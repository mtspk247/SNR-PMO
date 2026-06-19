import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  resellerListOrgs, resellerPendingInvites, resellerCreateInvite,
  resellerBillingSummary, adminImpersonateLink,
  snapshotList, snapshotCapture, snapshotDelete,
  resellerConnectOnboard, resellerConnectStatus,
  resellerListPrices, resellerSetPrice,
  resellerGetSelfSignup, resellerSetSelfSignup, inviteMember,
  ResellerOrg, ResellerInvite, ResellerBilling,
  WorkspaceSnapshot, ResellerConnectStatus, ResellerPlanPrice, SelfSignupConfig,
} from '@/lib/db';
import ResellerOverview from '@/components/ResellerOverview';

const PLANS = [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }];

type TabKey = 'overview' | 'subtenants' | 'pricing' | 'snapshots' | 'payments';

export default function ResellerPage() {
  const org = useActiveOrg();
  const [tab, setTab] = useState<TabKey>('overview');
  const router = useRouter();
  useEffect(() => { const t = router.query.tab; if (typeof t === 'string' && ['overview','subtenants','pricing','snapshots','payments'].includes(t)) setTab(t as TabKey); }, [router.query.tab]);
  const [coOpen, setCoOpen] = useState(false); const [coEmail, setCoEmail] = useState(''); const [coBusy, setCoBusy] = useState(false); const [coLink, setCoLink] = useState<string | null>(null); const [coErr, setCoErr] = useState(''); const [coCopied, setCoCopied] = useState(false);
  const submitCo = async () => { if (!org || !coEmail.trim()) return; setCoBusy(true); setCoErr(''); setCoLink(null); try { const r2 = await inviteMember(org.id, coEmail.trim(), 'admin'); setCoLink(r2.link); setCoEmail(''); } catch (e: any) { setCoErr(e.message); } finally { setCoBusy(false); } };

  const [orgs, setOrgs] = useState<ResellerOrg[] | null>(null);
  const [invites, setInvites] = useState<ResellerInvite[]>([]);
  const [billing, setBilling] = useState<ResellerBilling | null>(null);
  const [err, setErr] = useState('');

  // Invite modal
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('pro');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // View-as
  const [viewMsg, setViewMsg] = useState('');

  // Snapshots
  const [snaps, setSnaps] = useState<WorkspaceSnapshot[]>([]);
  const [snapName, setSnapName] = useState('');
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapId, setSnapId] = useState('');
  const [snapMsg, setSnapMsg] = useState('');

  // Stripe Connect
  const [connect, setConnect] = useState<ResellerConnectStatus | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);

  // Reseller pricing
  const [prices, setPrices] = useState<ResellerPlanPrice[]>([]);
  const [pPlan, setPPlan] = useState('pro');
  const [pAmt, setPAmt] = useState('');
  const [pInt, setPInt] = useState('month');
  const [pBusy, setPBusy] = useState(false);
  const [pMsg, setPMsg] = useState('');

  // Self-signup
  const [ss, setSs] = useState<SelfSignupConfig | null>(null);
  const [ssBusy, setSsBusy] = useState(false);
  const [ssMsg, setSsMsg] = useState('');

  // Sub-tenant filter bar state
  const [q, setQ] = useState('');
  const [fPlan, setFPlan] = useState('all');
  const [fStatus, setFStatus] = useState('all');

  const load = () => {
    if (!org) return;
    resellerListOrgs(org.id).then(setOrgs).catch((e) => { setErr(e.message); setOrgs([]); });
    resellerPendingInvites(org.id).then(setInvites).catch(() => {});
    resellerBillingSummary(org.id).then(setBilling).catch(() => {});
    snapshotList(org.id).then(setSnaps).catch(() => {});
    resellerConnectStatus(org.id).then(setConnect).catch(() => {});
    resellerListPrices(org.id).then(setPrices).catch(() => {});
    resellerGetSelfSignup(org.id).then(setSs).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  // ── All hooks must be called before any early return ──
  // Filtered sub-tenants for the Sub-tenants tab
  const filteredOrgs = useMemo(() => {
    const all = orgs || [];
    const term = q.trim().toLowerCase();
    return all.filter((o) => {
      if (term && !(`${o.org_name || ''}`.toLowerCase().includes(term) || `${o.slug || ''}`.toLowerCase().includes(term))) return false;
      if (fPlan !== 'all' && (o.plan_key || o.plan_name) !== fPlan) return false;
      if (fStatus === 'active' && o.sub_status !== 'active') return false;
      if (fStatus === 'other' && o.sub_status === 'active') return false;
      return true;
    });
  }, [orgs, q, fPlan, fStatus]);
  const filtersOn = q.trim() !== '' || fPlan !== 'all' || fStatus !== 'all';

  // Unique plan keys for the plan filter dropdown
  const planOptions = useMemo(() => {
    const keys = new Set((orgs || []).map((o) => o.plan_key || o.plan_name || 'free').filter(Boolean));
    return [{ value: 'all', label: 'All plans' }, ...[...keys].map((k) => ({ value: k, label: k }))];
  }, [orgs]);

  if (!org?.is_reseller || !can.manageMembers(org)) {
    return (
      <Layout flat title="Reseller">
        <EmptyState
          icon="ti-building-community"
          title="Not a reseller workspace"
          text="Reselling lets you create and manage your own sub-tenants under your brand. Ask the platform team to enable it on your plan."
        />
      </Layout>
    );
  }

  const viewAsSub = async (subId: string, nm: string) => {
    setViewMsg('Generating sign-in link…');
    try {
      const r = await adminImpersonateLink({ sub: subId });
      try { await navigator.clipboard?.writeText(r.link); } catch { /* */ }
      setViewMsg(`Sign-in link for ${nm} copied — open it in a private window to view that workspace.`);
      setTimeout(() => setViewMsg(''), 8000);
    } catch (e: any) { setViewMsg(e.message || 'Failed'); }
  };

  const submit = async () => {
    if (!org || !email.trim() || !name.trim()) return;
    setBusy(true); setErr(''); setLink(null);
    try {
      const r = await resellerCreateInvite(org.id, email.trim(), name.trim(), plan, snapId || null);
      setLink(r.link); setEmail(''); setName(''); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const copy = (l: string) => {
    try { navigator.clipboard?.writeText(l); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* */ }
  };

  const saveSnap = async () => {
    if (!org || !snapName.trim()) return;
    setSnapBusy(true); setSnapMsg('');
    try {
      await snapshotCapture(org.id, snapName.trim());
      setSnapName(''); setSnapMsg('Snapshot saved');
      snapshotList(org.id).then(setSnaps).catch(() => {});
      setTimeout(() => setSnapMsg(''), 2500);
    } catch (e: any) { setSnapMsg(e.message || 'Failed'); } finally { setSnapBusy(false); }
  };

  const delSnap = async (id: string) => {
    if (!org) return;
    try {
      await snapshotDelete(id);
      setSnaps((s2) => s2.filter((x) => x.id !== id));
      if (snapId === id) setSnapId('');
    } catch (e: any) { setSnapMsg(e.message || 'Failed'); }
  };

  const startConnect = async () => {
    if (!org) return;
    setConnectBusy(true); setErr('');
    try { const r = await resellerConnectOnboard(org.id); window.location.href = r.url; }
    catch (e: any) { setErr(e.message || 'Failed'); setConnectBusy(false); }
  };

  const saveSelfSignup = async (patch: Partial<SelfSignupConfig>) => {
    if (!org || !ss) return;
    const next = { ...ss, ...patch }; setSs(next); setSsBusy(true); setSsMsg('');
    try {
      await resellerSetSelfSignup(org.id, next.enabled, next.plan_key, next.snapshot_id);
      setSsMsg('Saved'); setTimeout(() => setSsMsg(''), 2000);
    } catch (e: any) {
      setSsMsg(e.message || 'Failed');
      resellerGetSelfSignup(org.id).then(setSs).catch(() => {});
    } finally { setSsBusy(false); }
  };

  const saveTemplate = async (tpl: string) => {
    if (!org) return;
    setTplBusy(true); setTplMsg('');
    try {
      const updated = await updateOrgSettings(org.id, { branding: { ...(org.branding || {}), site_template: tpl } });
      patchOrg({ id: org.id, branding: updated.branding });
      setTplMsg('Saved'); setTimeout(() => setTplMsg(''), 2000);
    } catch (e: any) {
      setTplMsg(e.message || 'Failed to save');
    } finally { setTplBusy(false); }
  };

  const savePrice = async () => {
    if (!org) return;
    const cents = Math.round(parseFloat(pAmt) * 100);
    if (!(cents >= 0) || !pAmt) { setPMsg('Enter a valid amount'); return; }
    setPBusy(true); setPMsg('');
    try {
      await resellerSetPrice(org.id, pPlan, cents, pInt);
      setPAmt(''); setPMsg('Price saved');
      resellerListPrices(org.id).then(setPrices).catch(() => {});
      setTimeout(() => setPMsg(''), 2500);
    } catch (e: any) { setPMsg(e.message || 'Failed'); } finally { setPBusy(false); }
  };

  return (
    <Layout flat title="Reseller">
      <PageHeader
        title="Reseller"
        subtitle="Create and manage your own sub-tenants — each gets its own workspace under your brand"
        icon="ti-building-community"
        action={
          <div className="flex items-center gap-2">
            <button className="btn" onClick={() => { setCoOpen(true); setCoLink(null); setCoErr(''); }} title="Invite a co-owner to help manage your reseller account">
              <Icon name="ti-user-plus" />Invite co-owner
            </button>
            <button className="btn btn-primary" onClick={() => { setOpen(true); setLink(null); setErr(''); }}>
              <Icon name="ti-plus" />Invite sub-tenant
            </button>
          </div>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {viewMsg && (
        <p className="text-2xs text-accentstrong mb-3 inline-flex items-center gap-1.5">
          <Icon name="ti-info-circle" />{viewMsg}
        </p>
      )}

      <Tabs
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
          { key: 'subtenants', label: 'Sub-tenants', icon: 'ti-buildings', count: orgs?.length },
          { key: 'pricing', label: 'Pricing', icon: 'ti-tag' },
          { key: 'snapshots', label: 'Snapshots', icon: 'ti-camera', count: snaps.length || undefined },
          { key: 'payments', label: 'Payments & signup', icon: 'ti-credit-card' },
        ]}
      />

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        orgs === null
          ? <div className="card p-8"><Spinner /></div>
          : orgs.length === 0
            ? <div className="card p-8"><EmptyState icon="ti-buildings" text="No sub-tenants yet — invite one to get started." /></div>
            : <ResellerOverview orgs={orgs} billing={billing} prices={prices} agencyPlan={org.plan} />
      )}

      {/* ── Sub-tenants tab ── */}
      {tab === 'subtenants' && (
        <>
          {/* Filter bar */}
          {orgs && orgs.length > 0 && (
            <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2 text-sm pointer-events-none" />
                <input
                  className="input pl-8 w-full"
                  placeholder="Search by name or slug…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="w-36">
                <Select value={fPlan} onChange={setFPlan} options={planOptions} />
              </div>
              <div className="w-36">
                <Select
                  value={fStatus}
                  onChange={setFStatus}
                  options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'other', label: 'Other' }]}
                />
              </div>
            </div>
          )}

          {/* Sub-tenants table */}
          <div className="card overflow-hidden mb-6">
            {orgs === null ? (
              <div className="p-8"><Spinner /></div>
            ) : orgs.length === 0 ? (
              <div className="p-6"><EmptyState icon="ti-buildings" text="No sub-tenants yet — invite one to get started." /></div>
            ) : filteredOrgs.length === 0 ? (
              <div className="p-8">
                <EmptyState
                  icon="ti-search"
                  title="No matches"
                  text="No sub-tenants match the current filters."
                  action={filtersOn
                    ? <button className="btn" onClick={() => { setQ(''); setFPlan('all'); setFStatus('all'); }}>Clear filters</button>
                    : undefined}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface2/60 text-muted text-left text-2xs uppercase tracking-wider font-semibold sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-2.5 text-muted2">Workspace</th>
                      <th className="px-4 py-2.5 text-muted2">Plan</th>
                      <th className="px-4 py-2.5 text-muted2">Members</th>
                      <th className="px-4 py-2.5 text-muted2">Seats</th>
                      <th className="px-4 py-2.5 text-muted2">Status</th>
                      <th className="px-4 py-2.5 text-muted2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrgs.map((o) => (
                      <tr key={o.org_id} className="border-t border-line hover:bg-surface2/60 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium text-content">{o.org_name}</span>
                          <span className="block text-2xs text-muted2">{o.slug}</span>
                        </td>
                        <td className="px-4 py-3 capitalize text-muted">{o.plan_name || o.plan_key || 'free'}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{o.member_count}</td>
                        <td className="px-4 py-3 tabular-nums text-muted">{o.seats}{o.seat_limit ? ` / ${o.seat_limit}` : ''}</td>
                        <td className="px-4 py-3">
                          <span className={`pill ${o.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{o.sub_status || 'free'}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => viewAsSub(o.org_id, o.org_name)}
                            className="btn-ghost text-2xs"
                            title="View this sub-tenant's workspace (private window)"
                          >
                            <Icon name="ti-login-2" />View as
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Invitations */}
          {invites.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line">
                <h3 className="text-sm font-semibold">Invitations</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Workspace</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((i) => (
                      <tr key={i.id} className="border-t border-line hover:bg-surface2/60 transition-colors">
                        <td className="px-4 py-3 text-content">{i.email}</td>
                        <td className="px-4 py-3 text-muted">{i.org_name || '—'}</td>
                        <td className="px-4 py-3 capitalize text-muted">{i.plan_key}</td>
                        <td className="px-4 py-3">
                          <span className={`pill ${i.status === 'pending' ? 'pill-amber' : i.status === 'accepted' ? 'pill-green' : 'pill-gray'}`}>{i.status}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {i.status === 'pending' && (
                            <button onClick={() => copy(`https://snr-pmo.vercel.app/signup?token=${i.token}`)} className="btn-ghost text-2xs">
                              <Icon name="ti-copy" />Copy link
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Pricing tab ── */}
      {tab === 'pricing' && (
        <div className="card overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold">Sub-tenant pricing</h3>
            <p className="text-2xs text-muted">Set what you charge your clients per plan. These prices are billed to your sub-tenants through your connected Stripe account.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-2xs text-muted block mb-1">Plan</label>
                <Select value={pPlan} onChange={setPPlan} options={[{ value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }]} />
              </div>
              <div>
                <label className="text-2xs text-muted block mb-1">Price (USD)</label>
                <input className="input w-28" type="number" min="0" step="0.01" placeholder="0.00" value={pAmt} onChange={(e) => setPAmt(e.target.value)} />
              </div>
              <div>
                <label className="text-2xs text-muted block mb-1">Billing</label>
                <Select value={pInt} onChange={setPInt} options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
              </div>
              <button className="btn btn-primary" disabled={pBusy || !pAmt} onClick={savePrice}>{pBusy ? 'Saving…' : 'Save price'}</button>
            </div>
            {pMsg && <p className="text-2xs text-accentstrong">{pMsg}</p>}
            {prices.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-lg">
                {prices.map((pr) => (
                  <li key={pr.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="capitalize font-medium text-content">{pr.plan_key}</span>
                    <span className="text-muted tabular-nums">{pr.currency.toUpperCase()} {(pr.amount_cents / 100).toFixed(2)} / {pr.interval === 'year' ? 'yr' : 'mo'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Snapshots tab ── */}
      {tab === 'snapshots' && (
        <div className="card overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold">Snapshots</h3>
            <p className="text-2xs text-muted">Save this workspace's setup (lists, statuses, tags, theme) and clone it into new sub-tenants on creation.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input className="input flex-1" placeholder="Snapshot name (e.g. Agency starter)" value={snapName} onChange={(e) => setSnapName(e.target.value)} />
              <button className="btn btn-primary whitespace-nowrap" disabled={snapBusy || !snapName.trim()} onClick={saveSnap}>
                <Icon name="ti-camera" />{snapBusy ? 'Saving…' : 'Save snapshot'}
              </button>
            </div>
            {snapMsg && <p className="text-2xs text-accentstrong">{snapMsg}</p>}
            {snaps.length === 0 ? (
              <p className="text-2xs text-muted2">No snapshots yet — save one from a configured workspace, then pick it when inviting a sub-tenant.</p>
            ) : (
              <ul className="divide-y divide-line border border-line rounded-lg">
                {snaps.map((sn) => (
                  <li key={sn.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">
                      <span className="font-medium text-content">{sn.name}</span>
                      {sn.description ? <span className="text-2xs text-muted2"> — {sn.description}</span> : null}
                    </span>
                    <button onClick={() => delSnap(sn.id)} className="btn-ghost text-2xs text-rose-600" title="Delete snapshot">
                      <Icon name="ti-trash" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Payments & signup tab ── */}
      {tab === 'payments' && (
        <div className="space-y-6">
          {/* Stripe Connect */}
          <div className="card p-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Icon name="ti-credit-card" />Payments (Stripe Connect)</h3>
              <p className="text-2xs text-muted mt-0.5">
                {connect?.charges_enabled
                  ? 'Connected — you can bill your sub-tenants and receive payouts directly.'
                  : connect?.connected
                    ? 'Setup incomplete — finish Stripe onboarding to enable billing.'
                    : 'Connect your Stripe account to bill your sub-tenants directly and receive payouts. The platform takes a small application fee on each charge.'}
              </p>
            </div>
            <div className="shrink-0">
              {connect?.charges_enabled
                ? <span className="pill pill-green inline-flex items-center gap-1"><Icon name="ti-circle-check" />Payments enabled</span>
                : <button className="btn btn-primary" disabled={connectBusy} onClick={startConnect}>{connectBusy ? 'Opening…' : connect?.connected ? 'Finish Stripe setup' : 'Connect Stripe'}</button>}
            </div>
          </div>

          {/* Public signup */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="text-sm font-semibold">Public signup (your website)</h3>
              <p className="text-2xs text-muted">Let visitors on your branded domain create their own workspace under you. Each signup becomes your sub-tenant, pre-loaded with your snapshot and branding.</p>
            </div>
            <div className="p-4 space-y-3">
              {!ss?.custom_domain || !ss?.domain_verified ? (
                <p className="text-2xs text-muted2">Add and verify your custom domain first (Settings ▸ Branding / domain). Public signup runs on your verified domain.</p>
              ) : (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!ss?.enabled} disabled={ssBusy} onChange={(e) => saveSelfSignup({ enabled: e.target.checked })} />
                    Enable public signup on <span className="font-medium">{ss.custom_domain}</span>
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="text-2xs text-muted block mb-1">Default plan</label>
                      <Select value={ss?.plan_key || 'free'} onChange={(v) => saveSelfSignup({ plan_key: v })} options={[{ value: 'free', label: 'Free / trial' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }]} />
                    </div>
                    <div>
                      <label className="text-2xs text-muted block mb-1">Apply snapshot</label>
                      <Select value={ss?.snapshot_id || ''} onChange={(v) => saveSelfSignup({ snapshot_id: v || null })} options={[{ value: '', label: 'None' }, ...snaps.map((sn) => ({ value: sn.id, label: sn.name }))]} />
                    </div>
                  </div>
                  {ss?.enabled && <p className="text-2xs text-accentstrong">Signup link: https://{ss.custom_domain}/signup</p>}
                </>
              )}
              {ssMsg && <p className="text-2xs text-muted">{ssMsg}</p>}
            </div>
          </div>

          {/* Landing page style */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="text-sm font-semibold">Landing page style</h3>
              <p className="text-2xs text-muted">Choose the visual template visitors see on your branded domain.</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-2xs text-muted block mb-1">Template</label>
                <Select
                  value={(org?.branding as any)?.site_template || 'classic'}
                  onChange={(v) => saveTemplate(v)}
                  options={[
                    { value: 'classic', label: 'Classic — branded, balanced layout' },
                    { value: 'minimal', label: 'Minimal — whitespace-first, type-forward' },
                    { value: 'bold', label: 'Bold — high-contrast, energetic, display type' },
                  ]}
                />
              </div>
              {tplMsg && <p className="text-2xs text-muted">{tplMsg}</p>}
              {tplBusy && <p className="text-2xs text-muted">Saving…</p>}
              {ss?.custom_domain && ss?.domain_verified && (
                <p className="text-2xs text-muted">
                  Preview your site →{' '}
                  <a href={`https://${ss.custom_domain}`} target="_blank" rel="noopener noreferrer" className="underline">
                    https://{ss.custom_domain}
                  </a>
                </p>
              )}
              {(!ss?.custom_domain || !ss?.domain_verified) && (
                <p className="text-2xs text-muted2">Verify your custom domain (Settings ▸ Branding / domain) to preview the live landing page.</p>
              )}
            </div>
          </div>

          {/* Wholesale billing summary */}
          {billing && Object.keys(billing.by_plan).length > 0 && (
            <div className="card p-4">
              <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-2">Wholesale usage — what your platform plan is billed on</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(billing.by_plan).map(([k, c]) => (
                  <span key={k} className="pill pill-gray capitalize">{c}× {k}</span>
                ))}
              </div>
              <p className="text-2xs text-muted mt-2">You're billed by the platform on these sub-tenants/seats; you bill your own clients directly.</p>
            </div>
          )}
        </div>
      )}

      {/* Invite modal — shared across all tabs */}
      <Modal open={coOpen} onClose={() => setCoOpen(false)} title="Invite a co-owner" icon="ti-user-plus" size="sm" onSubmit={submitCo}
        footer={<><button className="btn" onClick={() => setCoOpen(false)}>Close</button><button className="btn btn-primary" disabled={coBusy || !coEmail.trim()} onClick={submitCo}>{coBusy ? 'Inviting…' : 'Send invite'}</button></>}>
        <div className="space-y-3">
          <p className="text-2xs text-muted">A co-owner gets admin access to manage your reseller account — your sub-tenants, pricing, snapshots and billing. They join your workspace; they can\u2019t see other resellers or the platform.</p>
          <Field label="Co-owner email" required><input className="input" value={coEmail} onChange={(e) => setCoEmail(e.target.value)} placeholder="partner@youragency.com" /></Field>
          {coErr && <p className="text-2xs text-rose-600">{coErr}</p>}
          {coLink && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 p-3">
              <p className="text-2xs text-muted mb-1.5">Invite link — share it with your co-owner:</p>
              <div className="flex items-center gap-2"><input readOnly value={coLink} onFocus={(e) => e.currentTarget.select()} className="input text-2xs flex-1" /><button onClick={() => { try { navigator.clipboard?.writeText(coLink); setCoCopied(true); setTimeout(() => setCoCopied(false), 1500); } catch { /* */ } }} className="btn-ghost text-2xs"><Icon name="ti-copy" />{coCopied ? 'Copied' : 'Copy'}</button></div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a sub-tenant"
        icon="ti-building-plus"
        size="sm"
        onSubmit={submit}
        footer={
          <>
            <button className="btn" onClick={() => setOpen(false)}>Close</button>
            <button className="btn btn-primary" disabled={busy || !email.trim() || !name.trim()} onClick={submit}>
              {busy ? 'Creating…' : 'Create invite'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Workspace name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client workspace name" /></Field>
          <Field label="Owner email" required><input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@client.com" /></Field>
          <Field label="Plan"><Select value={plan} onChange={setPlan} options={PLANS} /></Field>
          <Field label="Start from snapshot">
            <Select value={snapId} onChange={setSnapId} options={[{ value: '', label: 'None (empty workspace)' }, ...snaps.map((sn) => ({ value: sn.id, label: sn.name }))]} />
          </Field>
          {link && (
            <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/5 p-3">
              <p className="text-2xs text-muted mb-1.5">Invite link — share it with the sub-tenant owner:</p>
              <div className="flex items-center gap-2">
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="input text-2xs flex-1" />
                <button onClick={() => copy(link)} className="btn-ghost text-2xs"><Icon name="ti-copy" />{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          )}
          {err && <p className="text-2xs text-rose-600">{err}</p>}
        </div>
      </Modal>
    </Layout>
  );
}
