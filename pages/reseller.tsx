import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs, HelpHint } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  resellerListOrgs, resellerBillingSummary,
  snapshotList, snapshotCapture, snapshotDelete,
  resellerConnectOnboard, resellerConnectStatus,
  resellerListPrices, resellerSetPrice,
  resellerGetAgentRate, resellerSetAgentRate, resellerAgentMargin,
  resellerGetSelfSignup, resellerSetSelfSignup, inviteMember,
  ResellerOrg, ResellerBilling,
  WorkspaceSnapshot, ResellerConnectStatus, ResellerPlanPrice, SelfSignupConfig,
  ResellerAgentRate, ResellerAgentMargin,
  updateOrgSettings,
} from '@/lib/db';

type TabKey = 'plans' | 'payments' | 'snapshots' | 'coowners';
// Section ↔ route map (the console is decomposed into focused /reseller/<section> routes).
const SECTION_PATHS: Record<TabKey, string> = { plans: '/reseller/plans', payments: '/reseller/payments', snapshots: '/reseller/snapshots', coowners: '/reseller/co-owners' };
function routeSection(pathname: string): TabKey | null {
  if (pathname.startsWith('/reseller/plans')) return 'plans';
  if (pathname.startsWith('/reseller/payments')) return 'payments';
  if (pathname.startsWith('/reseller/snapshots')) return 'snapshots';
  if (pathname.startsWith('/reseller/co-owners')) return 'coowners';
  return null;
}

