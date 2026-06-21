import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { listAllGuestRequests, decideGuestRequest, createTask, GuestRequestG } from '@/lib/db';
import RefLink from '@/components/RefLink';

const STATUS_PILL: Record<string, string> = { open: 'pill-amber', approved: 'pill-green', rejected: 'pill-red' };
const TYPE_ICON: Record<string, string> = { request: 'ti-help-circle', suggestion: 'ti-bulb', edit: 'ti-pencil' };

export default function RequestsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const isOrgAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [rows, setRows] = useState<GuestRequestG[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [selId, setSelId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => { try { setRows(await listAllGuestRequests()); } catch (e: any) { setErr(e?.message || 'Failed to load'); setRows([]); } };
  useEffect(() => { if (org?.id) load(); /* eslint-disable-next-line */ }, [org?.id]);
  useEffect(() => { const q = router.query.req; if (typeof q === 'string') setSelId(q); }, [router.query.req]);

  const shown = useMemo(() => (rows || []).filter((r) => filter === 'all' || r.status === 'open'), [rows, filter]);
  const sel = (rows || []).find((r) => r.id === selId) || null;
  const openCount = (rows || []).filter((r) => r.status === 'open').length;
  const canDecide = (r: GuestRequestG) => isOrgAdmin || r.created_by !== me?.id;

  const decide = async (r: GuestRequestG, status: 'approved' | 'rejected', addTask: boolean) => {
    if (!me || busy) return; setBusy(true); setErr('');
    try {
      if (addTask && status === 'approved') await createTask({ name: r.title, org_id: r.org_id, project_id: r.project_id, status: 'To Do', priority: 'Medium' });
      await decideGuestRequest(r.id, status, note, me.id);
      setNote(''); await load();
    } catch (e: any) { setErr(e?.message || 'Could not update request'); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Requests">
      <PageHeader title="Requests" subtitle="Guest requests and suggestions across your projects" icon="ti-inbox" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <StatCard label="Open" value={openCount} icon="ti-inbox" />
        <StatCard label="Total" value={(rows || []).length} icon="ti-list" />
        <StatCard label="Approved" value={(rows || []).filter((r) => r.status === 'approved').length} icon="ti-check" hintTone="up" />
      </div>
      <div className="flex items-center gap-2 mb-3">
        {(['open', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`pill capitalize cursor-pointer transition ${filter === f ? 'bg-accent/15 text-accentstrong font-medium' : 'pill-gray hover:bg-surface2'}`}>{f}</button>
        ))}
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? (
        <div className="card p-8"><EmptyState icon="ti-inbox" text="No requests." /></div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            {shown.map((r) => (
              <button key={r.id} onClick={() => setSelId(r.id)} className={`card p-4 w-full text-left transition ${selId === r.id ? 'ring-2 ring-accent' : 'hover:bg-surface2/50'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="chip capitalize"><Icon name={TYPE_ICON[r.type] || 'ti-inbox'} className="text-2xs mr-1" />{r.type}</span>
                  <span className={`pill ${STATUS_PILL[r.status]}`}>{r.status}</span>
                  <span className="ml-auto text-2xs text-muted2">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-sm font-medium text-content truncate">{r.title}</p>
                <p className="text-2xs text-muted2 mt-1">{r.project_id ? <RefLink href={`/projects/${r.project_id}`} label={r.project?.name || 'Project'} className="text-muted2" /> : (r.project?.name || 'Project')} · {r.creator?.full_name || 'Guest'}</p>
              </button>
            ))}
          </div>
          <div className="lg:sticky lg:top-2 self-start">
            {sel ? (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="chip capitalize">{sel.type}</span>
                  <span className={`pill ${STATUS_PILL[sel.status]}`}>{sel.status}</span>
                </div>
                <p className="text-base font-semibold text-content">{sel.title}</p>
                {sel.body && <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{sel.body}</p>}
                <p className="text-2xs text-muted2 mt-2">{sel.creator?.full_name || 'Guest'} · {sel.project_id ? <RefLink href={`/projects/${sel.project_id}`} label={sel.project?.name || 'Project'} className="text-muted2" /> : (sel.project?.name || 'Project')} · {new Date(sel.created_at).toLocaleString()}</p>
                {sel.decision_note && <p className="text-2xs text-muted mt-1 italic">&ldquo;{sel.decision_note}&rdquo;</p>}
                {sel.decided_at && <p className="text-2xs text-muted2 mt-1">{sel.status} by {sel.decider?.full_name || 'team'} · {new Date(sel.decided_at).toLocaleDateString()}</p>}
                <Link href={`/projects/${sel.project_id}`} className="text-2xs text-accentstrong hover:underline mt-2 inline-block">Open project &rarr;</Link>
                {canDecide(sel) && sel.status === 'open' && (
                  <div className="mt-4 pt-4 border-t border-line">
                    <input className="input mb-2" placeholder="Decision note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-primary h-8 py-0" disabled={busy} onClick={() => decide(sel, 'approved', false)}><Icon name="ti-check" />Approve</button>
                      <button className="btn h-8 py-0" disabled={busy} onClick={() => decide(sel, 'approved', true)}><Icon name="ti-plus" />Approve + task</button>
                      <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => decide(sel, 'rejected', false)}><Icon name="ti-x" />Reject</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card p-8"><EmptyState icon="ti-inbox" text="Select a request to see details." /></div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
