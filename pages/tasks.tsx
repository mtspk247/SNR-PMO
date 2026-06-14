import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import StatusManager from '@/components/StatusManager';
import EntityLink from '@/components/EntityLink';
import { Pill, Spinner, EmptyState, Avatar, Icon, PageHeader, StatusBadge, statusMeta } from '@/components/ui';
import { getOrgUsers, createTask, updateTask, deleteTask, notify, ensureTaskStatuses, createTaskStatus, updateTaskStatusDef, deleteTaskStatusDef, TaskStatus } from '@/lib/db';
import { Task, OrgUser } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useTasks, useProjects, useTeams } from '@/lib/queries';
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

type GroupBy = 'none' | 'project' | 'priority' | 'status';

export default function Tasks() {
  const router = useRouter();
  const activeOrg = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const canDelete = can.write(activeOrg);
  const qc = useQueryClient();
  const { data: tasks = [], isLoading: tasksLoading } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: teams = [] } = useTeams();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
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
  const activeFilters = (projectFilter ? 1 : 0) + (priorityFilter ? 1 : 0) + (assigneeFilter ? 1 : 0) + (overdueOnly ? 1 : 0);
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
    let r = roots.filter((t) =>
      (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
      (statusFilter.size === 0 || statusFilter.has(t.status)) &&
      (!priorityFilter || t.priority === priorityFilter) &&
      (!projectFilter || (projectFilter === 'none' ? !t.project_id : t.project_id === projectFilter)) &&
      (!assigneeFilter || (assigneeFilter === 'unassigned' ? !t.assignee_id : t.assignee_id === assigneeFilter)) &&
      (!overdueOnly || (isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled')));
    r = [...r].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) :
      sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') :
      (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
    return r;
  }, [roots, query, statusFilter, priorityFilter, projectFilter, assigneeFilter, overdueOnly, sort]);
  const pg = usePagination(filtered, 25);

  // Grouped view over the current page (header order: known rank lists, else A→Z).
  const groupedPage = useMemo(() => {
    if (groupBy === 'none') return null;
    const keyOf = (t: Task) =>
      groupBy === 'project' ? (t.projects?.name || 'No project') :
      groupBy === 'priority' ? (t.priority || 'None') : (t.status || 'None');
    const m = new Map<string, Task[]>();
    pg.pageItems.forEach((t) => { const k = keyOf(t); m.set(k, [...(m.get(k) || []), t]); });
    const rank = groupBy === 'priority' ? PRIORITIES : groupBy === 'status' ? statuses : null;
    return Array.from(m.entries()).sort(([a], [b]) =>
      rank ? rank.indexOf(a) - rank.indexOf(b) : a.localeCompare(b));
  }, [pg.pageItems, groupBy]);

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

  const mutate = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };

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

  // ----- shared detail panel (used as sidebar on xl+, overlay drawer below) -----
  const DetailPanel = () => !selected ? (
    <div className="card p-5 text-sm text-muted">Select a task to see details</div>
  ) : (
    <div className="card flex flex-col lg:flex-row max-h-[85vh] overflow-hidden">
      <div className="flex-1 min-w-0 overflow-y-auto p-5">
      {/* Address / breadcrumb */}
      <div className="flex items-center gap-1.5 text-2xs text-muted2 mb-3 min-w-0">
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

      <div className="flex items-start gap-2">
        <Bars level={PRIORITY_RANK[selected.priority] || 1} />
        <h3 className="flex-1 text-xl font-semibold leading-snug tracking-tight text-content">{selected.name}</h3>
      </div>

      {/* Status stepper — move the task back / forward through categories */}
      {(() => {
        const idx = statuses.indexOf(selected.status);
        const prev = idx > 0 ? statuses[idx - 1] : null;
        const next = idx >= 0 && idx < statuses.length - 1 ? statuses[idx + 1] : null;
        return (
          <div className="flex items-center gap-2 mt-3">
            <button disabled={busy || !prev} onClick={() => prev && setStatus(selected.id, prev)} title={prev ? `Move back to ${prev}` : 'First status'} className="btn h-9 w-9 p-0 shrink-0"><Icon name="ti-chevron-left" /></button>
            <select value={selected.status} disabled={busy} onChange={(e) => setStatus(selected.id, e.target.value)} className="input h-9 flex-1 font-medium">{statuses.map((st) => <option key={st}>{st}</option>)}</select>
            <button disabled={busy || !next} onClick={() => next && setStatus(selected.id, next)} title={next ? `Move to ${next}` : 'Last status'} className="btn btn-primary h-9 px-3 text-xs gap-1 shrink-0 whitespace-nowrap">{next ? <>{next}<Icon name="ti-chevron-right" /></> : <><Icon name="ti-check" />Done</>}</button>
          </div>
        );
      })()}

      {/* Top meta — followers · time tracking · tags (above the fold, ClickUp-style) */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3 pb-4 border-b border-line">
        <div>
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Followers</p>
          <div className="flex items-center flex-wrap gap-1.5">
            {(selected.followers || []).map((fid) => (
              <span key={fid} className="group relative" title={userName(fid)}>
                <Avatar name={userName(fid)} size={26} />
                <button onClick={() => removeFollower(fid)} disabled={busy} className="absolute -top-1 -right-1 hidden group-hover:grid h-3.5 w-3.5 place-items-center rounded-full bg-rose-500 text-white text-[8px]"><Icon name="ti-x" /></button>
              </span>
            ))}
            {availFollowers.length > 0 && (
              <select value="" disabled={busy} onChange={(e) => addFollower(e.target.value)} className="input h-7 w-8 px-0 text-center text-muted2" title="Add follower">
                <option value="">+</option>
                {availFollowers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            )}
          </div>
        </div>
        <div><TimeTracking taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} /></div>
        <div><EntityTags entityType="task" entityId={selected.id} orgId={selected.org_id} /></div>
      </div>

      {selected.description && <p className="text-sm text-contentsoft mt-4 whitespace-pre-wrap">{selected.description}</p>}

      <dl className="mt-5 pt-4 border-t border-line space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-muted"><Icon name="ti-user" className="text-base text-muted2 shrink-0" />Assignee</dt>
          <dd><select value={selected.assignee_id || ''} disabled={busy} onChange={(e) => reassign(e.target.value)} className="input h-8 py-0 text-sm max-w-[10rem]"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></dd>
        </div>
        <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-muted"><Icon name="ti-folder" className="text-base text-muted2 shrink-0" />Project</dt><dd className="font-medium text-content">
          {selected.project_id && selected.projects?.name ? (
            <EntityLink icon="ti-folder" label={selected.projects.name} href={`/projects/${selected.project_id}`}
              actions={can.write(activeOrg) ? [{ label: 'Edit in Projects', icon: 'ti-pencil', onClick: () => router.push('/projects') }] : []} />
          ) : '—'}
        </dd></div>
        <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-muted"><Icon name="ti-calendar" className="text-base text-muted2 shrink-0" />Due date</dt><dd className={`font-medium ${isOverdue(selected.due_date) && selected.status !== 'Done' ? 'text-rose-500' : 'text-content'}`}>{selected.due_date || '—'}</dd></div>
        <div className="flex items-center justify-between"><dt className="flex items-center gap-2 text-muted"><Icon name="ti-clock" className="text-base text-muted2 shrink-0" />Estimated</dt><dd className="font-medium text-content">{selected.estimated_hours || 0} h</dd></div>
        {teams.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <dt className="flex items-center gap-2 text-muted"><Icon name="ti-users-group" className="text-base text-muted2 shrink-0" />Team</dt>
            <dd>
              <select value={selected.team_id || ''} disabled={busy}
                onChange={(e) => mutate(async () => patchLocal(await updateTask(selected.id, { team_id: e.target.value || null })))}
                className="input h-8 py-0 text-sm max-w-[10rem]">
                <option value="">—</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-muted"><Icon name="ti-repeat" className="text-base text-muted2 shrink-0" />Repeat</dt>
          <dd>
            <select value={selected.recur_every || ''} disabled={busy}
              onChange={(e) => mutate(async () => patchLocal(await updateTask(selected.id, { recur_every: (e.target.value || null) as Task['recur_every'] })))}
              className="input h-8 py-0 text-sm">
              <option value="">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="flex items-center gap-2 text-muted"><Icon name="ti-bell" className="text-base text-muted2 shrink-0" />Remind me</dt>
          <dd>
            <input type="datetime-local" disabled={busy} value="" className="input h-8 py-0 text-sm"
              onChange={(e) => {
                if (!e.target.value || !me || !selected.org_id) return;
                const at = new Date(e.target.value);
                createReminder({ org_id: selected.org_id, user_id: me.id, note: `Task: ${selected.name}`, remind_at: at.toISOString(), entity_type: 'task', entity_id: selected.id })
                  .then(() => alert(`Reminder set for ${at.toLocaleString()}`)).catch((er) => alert(er.message));
              }} />
          </dd>
        </div>
      </dl>

      {/* Custom fields (per-project, ClickUp-style) */}
      <TaskCustomFields task={selected} />

      {/* Subtasks */}
      <div className="mt-5 pt-4 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Subtasks {subtasks.length > 0 && <span className="text-muted2">· {doneSubs}/{subtasks.length}</span>}</p>
        <div className="space-y-1.5">
          {subtasks.map((st) => (
            <div key={st.id} className="flex items-center gap-2 group">
              <input type="checkbox" checked={st.status === 'Done'} disabled={busy} onChange={() => toggleSub(st)} className="accent-accentstrong" />
              <span className={`text-sm flex-1 truncate ${st.status === 'Done' ? 'line-through text-muted2' : 'text-content'}`}>{st.name}</span>
              <button onClick={() => removeTask(st.id, st.name)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            placeholder="Add a subtask…" className="input h-8 text-sm" />
          <button onClick={addSubtask} disabled={busy || !subInput.trim()} className="btn h-8 px-2 text-xs"><Icon name="ti-plus" /></button>
        </div>
      </div>

      <Checklist taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
      </div>
      <div className="lg:w-[22rem] shrink-0 border-t lg:border-t-0 lg:border-l border-line overflow-y-auto p-5 bg-surface2/20">
        <p className="section-label mb-3 flex items-center gap-2"><Icon name="ti-activity" className="text-base text-muted2" />Activity</p>
        <CommentsThread entityType="task" entityId={selected.id} orgId={selected.org_id} users={users} currentUserId={me?.id} />
      </div>
    </div>
  );

  const BoardView = () => (
    <div className="flex-1 min-w-0 overflow-x-auto pb-2">
      <div className="flex gap-3 h-full">
        {statuses.map((st) => {
          const items = filtered.filter((t) => t.status === st);
          return (
            <div key={st}
              onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== st) setDragOverCol(st); }}
              onDrop={() => { if (dragId) { const tk = tasks.find((x) => x.id === dragId); if (tk && tk.status !== st) setStatus(dragId, st); } setDragId(null); setDragOverCol(null); }}
              className={`w-72 shrink-0 flex flex-col min-h-0 rounded-xl p-1 transition ${dragOverCol === st ? 'ring-2 ring-inset ring-accent/50 bg-accent/5' : ''}`}>
              <div className="flex items-center gap-2 mb-2 px-0.5">
                <StatusBadge status={st} solid color={statusColor(st)} />
                <span className="text-2xs font-medium text-muted2 tnum">{items.length}</span>
                <button onClick={() => { setForm({ ...EMPTY_FORM, status: st }); setModal({ mode: 'create' }); }}
                  title="Add task" className="ml-auto text-muted2 hover:text-content transition"><Icon name="ti-plus" className="text-sm" /></button>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                {items.map((t) => {
                  const od = isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled';
                  return (
                    <button key={t.id} draggable
                      onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                      onClick={() => selectTask(t.id)}
                      className={`card card-interactive w-full text-left p-3 cursor-grab active:cursor-grabbing ${selectedId === t.id ? 'border-accent' : ''} ${dragId === t.id ? 'opacity-95 shadow-lg ring-2 ring-accent/50 scale-[1.03] rotate-1' : ''}`}>
                      <p className="text-sm font-medium text-content truncate">{t.name}</p>
                      <p className="text-2xs text-muted truncate mt-1">{t.projects?.name || '—'}</p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <Pill label={t.priority} />
                        {t.due_date && <span className={`text-2xs tnum ${od ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{t.due_date}</span>}
                        {t.assignee_id && <span className="ml-auto shrink-0"><Avatar name={userName(t.assignee_id)} size={20} /></span>}
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && <p className="text-2xs text-muted2 px-1 py-6 text-center">No tasks</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const shownCols = colOrder.map((id) => COL_DEFS.find((c) => c.id === id)!).filter((c) => c && visibleCols.has(c.id));
  const moveCol = (id: string, dir: number) => setColOrder((o) => { const i = o.indexOf(id); const j = i + dir; if (j < 0 || j >= o.length) return o; const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const gridStyle = { gridTemplateColumns: `minmax(200px,1fr) ${shownCols.map((c) => c.w).join(' ')} 48px` } as React.CSSProperties;
  const GRID = 'grid items-center gap-2 px-4';

  const cell = (t: Task, id: string) => {
    switch (id) {
      case 'status':
        return (
          <select key={id} value={t.status} disabled={busy} onClick={(e) => e.stopPropagation()} onChange={(e) => setStatus(t.id, e.target.value)}
            className={`w-full rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset cursor-pointer outline-none ${statusMeta(t.status).soft}`}>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        );
      case 'assignee':
        return <div key={id} className="flex items-center min-w-0">{t.assignee_id ? <span title={userName(t.assignee_id)} className="inline-flex cursor-default"><Avatar name={userName(t.assignee_id)} size={22} /></span> : <span className="text-muted2 text-2xs">—</span>}</div>;
      case 'priority':
        return <div key={id}><Pill label={t.priority} /></div>;
      case 'project':
        return <span key={id} className="text-2xs text-muted truncate">{t.projects?.name || '—'}</span>;
      case 'created':
        return <span key={id} className="text-2xs text-muted2 tnum">{new Date(t.created_at).toLocaleDateString()}</span>;
      case 'due': {
        const od = isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled';
        return <span key={id} className={`text-2xs tnum ${od ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{t.due_date || '—'}</span>;
      }
      default:
        return <span key={id} />;
    }
  };

  const ColHeader = () => (
    <div className={`${GRID} py-2 border-b border-line bg-surface2/60 text-2xs font-semibold uppercase tracking-wider text-muted2`} style={gridStyle}>
      <span className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} onClick={(e) => e.stopPropagation()} className="accent-accentstrong" title="Select all" />Name</span>
      {shownCols.map((c) => <span key={c.id}>{c.label}</span>)}
      <span />
    </div>
  );

  const Row = (t: Task) => {
    const subs = tasks.filter((s) => s.parent_task_id === t.id);
    return (
      <div key={t.id}
        className={`group relative ${GRID} py-2.5 border-b border-line transition cursor-pointer ${selectedId === t.id ? 'bg-accent/5 border-l-2 border-l-accent z-10' : 'bg-surface hover:bg-surface2 hover:shadow-md hover:z-10 border-l-2 border-l-transparent'}`}
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
      className={`group relative ${GRID} py-2 border-b border-line transition cursor-pointer ${selectedId === t.id ? 'bg-accent/5 z-10' : 'bg-surface2/40 hover:bg-surface2 hover:shadow-md hover:z-10'}`}
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
          <PageHeader title="Tasks" subtitle="Track work across all your projects"
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
              {filterMenu && (
                <div className="absolute right-0 top-10 z-20 w-64 bg-surface border border-line rounded-lg shadow-lg p-3 space-y-3">
                  <div><label className="label">Project</label>
                    <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input h-9 w-full">
                      <option value="">All projects</option><option value="none">No project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select></div>
                  <div><label className="label">Priority</label>
                    <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input h-9 w-full">
                      <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                    </select></div>
                  <div><label className="label">Assignee</label>
                    <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="input h-9 w-full">
                      <option value="">All assignees</option><option value="unassigned">Unassigned</option>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select></div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={overdueOnly} onChange={() => setOverdueOnly((v) => !v)} className="accent-accentstrong" />Overdue only</label>
                  {activeFilters > 0 && <button onClick={() => { setProjectFilter(''); setPriorityFilter(''); setAssigneeFilter(''); setOverdueOnly(false); }} className="text-2xs text-muted hover:text-content underline">Clear all filters</button>}
                </div>
              )}
            </div>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="input h-9 w-auto">
              <option value="none">No grouping</option><option value="project">Group: Project</option><option value="priority">Group: Priority</option><option value="status">Group: Status</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'due' | 'priority' | 'name')} className="input h-9 w-auto">
              <option value="priority">Sort: Priority</option><option value="due">Sort: Due date</option><option value="name">Sort: Name</option>
            </select>
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
            <div className="h-full overflow-auto bg-surface">
              <div className="min-w-[960px]">
              {filtered.length === 0 ? <EmptyState text="No tasks match" /> : groupedPage ? (
                groupedPage.map(([label, items]) => {
                  const gcol = collapsedGroups.has(label);
                  return (
                  <div key={label} className="mt-2 first:mt-0">
                    <div draggable={groupBy === 'status' && taskStatuses.length > 0}
                      onDragStart={() => setDragGroup(label)}
                      onDragOver={(e) => { if (dragGroup && groupBy === 'status') e.preventDefault(); }}
                      onDrop={() => { if (dragGroup) reorderStatuses(dragGroup, label); setDragGroup(null); }}
                      onDragEnd={() => setDragGroup(null)}
                      className={`sticky top-0 z-10 px-4 py-2.5 bg-surface2 border-y border-line flex items-center gap-2.5 ${groupBy === 'status' && taskStatuses.length > 0 ? 'cursor-grab' : ''} ${dragGroup === label ? 'ring-1 ring-inset ring-accent/50' : ''}`}>
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
                    {!gcol && <ColHeader />}
                    {!gcol && items.map(renderTask)}
                  </div>
                  );
                })
              ) : (<><ColHeader />{pg.pageItems.map(renderTask)}</>)}
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
          <select className="input h-8 w-auto py-0 text-sm" value="" onChange={(e) => { if (e.target.value) bulkAssignUser(e.target.value === '__un' ? '' : e.target.value); e.target.value = ''; }}>
            <option value="">Assign to…</option>
            <option value="__un">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <select className="input h-8 w-auto py-0 text-sm" value="" onChange={(e) => { if (e.target.value) bulkAssignTeam(e.target.value); e.target.value = ''; }}>
            <option value="">Team…</option>
            {teams.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
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
                <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">{statuses.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Assignee"><select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className="input"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></Field>
                <Field label="Priority"><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></Field>
                <Field label="Due date"><input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" /></Field>
              </div>
              <Field label="Project">
                <div className="flex items-center gap-2">
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className="input"><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
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
