import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { supportAgentList, supportAgentAdd, supportAgentSetActive, supportAgentRemove, avatarSrc, SupportAgent } from '@/lib/db';

export default function SupportAgentsPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<SupportAgent[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => supportAgentList().then(setRows).catch((e) => { setErr(e?.message || 'Failed to load support agents'); setRows([]); });
  useEffect(() => { if (platformAdmin) load(); }, [platformAdmin]);

  const add = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setErr(''); setMsg('');
    try { await supportAgentAdd(email.trim()); setMsg(`Added ${email.trim()} to the support team.`); setEmail(''); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not add agent'); }
    finally { setBusy(false); }
  };
  const toggle = async (r: SupportAgent) => {
    setBusy(true); setErr(''); setMsg('');
    try { await supportAgentSetActive(r.user_id, !r.active); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not update agent'); }
    finally { setBusy(false); }
  };
  const remove = async (r: SupportAgent) => {
    if (!confirm(`Remove ${r.full_name || r.email} from the support team? They will no longer be assigned tickets.`)) return;
    setBusy(true); setErr(''); setMsg('');
    try { await supportAgentRemove(r.user_id); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not remove agent'); }
    finally { setBusy(false); }
  };

  if (!platformAdmin) return <Layout flat title="Support agents"><EmptyState icon="ti-lock" title="Platform admins only" text="The platform support team is managed by platform administrators." /></Layout>;

  const activeCount = rows?.filter((r) => r.active).length ?? 0;
  return (
    <Layout flat title="Support agents">
      <PageHeader title="Support agents" subtitle="Platform staff who handle support tickets from every tenant" icon="ti-headset" />

      <div className="card p-4 sm:p-5 mb-4">
        <h3 className="text-sm font-semibold text-content mb-1">Add a support agent</h3>
        <p className="text-2xs text-muted mb-3">Add a member of the platform company by email. Tickets from all tenants (including white-label partners) are assigned round-robin among active agents.</p>
        <div className="flex items-center gap-2">
          <input className="input flex-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@yourcompany.com" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <button className="btn btn-primary shrink-0" disabled={busy || !email.trim()} onClick={add}><Icon name="ti-user-plus" />{busy ? 'Adding…' : 'Add agent'}</button>
        </div>
        {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
        {msg && <p className="text-sm text-emerald-600 mt-2">{msg}</p>}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h3 className="text-sm font-semibold text-content">Support team</h3>
          <p className="text-2xs text-muted">{rows === null ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'agent' : 'agents'} · ${activeCount} active`}</p>
        </div>
        {rows === null ? <div className="p-8"><Spinner /></div> : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-headset" text="No support agents yet. Add one above." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
              <tr><th className="px-4 py-3 font-medium">Agent</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Added</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t border-line hover:bg-surface2/50">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={r.full_name || r.email} src={avatarSrc(r.avatar_url)} size={28} />
                      <span className="min-w-0"><span className="block font-medium text-content truncate">{r.full_name || r.email}</span><span className="block text-2xs text-muted truncate">{r.email}</span></span>
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className={`pill ${r.active ? 'pill-green' : 'pill-gray'}`}>{r.active ? 'Active' : 'Paused'}</span></td>
                  <td className="px-4 py-3 text-2xs text-muted2">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button className="btn-ghost text-2xs" disabled={busy} onClick={() => toggle(r)}><Icon name={r.active ? 'ti-player-pause' : 'ti-player-play'} />{r.active ? 'Pause' : 'Activate'}</button>
                    <button className="btn-ghost text-2xs text-rose-600 ml-1" disabled={busy} onClick={() => remove(r)}><Icon name="ti-x" />Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </Layout>
  );
}
