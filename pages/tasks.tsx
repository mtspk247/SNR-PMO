import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { getTasks, getOrgUsers, getProjects, createTask, updateTask, deleteTask } from '@/lib/db';
import { Task, OrgUser, Project } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';

const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'On Hold', 'Cancelled'];
const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low'];
const PRIORITY_RANK: Record<string, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
const isOverdue = (d: string | null) => !!d && new Date(d) < new Date(new Date().toDateString());

const Bars = ({ level }: { level: number }) => (
  <span className="inline-flex items-end gap-0.5 h-3.5" aria-hidden="true">
    {[1, 2, 3, 4].map((i) => (
      <span key={i} style={{ height: `${i * 25}%` }}
        className={`w-1 rounded-sm ${i <= level ? (level >= 4 ? 'bg-rose-500' : level === 3 ? 'bg-amber-500' : 'bg-sky-500') : 'bg-neutral-200'}`} />
    ))}
  </span>
);

export default function Tasks() {
  const activeOrg = useActiveOrg();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sort, setSort] = useState<'due' | 'priority' | 'name'>('priority');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subInput, setSubInput] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [nt, setNt] = useState({ name: '', project_id: '', priority: 'Medium', due_date: '', assignee_id: '' });

  useEffect(() => {
    Promise.all([getTasks(), getOrgUsers(), getProjects()])
      .then(([t, u, p]) => { setTasks(t); setUsers(u); setProjects(p); })
      .finally(() => setLoading(false));
  }, []);

  const userName = (id?: string | null) => users.find((u) => u.id === id)?.full_name || (id ? '—' : 'Unassigned');
  const patchLocal = (u: Task) => setTasks((prev) => prev.map((t) => (t.id === u.id ? u : t)));

  const roots = useMemo(() => tasks.filter((t) => !t.parent_task_id), [tasks]);
  const filtered = useMemo(() => {
    let r = roots.filter((t) =>
      (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
      (statusFilter.size === 0 || statusFilter.has(t.status)) &&
      (!priorityFilter || t.priority === priorityFilter));
    r = [...r].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) :
      sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') :
      (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
    return r;
  }, [roots, query, statusFilter, priorityFilter, sort]);

  useEffect(() => { if (!selectedId && filtered.length) setSelectedId(filtered[0].id); }, [filtered, selectedId]);
  const selected = tasks.find((t) => t.id === selectedId) || null;
  const subtasks = useMemo(() => tasks.filter((t) => t.parent_task_id === selectedId), [tasks, selectedId]);

  const open = roots.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const inProgress = roots.filter((t) => t.status === 'In Progress');
  const overdue = open.filter((t) => isOverdue(t.due_date));

  const toggleStatus = (s: string) => setStatusFilter((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  // ----- mutations -----
  const mutate = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const setStatus = (id: string, status: string) => mutate(async () => patchLocal(await updateTask(id, { status })));
  const reassign = (assignee_id: string) => selected && mutate(async () => patchLocal(await updateTask(selected.id, { assignee_id: assignee_id || null })));
  const addSubtask = () => {
    if (!selected || !subInput.trim()) return;
    mutate(async () => {
      const st = await createTask({ name: subInput.trim(), org_id: selected.org_id as string, project_id: selected.project_id, parent_task_id: selected.id, priority: 'Medium', status: 'To Do' });
      setTasks((p) => [...p, st]); setSubInput('');
    });
  };
  const toggleSub = (st: Task) => mutate(async () => patchLocal(await updateTask(st.id, { status: st.status === 'Done' ? 'To Do' : 'Done' })));
  const addFollower = (uid: string) => { if (!selected || !uid) return; const cur = selected.followers || []; if (cur.includes(uid)) return; mutate(async () => patchLocal(await updateTask(selected.id, { followers: [...cur, uid] }))); };
  const removeFollower = (uid: string) => selected && mutate(async () => patchLocal(await updateTask(selected.id, { followers: (selected.followers || []).filter((x) => x !== uid) })));
  const removeTask = (id: string) => mutate(async () => { await deleteTask(id); setTasks((p) => p.filter((t) => t.id !== id)); if (selectedId === id) setSelectedId(null); });
  const submitNew = () => {
    if (!nt.name.trim() || !activeOrg) return;
    mutate(async () => {
      const t = await createTask({ name: nt.name.trim(), org_id: activeOrg.id, project_id: nt.project_id || null, priority: nt.priority, due_date: nt.due_date || null, assignee_id: nt.assignee_id || null, status: 'To Do' });
      setTasks((p) => [...p, t]); setSelectedId(t.id); setShowNew(false);
      setNt({ name: '', project_id: '', priority: 'Medium', due_date: '', assignee_id: '' });
    });
  };

  const Summary = ({ icon, tone, label, count, a, b }:
    { icon: string; tone: string; label: string; count: number; a: [string, string]; b: [string, string] }) => (
    <div className="stat flex-1">
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-md grid place-items-center ${tone}`}><Icon name={icon} className="text-sm" /></span>
        <span className="text-sm font-medium">{label}</span>
        <span className="ml-auto text-lg font-semibold">{count}</span>
      </div>
      <div className="flex gap-6 mt-3">
        <div><p className="text-2xs text-neutral-400">{a[0]}</p><p className="text-sm font-medium mt-0.5">{a[1]}</p></div>
        <div><p className="text-2xs text-neutral-400">{b[0]}</p><p className="text-sm font-medium mt-0.5">{b[1]}</p></div>
      </div>
    </div>
  );

  const doneSubs = subtasks.filter((s) => s.status === 'Done').length;
  const availFollowers = users.filter((u) => !(selected?.followers || []).includes(u.id));

  return (
    <Layout title="Tasks">
      {loading ? <Spinner /> : (
        <div className="flex flex-col h-full">
          <div className="flex gap-3 mb-4">
            <Summary icon="ti-checkbox" tone="bg-sky-50 text-sky-600" label="Open" count={open.length}
              a={['Overdue', String(overdue.length)]} b={['Total', String(roots.length)]} />
            <Summary icon="ti-progress" tone="bg-amber-50 text-amber-600" label="In progress" count={inProgress.length}
              a={['Review', String(roots.filter(t => t.status === 'Review').length)]} b={['On hold', String(roots.filter(t => t.status === 'On Hold').length)]} />
            <Summary icon="ti-circle-check" tone="bg-emerald-50 text-emerald-600" label="Done" count={roots.filter(t => t.status === 'Done').length}
              a={['Cancelled', String(roots.filter(t => t.status === 'Cancelled').length)]} b={['Backlog', String(roots.filter(t => t.status === 'Backlog').length)]} />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-white flex-1 max-w-xs">
              <Icon name="ti-search" className="text-neutral-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks"
                className="bg-transparent outline-none text-sm w-full" />
            </div>
            <span className="text-2xs text-neutral-400 ml-2">Sort</span>
            {(['priority', 'due', 'name'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={`h-8 px-2.5 rounded-md text-xs capitalize ${sort === s ? 'bg-white border border-line text-ink' : 'text-neutral-500'}`}>{s}</button>
            ))}
            <button onClick={() => setShowNew(true)} className="btn btn-primary ml-auto"><Icon name="ti-plus" />New task</button>
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <aside className="w-48 shrink-0 hidden lg:block">
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Status</p>
              <div className="space-y-1">
                {STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} className="accent-ink" />
                    {s}<span className="ml-auto text-2xs text-neutral-400">{roots.filter(t => t.status === s).length}</span>
                  </label>
                ))}
              </div>
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mt-5 mb-2">Priority</p>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input">
                <option value="">All</option>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </aside>

            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No tasks match" /> : filtered.map((t) => {
                const subs = tasks.filter((s) => s.parent_task_id === t.id);
                return (
                  <button key={t.id} onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line transition ${selectedId === t.id ? 'bg-sky-50/60 border-l-2 border-l-sky-500' : 'hover:bg-paper/70 border-l-2 border-l-transparent'}`}>
                    <Bars level={PRIORITY_RANK[t.priority] || 1} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink truncate">{t.name}</p>
                      <p className="text-2xs text-neutral-500 truncate flex items-center gap-2">
                        <span>{t.projects?.name || '—'}</span>
                        {subs.length > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="ti-subtask" />{subs.filter(s => s.status === 'Done').length}/{subs.length}</span>}
                        {(t.followers?.length || 0) > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="ti-eye" />{t.followers!.length}</span>}
                      </p>
                    </div>
                    <Pill label={t.status} />
                    <span className={`text-2xs w-16 text-right ${isOverdue(t.due_date) && t.status !== 'Done' ? 'text-rose-600' : 'text-neutral-400'}`}>{t.due_date || '—'}</span>
                  </button>
                );
              })}
            </div>

            <aside className="w-80 shrink-0 hidden xl:block overflow-y-auto">
              {selected ? (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Bars level={PRIORITY_RANK[selected.priority] || 1} />
                    <Pill label={selected.priority} />
                    <button onClick={() => removeTask(selected.id)} disabled={busy} title="Delete task" className="btn-ghost ml-auto p-1.5 rounded text-neutral-400 hover:text-rose-600"><Icon name="ti-trash" /></button>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{selected.name}</h3>

                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setStatus(selected.id, 'Done')} disabled={busy || selected.status === 'Done'} className="btn btn-primary flex-1 text-xs"><Icon name="ti-check" />Mark done</button>
                  </div>

                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-neutral-500">Status</dt>
                      <dd><select value={selected.status} disabled={busy} onChange={(e) => setStatus(selected.id, e.target.value)} className="input h-8 py-0 text-sm">{STATUSES.map(s => <option key={s}>{s}</option>)}</select></dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-neutral-500">Assignee</dt>
                      <dd><select value={selected.assignee_id || ''} disabled={busy} onChange={(e) => reassign(e.target.value)} className="input h-8 py-0 text-sm max-w-[10rem]"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></dd>
                    </div>
                    <div className="flex items-center justify-between"><dt className="text-neutral-500">Project</dt><dd className="font-medium">{selected.projects?.name || '—'}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-neutral-500">Due date</dt><dd className={`font-medium ${isOverdue(selected.due_date) && selected.status !== 'Done' ? 'text-rose-600' : ''}`}>{selected.due_date || '—'}</dd></div>
                    <div className="flex items-center justify-between"><dt className="text-neutral-500">Estimated</dt><dd className="font-medium">{selected.estimated_hours || 0} h</dd></div>
                  </dl>

                  {/* Subtasks */}
                  <div className="mt-5 pt-4 border-t border-line">
                    <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Subtasks {subtasks.length > 0 && <span className="text-neutral-300">· {doneSubs}/{subtasks.length}</span>}</p>
                    <div className="space-y-1.5">
                      {subtasks.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 group">
                          <input type="checkbox" checked={st.status === 'Done'} disabled={busy} onChange={() => toggleSub(st)} className="accent-ink" />
                          <span className={`text-sm flex-1 truncate ${st.status === 'Done' ? 'line-through text-neutral-400' : ''}`}>{st.name}</span>
                          <button onClick={() => removeTask(st.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-rose-600"><Icon name="ti-x" className="text-sm" /></button>
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
                    <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Followers</p>
                    <div className="flex flex-col gap-1.5">
                      {(selected.followers || []).length === 0 && <p className="text-2xs text-neutral-400">No followers yet.</p>}
                      {(selected.followers || []).map((fid) => (
                        <div key={fid} className="flex items-center gap-2 group">
                          <Avatar name={userName(fid)} size={24} />
                          <span className="text-sm flex-1 truncate">{userName(fid)}</span>
                          <button onClick={() => removeFollower(fid)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-neutral-300 hover:text-rose-600"><Icon name="ti-x" className="text-sm" /></button>
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
                </div>
              ) : <div className="card p-5 text-sm text-neutral-400">Select a task</div>}
            </aside>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">New task</h3>
            <div className="space-y-3">
              <div><label className="label">Name</label><input autoFocus value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} className="input" placeholder="What needs doing?" /></div>
              <div><label className="label">Project</label><select value={nt.project_id} onChange={(e) => setNt({ ...nt, project_id: e.target.value })} className="input"><option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="label">Priority</label><select value={nt.priority} onChange={(e) => setNt({ ...nt, priority: e.target.value })} className="input">{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></div>
                <div className="flex-1"><label className="label">Due date</label><input type="date" value={nt.due_date} onChange={(e) => setNt({ ...nt, due_date: e.target.value })} className="input" /></div>
              </div>
              <div><label className="label">Assignee</label><select value={nt.assignee_id} onChange={(e) => setNt({ ...nt, assignee_id: e.target.value })} className="input"><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="btn flex-1">Cancel</button>
              <button onClick={submitNew} disabled={busy || !nt.name.trim()} className="btn btn-primary flex-1">Create task</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
