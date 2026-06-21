import { useEffect, useMemo, useRef, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Dropdown from '@/components/Dropdown';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import StatusManager from '@/components/StatusManager';
import EntityLink from '@/components/EntityLink';
import { Pill, Spinner, EmptyState, Avatar, Icon, PageHeader, StatusBadge, statusMeta } from '@/components/ui';
import { getOrgUsers, createTask, updateTask, deleteTask, notify, avatarSrc, ensureTaskStatuses, createTaskStatus, updateTaskStatusDef, deleteTaskStatusDef, TaskStatus, getOrgOptions } from '@/lib/db';
import { Task, OrgUser } from '@/lib/supabase';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useTasks, useProjects, useTeams, useOrgCompanies } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { usePagination, Pagination } from '@/components/Pagination';
import { can } from '@/lib/authz';
import CommentsThread from '@/components/Comments';
import EntityTags from '@/components/EntityTags';
import TimeTracking from '@/components/TimeTracking';
import Checklist from '@/components/Checklist';
import { createReminder } from '@/lib/db';
import TaskCustomFields from '@/components/TaskCustomFields';

const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'On Hold', 'Cancelled'];
const COL_DEFS: { id: string; label: string; w: string }[] = [
  { id: 'status', label: 'Status', w: '120px' },
  { id: 'assignee', label: 'Assignee', w: '150px' },
  { id: 'priority', label: 'Priority', w: '88px' },
  { id: 'project', label: 'Project', w: '150px' },
  { id: 'created', label: 'Created', w: '100px' },
  { id: 'due', label: 'Due', w: '96px' },
];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const PRIORITY_RANK: Record<string, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
const PRIORITY_DOT: Record<string, string> = { Urgent: '#ef4444', High: '#f59e0b', Medium: '#3b82f6', Low: '#9aa0ae' };
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

const Bars = ({ level }: { level: number }) => (
  <span className="inline-flex items-end gap-0.5 h-3.5 shrink-0" aria-hidden="true">
    {[1, 2, 3, 4].map((i) => (
      <span key={i} style={{ height: `${i * 25}%` }}
        className={`w-1 rounded-sm ${i <= level ? (level >= 4 ? 'bg-rose-500' : level === 3 ? 'bg-amber-500' : 'bg-sky-500') : 'bg-surface2'}`} />
    ))}
  </span>
);

interface TaskForm {
  name: string; description: string; project_id: string; assignee_id: string;
  priority: string; status: string; due_date: string; estimated_hours: string;
}
const EMPTY_FORM: TaskForm = { name: '', description: '', project_id: '', assignee_id: '', priority: 'Medium', status: 'To Do', due_date: '', estimated_hours: '' };

type GroupBy = 'none' | 'project' | 'priority' | 'status' | 'company';

