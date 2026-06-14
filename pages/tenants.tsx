import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { listTenants, listPlans, listOrgInvites, createOrgInvite, revokeOrgInvite } from '@/lib/db';
import { Plan, OrgInvite } from '@/lib/supabase';

export default function TenantsPage() {
  const router = useRouter();
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<any[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState('');
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [invEmail, setInvEmail] = useState(''); const [invName, setInvName] = useState(''); const [invPlan, setInvPlan] = useState('free');
  const [invBusy, setInvBusy] = useState(false); const [invErr, setInvErr] = useState(''); const [invLink, setInvLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => { listTenants().then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  const loadInvites = () => listOrgInvites().then(setInvites).catch(() => {});
  useEffect(() => { if (platformAdmin) { load(); loadInvites(); listPlans().then(setPlans).catch(() => {}); } }, [platformAdmin]);

  const copyLink = (link: string) => { try { navigator.clipboard?.writeText(link); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitInvite = async () => {
    if (!invEmail.trim() || !invName.trim()) return;
    setInvBusy(true); setInvErr(''); setInvLink(null);
    try { const r = await createOrgInvite(invEmail.trim(), invName.trim(), invPlan); setInvLink(r.link); setInvEmail(''); setInvName(''); loadInvites(); }
    catch (e: any) { setInvErr(e.message); } finally { setInvBusy(false); }
  };
  const doRevoke = async (id: string) => { if (!confirm('Revoke this invitation? The link will stop working.')) return; try { await revokeOrgInvite(id); loadInvites(); } catch (e: any) { setErr(e.message); } };

  if (!platformAdmin) return <Layout flat title="Tenants"><EmptyState icon="ti-lock" title="Platform admins only" text="Tenant management is restricted to platform administrators." /></Layout>;

  return (
    <Layout flat title="Tenants">
      <PageHeader title="Tenants" subtitle="Manage every organization — plan, features, quotas and access" icon="ti-building-community" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="card overflow-hidden">
        {rows === null ? <div className="p-8"><Spinner /></div> : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-building-community" text="No tenants." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
              <tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.org_id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => router.push(`/tenants/${t.org_id}`)}>
                  <td className="px-4 py-3"><span className="font-medium text-content">{t.org_name}</span><span className="block text-2xs text-muted2">{t.slug}</span></td>
                  <td className="px-4 py-3"><span className="pill pill-gray">{t.plan_name || t.plan_key || '—'}</span></td>
                  <td className="px-4 py-3 text-muted tabular-nums">{t.member_count ?? '—'}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">{t.seats ?? 0}{t.seat_limit ? ` / ${t.seat_limit}` : ''}</td>
                  <td className="px-4 py-3"><span className={`pill ${t.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{t.sub_status || 'free'}</span></td>
                  <td className="px-4 py-3 text-right"><Icon name="ti-chevron-right" className="text-muted2" /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card overflow-hidden mt-4">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <div><h3 className="text-sm font-semibold text-content">Invitations</h3>
            <p className="text-2xs text-muted">Invite an owner to provision a new tenant. They set up their account via a secure signup link (email also queued).</p></div>
          <button className="btn btn-primary shrink-0" onClick={() => { setInvOpen(true); setInvLink(null); setInvErr(''); }}><Icon name="ti-mail-plus" />Invite owner</button>
        </div>
        {invites.length === 0 ? <div className="p-6"><EmptyState icon="ti-mail" text="No invitations yet." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
              <tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody>
              {invites.map((iv) => (
                <tr key={iv.id} className="border-t border-line">
                  <td className="px-4 py-3 text-content">{iv.email}</td>
                  <td className="px-4 py-3 text-muted">{iv.org_name || '—'}</td>
                  <td className="px-4 py-3"><span className="pill pill-gray">{iv.plan_key}</span></td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${iv.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : iv.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface2 text-muted'}`}>{iv.status}</span></td>
                  <td className="px-4 py-3 text-2xs text-muted2">{new Date(iv.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {iv.status === 'pending' && (
                      <>
                        <button className="btn-ghost text-2xs" onClick={() => copyLink(`${window.location.origin}/signup?token=${iv.token}`)}><Icon name="ti-link" />Copy link</button>
                        <button className="btn-ghost text-2xs text-rose-600 ml-1" onClick={() => doRevoke(iv.id)}><Icon name="ti-x" />Revoke</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {invOpen && (
        <Modal open onClose={() => setInvOpen(false)} size="md" icon="ti-mail-plus" title="Invite an owner" subtitle="Provision a new tenant via a secure signup link"
          footer={invLink
            ? <button className="btn" onClick={() => setInvOpen(false)}>Done</button>
            : <><button className="btn" onClick={() => setInvOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={invBusy || !invEmail.trim() || !invName.trim()} onClick={submitInvite}>{invBusy ? 'Creating…' : 'Create invite'}</button></>}>
          {invLink ? (
            <div className="space-y-3">
              <p className="text-sm text-content">Invitation created. Share this secure link with the owner — an email was also queued.</p>
              <div className="flex items-center gap-2">
                <input className="input flex-1 font-mono text-2xs" readOnly value={invLink} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn btn-primary shrink-0" onClick={() => copyLink(invLink)}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
              <p className="text-2xs text-muted">Expires in 14 days. The owner must sign up with this exact email address.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Owner email" required><input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="owner@company.com" /></Field>
              <Field label="Workspace name" required hint="The new tenant is provisioned when the owner accepts."><input className="input" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Acme Inc" /></Field>
              <Field label="Plan"><select className="input" value={invPlan} onChange={(e) => setInvPlan(e.target.value)}>{plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></Field>
              {invErr && <p className="text-sm text-rose-600">{invErr}</p>}
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}
