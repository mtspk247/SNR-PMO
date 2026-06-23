import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, StatCard, Icon, Spinner } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useProjects, useTasks } from '@/lib/queries';
import { Project } from '@/lib/supabase';
import { listInvoices, Invoice, listPortalFiles, PortalFile, driveFileUrl, listPortalApprovals, PortalApproval, decidePortalApproval } from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

// Branded client portal. Guests are RLS-fenced to their own projects, the invoices/files/
// approvals on those projects. Reads + the one write (approve/reject) go through RLS.
const P_COLS: ColDef[] = [
  { id: 'name', label: 'Project', locked: true },
  { id: 'status', label: 'Status' }, { id: 'priority', label: 'Priority' },
  { id: 'start', label: 'Start' }, { id: 'due', label: 'Due' },
];
const I_COLS: ColDef[] = [
  { id: 'number', label: 'Invoice', locked: true }, { id: 'status', label: 'Status' },
  { id: 'issued', label: 'Issued' }, { id: 'due', label: 'Due' }, { id: 'total', label: 'Total' }, { id: 'balance', label: 'Balance due' },
];
const P_STATUS_PILL: Record<string, string> = { active: 'pill-green', planning: 'pill-amber', 'on hold': 'pill-gray', completed: 'pill-gray', cancelled: 'pill-rose' };
const I_STATUS_PILL: Record<string, string> = { paid: 'pill-green', sent: 'pill-amber', overdue: 'pill-rose', draft: 'pill-gray', partial: 'pill-amber', void: 'pill-gray' };
const A_STATUS_PILL: Record<string, string> = { approved: 'pill-green', rejected: 'pill-rose', cancelled: 'pill-gray', pending: 'pill-amber' };
const P_FILTERS: FilterDef[] = [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'Active', label: 'Active' }, { value: 'Planning', label: 'Planning' }, { value: 'On Hold', label: 'On Hold' }, { value: 'Completed', label: 'Completed' }] }];
const DONE = ['completed', 'cancelled', 'done', 'archived'];
const pPill = (s: string) => P_STATUS_PILL[(s || '').toLowerCase()] || 'pill-gray';
const iPill = (s: string) => I_STATUS_PILL[(s || '').toLowerCase()] || 'pill-gray';
const aPill = (s: string) => A_STATUS_PILL[(s || '').toLowerCase()] || 'pill-gray';
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
const money = (cur: string | null | undefined, n: number | null | undefined) => `${cur || ''} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
const fmtBytes = (n: number) => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`; };
const fileIcon = (f: PortalFile) => { const m = f.mime_type || ''; if (m.startsWith('image/')) return 'ti-photo'; if (m.includes('pdf')) return 'ti-file-type-pdf'; if (m.includes('zip') || m.includes('compressed')) return 'ti-file-zip'; return 'ti-file'; };

