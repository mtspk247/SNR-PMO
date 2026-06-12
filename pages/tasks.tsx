import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Modal, Field, ModalSection } from '@/components/Modal';
import EntityLink from '@/components/EntityLink';
import { Pill, Spinner, EmptyState, Avatar, Icon, PageHeader } from '@/components/ui';
import { getOrgUsers, createTask, updateTask, deleteTask, notify } from '@/lib/db';
import { Task, OrgUser } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useTasks, useProjects } from '@/lib/queries';
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
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sort, setSort] = useState<'due' | 'priority' | 'name'>('priority');
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    const rank = groupBy === 'priority' ? PRIORITIES : groupBy === 'status' ? STATUSES : null;
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
  const mutate = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
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
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bars level={PRIORITY_RANK[selected.priority] || 1} />
        <Pill label={selected.priority} />
        <Pill label={selected.status} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => openEdit(selected)} disabled={busy} title="Edit task" className="btn-ghost p-1.5 rounded text-muted hover:text-content"><Icon name="ti-pencil" /></button>
          {canDelete && <button onClick={() => removeTask(selected.id, selected.name)} disabled={busy} title="Delete task" className="btn-ghost p-1.5 rounded text-muted hover:text-rose-500"><Icon name="ti-trash" /></button>}
          <button onClick={() => setShowDetail(false)} title="Close" className="btn-ghost p-1.5 rounded text-muted hover:text-content xl:hidden"><Icon name="ti-x" /></button>
        </div>
      </div>
      <h3 className="text-base font-semibold leading-snug text-content">{selected.name}</h3>
      {selected.description && <p className="text-sm text-contentsoft mt-2 whitespace-pre-wrap">{selected.description}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={() => setStatus(selected.id, 'Done')} disabled={busy || selected.status === 'Done'} className="btn btn-primary flex-1 text-xs"><Icon name="ti-check" />Mark done</button>
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Status</dt>
          <dd><select value={selected.status} disabled={busy} onChange={(e) => setStatus(selected.id, e.target.value)} className="input h-8 py-0 text-sm">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Assignee</dt>
          <dd><select value={selected.assignee_id || ''} disabled={busy} onChange={(e) => reassign(e.target.value)} className="input h-8 py-0 text-sm max-w-[10rem]"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></dd>
        </div>
        <div className="flex items-center justify-between"><dt className="text-muted">Project</dt><dd className="font-medium text-content">
          {selected.project_id && selected.projects?.name ? (
            <EntityLink icon="ti-folder" label={selected.projects.name} href={`/projects/${selected.project_id}`}
              actions={can.write(activeOrg) ? [{ label: 'Edit in Projects', icon: 'ti-pencil', onClick: () => router.push('/projects') }] : []} />
          ) : '—'}
        </dd></div>
        <div className="flex items-center justify-between"><dt className="text-muted">Due date</dt><dd className={`font-medium ${isOverdue(selected.due_date) && selected.status !== 'Done' ? 'text-rose-500' : 'text-content'}`}>{selected.due_date || '—'}</dd></div>
        <div className="flex items-center justify-between"><dt className="text-muted">Estimated</dt><dd className="font-medium text-content">{selected.estimated_hours || 0} h</dd></div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted">Repeat</dt>
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
          <dt className="text-muted">Remind me</dt>
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

      {/* Followers */}
      <div className="mt-5 pt-4 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Followers</p>
        <div className="flex flex-col gap-1.5">
          {(selected.followers || []).length === 0 && <p className="text-2xs text-muted2">No followers yet.</p>}
          {(selected.followers || []).map((fid) => (
            <div key={fid} className="flex items-center gap-2 group">
              <Avatar name={userName(fid)} size={24} />
              <span className="text-sm flex-1 truncate text-content">{userName(fid)}</span>
              <button onClick={() => removeFollower(fid)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500"><Icon name="ti-x" className="text-sm" /></button>
            </div>
          ))}
        </div>
        {availFollowers.length > 0 && (
          <select value="" disabled={busy} onChange={(e) => addFollower(e.target.value)} className="input h-8 py-0 text-sm mt-2">
            <option value="">+ Add follower…</option>
            {availFollowers.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        )}
      </div>
      <Checklist taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
      <TimeTracking taskId={selected.id} orgId={selected.org_id as string} projectId={selected.project_id} />
      <EntityTags entityType="task" entityId={selected.id} orgId={selected.org_id} />
      <CommentsThread entityType="task" entityId={selected.id} orgId={selected.org_id} users={users} currentUserId={me?.id} />
    </div>
  );

  const Row = (t: Task) => {
    const subs = tasks.filter((s) => s.parent_task_id === t.id);
    const overdueRow = isOverdue(t.due_date) && t.status !== 'Done' && t.status !== 'Cancelled';
    return (
      <div key={t.id}
        className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 border-b border-line transition cursor-pointer ${selectedId === t.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2/60 border-l-2 border-l-transparent'}`}
        onClick={() => selectTask(t.id)}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Bars level={PRIORITY_RANK[t.priority] || 1} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-content truncate">{t.name}</p>
            <p className="text-2xs text-muted truncate flex items-center gap-2 mt-0.5">
              <span className="truncate">{t.projects?.name || '—'}</span>
              {t.assignee_id && <span className="inline-flex items-center gap-1 shrink-0"><Avatar name={userName(t.assignee_id)} size={14} />{userName(t.assignee_id)}</span>}
              {subs.length > 0 && <span className="inline-flex items-center gap-0.5 shrink-0"><Icon name="ti-subtask" />{subs.filter(s => s.status === 'Done').length}/{subs.length}</span>}
              {(t.followers?.length || 0) > 0 && <span className="inline-flex items-center gap-0.5 shrink-0"><Icon name="ti-eye" />{t.followers!.length}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 pl-7 sm:pl-0">
          <Pill label={t.priority} />
          <select value={t.status} disabled={busy} onClick={(e) => e.stopPropagation()}
            onChange={(e) => setStatus(t.id, e.target.value)}
            className={`pill border-0 cursor-pointer outline-none ${
              t.status === 'Done' ? 'pill-green' : t.status === 'In Progress' ? 'pill-amber' :
              t.status === 'Review' ? 'pill-violet' : t.status === 'Cancelled' || t.status === 'On Hold' ? 'pill-red' : 'pill-blue'
            }`}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className={`text-2xs w-16 text-right shrink-0 ${overdueRow ? 'text-rose-500 font-medium' : 'text-muted2'}`}>{t.due_date || '—'}</span>
          <button onClick={(e) => { e.stopPropagation(); openEdit(t); }} disabled={busy} title="Edit task"
            className="btn-ghost p-1.5 rounded text-muted2 hover:text-content"><Icon name="ti-pencil" className="text-sm" /></button>
          {canDelete && (
            <button onClick={(e) => { e.stopPropagation(); removeTask(t.id, t.name); }} disabled={busy} title="Delete task"
              className="btn-ghost p-1.5 rounded text-muted2 hover:text-rose-500"><Icon name="ti-trash" className="text-sm" /></button>
          )}
        </div>
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

          {/* Toolbar: search, filters, grouping, sort */}
          <div className="flex flex-col gap-3 mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-surface flex-1 min-w-[10rem] max-w-xs">
                <Icon name="ti-search" className="text-muted2" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks"
                  className="bg-transparent outline-none text-sm w-full text-content placeholder:text-muted2" />
              </div>
              <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input h-9 w-auto">
                <option value="">All projects</option>
                <option value="none">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input h-9 w-auto">
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
              <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="input h-9 w-auto">
                <option value="">All assignees</option>
                <option value="unassigned">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              <button onClick={() => setOverdueOnly((v) => !v)}
                className={`pill cursor-pointer transition h-9 px-3 ${overdueOnly ? 'bg-rose-500/15 text-rose-600 font-medium' : 'bg-surface2 text-muted hover:text-content'}`}>
                <Icon name="ti-alarm" className="mr-1" />Overdue
              </button>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} className="input h-9 w-auto">
                <option value="none">No grouping</option>
                <option value="project">Group: Project</option>
                <option value="priority">Group: Priority</option>
                <option value="status">Group: Status</option>
              </select>
              <span className="text-2xs text-muted2 ml-1 hidden sm:inline">Sort</span>
              <div className="flex items-center gap-1">
                {(['priority', 'due', 'name'] as const).map((s) => (
                  <button key={s} onClick={() => setSort(s)}
                    className={`h-8 px-2.5 rounded-md text-xs capitalize ${sort === s ? 'bg-surface border border-line text-content' : 'text-muted hover:text-content'}`}>{s}</button>
                ))}
              </div>
            </div>

            {/* Status filter pills — horizontal, wraps on small screens */}
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className={`pill cursor-pointer transition ${statusFilter.has(s) ? 'bg-accent text-accentfg' : 'bg-surface2 text-muted hover:text-content'}`}>
                  {s}<span className="ml-1 opacity-70">{roots.filter(t => t.status === s).length}</span>
                </button>
              ))}
              {statusFilter.size > 0 && (
                <button onClick={() => setStatusFilter(new Set())} className="text-2xs text-muted hover:text-content underline ml-1">Clear</button>
              )}
            </div>
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No tasks match" /> : groupedPage ? (
                groupedPage.map(([label, items]) => (
                  <div key={label}>
                    <div className="sticky top-0 z-10 px-4 py-1.5 bg-surface2/90 backdrop-blur border-b border-line flex items-center gap-2">
                      <span className="text-2xs font-semibold uppercase tracking-wide text-muted">{label}</span>
                      <span className="text-2xs text-muted2">{items.length}</span>
                    </div>
                    {items.map(Row)}
                  </div>
                ))
              ) : pg.pageItems.map(Row)}
              {filtered.length > 0 && (
                <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
              )}
            </div>

            {/* Detail sidebar — visible permanently on xl+ */}
            <aside className="w-80 shrink-0 hidden xl:block overflow-y-auto">
              <DetailPanel />
            </aside>
          </div>
        </div>
      )}

      {/* Detail drawer — overlay on screens below xl */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-stretch justify-end xl:hidden" onClick={() => setShowDetail(false)}>
          <div className="bg-surface w-full max-w-sm h-full overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <DetailPanel />
          </div>
        </div>
      )}

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
      >
        <div>
          <ModalSection title="Basics" icon="ti-align-left">
            <div className="space-y-3.5">
              <Field label="Name" required hint="What needs doing?">
                <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="What needs doing?" />
              </Field>
              <Field label="Description" hint="Optional — any extra context.">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="textarea h-20" placeholder="Optional details" />
              </Field>
              <Field label="Project">
                <div className="flex items-center gap-2">
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className="input"><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  {form.project_id && (
                    <button type="button" title="Open project page" onClick={() => router.push(`/projects/${form.project_id}`)}
                      className="btn btn-ghost h-9 w-9 px-0 shrink-0 text-muted hover:text-accentstrong"><Icon name="ti-external-link" /></button>
                  )}
                </div>
              </Field>
            </div>
          </ModalSection>
          <ModalSection title="Planning" icon="ti-calendar-stats">
            <div className="space-y-3.5">
              <div className="flex gap-3">
                <Field label="Priority" className="flex-1">
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>
                </Field>
                <Field label="Status" className="flex-1">
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
                </Field>
              </div>
              <div className="flex gap-3">
                <Field label="Due date" className="flex-1">
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
                </Field>
                <Field label="Estimated hours" className="flex-1">
                  <input type="number" min="0" step="0.5" value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} className="input" placeholder="0" />
                </Field>
              </div>
            </div>
          </ModalSection>
          <ModalSection title="People" icon="ti-users">
            <Field label="Assignee">
              <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })} className="input"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
            </Field>
          </ModalSection>
        </div>
      </Modal>
    </Layout>
  );
}
