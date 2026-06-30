import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

type Feedback = {
  id: string; org_id: string; user_id: string | null; kind: string; subject: string; body: string | null;
  status: string; priority: string | null; page_path: string | null; admin_note: string | null; created_at: string;
};
const STATUSES = ['new', 'triaged', 'planned', 'in_progress', 'done', 'declined'];
const KIND_META: Record<string, { label: string; icon: string; cls: string }> = {
  bug: { label: 'Bug', icon: 'ti-bug', cls: 'pill-red' },
  idea: { label: 'Idea', icon: 'ti-bulb', cls: 'pill-amber' },
  praise: { label: 'Praise', icon: 'ti-heart', cls: 'pill-green' },
  other: { label: 'Other', icon: 'ti-message-dots', cls: 'pill-gray' },
};

/** Admin triage for in-app feedback. Platform admins see all tenants; org owner/admin see their org (RLS). */
export default function FeedbackAdmin() {
  const { platformAdmin } = useAuthStore();
  const org = useActiveOrg();
  const [rows, setRows] = useState<Feedback[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [err, setErr] = useState('');
  const allowed = platformAdmin || can.manageMembers(org);

  const load = useCallback(async () => {
    setErr('');
    try {
      if (platformAdmin) {
        const { data, error } = await sb.rpc('platform_feedback_list', { p_status: null });
        if (error) throw new Error(error.message);
        setRows((data as Feedback[]) || []);
      } else {
        const { data, error } = await sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(500);
        if (error) throw new Error(error.message);
        setRows((data as Feedback[]) || []);
      }
    } catch (e: any) { setErr(e.message); setRows([]); }
  }, [platformAdmin]);

  useEffect(() => { if (allowed) load(); }, [allowed, load]);

  const setStatus = async (id: string, status: string) => {
    try { const { error } = await sb.rpc('feedback_triage', { p_id: id, p_status: status, p_priority: null, p_note: null }); if (error) throw new Error(error.message); load(); }
    catch (e: any) { setErr(e.message); }
  };

  if (!allowed) return <Layout title="Feedback"><EmptyState icon="ti-lock" title="Admins only" text="Feedback triage is available to workspace admins and the platform team." /></Layout>;

  const shown = (rows || []).filter((r) => filter === 'all' || r.status === filter);
  return (
    <Layout title="Feedback">
      <PageHeader title="Feedback" subtitle="Triage product feedback from your workspace" icon="ti-message-circle" help="feedback" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', ...STATUSES].map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`btn h-7 py-0 text-2xs capitalize ${filter === s ? 'btn-primary' : 'border border-line text-muted'}`}>{s.replace('_', ' ')}</button>
        ))}
      </div>
      {rows === null ? <Spinner /> : shown.length === 0 ? (
        <EmptyState icon="ti-message-circle" title="No feedback yet" text="Feedback submitted from the in-app widget will appear here." />
      ) : (
        <div className="space-y-2">
          {shown.map((r) => {
            const km = KIND_META[r.kind] || KIND_META.other;
            return (
              <div key={r.id} className="card p-4 flex items-start gap-3">
                <span className={`pill ${km.cls} shrink-0`}><Icon name={km.icon} className="mr-1" />{km.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-content">{r.subject}</p>
                  {r.body && <p className="text-2xs text-muted mt-0.5 whitespace-pre-wrap">{r.body}</p>}
                  <p className="text-[10px] text-muted2 mt-1">{new Date(r.created_at).toLocaleString()}{r.page_path ? ` · ${r.page_path}` : ''}</p>
                </div>
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} className="input h-8 py-0 text-2xs capitalize shrink-0">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
