import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { resellerListOrgs, resellerPendingInvites, resellerCreateInvite, resellerBillingSummary, adminImpersonateLink, snapshotList, snapshotCapture, snapshotDelete, resellerConnectOnboard, resellerConnectStatus, ResellerOrg, ResellerInvite, ResellerBilling, WorkspaceSnapshot, ResellerConnectStatus } from '@/lib/db';

const PLANS = [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }];

export default function ResellerPage() {
  const org = useActiveOrg();
  const [orgs, setOrgs] = useState<ResellerOrg[] | null>(null);
  const [invites, setInvites] = useState<ResellerInvite[]>([]);
  const [billing, setBilling] = useState<ResellerBilling | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [plan, setPlan] = useState('pro');
  const [busy, setBusy] = useState(false); const [link, setLink] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const [viewMsg, setViewMsg] = useState('');
  const [snaps, setSnaps] = useState<WorkspaceSnapshot[]>([]);
  const [snapName, setSnapName] = useState(''); const [snapBusy, setSnapBusy] = useState(false); const [snapId, setSnapId] = useState(''); const [snapMsg, setSnapMsg] = useState('');
  const [connect, setConnect] = useState<ResellerConnectStatus | null>(null); const [connectBusy, setConnectBusy] = useState(false);
  const viewAsSub = async (subId: string, nm: string) => { setViewMsg('Generating sign-in link…'); try { const r = await adminImpersonateLink({ sub: subId }); try { await navigator.clipboard?.writeText(r.link); } catch { /* */ } setViewMsg(`Sign-in link for ${nm} copied — open it in a private window to view that workspace.`); setTimeout(() => setViewMsg(''), 8000); } catch (e: any) { setViewMsg(e.message || 'Failed'); } };

  const load = () => { if (!org) return; resellerListOrgs(org.id).then(setOrgs).catch((e) => { setErr(e.message); setOrgs([]); }); resellerPendingInvites(org.id).then(setInvites).catch(() => {}); resellerBillingSummary(org.id).then(setBilling).catch(() => {}); snapshotList(org.id).then(setSnaps).catch(() => {}); resellerConnectStatus(org.id).then(setConnect).catch(() => {}); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  if (!org?.is_reseller || !can.manageMembers(org)) {
    return <Layout flat title="Reseller"><EmptyState icon="ti-building-community" title="Not a reseller workspace" text="Reselling lets you create and manage your own sub-tenants under your brand. Ask the platform team to enable it on your plan." /></Layout>;
  }

  const submit = async () => {
    if (!org || !email.trim() || !name.trim()) return; setBusy(true); setErr(''); setLink(null);
    try { const r = await resellerCreateInvite(org.id, email.trim(), name.trim(), plan, snapId || null); setLink(r.link); setEmail(''); setName(''); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const copy = (l: string) => { try { navigator.clipboard?.writeText(l); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ } };
  const saveSnap = async () => { if (!org || !snapName.trim()) return; setSnapBusy(true); setSnapMsg(''); try { await snapshotCapture(org.id, snapName.trim()); setSnapName(''); setSnapMsg('Snapshot saved'); snapshotList(org.id).then(setSnaps).catch(() => {}); setTimeout(() => setSnapMsg(''), 2500); } catch (e: any) { setSnapMsg(e.message || 'Failed'); } finally { setSnapBusy(false); } };
  const delSnap = async (id: string) => { if (!org) return; try { await snapshotDelete(id); setSnaps((s2) => s2.filter((x) => x.id !== id)); if (snapId === id) setSnapId(''); } catch (e: any) { setSnapMsg(e.message || 'Failed'); } };
  const startConnect = async () => { if (!org) return; setConnectBusy(true); setErr(''); try { const r = await resellerConnectOnboard(org.id); window.location.href = r.url; } catch (e: any) { setErr(e.message || 'Failed'); setConnectBusy(false); } };

  return (
    <Layout flat title="Reseller">
      <PageHeader title="Reseller" subtitle="Create and manage your own sub-tenants — each gets its own workspace under your brand" icon="ti-building-community"
        action={<button className="btn btn-primary" onClick={() => { setOpen(true); setLink(null); setErr(''); }}><Icon name="ti-plus" />Invite sub-tenant</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {viewMsg && <p className="text-2xs text-accentstrong mb-3 inline-flex items-center gap-1.5"><Icon name="ti-info-circle" />{viewMsg}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sub-tenants" value={billing?.sub_count ?? orgs?.length ?? 0} icon="ti-buildings" hint={billing ? `${billing.active} active` : undefined} />
        <StatCard label="Total seats (billed)" value={billing?.total_seats ?? 0} icon="ti-users" hint="across all sub-tenants" />
        <StatCard label="Pending invites" value={invites.filter((i) => i.status === 'pending').length} icon="ti-mail" />
        <StatCard label="Your agency plan" value={org.plan || '—'} icon="ti-package" />
      </div>
      {billing && Object.keys(billing.by_plan).length > 0 && (
        <div className="card p-4 mb-6 max-w-3xl">
          <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-2">Wholesale usage — what your platform plan is billed on</p>
          <div className="flex flex-wrap gap-2">{Object.entries(billing.by_plan).map(([k, c]) => (<span key={k} className="pill pill-gray capitalize">{c}× {k}</span>))}</div>
          <p className="text-2xs text-muted mt-2">You’re billed by the platform on these sub-tenants/seats; you bill your own clients directly.</p>
        </div>
      )}

      <div className="card p-4 mb-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Icon name="ti-credit-card" />Payments (Stripe Connect)</h3>
          <p className="text-2xs text-muted mt-0.5">{connect?.charges_enabled ? 'Connected — you can bill your sub-tenants and receive payouts directly.' : connect?.connected ? 'Setup incomplete — finish Stripe onboarding to enable billing.' : 'Connect your Stripe account to bill your sub-tenants directly and receive payouts. The platform takes a small application fee on each charge.'}</p>
        </div>
        <div className="shrink-0">
          {connect?.charges_enabled
            ? <span className="pill pill-green inline-flex items-center gap-1"><Icon name="ti-circle-check" />Payments enabled</span>
            : <button className="btn btn-primary" disabled={connectBusy} onClick={startConnect}>{connectBusy ? 'Opening…' : connect?.connected ? 'Finish Stripe setup' : 'Connect Stripe'}</button>}
        </div>
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Snapshots</h3><p className="text-2xs text-muted">Save this workspace’s setup (lists, statuses, tags, theme) and clone it into new sub-tenants on creation.</p></div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input className="input flex-1" placeholder="Snapshot name (e.g. Agency starter)" value={snapName} onChange={(e) => setSnapName(e.target.value)} />
            <button className="btn btn-primary whitespace-nowrap" disabled={snapBusy || !snapName.trim()} onClick={saveSnap}><Icon name="ti-camera" />{snapBusy ? 'Saving…' : 'Save snapshot'}</button>
          </div>
          {snapMsg && <p className="text-2xs text-accentstrong">{snapMsg}</p>}
          {snaps.length === 0 ? <p className="text-2xs text-muted2">No snapshots yet — save one from a configured workspace, then pick it when inviting a sub-tenant.</p> : (
            <ul className="divide-y divide-line border border-line rounded-lg">
              {snaps.map((sn) => (
                <li key={sn.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="truncate"><span className="font-medium text-content">{sn.name}</span>{sn.description ? <span className="text-2xs text-muted2"> — {sn.description}</span> : null}</span>
                  <button onClick={() => delSnap(sn.id)} className="btn-ghost text-2xs text-rose-600" title="Delete snapshot"><Icon name="ti-trash" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Your sub-tenants</h3></div>
        {orgs === null ? <div className="p-8"><Spinner /></div> : orgs.length === 0 ? <div className="p-6"><EmptyState icon="ti-buildings" text="No sub-tenants yet — invite one to get started." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide"><tr><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>{orgs.map((o) => (
              <tr key={o.org_id} className="border-t border-line"><td className="px-4 py-3"><span className="font-medium text-content">{o.org_name}</span><span className="block text-2xs text-muted2">{o.slug}</span></td><td className="px-4 py-3 capitalize text-muted">{o.plan_name || o.plan_key || 'free'}</td><td className="px-4 py-3 tabular-nums text-muted">{o.member_count}</td><td className="px-4 py-3 tabular-nums text-muted">{o.seats}{o.seat_limit ? ` / ${o.seat_limit}` : ''}</td><td className="px-4 py-3"><span className={`pill ${o.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{o.sub_status || 'free'}</span></td><td className="px-4 py-3 text-right"><button onClick={() => viewAsSub(o.org_id, o.org_name)} className="btn-ghost text-2xs" title="View this sub-tenant\u2019s workspace (private window)"><Icon name="ti-login-2" />View as</button></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {invites.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-line"><h3 className="text-sm font-semibold">Invitations</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide"><tr><th className="px-4 py-3">Email</th><th className="px-4 py-3">Workspace</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>{invites.map((i) => (
              <tr key={i.id} className="border-t border-line"><td className="px-4 py-3 text-content">{i.email}</td><td className="px-4 py-3 text-muted">{i.org_name || '—'}</td><td className="px-4 py-3 capitalize text-muted">{i.plan_key}</td><td className="px-4 py-3"><span className={`pill ${i.status === 'pending' ? 'pill-amber' : i.status === 'accepted' ? 'pill-green' : 'pill-gray'}`}>{i.status}</span></td><td className="px-4 py-3 text-right">{i.status === 'pending' && <button onClick={() => copy(`https://snr-pmo.vercel.app/signup?token=${i.token}`)} className="btn-ghost text-2xs"><Icon name="ti-copy" />Copy link</button>}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Invite a sub-tenant" icon="ti-building-plus" size="sm" onSubmit={submit}
        footer={<><button className="btn" onClick={() => setOpen(false)}>Close</button><button className="btn btn-primary" disabled={busy || !email.trim() || !name.trim()} onClick={submit}>{busy ? 'Creating…' : 'Create invite'}</button></>}>
        <div className="space-y-3">
          <Field label="Workspace name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client workspace name" /></Field>
          <Field label="Owner email" required><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@client.com" /></Field>
          <Field label="Plan"><Select value={plan} onChange={setPlan} options={PLANS} /></Field>
          <Field label="Start from snapshot"><Select value={snapId} onChange={setSnapId} options={[{ value: '', label: 'None (empty workspace)' }, ...snaps.map((sn) => ({ value: sn.id, label: sn.name }))]} /></Field>
          {link && <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 p-3"><p className="text-2xs text-muted mb-1.5">Invite link — share it with the sub-tenant owner:</p><div className="flex items-center gap-2"><input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="input text-2xs flex-1" /><button onClick={() => copy(link)} className="btn-ghost text-2xs"><Icon name="ti-copy" />{copied ? 'Copied' : 'Copy'}</button></div></div>}
          {err && <p className="text-2xs text-rose-600">{err}</p>}
        </div>
      </Modal>
    </Layout>
  );
}