export default function ResellerPage() {
  const org = useActiveOrg();
  const patchOrg = useAuthStore((s) => s.patchOrg);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(routeSection(router.pathname) || 'plans');
  // Section is driven by the route (/reseller/<section>); legacy /reseller?tab=x deep-links redirect to the real route.
  useEffect(() => {
    const r = routeSection(router.pathname);
    if (r) { setTab(r); return; }
    const t = router.query.tab;
    if (typeof t === 'string' && (['plans','payments','snapshots','coowners'] as string[]).includes(t)) router.replace(SECTION_PATHS[t as TabKey]);
  }, [router.pathname, router.query.tab]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Co-owner invite
  const [coOpen, setCoOpen] = useState(false); const [coEmail, setCoEmail] = useState(''); const [coBusy, setCoBusy] = useState(false); const [coLink, setCoLink] = useState<string | null>(null); const [coErr, setCoErr] = useState(''); const [coCopied, setCoCopied] = useState(false);
  const submitCo = async () => { if (!org || !coEmail.trim()) return; setCoBusy(true); setCoErr(''); setCoLink(null); try { const r2 = await inviteMember(org.id, coEmail.trim(), 'admin'); setCoLink(r2.link); setCoEmail(''); } catch (e: any) { setCoErr(e.message); } finally { setCoBusy(false); } };

  const [orgs, setOrgs] = useState<ResellerOrg[] | null>(null);
  const [billing, setBilling] = useState<ResellerBilling | null>(null);
  const [err, setErr] = useState('');

  // Snapshots
  const [snaps, setSnaps] = useState<WorkspaceSnapshot[]>([]);
  const [snapName, setSnapName] = useState('');
  const [snapBusy, setSnapBusy] = useState(false);
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

  // AI agent metered pricing (retail) + margin
  const [agentRate, setAgentRate] = useState<ResellerAgentRate | null>(null);
  const [margin, setMargin] = useState<ResellerAgentMargin | null>(null);
  const [arRun, setArRun] = useState(''); const [arTok, setArTok] = useState('');
  const [arBusy, setArBusy] = useState(false); const [arMsg, setArMsg] = useState('');

  // Self-signup
  const [ss, setSs] = useState<SelfSignupConfig | null>(null);
  const [ssBusy, setSsBusy] = useState(false);
  const [ssMsg, setSsMsg] = useState('');
  const [tplBusy, setTplBusy] = useState(false);
  const [tplMsg, setTplMsg] = useState('');

  const load = () => {
    if (!org) return;
    resellerListOrgs(org.id).then(setOrgs).catch((e) => { setErr(e.message); setOrgs([]); });
    resellerBillingSummary(org.id).then(setBilling).catch(() => {});
    snapshotList(org.id).then(setSnaps).catch(() => {});
    resellerConnectStatus(org.id).then(setConnect).catch(() => {});
    resellerListPrices(org.id).then(setPrices).catch(() => {});
    resellerGetAgentRate(org.id).then((r) => { setAgentRate(r); if (r) { setArRun(String(r.price_per_run)); setArTok(String(r.price_per_1k_tokens)); } }).catch(() => {});
    resellerAgentMargin(org.id).then(setMargin).catch(() => {});
    resellerGetSelfSignup(org.id).then(setSs).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

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

  const saveAgentRate = async () => {
    if (!org) return;
    const run = parseFloat(arRun || '0'); const tok = parseFloat(arTok || '0');
    if (!(run >= 0) || !(tok >= 0)) { setArMsg('Enter valid amounts'); return; }
    setArBusy(true); setArMsg('');
    try {
      await resellerSetAgentRate(org.id, run, tok);
      setArMsg('Agent rates saved');
      resellerGetAgentRate(org.id).then(setAgentRate).catch(() => {});
      resellerAgentMargin(org.id).then(setMargin).catch(() => {});
      setTimeout(() => setArMsg(''), 2500);
    } catch (e: any) { setArMsg(e.message || 'Failed'); } finally { setArBusy(false); }
  };

  return (
    <Layout flat title="Reseller">
      <PageHeader help="reselling"
        title="Reseller"
        subtitle="Set up and manage your reselling business — plans, payments, snapshots and co-owners"
        icon="ti-building-community"
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <Tabs
        active={tab}
        onChange={(k) => router.push(SECTION_PATHS[k as TabKey])}
        tabs={[
          { key: 'plans', label: 'Plans & features', icon: 'ti-package' },
          { key: 'payments', label: 'Payments & signup', icon: 'ti-credit-card' },
          { key: 'snapshots', label: 'Snapshots', icon: 'ti-camera', count: snaps.length || undefined },
          { key: 'coowners', label: 'Co-owners', icon: 'ti-users' },
        ]}
      />

      {/* ── Pricing tab ── */}
      {tab === 'plans' && (
        <>
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

        {/* AI agent metered pricing (retail) */}
        <div className="card overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-line">
            <div className="flex items-center gap-1.5"><h3 className="text-sm font-semibold">AI agent pricing (metered)</h3><HelpHint anchor="agent-billing" /></div>
            <p className="text-2xs text-muted">Resell AI agents at your own markup. Set what you charge clients per agent run and per 1,000 tokens; the platform&rsquo;s wholesale rate is your cost and you keep the difference. Leave at 0 to pass through at cost.</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-2xs text-muted block mb-1">Price / run (USD)</label>
                <input className="input w-28" type="number" min="0" step="0.001" placeholder="0.00" value={arRun} onChange={(e) => setArRun(e.target.value)} />
              </div>
              <div>
                <label className="text-2xs text-muted block mb-1">Price / 1k tokens (USD)</label>
                <input className="input w-32" type="number" min="0" step="0.001" placeholder="0.00" value={arTok} onChange={(e) => setArTok(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={arBusy} onClick={saveAgentRate}>{arBusy ? 'Saving…' : 'Save agent rates'}</button>
            </div>
            {arMsg && <p className="text-2xs text-accentstrong">{arMsg}</p>}
            {margin && (
              <p className="text-2xs text-muted">Your wholesale cost from the platform: <span className="tabular-nums">${margin.per_run_wholesale}/run &middot; ${margin.per_1k_wholesale}/1k tokens</span>. You bill clients at your rates above; margin is the difference.</p>
            )}
          </div>
        </div>

        {/* AI agent margin this month */}
        <div className="card overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold">AI agent margin &mdash; this month</h3>
            <p className="text-2xs text-muted">What your sub-tenants&rsquo; agent usage earns you: retail (what you bill them) minus wholesale (what the platform bills you).</p>
          </div>
          <div className="p-4 space-y-3">
            {!margin || margin.total_runs === 0 ? (
              <p className="text-2xs text-muted2">No agent usage from your sub-tenants yet this month. Once their agents run, your margin shows here.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-line p-3"><p className="text-2xs uppercase tracking-wide text-muted2">You bill (retail)</p><p className="text-lg font-semibold tabular-nums">${margin.total_retail.toFixed(2)}</p></div>
                  <div className="rounded-lg border border-line p-3"><p className="text-2xs uppercase tracking-wide text-muted2">Your cost (wholesale)</p><p className="text-lg font-semibold tabular-nums">${margin.total_wholesale.toFixed(2)}</p></div>
                  <div className="rounded-lg border border-line p-3 bg-emerald-500/5"><p className="text-2xs uppercase tracking-wide text-muted2">Your margin</p><p className="text-lg font-semibold tabular-nums text-accentstrong">${margin.total_margin.toFixed(2)}</p></div>
                </div>
                <ul className="divide-y divide-line border border-line rounded-lg">
                  {margin.subs.filter((su) => su.runs > 0 || su.tokens > 0).map((su) => (
                    <li key={su.org_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="truncate font-medium text-content flex-1">{su.name}</span>
                      <span className="text-2xs text-muted tabular-nums">{su.runs} runs &middot; {(su.tokens / 1000).toFixed(0)}k tok</span>
                      <span className="tabular-nums text-accentstrong w-20 text-right">+${su.margin.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
        </>
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
                <select className="input" value={(org?.branding as { site_template?: string } | undefined)?.site_template || 'classic'} onChange={(e) => saveTemplate(e.target.value)}>
                  <option value="classic">Classic — branded, balanced layout</option>
                  <option value="minimal">Minimal — whitespace-first, type-forward</option>
                  <option value="bold">Bold — high-contrast, energetic, display type</option>
                </select>
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

      {/* Co-owner invite modal */}
      {tab === 'coowners' && (
        <div className="card p-5 max-w-2xl">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Icon name="ti-users" />Co-owners</h3>
          <p className="text-2xs text-muted mt-1 mb-3">Invite a co-owner to help manage your reseller account — your clients, plans, snapshots and payments. They get admin access to this workspace only; they can’t see other resellers or the platform.</p>
          <button className="btn btn-primary" onClick={() => { setCoOpen(true); setCoLink(null); setCoErr(''); }}><Icon name="ti-user-plus" />Invite co-owner</button>
        </div>
      )}

      <Modal open={coOpen} onClose={() => setCoOpen(false)} title="Invite a co-owner" icon="ti-user-plus" size="sm" onSubmit={submitCo}
        footer={<><button className="btn" onClick={() => setCoOpen(false)}>Close</button><button className="btn btn-primary" disabled={coBusy || !coEmail.trim()} onClick={submitCo}>{coBusy ? 'Inviting…' : 'Send invite'}</button></>}>
        <div className="space-y-3">
          <p className="text-2xs text-muted">A co-owner gets admin access to manage your reseller account — your sub-tenants, pricing, snapshots and billing. They join your workspace; they can't see other resellers or the platform.</p>
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
    </Layout>
  );
}
