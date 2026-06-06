import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { getTasks } from '@/lib/db';
import { Task } from '@/lib/supabase';

const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'On Hold', 'Cancelled'];
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sort, setSort] = useState<'due' | 'priority' | 'name'>('priority');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { getTasks().then(setTasks).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => {
    let r = tasks.filter((t) =>
      (!query || t.name.toLowerCase().includes(query.toLowerCase())) &&
      (statusFilter.size === 0 || statusFilter.has(t.status)) &&
      (!priorityFilter || t.priority === priorityFilter));
    r = [...r].sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) :
      sort === 'due' ? (a.due_date || '9999').localeCompare(b.due_date || '9999') :
      (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
    return r;
  }, [tasks, query, statusFilter, priorityFilter, sort]);

  useEffect(() => { if (!selectedId && filtered.length) setSelectedId(filtered[0].id); }, [filtered, selectedId]);
  const selected = filtered.find((t) => t.id === selectedId) || null;

  const open = tasks.filter((t) => t.status !== 'Done' && t.status !== 'Cancelled');
  const inProgress = tasks.filter((t) => t.status === 'In Progress');
  const overdue = open.filter((t) => isOverdue(t.due_date));

  const toggleStatus = (s: string) => setStatusFilter((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

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

  return (
    <Layout title="Tasks">
      {loading ? <Spinner /> : (
        <div className="flex flex-col h-full">
          <div className="flex gap-3 mb-4">
            <Summary icon="ti-checkbox" tone="bg-sky-50 text-sky-600" label="Open" count={open.length}
              a={['Overdue', String(overdue.length)]} b={['Total', String(tasks.length)]} />
            <Summary icon="ti-progress" tone="bg-amber-50 text-amber-600" label="In progress" count={inProgress.length}
              a={['Review', String(tasks.filter(t => t.status === 'Review').length)]} b={['On hold', String(tasks.filter(t => t.status === 'On Hold').length)]} />
            <Summary icon="ti-circle-check" tone="bg-emerald-50 text-emerald-600" label="Done" count={tasks.filter(t => t.status === 'Done').length}
              a={['Cancelled', String(tasks.filter(t => t.status === 'Cancelled').length)]} b={['Backlog', String(tasks.filter(t => t.status === 'Backlog').length)]} />
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
            <button className="btn btn-primary ml-auto"><Icon name="ti-plus" />New task</button>
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <aside className="w-48 shrink-0 hidden lg:block">
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Status</p>
              <div className="space-y-1">
                {STATUSES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={statusFilter.has(s)} onChange={() => toggleStatus(s)} className="accent-ink" />
                    {s}<span className="ml-auto text-2xs text-neutral-400">{tasks.filter(t => t.status === s).length}</span>
                  </label>
                ))}
              </div>
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mt-5 mb-2">Priority</p>
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input">
                <option value="">All</option>
                {['Urgent', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </aside>

            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No tasks match" /> : filtered.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line transition ${selectedId === t.id ? 'bg-sky-50/60 border-l-2 border-l-sky-500' : 'hover:bg-paper/70 border-l-2 border-l-transparent'}`}>
                  <Bars level={PRIORITY_RANK[t.priority] || 1} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{t.name}</p>
                    <p className="text-2xs text-neutral-500 truncate">{t.projects?.name || '—'}</p>
                  </div>
                  <Pill label={t.status} />
                  <span className={`text-2xs w-16 text-right ${isOverdue(t.due_date) && t.status !== 'Done' ? 'text-rose-600' : 'text-neutral-400'}`}>{t.due_date || '—'}</span>
                </button>
              ))}
            </div>

            <aside className="w-80 shrink-0 hidden xl:block">
              {selected ? (
                <div className="card p-5 sticky top-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Bars level={PRIORITY_RANK[selected.priority] || 1} />
                    <Pill label={selected.priority} />
                    <button className="btn-ghost ml-auto p-1.5 rounded text-neutral-400"><Icon name="ti-dots" /></button>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{selected.name}</h3>
                  <div className="flex gap-2 mt-4">
                    <button className="btn flex-1 text-xs">Mark done</button>
                    <button className="btn flex-1 text-xs">Reassign</button>
                  </div>
                  <dl className="mt-5 space-y-3">
                    {[
                      ['Status', <Pill key="s" label={selected.status} />],
                      ['Project', selected.projects?.name || '—'],
                      ['Due date', selected.due_date || '—'],
                      ['Estimated', `${selected.estimated_hours || 0} h`],
                    ].map(([k, v], i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <dt className="text-neutral-500">{k as string}</dt><dd className="font-medium">{v as any}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 pt-4 border-t border-line">
                    <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Assignee</p>
                    <div className="flex items-center gap-2"><Avatar name="System Administrator" size={28} /><span className="text-sm">System Administrator</span></div>
                  </div>
                </div>
              ) : <div className="card p-5 text-sm text-neutral-400">Select a task</div>}
            </aside>
          </div>
        </div>
      )}
    </Layout>
  );
}
