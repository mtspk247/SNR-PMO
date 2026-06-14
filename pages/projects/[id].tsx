import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Pill, Spinner, EmptyState, StatCard, Icon, Tabs, StatusBadge } from '@/components/ui';
import CommentsThread from '@/components/Comments';
import EntityTags from '@/components/EntityTags';
import { Modal, Field } from '@/components/Modal';
import { createGuest } from '@/lib/db';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import {
  getProjectById, getTasks, getRisks, getFinancials, getLedgerEntries,
  getOrgUsers, getOrgCompanies, getPortfolios,
  createTask, listGuestRequests, createGuestRequest, decideGuestRequest, GuestRequest,
  listGuestDocuments, uploadGuestDocument, guestDocumentUrl, deleteGuestDocument, GuestDocument,
} from '@/lib/db';
import { Project, Task, Risk, Financial, LedgerEntry, OrgUser, OrgCompany, Portfolio } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const DONE = ['Completed', 'Done'];

export default function ProjectDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const [guestModal, setGuestModal] = useState(false);
  const [gName, setGName] = useState(''); const [gEmail, setGEmail] = useState(''); const [gBusy, setGBusy] = useState(false);
  const isOrgAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const inviteGuest = async () => {
    if (!org || !gName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail.trim())) return;
    setGBusy(true);
    try {
      await createGuest({ org_id: org.id, email: gEmail.trim(), name: gName.trim(), project_id: String(router.query.id) });
      setGuestModal(false); setGName(''); setGEmail('');
      alert('Guest invited — they get access to this project only once they sign in with that email.');
    } catch (e: any) { alert(e.message); } finally { setGBusy(false); }
  };
  const me = useAuthStore((s) => s.user);

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('overview');
  const [taskStatus, setTaskStatus] = useState<string>('all');

  useSetCrumbs(project ? [{ label: 'Projects', href: '/projects' }, { label: project.name }] : null);

  useEffect(() => {
    if (!id) return;
    setLoading(true); setNotFound(false);
    Promise.all([
      getProjectById(id),
      getTasks().catch(() => [] as Task[]),
      getRisks().catch(() => [] as Risk[]),
      getFinancials().catch(() => [] as Financial[]),
      getLedgerEntries().catch(() => [] as LedgerEntry[]),
      getOrgUsers().catch(() => [] as OrgUser[]),
      getOrgCompanies().catch(() => [] as OrgCompany[]),
      getPortfolios().catch(() => [] as Portfolio[]),
    ])
      .then(([p, t, r, f, l, u, c, pf]) => {
        if (!p) { setNotFound(true); return; }
        setProject(p);
        setTasks(t.filter((x) => x.project_id === id));
        setRisks(r.filter((x) => x.project_id === id));
        setFinancials(f.filter((x) => x.project_id === id));
        setLedger(l.filter((x) => x.project_id === id));
        setUsers(u); setCompanies(c); setPortfolios(pf);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, org?.id]);

  const userName = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';
  const companyName = (cid?: string | null) => (cid ? companies.find((c) => c.id === cid)?.name : undefined);
  const portfolioName = (pid?: string | null) => (pid ? portfolios.find((pf) => pf.id === pid)?.name : undefined);

  // ---- Derived metrics ----
  const planned = financials.reduce((s, f) => s + (f.planned || 0), 0);
  const actual = financials.reduce((s, f) => s + (f.actual || 0), 0);
  const variance = planned > 0 ? Math.round(((actual - planned) / planned) * 100) : 0;
  // Real money movements from the org ledger scoped to this project.
  const ledgerIncome = ledger.filter((e) => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0);
  const ledgerExpense = ledger.filter((e) => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0);
  const realSpend = actual + ledgerExpense;
  const openTasks = tasks.filter((t) => !DONE.includes(t.status)).length;
  const doneTasks = tasks.length - openTasks;
  const taskPct = tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;
  const openRisks = risks.filter((r) => r.status === 'Open' || r.status === 'Mitigating');
  // Impact/probability may be numeric (1–5) — NaN-safe severity score.
  const severeRisks = openRisks.filter((r) => Number(r.impact) * Number(r.probability) >= 12).length;
  const progress = project?.progress || 0;

  // Schedule: days remaining vs end date.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = project?.end_date ? new Date(project.end_date) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - today.getTime()) / 86400000) : null;
  const overdue = daysLeft !== null && daysLeft < 0 && progress < 100;
  const nearDue = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && progress < 80;

  // Health heuristic: schedule + budget + severe open risks.
  const overBudget = planned > 0 && actual > planned;
  const health = overdue || (overBudget && variance > 10) || severeRisks >= 2
    ? 'Off track'
    : overBudget || severeRisks > 0 || nearDue
      ? 'At risk'
      : 'On track';

  if (loading) return <Layout title="Project"><Spinner /></Layout>;

  if (notFound || !project) {
    return (
      <Layout title="Project">
        <EmptyState icon="ti-folder-off" text="Project not found, or you don’t have access." />
        <div className="mt-4"><Link href="/projects" className="btn"><Icon name="ti-arrow-left" />Back to projects</Link></div>
      </Layout>
    );
  }

  const meta = [
    { label: 'Company', value: companyName(project.company_id) || '—', icon: 'ti-building' },
    { label: 'Portfolio', value: portfolioName(project.portfolio_id) || '—', icon: 'ti-stack-2' },
    { label: 'Project manager', value: userName(project.pm_id), icon: 'ti-user' },
    { label: 'Start', value: project.start_date || '—', icon: 'ti-calendar' },
    { label: 'End', value: project.end_date || '—', icon: 'ti-calendar-event' },
    { label: 'Health', value: health, icon: 'ti-heartbeat' },
  ];

  const taskStatuses = ['all', ...Array.from(new Set(tasks.map((t) => t.status)))];
  const shownTasks = taskStatus === 'all' ? tasks : tasks.filter((t) => t.status === taskStatus);

  const TaskTable = () => (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-line flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold mr-auto">Tasks</p>
        {taskStatuses.map((s) => (
          <button key={s} onClick={() => setTaskStatus(s)}
            className={`pill cursor-pointer transition ${taskStatus === s ? 'bg-accent/15 text-accentstrong font-medium' : 'pill-gray hover:bg-surface2'}`}>
            {s === 'all' ? `All ${tasks.length}` : s}
          </button>
        ))}
        <Link href="/tasks" className="text-2xs text-muted hover:text-content ml-2">All tasks →</Link>
      </div>
      {shownTasks.length === 0 ? <div className="p-5"><EmptyState icon="ti-checklist" text="No tasks here yet." /></div> : (
        <div className="overflow-x-auto"><table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Status</th><th className="th">Priority</th><th className="th">Assignee</th><th className="th">Due</th></tr></thead>
          <tbody>
            {shownTasks.map((t) => (
              <tr key={t.id} className="row">
                <td className="td font-medium">{t.name}</td>
                <td className="td"><StatusBadge status={t.status} /></td>
                <td className="td"><Pill label={t.priority} /></td>
                <td className="td text-2xs text-muted">{userName(t.assignee_id)}</td>
                <td className="td text-2xs text-muted">{t.due_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );

  return (
    <Layout title={project.name}>
      <PageHeader title={project.name}
        subtitle={[companyName(project.company_id), portfolioName(project.portfolio_id)].filter(Boolean).join(' · ') || undefined}
        action={<div className="flex items-center gap-2">
          {isOrgAdmin && (
            <button onClick={() => setGuestModal(true)} className="btn text-xs"><Icon name="ti-user-plus" />Invite guest</button>
          )}
          <Pill label={health} /><Pill label={project.status} /><Pill label={project.priority} /></div>} />

      {guestModal && (
        <Modal open onClose={() => setGuestModal(false)} title="Invite a guest" icon="ti-user-plus" size="sm"
          subtitle="External user — sees only this project (tasks, chat, files). Doesn't use a seat."
          onSubmit={() => !gBusy && inviteGuest()}
          footer={<>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to invite</span>
            <button onClick={() => setGuestModal(false)} className="btn">Cancel</button>
            <button onClick={inviteGuest} disabled={gBusy || !gName.trim() || !gEmail.trim()} className="btn btn-primary">{gBusy ? 'Inviting…' : 'Invite guest'}</button>
          </>}>
          <div className="grid gap-3.5">
            <Field label="Name" required>
              <input autoFocus value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Jane Client" className="input" />
            </Field>
            <Field label="Email" required hint="They sign in with this email to get access.">
              <input type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} placeholder="name@client.com" className="input" />
            </Field>
          </div>
        </Modal>
      )}

      {/* Metrics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <div className="stat">
          <p className="text-xs text-muted">Progress</p>
          <p className="text-2xl font-semibold mt-1.5 text-content">{progress}%</p>
          <div className="h-1.5 rounded-full bg-surface2 mt-2"><div className="h-1.5 rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
        <StatCard label="Tasks" value={`${doneTasks}/${tasks.length}`} icon="ti-checklist"
          hint={tasks.length ? `${taskPct}% complete · ${openTasks} open` : 'No tasks yet'} />
        <StatCard label="Open risks" value={`${openRisks.length}`} icon="ti-alert-triangle"
          hint={severeRisks > 0 ? `${severeRisks} severe` : openRisks.length ? 'None severe' : 'All clear'}
          hintTone={severeRisks > 0 ? 'down' : 'muted'} />
        <StatCard label="Budget" value={fmtMoney(actual)} icon="ti-cash"
          hint={planned > 0 ? `${variance >= 0 ? '+' : ''}${variance}% vs ${fmtMoney(planned)} planned` : 'No plan recorded'}
          hintTone={planned > 0 ? (actual > planned ? 'down' : 'up') : 'muted'} />
        <StatCard label="Schedule" value={daysLeft === null ? '—' : overdue ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
          icon="ti-calendar-stats" hint={project.end_date ? `Ends ${project.end_date}` : 'No end date'}
          hintTone={overdue ? 'down' : 'muted'} />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'tasks', label: 'Tasks', icon: 'ti-checklist', count: tasks.length },
        { key: 'risks', label: 'Risks', icon: 'ti-alert-triangle', count: risks.length },
        { key: 'financials', label: 'Financials', icon: 'ti-cash', count: financials.length + ledger.length },
        { key: 'requests', label: 'Requests', icon: 'ti-inbox' },
        { key: 'documents', label: 'Documents', icon: 'ti-paperclip' },
        { key: 'discussion', label: 'Discussion', icon: 'ti-messages' },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Description</p>
              {project.description
                ? <p className="text-sm text-content whitespace-pre-line">{project.description}</p>
                : <p className="text-sm text-muted2">No description.</p>}
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mt-5">
                {meta.map((m) => (
                  <div key={m.label} className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-md bg-surface2 grid place-items-center text-muted shrink-0"><Icon name={m.icon} /></span>
                    <div className="min-w-0">
                      <p className="text-2xs text-muted2">{m.label}</p>
                      <p className="text-sm truncate">{m.label === 'Health' ? <Pill label={health} /> : m.value}</p>
                    </div>
                  </div>
                ))}
              </div>
              <EntityTags entityType="project" entityId={project.id} orgId={org?.id} />
            </div>
            <TaskTable />
          </div>
          <div className="lg:col-span-1 space-y-4">
            <div className="card p-5">
              <p className="text-sm font-semibold mb-3">Budget summary</p>
              {planned === 0 && actual === 0 ? <p className="text-sm text-muted2">No financial records.</p> : (
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-muted">Planned</span><span className="font-medium">{fmtMoney(planned)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Actual</span><span className="font-medium">{fmtMoney(actual)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2">
                    <span className="text-muted">Variance</span>
                    <span className={`font-medium ${actual > planned ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {variance >= 0 ? '+' : ''}{variance}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface2 mt-1">
                    <div className={`h-1.5 rounded-full ${actual > planned ? 'bg-rose-500' : 'bg-accent'}`}
                      style={{ width: `${planned > 0 ? Math.min(100, Math.round((actual / planned) * 100)) : 0}%` }} />
                  </div>
                  {(ledgerIncome > 0 || ledgerExpense > 0) && (
                    <div className="border-t border-line pt-2 mt-2 space-y-2.5">
                      <div className="flex justify-between"><span className="text-muted">Ledger income</span><span className="font-medium text-emerald-600">+{fmtMoney(ledgerIncome)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Ledger spend</span><span className="font-medium text-rose-600">−{fmtMoney(ledgerExpense)}</span></div>
                      <div className="flex justify-between"><span className="text-muted">Total spend</span><span className="font-medium">{fmtMoney(realSpend)}</span></div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold mb-3">Discussion</p>
              <CommentsThread entityType="project" entityId={project.id} orgId={org?.id} users={users} currentUserId={me?.id} />
            </div>
          </div>
        </div>
      )}

      {tab === 'tasks' && <TaskTable />}

      {tab === 'risks' && (
        <div className="card overflow-hidden">
          {risks.length === 0 ? <div className="p-5"><EmptyState icon="ti-shield-check" text="No risks logged." /></div> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Title</th><th className="th">Category</th><th className="th">Impact × Prob</th><th className="th">Status</th></tr></thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.id} className="row">
                    <td className="td font-medium">{r.title}</td>
                    <td className="td text-2xs text-muted">{r.category}</td>
                    <td className="td text-2xs text-muted">{r.impact} × {r.probability}</td>
                    <td className="td"><Pill label={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'financials' && (
        <div className="card overflow-hidden">
          {financials.length === 0 ? <div className="p-5"><EmptyState icon="ti-cash" text="No financial records." /></div> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Period</th><th className="th">Category</th><th className="th text-right">Planned</th><th className="th text-right">Actual</th></tr></thead>
              <tbody>
                {financials.map((f) => (
                  <tr key={f.id} className="row">
                    <td className="td text-2xs text-muted">{f.period}</td>
                    <td className="td text-2xs text-muted">{f.category}</td>
                    <td className="td text-right">{fmtMoney(f.planned || 0)}</td>
                    <td className="td text-right">{fmtMoney(f.actual || 0)}</td>
                  </tr>
                ))}
                <tr className="row bg-surface2/50">
                  <td className="td font-medium" colSpan={2}>Total</td>
                  <td className="td text-right font-medium">{fmtMoney(planned)}</td>
                  <td className="td text-right font-medium">{fmtMoney(actual)}</td>
                </tr>
              </tbody>
            </table></div>
          )}
          <div className="border-t border-line">
            <div className="px-5 h-12 flex items-center justify-between">
              <span className="text-sm font-semibold">Ledger entries</span>
              <span className="text-2xs text-muted2">{ledger.length} linked to this project</span>
            </div>
            {ledger.length === 0 ? <div className="px-5 pb-5"><p className="text-sm text-muted2">No ledger entries yet — add them in Accounting.</p></div> : (
              <div className="overflow-x-auto"><table className="w-full">
                <thead><tr><th className="th">Date</th><th className="th">Type</th><th className="th">Category</th><th className="th">Notes</th><th className="th text-right">Amount</th></tr></thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="row">
                      <td className="td text-2xs text-muted tabular-nums">{e.entry_date}</td>
                      <td className="td"><span className={`pill ${e.type === 'income' ? 'pill-green' : 'pill-red'}`}>{e.type}</span></td>
                      <td className="td font-medium">{e.category}</td>
                      <td className="td text-2xs text-muted max-w-[16rem] truncate">{e.notes || '—'}</td>
                      <td className={`td text-right font-medium tabular-nums ${e.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {e.type === 'income' ? '+' : '−'}{fmtMoney(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}

      {tab === 'requests' && <RequestsPanel projectId={id} orgId={org?.id} meId={me?.id} isOrgAdmin={isOrgAdmin} isGuest={org?.member_role === 'guest'} />}

      {tab === 'documents' && <DocumentsPanel projectId={id} orgId={org?.id} meId={me?.id} isOrgAdmin={isOrgAdmin} />}

      {tab === 'discussion' && (
        <div className="card p-5 max-w-2xl">
          <p className="text-sm font-semibold mb-3">Discussion</p>
          <CommentsThread entityType="project" entityId={project.id} orgId={org?.id} users={users} currentUserId={me?.id} />
        </div>
      )}
    </Layout>
  );
}


function RequestsPanel({ projectId, orgId, meId, isOrgAdmin, isGuest }: { projectId: string; orgId?: string; meId?: string; isOrgAdmin: boolean; isGuest: boolean }) {
  const [rows, setRows] = useState<GuestRequest[] | null>(null);
  const [type, setType] = useState('request');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async () => { try { setRows(await listGuestRequests(projectId)); } catch (e: any) { setErr(e?.message || 'Failed to load requests'); setRows([]); } };
  useEffect(() => { if (projectId) load(); /* eslint-disable-next-line */ }, [projectId]);

  const canDecide = isOrgAdmin || (rows || []).some((r) => r.created_by !== meId);
  const STATUS_PILL: Record<string, string> = { open: 'pill-amber', approved: 'pill-green', rejected: 'pill-red' };

  const submit = async () => {
    if (!title.trim() || !orgId || !meId || busy) return;
    setBusy(true); setErr('');
    try { await createGuestRequest({ org_id: orgId, project_id: projectId, created_by: meId, type, title: title.trim(), body: body.trim() || undefined }); setTitle(''); setBody(''); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not submit'); } finally { setBusy(false); }
  };
  const decide = async (r: GuestRequest, status: 'approved' | 'rejected', addTask: boolean) => {
    if (!meId || busy) return;
    setBusy(true); setErr('');
    try {
      if (addTask && status === 'approved' && orgId) await createTask({ name: r.title, org_id: orgId, project_id: projectId, status: 'To Do', priority: 'Medium' });
      await decideGuestRequest(r.id, status, noteFor === r.id ? note : '', meId);
      setNoteFor(null); setNote(''); await load();
    } catch (e: any) { setErr(e?.message || 'Could not update request'); } finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1">
        <div className="card p-4">
          <p className="text-sm font-semibold text-content mb-3">{isGuest ? 'Raise a request' : 'New request / suggestion'}</p>
          {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
          <div className="space-y-2.5">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="request">Request something</option>
              <option value="suggestion">Suggest a change</option>
            </select>
            <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input min-h-[80px] py-2" placeholder="Details (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
            <button className="btn btn-primary w-full" disabled={busy || !title.trim()} onClick={submit}><Icon name="ti-send" />Submit</button>
            <p className="text-2xs text-muted2">{isGuest ? 'Your request goes to the project team for review.' : 'Tracked here for the team to action.'}</p>
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-3">
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <div className="card p-8"><EmptyState icon="ti-inbox" text="No requests yet." /></div>
        ) : rows.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="chip capitalize">{r.type}</span>
              <span className={`pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
            </div>
            <p className="text-sm font-medium text-content">{r.title}</p>
            {r.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{r.body}</p>}
            <p className="text-2xs text-muted2 mt-1">{r.creator?.full_name || 'Guest'} · {new Date(r.created_at).toLocaleDateString()}{r.decided_at ? ` · ${r.status} by ${r.decider?.full_name || 'team'}` : ''}</p>
            {r.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{r.decision_note}&rdquo;</p>}
            {canDecide && r.status === 'open' && (
              <div className="mt-3 pt-3 border-t border-line">
                {noteFor === r.id && <input className="input mb-2" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />}
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => decide(r, 'approved', false)}><Icon name="ti-check" />Approve</button>
                  <button className="btn h-8 py-0" disabled={busy} onClick={() => decide(r, 'approved', true)}><Icon name="ti-plus" />Approve + task</button>
                  <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => decide(r, 'rejected', false)}><Icon name="ti-x" />Reject</button>
                  <button className="btn btn-ghost h-8 py-0" onClick={() => { setNoteFor(noteFor === r.id ? null : r.id); setNote(''); }}><Icon name="ti-note" />Note</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


function DocumentsPanel({ projectId, orgId, meId, isOrgAdmin }: { projectId: string; orgId?: string; meId?: string; isOrgAdmin: boolean }) {
  const [rows, setRows] = useState<GuestDocument[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => { try { setRows(await listGuestDocuments(projectId)); } catch (e: any) { setErr(e?.message || 'Failed to load documents'); setRows([]); } };
  useEffect(() => { if (projectId) load(); /* eslint-disable-next-line */ }, [projectId]);
  const upload = async () => {
    if (!file || !orgId || !meId || busy) return;
    setBusy(true); setErr('');
    try { await uploadGuestDocument({ org_id: orgId, project_id: projectId, uploaded_by: meId, file, note: note.trim() || undefined }); setFile(null); setNote(''); await load(); }
    catch (e: any) { setErr(e?.message || 'Upload failed'); } finally { setBusy(false); }
  };
  const openDoc = async (d: GuestDocument) => { try { const url = await guestDocumentUrl(d.file_path); window.open(url, '_blank'); } catch (e: any) { setErr(e?.message || 'Could not open file'); } };
  const del = async (d: GuestDocument) => { if (!confirm(`Delete ${d.file_name}?`)) return; setBusy(true); setErr(''); try { await deleteGuestDocument(d.id, d.file_path); await load(); } catch (e: any) { setErr(e?.message || 'Delete failed'); } finally { setBusy(false); } };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1"><div className="card p-4">
        <p className="text-sm font-semibold text-content mb-3">Submit a document</p>
        {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}
        <div className="space-y-2.5">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-line file:bg-surface2 file:text-content file:text-sm" />
          <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary w-full" disabled={busy || !file} onClick={upload}><Icon name="ti-upload" />{busy ? 'Uploading…' : 'Upload'}</button>
          <p className="text-2xs text-muted2">Files are private to this project&rsquo;s team and guests.</p>
        </div>
      </div></div>
      <div className="lg:col-span-2">
        {rows === null ? <Spinner /> : rows.length === 0 ? (
          <div className="card p-8"><EmptyState icon="ti-paperclip" text="No documents yet." /></div>
        ) : (
          <div className="card overflow-hidden"><div className="divide-y divide-line">
            {rows.map((d) => {
              const canDel = d.uploaded_by === meId || isOrgAdmin;
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon name="ti-file" className="text-muted2 text-lg shrink-0" />
                  <div className="min-w-0 flex-1">
                    <button onClick={() => openDoc(d)} className="block text-sm text-content hover:text-accent truncate text-left">{d.file_name}</button>
                    <p className="text-2xs text-muted2 truncate">{d.uploader?.full_name || 'Guest'} · {new Date(d.created_at).toLocaleDateString()}{d.note ? ` · ${d.note}` : ''}</p>
                  </div>
                  <button onClick={() => openDoc(d)} className="btn btn-ghost h-8 py-0" title="Download"><Icon name="ti-download" className="text-sm" /></button>
                  {canDel && <button onClick={() => del(d)} disabled={busy} className="btn btn-ghost h-8 py-0 text-rose-500" title="Delete"><Icon name="ti-trash" className="text-sm" /></button>}
                </div>
              );
            })}
          </div></div>
        )}
      </div>
    </div>
  );
}