function BoardCardInner({ task, projectName, assigneeName, assigneeSrc, overdue }: { task: Task; projectName: string; assigneeName: string; assigneeSrc?: string; overdue: boolean }) {
  return (
    <>
      <p className="text-sm font-medium text-content truncate">{task.name}</p>
      <p className="text-2xs text-muted truncate mt-1">{projectName || '—'}</p>
      <div className="flex items-center gap-2 mt-2.5">
        <Pill label={task.priority} />
        {task.due_date && <span className={`text-2xs tnum ${overdue ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{task.due_date}</span>}
        {assigneeName && <span className="ml-auto shrink-0"><Avatar name={assigneeName} size={20} src={assigneeSrc} /></span>}
      </div>
    </>
  );
}

function BoardCard({ task, selected, projectName, assigneeName, assigneeSrc, overdue, onOpen }: { task: Task; selected: boolean; projectName: string; assigneeName: string; assigneeSrc?: string; overdue: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <button ref={setNodeRef} type="button" data-card="1" {...attributes} {...listeners} onClick={onOpen}
      className={`card card-interactive w-full text-left p-3 cursor-grab active:cursor-grabbing ${selected ? 'border-accent' : ''} ${isDragging ? 'opacity-40' : ''}`}>
      <BoardCardInner task={task} projectName={projectName} assigneeName={assigneeName} assigneeSrc={assigneeSrc} overdue={overdue} />
    </button>
  );
}

function BoardColumn({ status, color, count, onAdd, children }: { status: string; color?: string; count: number; onAdd: () => void; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`w-72 shrink-0 flex flex-col min-h-0 rounded-lg p-1 transition ${isOver ? 'ring-2 ring-inset ring-accent/50 bg-accent/5' : ''}`}>
      <div className="flex items-center gap-2 mb-2 px-0.5">
        <StatusBadge status={status} solid color={color} />
        <span className="text-2xs font-medium text-muted2 tnum">{count}</span>
        <button onClick={onAdd} title="Add task" className="ml-auto text-muted2 hover:text-content transition"><Icon name="ti-plus" className="text-sm" /></button>
      </div>
      <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[2.5rem]">{children}</div>
    </div>
  );
}

export default function Tasks() {
  const router = useRouter();
  const activeOrg = useActiveOrg();
  const [priorities, setPriorities] = useState<string[]>(PRIORITIES);
  useEffect(() => { if (!activeOrg) return; getOrgOptions(activeOrg.id, 'task_priority').then((o) => { const a = o.filter((x) => x.active).map((x) => x.label); if (a.length) setPriorities(a); }).catch(() => {}); }, [activeOrg?.id]);
  const me = useAuthStore((s) => s.user);
  const canDelete = can.write(activeOrg);
  const qc = useQueryClient();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: companies = [] } = useOrgCompanies();
  const { data: teams = [] } = useTeams();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ x: number; left: number } | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set(COL_DEFS.map((c) => c.id)));
  const [colOrder, setColOrder] = useState<string[]>(COL_DEFS.map((c) => c.id));
  const [colMenu, setColMenu] = useState(false);
  const [taskStatuses, setTaskStatuses] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const taskTabs = useModalTabs('overview');
  const [sort, setSort] = useState<'due' | 'priority' | 'name'>('priority');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);
  const [subInput, setSubInput] = useState('');

  // Create/edit modal — shared form for both flows.
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; id?: string }>(null);
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);

  useEffect(() => {
    getOrgUsers().then(setUsers).finally(() => setUsersLoading(false));
  }, []);
  const loading = tasksLoading || usersLoading;

  const userName = (id?: string | null) => users.find((u) => u.id === id)?.full_name || (id ? '—' : 'Unassigned');
  const userAvatar = (id?: string | null) => avatarSrc(users.find((u) => u.id === id)?.avatar_url);
  // Patch the RQ cache in place with the authoritative row db.ts returned —
  // same data flow as the old setTasks local state, no extra refetch.
  const setCache = (fn: (prev: Task[]) => Task[]) =>
    qc.setQueryData<Task[]>(qk.tasks(activeOrg?.id), (prev) => fn(prev ?? []));
  const patchLocal = (u: Task) => setCache((prev) => prev.map((t) => (t.id === u.id ? u : t)));

  useEffect(() => { if (activeOrg?.id) ensureTaskStatuses(activeOrg.id).then(setTaskStatuses).catch(() => {}); }, [activeOrg?.id]);
  // Per-user saved view (auto-persisted to this browser, keyed by user).
  useEffect(() => {
    if (!me?.id) return;
    try {
      const raw = localStorage.getItem(`snr-tasks-view-${me.id}`);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.groupBy) setGroupBy(v.groupBy);
        if (v.sort) setSort(v.sort);
        if (v.view) setView(v.view);
        if (Array.isArray(v.colOrder)) setColOrder(v.colOrder);
        if (Array.isArray(v.visibleCols)) setVisibleCols(new Set(v.visibleCols));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  useEffect(() => {
    if (!me?.id) return;
    try { localStorage.setItem(`snr-tasks-view-${me.id}`, JSON.stringify({ groupBy, sort, view, colOrder, visibleCols: [...visibleCols] })); } catch { /* ignore */ }
  }, [me?.id, groupBy, sort, view, colOrder, visibleCols]);
  const statuses = taskStatuses.length ? taskStatuses.map((x) => x.name) : STATUSES;
  const statusColor = (n: string) => taskStatuses.find((x) => x.name === n)?.color;
  const reloadStatuses = () => { if (activeOrg?.id) ensureTaskStatuses(activeOrg.id).then(setTaskStatuses).catch(() => {}); };
  const activeFilters = (projectFilter ? 1 : 0) + (priorityFilter ? 1 : 0) + (assigneeFilter ? 1 : 0) + (teamFilter ? 1 : 0) + (overdueOnly ? 1 : 0);
  const reorderStatuses = async (from: string, to: string) => {
    if (from === to || taskStatuses.length === 0) return;
    const order = taskStatuses.map((x) => x.name);
    const fi = order.indexOf(from), ti = order.indexOf(to);
    if (fi < 0 || ti < 0) return;
    order.splice(ti, 0, order.splice(fi, 1)[0]);
    try {
      await Promise.all(order.map((name, idx) => {
        const st = taskStatuses.find((x) => x.name === name);
        return st && st.position !== idx ? updateTaskStatusDef(st.id, { position: idx }) : Promise.resolve();
      }));
      reloadStatuses();
    } catch { /* ignore */ }
  };

  const roots = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks]);
  const filtered = useMemo(() => {
    const ftTeam = teamFilter ? teams.find((t: any) => t.id === teamFilter) : null;
    const ftMembers = ftTeam ? new Set((ftTeam.members || []).map((m: any) => m.user_id)) : null;
    let r = roots.filter((t) =>
      (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
      (statusFilter.size === 0 || statusFilter.has(t.status)) &&
      (!priorityFilter || t.priority === priorityFilter) &&
      (!projectFilter || (projectFilter === 'none' ? !t.project_id : t.project_id === projectFilter)) &&
      (!assigneeFilter || (assigneeFilter === 'unassigned' ? !t.assignee_id : t.assignee_id === assigneeFilter)) &&
      (!teamFilter || t.team_id === teamFilter || (!!t.assignee_id && !!ftMembers && ftMembers.has(t.assignee_id))) &&
      (!overdueOnly || (isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled')));
    r = [...r].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) :
      sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') :
      (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
    return r;
  }, [roots, query, statusFilter, priorityFilter, projectFilter, assigneeFilter, teamFilter, teams, overdueOnly, sort]);
  const pg = usePagination(filtered, 25);

  const projCompany = useMemo(() => { const m = new Map<string, string>(); projects.forEach((p: any) => { if (p.company_id) m.set(p.id, p.company_id); }); return m; }, [projects]);
  const compName = useMemo(() => { const m = new Map<string, string>(); companies.forEach((c: any) => m.set(c.id, c.name)); return m; }, [companies]);
  // Grouped view over the current page (header order: known rank lists, else A→Z).
  const groupedPage = useMemo(() => {
    if (groupBy === 'none') return null;
    const keyOf = (t: Task) =>
      groupBy === 'project' ? (t.projects?.name || 'No project') :
      groupBy === 'company' ? (compName.get(projCompany.get(t.project_id || '') || '') || 'No company') :
      groupBy === 'priority' ? (t.priority || 'None') : (t.status || 'None');
    const m = new Map<string, Task[]>();
    pg.pageItems.forEach((t) => { const k = keyOf(t); m.set(k, [...(m.get(k) || []), t]); });
    const rank = groupBy === 'priority' ? priorities : groupBy === 'status' ? statuses : null;
    return Array.from(m.entries()).sort(([a], [b]) =>
      rank ? rank.indexOf(a) - rank.indexOf(b) : a.localeCompare(b));
  }, [pg.pageItems, groupBy, projCompany, compName, priorities, statuses]);

  const selected = tasks.find((t) => t.id === selectedId) || null;
  const subtasks = useMemo(() => tasks.filter((t) => t.parent_task_id === selectedId), [tasks, selectedId]);

  const open = roots.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const inProgress = roots.filter((t) => t.status === 'In Progress');
  const overdue = open.filter((t) => isOverdue(t.due_date));

  const toggleStatus = (s: string) => setStatusFilter((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  const selectTask = (id: string) => { setSelectedId(id); setShowDetail(true); };

  // ----- mutations -----
  // C2 deep-link: /tasks?task=<id> selects the task and opens the drawer
  useEffect(() => {
    const tid = typeof router.query.task === 'string' ? router.query.task : null;
    if (!tid || !tasks.length) return;
    const t = tasks.find((x) => x.id === tid);
    if (t) { setSelectedId(t.id); setShowDetail(true); }
  }, [router.query.task, tasks.length]);

  const mutate = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };

  // Bulk select + mass-assign (List view)
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSel(new Set());
  const selectableIds = filtered.filter((t) => !t.parent_task_id).map((t) => t.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => sel.has(id));
  const toggleSelectAll = () => setSel(allSelected ? new Set() : new Set(selectableIds));
  const bulkAssignUser = (uid: string) => mutate(async () => {
    for (const id of Array.from(sel)) {
      const u = await updateTask(id, { assignee_id: uid || null }); patchLocal(u);
      if (uid && uid !== me?.id && activeOrg?.id) notify({ org_id: activeOrg.id, user_id: uid, type: 'TASK_ASSIGNED', title: 'You were assigned a task', body: u.name, link: '/tasks', entity_type: 'task', entity_id: id }).catch(() => {});
    }
    clearSel();
  });
  const bulkAssignTeam = (teamId: string) => mutate(async () => {
    const team = teams.find((t: any) => t.id === teamId);
    for (const id of Array.from(sel)) { patchLocal(await updateTask(id, { team_id: teamId || null } as any)); }
    if (activeOrg?.id && team) (team.members || []).map((m: any) => m.user_id).filter((mid: string) => mid !== me?.id).forEach((mid: string) =>
      notify({ org_id: activeOrg.id, user_id: mid, type: 'TASK_ASSIGNED', title: `Tasks assigned to ${team.name}`, body: `${sel.size} task(s) assigned to your team`, link: '/tasks', entity_type: 'task' }).catch(() => {}));
    clearSel();
  });
  const setStatus = (id: string, status: string) => mutate(async () => patchLocal(await updateTask(id, { status })));
  const reassign = (assignee_id: string) => selected && mutate(async () => {
    patchLocal(await updateTask(selected.id, { assignee_id: assignee_id || null }));
    if (assignee_id && assignee_id !== me?.id && selected.org_id) notify({ org_id: selected.org_id, user_id: assignee_id, type: 'TASK_ASSIGNED', title: 'You were assigned a task', body: selected.name, link: '/tasks', entity_type: 'task', entity_id: selected.id }).catch(() => {});
  });
  const addSubtask = () => {
    if (!selected || !subInput.trim()) return;
    mutate(async () => {
      const st = await createTask({ name: subInput.trim(), org_id: selected.org_id as string, project_id: selected.project_id, parent_task_id: selected.id, priority: 'Medium', status: 'To Do' });
      setCache((p) => [...p, st]); setSubInput('');
    });
  };
  const toggleSub = (st: Task) => mutate(async () => patchLocal(await updateTask(st.id, { status: st.status === 'Done' ? 'To Do' : 'Done' })));
  const addFollower = (uid: string) => { if (!selected || !uid) return; const cur = selected.followers || []; if (cur.includes(uid)) return; mutate(async () => patchLocal(await updateTask(selected.id, { followers: [...cur, uid] }))); };
  const removeFollower = (uid: string) => selected && mutate(async () => patchLocal(await updateTask(selected.id, { followers: (selected.followers || []).filter((x) => x !== uid) })));

  const removeTask = (id: string, name: string) => {
    if (!confirm(`Delete task "${name}"? This can't be undone.`)) return;
    mutate(async () => {
      await deleteTask(id);
      setCache((p) => p.filter((t) => t.id !== id && t.parent_task_id !== id));
      if (selectedId === id) { setSelectedId(null); setShowDetail(false); }
    });
  };

  // ----- create/edit modal -----
  const openCreate = () => { setForm(EMPTY_FORM); setModal({ mode: 'create' }); };
  const openEdit = (t: Task) => {
    setForm({
      name: t.name,
      description: t.description || '',
      project_id: t.project_id || '',
      assignee_id: t.assignee_id || '',
      priority: t.priority || 'Medium',
      status: t.status || 'To Do',
      due_date: t.due_date || '',
      estimated_hours: t.estimated_hours != null ? String(t.estimated_hours) : '',
    });
    setModal({ mode: 'edit', id: t.id });
  };
  const closeModal = () => setModal(null);

  const submitForm = () => {
    if (!form.name.trim() || !modal) return;
    if (modal.mode === 'create') {
      if (!activeOrg) return;
      mutate(async () => {
        const t = await createTask({
          name: form.name.trim(),
          org_id: activeOrg.id,
          project_id: form.project_id || null,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
          assignee_id: form.assignee_id || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : undefined,
        });
        // createTask doesn't accept description directly; patch it in if provided.
        const final = form.description.trim()
          ? await updateTask(t.id, { description: form.description.trim() })
          : t;
        setCache((p) => [...p, final]);
        selectTask(final.id);
        setModal(null);
        if (form.assignee_id && form.assignee_id !== me?.id) notify({ org_id: activeOrg.id, user_id: form.assignee_id, type: 'TASK_ASSIGNED', title: 'You were assigned a task', body: final.name, link: '/tasks', entity_type: 'task', entity_id: final.id }).catch(() => {});
      });
    } else if (modal.mode === 'edit' && modal.id) {
      const id = modal.id;
      const prevAssignee = tasks.find((t) => t.id === id)?.assignee_id || null;
      mutate(async () => {
        const updated = await updateTask(id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          project_id: form.project_id || null,
          assignee_id: form.assignee_id || null,
          priority: form.priority,
          status: form.status,
          due_date: form.due_date || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        });
        patchLocal(updated);
        setModal(null);
        if (form.assignee_id && form.assignee_id !== prevAssignee && form.assignee_id !== me?.id && updated.org_id) {
          notify({ org_id: updated.org_id, user_id: form.assignee_id, type: 'TASK_ASSIGNED', title: 'You were assigned a task', body: updated.name, link: '/tasks', entity_type: 'task', entity_id: updated.id }).catch(() => {});
        }
      });
    }
  };

  const Summary = ({ icon, tone, label, count, a, b }:
    { icon: string; tone: string; label: string; count: number; a: [string, string]; b: [string, string] }) => (
    <div className="stat flex-1">
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-md grid place-items-center ${tone}`}><Icon name={icon} className="text-sm" /></span>
        <span className="text-sm font-medium text-content">{label}</span>
        <span className="ml-auto text-lg font-semibold text-content">{count}</span>
      </div>
      <div className="flex gap-6 mt-3">
        <div><p className="text-2xs text-muted2">{a[0]}</p><p className="text-sm font-medium mt-0.5 text-content">{a[1]}</p></div>
        <div><p className="text-2xs text-muted2">{b[0]}</p><p className="text-sm font-medium mt-0.5 text-content">{b[1]}</p></div>
      </div>
    </div>
  );

  const doneSubs = subtasks.filter((s) => s.status === 'Done').length;
  const availFollowers = users.filter((u) => !(selected?.followers || []).includes(u.id));
  const assigneeIds = selected ? ((selected.assignee_ids && selected.assignee_ids.length) ? selected.assignee_ids : (selected.assignee_id ? [selected.assignee_id] : [])) : [];
  const availAssignees = users.filter((u) => !assigneeIds.includes(u.id));
  const setAssignees = (ids: string[]) => selected && mutate(async () => patchLocal(await updateTask(selected.id, { assignee_ids: ids, assignee_id: ids[0] || null })));
  const addAssignee = (uid: string) => { if (!selected || !uid || assigneeIds.includes(uid)) return; setAssignees([...assigneeIds, uid]); if (uid !== me?.id && selected.org_id) notify({ org_id: selected.org_id, user_id: uid, type: 'TASK_ASSIGNED', title: 'You were assigned a task', body: selected.name, link: '/tasks', entity_type: 'task', entity_id: selected.id }).catch(() => {}); };
  const removeAssignee = (uid: string) => { if (!selected) return; setAssignees(assigneeIds.filter((x) => x !== uid)); };
  const toggleAssignee = (uid: string) => assigneeIds.includes(uid) ? removeAssignee(uid) : addAssignee(uid);
  const toggleFollower = (uid: string) => ((selected?.followers || []).includes(uid) ? removeFollower(uid) : addFollower(uid));
  const setPriority = (pr: string) => selected && mutate(async () => patchLocal(await updateTask(selected.id, { priority: pr })));

  // ----- shared detail panel (used as sidebar on xl+, overlay drawer below) -----
  const PropRow = ({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 min-h-[34px] px-2 -mx-2 rounded-lg hover:bg-surface2/40 transition-colors">
      <span className="flex items-center gap-2 w-24 shrink-0 text-xs text-muted"><Icon name={icon} className="text-sm text-muted2" />{label}</span>
      <div className="flex-1 min-w-0 text-sm">{children}</div>
    </div>
  );

  const DetailPanel = () => {
    if (!selected) return <div className="card p-5 text-sm text-muted">Select a task to see details</div>;
    const statusItems = statuses.map((st) => ({ value: st, label: st, dot: statusColor(st) || '#9ca3af' }));
    const teamName = teams.find((t) => t.id === selected.team_id)?.name;
    const REPEAT = [{ value: '', label: 'No repeat' }, { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Every 2 weeks' }, { value: 'monthly', label: 'Monthly' }];
    const repeatLabel = REPEAT.find((r) => r.value === (selected.recur_every || ''))?.label || 'No repeat';
    const trig = (text: string, muted = false) => <span className={`inline-flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md hover:bg-surface2 transition cursor-pointer ${muted ? 'text-muted2' : 'text-content'}`}>{text}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>;
    return (
    <div className="card flex flex-col lg:flex-row max-h-[85vh] overflow-hidden">
      {/* MAIN */}
      <div className="flex-1 min-w-0 overflow-y-auto p-5 lg:p-6">
        <div className="flex items-center gap-1.5 text-2xs text-muted2 mb-4 min-w-0">
          <Icon name="ti-folder" className="text-sm shrink-0" />
          <span className="truncate">{selected.projects?.name || 'No project'}</span>
          <Icon name="ti-chevron-right" className="text-2xs shrink-0" />
          <span className="truncate text-muted">{selected.name}</span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => openEdit(selected)} disabled={busy} title="Edit task" className="btn-ghost p-1.5 rounded text-muted hover:text-content"><Icon name="ti-pencil" /></button>
            {canDelete && <button onClick={() => removeTask(selected.id, selected.name)} disabled={busy} title="Delete task" className="btn-ghost p-1.5 rounded text-muted hover:text-rose-500"><Icon name="ti-trash" /></button>}
            <button onClick={() => setShowDetail(false)} title="Close" className="btn-ghost p-1.5 rounded text-muted hover:text-content"><Icon name="ti-x" /></button>
          </div>
        </div>

        {/* TITLE ROW */}
        <div className="flex items-center gap-3 flex-wrap">
          <Dropdown value={selected.status} onChange={(v) => setStatus(selected.id, v)} items={statusItems} width={200}
            trigger={<span className="inline-flex items-center gap-2 h-8 px-3 rounded-md text-sm font-medium bg-surface2 text-content hover:brightness-95 transition"><span className="w-2 h-2 rounded-full" style={{ background: statusColor(selected.status) || '#9ca3af' }} />{selected.status}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
          <h3 className="text-lg sm:text-xl font-semibold leading-snug tracking-tight text-content min-w-0">{selected.name}</h3>
          <div className="flex items-center">
            {assigneeIds.map((uid) => (
              <span key={uid} className="group relative -ml-1.5 first:ml-0" title={userName(uid)}>
                <span className="inline-block rounded-full ring-2 ring-surface"><Avatar name={userName(uid)} size={28} src={userAvatar(uid)} /></span>
                <button onClick={() => removeAssignee(uid)} disabled={busy} className="absolute -top-1 -right-1 hidden group-hover:grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white text-[8px]"><Icon name="ti-x" /></button>
              </span>
            ))}
            <span className="-ml-1.5 first:ml-0">
              <Dropdown multiple search width={240} placeholder="Assign people…" values={assigneeIds} onToggle={toggleAssignee}
                items={users.map((u) => ({ value: u.id, label: u.full_name }))}
                trigger={<span title="Assign" className="grid place-items-center h-7 w-7 rounded-full border border-dashed border-borderstrong bg-surface text-muted2 hover:border-accent hover:text-accentstrong ring-2 ring-surface cursor-pointer"><Icon name="ti-plus" className="text-sm" /></span>} />
            </span>
          </div>
          <TimeTracking variant="icon" taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
        </div>

        {/* PROPERTIES */}
        <div className="grid sm:grid-cols-2 gap-x-8 mt-4 pb-3 border-b border-line">
          <PropRow icon="ti-flag" label="Priority">
            <Dropdown value={selected.priority} onChange={setPriority} items={PRIORITIES.map((pr) => ({ value: pr, label: pr, dot: PRIORITY_DOT[pr] }))} width={180}
              trigger={<span className="inline-flex items-center gap-2 px-2 py-1 -ml-2 rounded-md hover:bg-surface2 cursor-pointer"><Bars level={PRIORITY_RANK[selected.priority] || 1} /><span className="font-medium text-content">{selected.priority}</span></span>} />
          </PropRow>
          <PropRow icon="ti-folder" label="Project">
            {selected.project_id && selected.projects?.name
              ? <Link href={`/projects/${selected.project_id}`} className="px-2 py-1 -ml-2 rounded-md hover:bg-surface2 inline-block font-medium text-content truncate max-w-full">{selected.projects.name}</Link>
              : <span className="px-2 py-1 -ml-2 text-muted2">No project</span>}
          </PropRow>
          <PropRow icon="ti-calendar" label="Due">
            <span className={`px-2 py-1 -ml-2 ${isOverdue(selected.due_date) && selected.status !== 'Done' ? 'text-rose-500 font-medium' : selected.due_date ? 'text-content' : 'text-muted2'}`}>{selected.due_date || 'No due date'}</span>
          </PropRow>
          <PropRow icon="ti-clock" label="Estimate">
            <span className={`px-2 py-1 -ml-2 ${selected.estimated_hours ? 'text-content font-medium' : 'text-muted2'}`}>{selected.estimated_hours ? `${selected.estimated_hours} h` : 'No estimate'}</span>
          </PropRow>
          {teams.length > 0 && (
            <PropRow icon="ti-users-group" label="Team">
              <Dropdown value={selected.team_id || ''} onChange={(v) => mutate(async () => patchLocal(await updateTask(selected.id, { team_id: v || null })))} width={200}
                items={[{ value: '', label: 'No team' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
                trigger={trig(teamName || 'No team', !teamName)} />
            </PropRow>
          )}
          <PropRow icon="ti-repeat" label="Repeat">
            <Dropdown value={selected.recur_every || ''} onChange={(v) => mutate(async () => patchLocal(await updateTask(selected.id, { recur_every: (v || null) as Task['recur_every'] })))} width={180}
              items={REPEAT} trigger={trig(repeatLabel, !selected.recur_every)} />
          </PropRow>
          <PropRow icon="ti-bell" label="Remind">
            <input type="datetime-local" disabled={busy} value="" className="bg-transparent text-sm text-content rounded-md px-2 py-1 -ml-2 hover:bg-surface2 outline-none cursor-pointer w-[12rem]"
              onChange={(e) => { if (!e.target.value || !me || !selected.org_id) return; const at = new Date(e.target.value); createReminder({ org_id: selected.org_id, user_id: me.id, note: `Task: ${selected.name}`, remind_at: at.toISOString(), entity_type: 'task', entity_id: selected.id }).then(() => alert(`Reminder set for ${at.toLocaleString()}`)).catch((er) => alert(er.message)); }} />
          </PropRow>
          <PropRow icon="ti-users" label="Followers">
            <div className="flex items-center">
              {(selected.followers || []).map((fid) => (
                <span key={fid} className="group relative -ml-1.5 first:ml-0" title={userName(fid)}>
                  <span className="inline-block rounded-full ring-2 ring-surface"><Avatar name={userName(fid)} size={24} src={userAvatar(fid)} /></span>
                  <button onClick={() => removeFollower(fid)} disabled={busy} className="absolute -top-1 -right-1 hidden group-hover:grid h-3.5 w-3.5 place-items-center rounded-full bg-rose-500 text-white text-[8px]"><Icon name="ti-x" /></button>
                </span>
              ))}
              <span className="-ml-1.5 first:ml-0">
                <Dropdown multiple search width={240} placeholder="Add followers…" values={selected.followers || []} onToggle={toggleFollower}
                  items={users.map((u) => ({ value: u.id, label: u.full_name }))}
                  trigger={<span title="Add follower" className="grid place-items-center h-6 w-6 rounded-full border border-dashed border-borderstrong bg-surface text-muted2 hover:border-accent hover:text-accentstrong ring-2 ring-surface cursor-pointer"><Icon name="ti-plus" className="text-xs" /></span>} />
              </span>
            </div>
          </PropRow>
        </div>

        {/* Tags */}
        <div className="mt-3"><EntityTags entityType="task" entityId={selected.id} orgId={selected.org_id} bare /></div>

        {/* Description */}
        <div className="mt-5">
          <p className="section-label mb-2">Description</p>
          {selected.description
            ? <p className="text-sm text-contentsoft whitespace-pre-wrap leading-relaxed">{selected.description}</p>
            : <p className="text-sm text-muted2 italic">No description.</p>}
        </div>

        <TaskCustomFields task={selected} />

        {/* Subtasks */}
        <div className="mt-6 pt-5 border-t border-line">
          <p className="section-label mb-2.5">Subtasks {subtasks.length > 0 && <span className="text-muted2">· {doneSubs}/{subtasks.length}</span>}</p>
          <div className="space-y-1.5">
            {subtasks.map((st) => (
              <div key={st.id} className="flex items-center gap-2 group">
                <input type="checkbox" checked={st.status === 'Done'} disabled={busy} onChange={() => toggleSub(st)} className="accent-accentstrong w-4 h-4" />
                <span className={`text-sm flex-1 truncate ${st.status === 'Done' ? 'line-through text-muted2' : 'text-content'}`}>{st.name}</span>
                <button onClick={() => removeTask(st.id, st.name)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSubtask()} placeholder="Add a subtask…" className="input h-8 text-sm" />
            <button onClick={addSubtask} disabled={busy || !subInput.trim()} className="btn h-8 px-2 text-xs"><Icon name="ti-plus" /></button>
          </div>
        </div>

        <Checklist taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
        <TimeTracking taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
      </div>

      {/* ACTIVITY RAIL */}
      <div className="lg:w-[20rem] shrink-0 border-t lg:border-t-0 lg:border-l border-line overflow-y-auto p-5 bg-surface2/30">
        <p className="section-label mb-3 flex items-center gap-2"><Icon name="ti-activity" className="text-base text-muted2" />Activity</p>
        <CommentsThread entityType="task" entityId={selected.id} orgId={selected.org_id} users={users} currentUserId={me?.id} />
      </div>
    </div>
    );
  };


  const BoardView = () => {
    const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;
    const onDragEnd = (e: DragEndEvent) => {
      const overId = e.over?.id as string | undefined;
      const id = e.active.id as string;
      setActiveId(null);
      const tk = tasks.find((x) => x.id === id);
      if (overId && tk && tk.status !== overId) setStatus(id, overId);
    };
    const panDown = (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('[data-card]')) return;
      const el = boardScrollRef.current; if (!el) return;
      panRef.current = { x: e.clientX, left: el.scrollLeft };
    };
    const panMove = (e: React.PointerEvent) => {
      if (!panRef.current || !boardScrollRef.current) return;
      boardScrollRef.current.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
    };
    const panUp = () => { panRef.current = null; };
    return (
      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div ref={boardScrollRef} onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp} onPointerLeave={panUp}
          className="flex-1 min-w-0 overflow-x-auto pb-2 cursor-grab select-none">
          <div className="flex gap-3 h-full">
            {statuses.map((st) => {
              const items = filtered.filter((t) => t.status === st);
              return (
                <BoardColumn key={st} status={st} color={statusColor(st)} count={items.length}
                  onAdd={() => { setForm({ ...EMPTY_FORM, status: st }); setModal({ mode: 'create' }); }}>
                  {items.map((t) => (
                    <BoardCard key={t.id} task={t} selected={selectedId === t.id}
                      projectName={t.projects?.name || ''} assigneeName={t.assignee_id ? userName(t.assignee_id) : ''} assigneeSrc={userAvatar(t.assignee_id)}
                      overdue={isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled'}
                      onOpen={() => selectTask(t.id)} />
                  ))}
                  {items.length === 0 && <p className="text-2xs text-muted2 px-1 py-6 text-center">No tasks</p>}
                </BoardColumn>
              );
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' }}>
          {activeTask ? (
            <div className="card p-3 w-72 shadow-lg ring-2 ring-accent/50 rotate-1 cursor-grabbing">
              <BoardCardInner task={activeTask} projectName={activeTask.projects?.name || ''} assigneeName={activeTask.assignee_id ? userName(activeTask.assignee_id) : ''} assigneeSrc={userAvatar(activeTask.assignee_id)} overdue={isOverdue(activeTask.due_date) && activeTask.status !== 'Done' && activeTask.status !== 'Cancelled'} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    );
  };


  const shownCols = colOrder.map((id) => COL_DEFS.find((c) => c.id === id)!).filter((c) => c && visibleCols.has(c.id));
  const moveCol = (id: string, dir: number) => setColOrder((o) => { const i = o.indexOf(id); const j = i + dir; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const gridStyle = { gridTemplateColumns: `minmax(200px,1fr) ${shownCols.map((c) => c.w).join(' ')} 48px` } as React.CSSProperties;
  const GRID = 'grid items-center gap-2 px-4';

  const cell = (t: Task, id: string) => {
    switch (id) {
      case 'status':
        return (
          <span onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Select value={t.status} onChange={(v) => setStatus(t.id, v)} disabled={busy} options={[...statuses.map((s) => ({ value: s, label: titleCase(s) }))]} />
          </span>
        );
      case 'assignee':
        return <div key={id} className="flex items-center min-w-0">{t.assignee_id ? <span title={userName(t.assignee_id)} className="inline-flex cursor-default"><Avatar name={userName(t.assignee_id)} size={22} src={userAvatar(t.assignee_id)} /></span> : <span className="text-muted2 text-2xs">—</span>}</div>;
      case 'priority':
        return <div key={id}><Pill label={t.priority} /></div>;
      case 'project':
        return <span key={id} className="text-2xs text-muted truncate">{t.projects?.name || '—'}</span>;
      case 'created':
        return <span key={id} className="text-2xs text-muted2 tnum">{new Date(t.created_at!).toLocaleDateString()}</span>;
      case 'due': {
        const od = isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled';
        return <span key={id} className={`text-2xs tnum ${od ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{t.due_date || '—'}</span>;
      }
      default:
        return <span key={id} />;
    }
  };

  const ColHeader = () => (
    <div className={`${GRID} py-2 border-b border-line text-2xs font-semibold uppercase tracking-wider text-muted2`} style={gridStyle}>
      <span className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} onClick={(e) => e.stopPropagation()} className="accent-accentstrong" title="Select all" />Name</span>
      {shownCols.map((c) => <span key={c.id}>{c.label}</span>)}
      <span />
    </div>
  );

  const Row = (t: Task) => {
    const subs = tasks.filter((s) => s.parent_task_id === t.id);
    return (
      <div key={t.id}
        className={`group relative ${GRID} py-2.5 border-b border-line/50 transition cursor-pointer ${selectedId === t.id ? 'bg-accent/5' : 'hover:bg-surface2'}`}
        style={gridStyle} onClick={() => selectTask(t.id)}>
        <div className="flex items-center gap-2 min-w-0">
          <input type="checkbox" checked={sel.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(t.id)} className="accent-accentstrong shrink-0" title="Select" />
          {subs.length > 0 ? (
            <button onClick={(e) => { e.stopPropagation(); setExpanded((pr) => { const n = new Set(pr); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; }); }}
              className="shrink-0 -ml-1 text-muted2 hover:text-content" title={expanded.has(t.id) ? 'Collapse subtasks' : 'Expand subtasks'}>
              <Icon name={expanded.has(t.id) ? 'ti-chevron-down' : 'ti-chevron-right'} className="text-sm" />
            </button>
          ) : <span className="w-4 shrink-0" />}
          <Bars level={PRIORITY_RANK[t.priority] || 1} />
          <span className="text-sm font-medium text-content truncate">{t.name}</span>
          {subs.length > 0 && <span className="shrink-0 inline-flex items-center gap-0.5 text-2xs text-muted2"><Icon name="ti-subtask" />{subs.filter((s) => s.status === 'Done').length}/{subs.length}</span>}
        </div>
        {shownCols.map((c) => cell(t, c.id))}
        <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition">
          <button onClick={(e) => { e.stopPropagation(); openEdit(t); }} disabled={busy} title="Edit task" className="p-1 rounded text-muted2 hover:text-content"><Icon name="ti-pencil" className="text-sm" /></button>
          {canDelete && (
            <button onClick={(e) => { e.stopPropagation(); removeTask(t.id, t.name); }} disabled={busy} title="Delete task" className="p-1 rounded text-muted2 hover:text-rose-500"><Icon name="ti-trash" className="text-sm" /></button>
          )}
        </div>
      </div>
    );
  };

  const SubRow = (t: Task) => (
    <div key={t.id}
      className={`group relative ${GRID} py-2 border-b border-line/50 transition cursor-pointer ${selectedId === t.id ? 'bg-accent/5' : 'bg-surface2/30 hover:bg-surface2'}`}
      style={gridStyle} onClick={() => selectTask(t.id)}>
      <div className="flex items-center gap-2 min-w-0 pl-5">
        <Icon name="ti-corner-down-right" className="text-muted2 text-sm shrink-0" />
        <input type="checkbox" checked={t.status === 'Done'} disabled={busy} onClick={(e) => e.stopPropagation()} onChange={() => setStatus(t.id, t.status === 'Done' ? 'To Do' : 'Done')} className="accent-accentstrong shrink-0" />
        <span className={`text-sm truncate ${t.status === 'Done' ? 'line-through text-muted2' : 'text-content'}`}>{t.name}</span>
      </div>
      {shownCols.map((c) => cell(t, c.id))}
      <span />
    </div>
  );

  const renderTask = (t: Task) => {
    const subs = tasks.filter((s) => s.parent_task_id === t.id);
    return (
      <div key={t.id}>
        {Row(t)}
        {expanded.has(t.id) && subs.map((st) => SubRow(st))}
      </div>
    );
  };

  return (
    <Layout title="Tasks">
      {loading ? <Spinner /> : (
        <div className="flex flex-col h-full">
          <PageHeader help="work" title="Tasks" subtitle="Track work across all your projects"
            action={<button onClick={openCreate} className="btn btn-primary"><Icon name="ti-plus" />New task</button>} />

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Summary icon="ti-checkbox" tone="bg-sky-500/10 text-sky-600" label="Open" count={open.length}
              a={['Overdue', String(overdue.length)]} b={['Total', String(roots.length)]} />
            <Summary icon="ti-progress" tone="bg-amber-500/10 text-amber-600" label="In progress" count={inProgress.length}
              a={['Review', String(roots.filter(t => t.status === 'Review').length)]} b={['On hold', String(roots.filter(t => t.status === 'On Hold').length)]} />
            <Summary icon="ti-circle-check" tone="bg-emerald-500/10 text-emerald-600" label="Done" count={roots.filter(t => t.status === 'Done').length}
              a={['Cancelled', String(roots.filter(t => t.status === 'Cancelled').length)]} b={['Backlog', String(roots.filter(t => t.status === 'Backlog').length)]} />
          </div>

          {/* Toolbar — clean, ClickUp-style */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface w-full sm:w-72">
              <Icon name="ti-search" className="text-muted2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks"
                className="bg-transparent outline-none text-sm w-full text-content placeholder:text-muted2" />
            </div>
            <div className="hidden sm:block flex-1" />
            <div className="relative">
              <button onClick={() => setFilterMenu((v) => !v)} className={`btn h-9 ${activeFilters ? 'border-accent text-accentstrong' : ''}`}>
                <Icon name="ti-filter" className="text-sm" />Filter{activeFilters > 0 && <span className="ml-0.5 text-2xs bg-accent/15 text-accentstrong rounded-full px-1.5">{activeFilters}</span>}
              </button>
              {filterMenu && <div className="fixed inset-0 z-10" onClick={() => setFilterMenu(false)} aria-hidden />}
              {filterMenu && (
                <div className="absolute right-0 top-10 z-20 w-64 bg-surface border border-line rounded-lg shadow-lg p-3 space-y-3">
                  <div><label className="label">Project</label>
                    <Dropdown value={projectFilter} onChange={setProjectFilter} width={224} search placeholder="Find project…"
                      items={[{ value: '', label: 'All projects' }, { value: 'none', label: 'No project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                      trigger={<span className="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-line bg-surface text-sm cursor-pointer hover:border-borderstrong"><span className="truncate">{projectFilter === '' ? 'All projects' : projectFilter === 'none' ? 'No project' : (projects.find((p) => p.id === projectFilter)?.name || '—')}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} /></div>
                  <div><label className="label">Priority</label>
                    <Dropdown value={priorityFilter} onChange={setPriorityFilter} width={224}
                      items={[{ value: '', label: 'All priorities' }, ...priorities.map((p) => ({ value: p, label: titleCase(p) }))]}
                      trigger={<span className="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-line bg-surface text-sm cursor-pointer hover:border-borderstrong"><span className="truncate">{priorityFilter || 'All priorities'}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} /></div>
                  <div><label className="label">Assignee</label>
                    <Dropdown value={assigneeFilter} onChange={setAssigneeFilter} width={224} search placeholder="Find person…"
                      items={[{ value: '', label: 'All assignees' }, { value: 'unassigned', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]}
                      trigger={<span className="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-line bg-surface text-sm cursor-pointer hover:border-borderstrong"><span className="truncate">{assigneeFilter === '' ? 'All assignees' : assigneeFilter === 'unassigned' ? 'Unassigned' : (users.find((u) => u.id === assigneeFilter)?.full_name || '—')}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} /></div>
                  <div><label className="label">Team</label>
                    <Dropdown value={teamFilter} onChange={setTeamFilter} width={224}
                      items={[{ value: '', label: 'All teams' }, ...teams.map((t: any) => ({ value: t.id, label: t.name }))]}
                      trigger={<span className="flex items-center justify-between gap-2 h-9 w-full px-3 rounded-md border border-line bg-surface text-sm cursor-pointer hover:border-borderstrong"><span className="truncate">{teamFilter === '' ? 'All teams' : (teams.find((t: any) => t.id === teamFilter)?.name || '—')}</span><Icon name="ti-chevron-down" className="text-2xs text-muted2 shrink-0" /></span>} /></div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={overdueOnly} onChange={() => setOverdueOnly((v) => !v)} className="accent-accentstrong" />Overdue only</label>
                  {activeFilters > 0 && <button onClick={() => { setProjectFilter(''); setPriorityFilter(''); setAssigneeFilter(''); setTeamFilter(''); setOverdueOnly(false); }} className="text-2xs text-muted hover:text-content underline">Clear all filters</button>}
                </div>
              )}
            </div>
            <Dropdown value={groupBy} onChange={(v) => setGroupBy(v as GroupBy)} width={180}
              items={[{ value: 'none', label: 'No grouping' }, { value: 'company', label: 'Group: Company' }, { value: 'project', label: 'Group: Project' }, { value: 'priority', label: 'Group: Priority' }, { value: 'status', label: 'Group: Status' }]}
              trigger={<span className="inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-line bg-surface text-sm text-content hover:border-borderstrong cursor-pointer whitespace-nowrap">{({ none: 'No grouping', company: 'Group: Company', project: 'Group: Project', priority: 'Group: Priority', status: 'Group: Status' } as Record<string, string>)[groupBy]}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
            <Dropdown value={sort} onChange={(v) => setSort(v as 'due' | 'priority' | 'name')} width={170}
              items={[{ value: 'priority', label: 'Sort: Priority' }, { value: 'due', label: 'Sort: Due date' }, { value: 'name', label: 'Sort: Name' }]}
              trigger={<span className="inline-flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-line bg-surface text-sm text-content hover:border-borderstrong cursor-pointer whitespace-nowrap">{({ priority: 'Sort: Priority', due: 'Sort: Due date', name: 'Sort: Name' } as Record<string, string>)[sort]}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
            <div className="flex items-center rounded-lg border border-line overflow-hidden h-9 shrink-0">
              {(['list', 'board'] as const).map((vw) => (
                <button key={vw} onClick={() => setView(vw)}
                  className={`h-full px-3 text-xs capitalize inline-flex items-center gap-1.5 transition ${view === vw ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}>
                  <Icon name={vw === 'list' ? 'ti-list' : 'ti-layout-board'} className="text-sm" />{vw}
                </button>
              ))}
            </div>
            <div className="relative">
              <button onClick={() => setColMenu((v) => !v)} className="btn h-9"><Icon name="ti-columns-3" className="text-sm" /><span className="hidden md:inline">Columns</span></button>
              {colMenu && <div className="fixed inset-0 z-10" onClick={() => setColMenu(false)} aria-hidden />}
              {colMenu && (
                <div className="absolute right-0 top-10 z-20 w-56 bg-surface border border-line rounded-lg shadow-lg p-1">
                  <p className="px-2 py-1 text-2xs text-muted2">Show &amp; reorder columns</p>
                  {colOrder.map((cid, idx) => { const c = COL_DEFS.find((x) => x.id === cid)!; return (
                    <div key={cid} className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface2">
                      <label className="flex items-center gap-2 text-sm flex-1 cursor-pointer">
                        <input type="checkbox" checked={visibleCols.has(cid)} onChange={() => setVisibleCols((pr) => { const n = new Set(pr); n.has(cid) ? n.delete(cid) : n.add(cid); return n; })} className="accent-accentstrong" />
                        {c.label}
                      </label>
                      <button onClick={() => moveCol(cid, -1)} disabled={idx === 0} title="Move up" className="text-muted2 hover:text-content disabled:opacity-25"><Icon name="ti-chevron-up" className="text-sm" /></button>
                      <button onClick={() => moveCol(cid, 1)} disabled={idx === colOrder.length - 1} title="Move down" className="text-muted2 hover:text-content disabled:opacity-25"><Icon name="ti-chevron-down" className="text-sm" /></button>
                    </div>
                  ); })}
                </div>
              )}
            </div>
            {canDelete && (
              <button onClick={() => setStatusMgr(true)} className="btn h-9"><Icon name="ti-flag-3" className="text-sm" /><span className="hidden md:inline">Statuses</span></button>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {view === 'board' ? <BoardView /> : (
            <div className="h-full overflow-auto">
              <div className="min-w-[960px]">
              {filtered.length === 0 ? <EmptyState text="No tasks match" /> : groupedPage ? (
                groupedPage.map(([label, items]) => {
                  const gcol = collapsedGroups.has(label);
                  return (
                  <div key={label} className="mt-5 first:mt-1">
                    <div draggable={groupBy === 'status' && taskStatuses.length > 0}
                      onDragStart={() => setDragGroup(label)}
                      onDragOver={(e) => { if (dragGroup && groupBy === 'status') e.preventDefault(); }}
                      onDrop={() => { if (dragGroup) reorderStatuses(dragGroup, label); setDragGroup(null); }}
                      onDragEnd={() => setDragGroup(null)}
                      className={`px-1 py-2 mb-2 flex items-center gap-2.5 ${groupBy === 'status' && taskStatuses.length > 0 ? 'cursor-grab' : ''} ${dragGroup === label ? 'opacity-60' : ''}`}>
                      <button onClick={() => setCollapsedGroups((pr) => { const n = new Set(pr); n.has(label) ? n.delete(label) : n.add(label); return n; })}
                        className="shrink-0 text-muted2 hover:text-content" title={gcol ? 'Expand' : 'Collapse'}>
                        <Icon name={gcol ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-sm" />
                      </button>
                      {groupBy === 'status'
                        ? <StatusBadge status={label} solid color={statusColor(label)} />
                        : <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</span>}
                      <span className="text-2xs font-medium text-muted2 tnum">{items.length}</span>
                      {groupBy === 'status' && (
                        <button onClick={() => { setForm({ ...EMPTY_FORM, status: label }); setModal({ mode: 'create' }); }}
                          className="ml-auto inline-flex items-center gap-1 text-2xs text-muted2 hover:text-content transition">
                          <Icon name="ti-plus" className="text-sm" />Add task
                        </button>
                      )}
                    </div>
                    {!gcol && (
                      <div className="overflow-x-auto">
                        <ColHeader />
                        {items.map(renderTask)}
                      </div>
                    )}
                  </div>
                  );
                })
              ) : (<div className="overflow-x-auto"><ColHeader />{pg.pageItems.map(renderTask)}</div>)}
              {filtered.length > 0 && (
                <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
              )}
              </div>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Task detail — centered modal (ClickUp-style) */}
      {sel.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-surface border border-line rounded-xl shadow-2xl px-3 py-2">
          <span className="text-sm font-medium text-content">{sel.size} selected</span>
          <span className="text-muted2">·</span>
          <div className="w-auto"><Select value="" onChange={(v) => { if (v) bulkAssignUser(v === '__un' ? '' : v); }} className="h-8 py-0" options={[{ value: '', label: 'Assign to…' }, { value: '__un', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} /></div>
          <div className="w-auto"><Select value="" onChange={(v) => { if (v) bulkAssignTeam(v); }} className="h-8 py-0" options={[{ value: '', label: 'Team…' }, ...teams.map((t: any) => ({ value: t.id, label: t.name }))]} /></div>
          <button onClick={clearSel} className="btn btn-ghost h-8 py-0">Clear</button>
        </div>
      )}

      {showDetail && selected && (
        <div className="modal-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={() => setShowDetail(false)}>
          <div className="modal-card w-full max-w-5xl my-2" onClick={(e) => e.stopPropagation()}>
            {DetailPanel()}
          </div>
        </div>
      )}

      {activeOrg?.id && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={activeOrg.id} statuses={taskStatuses} onChanged={reloadStatuses} />}

      {/* Create / edit modal */}
      <Modal
        open={!!modal}
        onClose={closeModal}
        title={modal?.mode === 'edit' ? 'Edit task' : 'New task'}
        subtitle={modal?.mode === 'edit' ? 'Update details, assignment and schedule.' : 'Add a task and assign it to a project.'}
        icon={modal?.mode === 'edit' ? 'ti-edit' : 'ti-checkbox'}
        onSubmit={() => { if (!busy && form.name.trim()) submitForm(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={closeModal} className="btn">Cancel</button>
            <button onClick={submitForm} disabled={busy || !form.name.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : (modal?.mode === 'create' ? 'Create task' : 'Save changes')}</button>
          </>
        }
        tabs={[{ key: 'overview', label: 'Overview', icon: 'ti-layout-list' }, { key: 'more', label: 'Details', icon: 'ti-align-left' }]}
        {...taskTabs.bind}
      >
        <div>
          <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-3 mb-1 border-b border-line" placeholder="Task name" />
          {taskTabs.tab === 'overview' && (
            <div className="space-y-3.5 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status"><Select value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={[...statuses.map(s => ({ value: s, label: titleCase(s) }))]} /></Field>
                <Field label="Assignee"><Select value={form.assignee_id} onChange={(v) => setForm({ ...form, assignee_id: v })} options={[{ value: '', label: 'Unassigned' }, ...users.map(u => ({ value: u.id, label: u.full_name }))]} /></Field>
                <Field label="Priority"><Select value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} options={[...priorities.map((p) => ({ value: p, label: titleCase(p) }))]} /></Field>
                <Field label="Due date"><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" /></Field>
              </div>
              <Field label="Project">
                <div className="flex items-center gap-2">
                  <Select value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={[{ value: '', label: 'No project' }, ...projects.map(p => ({ value: p.id, label: p.name }))]} />
                  {form.project_id && (
                    <button type="button" title="Open project page" onClick={() => router.push(`/projects/${form.project_id}`)} className="btn btn-ghost h-9 w-9 px-0 shrink-0 text-muted hover:text-accentstrong"><Icon name="ti-external-link" /></button>
                  )}
                </div>
              </Field>
            </div>
          )}
          {taskTabs.tab === 'more' && (
            <div className="space-y-3.5 mt-4">
              <Field label="Description" hint="Optional — any extra context.">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="textarea h-28" placeholder="Optional details" />
              </Field>
              <Field label="Estimated hours">
                <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} className="input w-40" placeholder="0" />
              </Field>
            </div>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