export default function Portal() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const { data: projects = [], isLoading: pLoading } = useProjects();
  const { data: tasks = [] } = useTasks();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [files, setFiles] = useState<PortalFile[] | null>(null);
  const [approvals, setApprovals] = useState<PortalApproval[] | null>(null);
  const [tab, setTab] = useState<'projects' | 'invoices' | 'files' | 'approvals'>('projects');
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!org?.id) return;
    setInvoices(null); setFiles(null); setApprovals(null);
    listInvoices(org.id).then(setInvoices).catch(() => setInvoices([]));
    listPortalFiles(org.id).then(setFiles).catch(() => setFiles([]));
    listPortalApprovals(org.id).then(setApprovals).catch(() => setApprovals([]));
  }, [org?.id]);

  // projects
  const pPrefs = useListPrefs('snrpmo.portal.projects.cols', P_COLS, { entity: 'portal-projects', orgId: org?.id });
  const pq = pPrefs.query; const pStatusF = pPrefs.filters.status || 'all';
  const pShown = useMemo(() => projects.filter((p) => (pStatusF === 'all' || p.status === pStatusF) && (!pq.trim() || p.name.toLowerCase().includes(pq.toLowerCase()))), [projects, pq, pStatusF]);
  const pRs = useRowSelection(pShown);
  const P_GROUPS: GroupMeta[] = useMemo(() => Array.from(new Set(projects.map((p) => p.status).filter(Boolean))).map((s) => ({ value: s, label: titleCase(s), pill: pPill(s) })), [projects]);
  const pCell = (id: string, p: Project) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{p.name}</span>;
      case 'status': return <span className={'pill ' + pPill(p.status)}>{titleCase(p.status || '—')}</span>;
      case 'priority': return p.priority ? titleCase(p.priority) : '—';
      case 'start': return fmt(p.start_date);
      case 'due': return fmt(p.end_date);
      default: return '—';
    }
  };
  const pExport = (id: string, p: Project) => id === 'name' ? p.name : id === 'status' ? (p.status || '') : id === 'priority' ? (p.priority || '') : id === 'start' ? (p.start_date || '') : id === 'due' ? (p.end_date || '') : '';

  // invoices
  const iPrefs = useListPrefs('snrpmo.portal.invoices.cols', I_COLS, { entity: 'portal-invoices', orgId: org?.id });
  const iq = iPrefs.query; const iStatusF = iPrefs.filters.status || 'all';
  const iAll = invoices || [];
  const bal = (v: Invoice) => Number(v.total || 0) - Number(v.amount_paid || 0);
  const iShown = useMemo(() => iAll.filter((v) => (iStatusF === 'all' || v.status === iStatusF) && (!iq.trim() || `${v.invoice_number} ${v.client_name || ''}`.toLowerCase().includes(iq.toLowerCase()))), [iAll, iq, iStatusF]);
  const iRs = useRowSelection(iShown);
  const I_GROUPS: GroupMeta[] = useMemo(() => Array.from(new Set(iAll.map((v) => v.status).filter(Boolean))).map((s) => ({ value: s, label: titleCase(s), pill: iPill(s) })), [iAll]);
  const I_FILTERS: FilterDef[] = useMemo(() => [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...Array.from(new Set(iAll.map((v) => v.status).filter(Boolean))).map((s) => ({ value: s, label: titleCase(s) }))] }], [iAll]);
  const iCell = (id: string, v: Invoice) => {
    switch (id) {
      case 'number': return <span className="font-medium text-content">{v.invoice_number}</span>;
      case 'status': return <span className={'pill ' + iPill(v.status)}>{titleCase(v.status || '—')}</span>;
      case 'issued': return fmt(v.issue_date);
      case 'due': return fmt(v.due_date);
      case 'total': return money(v.currency, v.total);
      case 'balance': return money(v.currency, bal(v));
      default: return '—';
    }
  };
  const iExport = (id: string, v: Invoice) => id === 'number' ? v.invoice_number : id === 'status' ? (v.status || '') : id === 'issued' ? (v.issue_date || '') : id === 'due' ? (v.due_date || '') : id === 'total' ? String(v.total || 0) : id === 'balance' ? String(bal(v)) : '';

  const download = async (f: PortalFile) => {
    if (!f.storage_path) return;
    try { const url = await driveFileUrl(f.storage_path); window.open(url, '_blank', 'noopener'); } catch (_e) { /* ignore */ }
  };
  const decide = async (a: PortalApproval, status: 'approved' | 'rejected') => {
    if (!me || busy) return; setBusy(true);
    try { await decidePortalApproval(a.id, status, me.id, noteFor === a.id ? note : null); setNoteFor(null); setNote(''); if (org) setApprovals(await listPortalApprovals(org.id)); }
    catch (_e) { /* ignore */ } finally { setBusy(false); }
  };

  const aAll = approvals || [];
  const pendingApprovals = aAll.filter((a) => a.status === 'pending').length;
  const kpis = useMemo(() => ({
    projects: projects.length,
    open: tasks.filter((t) => !DONE.includes((t.status || '').toLowerCase())).length,
    outstanding: iAll.reduce((s, v) => s + Math.max(0, bal(v)), 0),
  }), [projects, tasks, iAll]);
  const outCur = iAll[0]?.currency || '';
  const firstName = me?.full_name ? me.full_name.split(' ')[0] : '';
  const TABS: { id: 'projects' | 'invoices' | 'files' | 'approvals'; label: string; badge?: number }[] = [
    { id: 'projects', label: 'Projects' }, { id: 'invoices', label: 'Invoices' }, { id: 'files', label: 'Files' },
    { id: 'approvals', label: 'Approvals', badge: pendingApprovals },
  ];

  return (
    <Layout flat title="Portal">
      <PageHeader help="client-portal" title={firstName ? `Welcome, ${firstName}` : 'Welcome'} subtitle={`Your projects with ${org?.name || 'us'}`} icon="ti-layout-dashboard" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Projects" value={String(kpis.projects)} icon="ti-folder" />
        <StatCard label="Open tasks" value={String(kpis.open)} icon="ti-list-check" />
        <StatCard label="Awaiting you" value={String(pendingApprovals)} icon="ti-checks" />
        <StatCard label="Outstanding" value={money(outCur, kpis.outstanding)} icon="ti-cash" />
      </div>
      <div className="flex gap-1 mb-4 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={'px-3 py-2 text-sm font-medium -mb-px border-b-2 inline-flex items-center gap-1.5 ' + (tab === t.id ? 'border-accent text-content' : 'border-transparent text-muted hover:text-content')}>
            {t.label}{!!t.badge && <span className="pill pill-amber text-2xs px-1.5 py-0">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'projects' && (
        !pLoading && projects.length === 0 ? (
          <EmptyState icon="ti-folder" title="No projects yet" text="Projects shared with you will appear here." />
        ) : (
          <ListView rows={pLoading ? null : pShown} rowKey={(p) => p.id} cols={P_COLS} prefs={pPrefs} cell={pCell} selection={pRs}
            filters={P_FILTERS} searchPlaceholder="Search projects…"
            groupField={{ value: 'status', label: 'Status' }} groupOf={(p) => p.status} groups={P_GROUPS}
            exportName="my-projects" exportValue={pExport} emptyIcon="ti-folder" emptyText="No projects match your filters." />
        )
      )}

      {tab === 'invoices' && (
        invoices !== null && iAll.length === 0 ? (
          <EmptyState icon="ti-file-invoice" title="No invoices yet" text="Invoices for your projects will appear here." />
        ) : (
          <ListView rows={invoices === null ? null : iShown} rowKey={(v) => v.id} cols={I_COLS} prefs={iPrefs} cell={iCell} selection={iRs}
            filters={I_FILTERS} searchPlaceholder="Search invoices…"
            groupField={{ value: 'status', label: 'Status' }} groupOf={(v) => v.status} groups={I_GROUPS}
            exportName="my-invoices" exportValue={iExport} emptyIcon="ti-file-invoice" emptyText="No invoices match your filters." />
        )
      )}

      {tab === 'files' && (
        files === null ? <div className="p-8"><Spinner /></div> :
        files.length === 0 ? <EmptyState icon="ti-file" title="No files yet" text="Files shared on your projects will appear here." /> : (
          <div className="card divide-y divide-line overflow-hidden">
            {files.map((f) => (
              <div key={f.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-surface2/50">
                <Icon name={fileIcon(f)} className="text-muted" />
                <button className="text-sm text-content truncate flex-1 text-left hover:text-accentstrong" onClick={() => download(f)}>{f.name}</button>
                {f.drive_name && <span className="text-2xs text-muted2 hidden sm:inline truncate max-w-[10rem]">{f.drive_name}</span>}
                <span className="text-2xs text-muted2 shrink-0 tabular-nums">{fmtBytes(f.size_bytes)}</span>
                <button onClick={() => download(f)} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-content" title="Download"><Icon name="ti-download" className="text-sm" /></button>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'approvals' && (
        approvals === null ? <div className="p-8"><Spinner /></div> :
        aAll.length === 0 ? <EmptyState icon="ti-checks" title="Nothing to review" text="Items sent to you for approval will appear here." /> : (
          <div className="space-y-2.5 max-w-3xl">
            {aAll.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center gap-2 mb-0.5">
                  {a.project_name && <span className="chip">{a.project_name}</span>}
                  <span className={'pill ' + aPill(a.status)}>{titleCase(a.status)}</span>
                </div>
                <p className="text-sm font-medium text-content">{a.title}</p>
                {a.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{a.body}</p>}
                {a.decided_at && <p className="text-2xs text-muted2 mt-1">{titleCase(a.status)} · {new Date(a.decided_at).toLocaleDateString()}</p>}
                {a.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{a.decision_note}&rdquo;</p>}
                {a.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <input className="input mb-2" placeholder="Add a note (optional)" value={noteFor === a.id ? note : ''} onFocus={() => setNoteFor(a.id)} onChange={(e) => { setNoteFor(a.id); setNote(e.target.value); }} />
                    <div className="flex gap-2">
                      <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => decide(a, 'approved')}><Icon name="ti-check" />Approve</button>
                      <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => decide(a, 'rejected')}><Icon name="ti-x" />Reject</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </Layout>
  );
}
