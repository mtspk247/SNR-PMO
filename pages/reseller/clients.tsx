import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, Tabs } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import ResellerOverview from '@/components/ResellerOverview';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  resellerListOrgs, resellerPendingInvites, resellerCreateInvite,
  resellerBillingSummary, resellerListPrices,
  adminImpersonateLink, snapshotList,
  ResellerOrg, ResellerInvite, WorkspaceSnapshot, ResellerBilling, ResellerPlanPrice,
} from '@/lib/db';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const PLANS = [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }];

type OrgRow = ResellerOrg & { id: string };

const GROUPS: GroupMeta[] = [
  { value: 'active', label: 'Active', pill: 'pill-green' },
  { value: 'other', label: 'Other', pill: 'pill-gray' },
];

const COLS: ColDef[] = [
  { id: 'workspace', label: 'Workspace', locked: true },
  { id: 'plan', label: 'Plan' },
  { id: 'members', label: 'Members' },
  { id: 'seats', label: 'Seats' },
  { id: 'status', label: 'Status' },
  { id: 'actions', label: '' },
];

const CLIENT_FILTERS: FilterDef[] = [
  {
    id: 'status',
    label: 'Status',
    options: [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'other', label: 'Other' },
    ],
  },
];

export default function ResellerClientsPage() {
  const org = useActiveOrg();
  const router = useRouter();

  const [orgs, setOrgs] = useState<ResellerOrg[] | null>(null);
  const [tab, setTab] = useState<'overview' | 'clients'>('overview');
  const [billing, setBilling] = useState<ResellerBilling | null>(null);
  const [prices, setPrices] = useState<ResellerPlanPrice[]>([]);
  const [invites, setInvites] = useState<ResellerInvite[]>([]);
  const [snaps, setSnaps] = useState<WorkspaceSnapshot[]>([]);
  const [err, setErr] = useState('');

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('pro');
  const [snapId, setSnapId] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [viewMsg, setViewMsg] = useState('');

  const prefs = useListPrefs('snrpmo.reseller_clients.cols', COLS, { entity: 'reseller_clients', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';

  const load = () => {
    if (!org) return;
    resellerListOrgs(org.id).then(setOrgs).catch((e) => { setErr(e.message); setOrgs([]); });
    resellerBillingSummary(org.id).then(setBilling).catch(() => {});
    resellerListPrices(org.id).then(setPrices).catch(() => {});
    resellerPendingInvites(org.id).then(setInvites).catch(() => {});
    snapshotList(org.id).then(setSnaps).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const rows: OrgRow[] | null = useMemo(
    () => orgs === null ? null : orgs.map((o) => ({ ...o, id: o.org_id })),
    [orgs]
  );

  const shown: OrgRow[] = useMemo(() => {
    if (!rows) return [];
    const term = q.trim().toLowerCase();
    return rows.filter((o) => {
      if (term && !(`${o.org_name || ''}`.toLowerCase().includes(term) || `${o.slug || ''}`.toLowerCase().includes(term))) return false;
      if (statusF === 'active' && o.sub_status !== 'active') return false;
      if (statusF === 'other' && o.sub_status === 'active') return false;
      return true;
    });
  }, [rows, q, statusF]);

  const rs = useRowSelection(shown);

  const cell = (id: string, o: OrgRow) => {
    switch (id) {
      case 'workspace':
        return (
          <span>
            <span className="font-medium text-content">{o.org_name}</span>
            <span className="block text-2xs text-muted2">{o.slug}</span>
          </span>
        );
      case 'plan':
        return <span className="capitalize text-muted">{o.plan_name || o.plan_key || 'free'}</span>;
      case 'members':
        return <span className="tabular-nums text-muted">{o.member_count}</span>;
      case 'seats':
        return <span className="tabular-nums text-muted">{o.seats}{o.seat_limit ? ` / ${o.seat_limit}` : ''}</span>;
      case 'status':
        return <span className={`pill ${o.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{o.sub_status || 'free'}</span>;
      case 'actions':
        return (
          <button
            onClick={(e) => { e.stopPropagation(); viewAsSub(o.org_id, o.org_name); }}
            className="btn-ghost text-2xs"
            title="View this sub-tenant's workspace (private window)"
          >
            <Icon name="ti-login-2" />View as
          </button>
        );
      default:
        return '---';
    }
  };

  const exportValue = (id: string, o: OrgRow) => {
    switch (id) {
      case 'workspace': return o.org_name || '';
      case 'plan': return o.plan_name || o.plan_key || 'free';
      case 'members': return String(o.member_count ?? '');
      case 'seats': return o.seat_limit ? `${o.seats} / ${o.seat_limit}` : String(o.seats ?? '');
      case 'status': return o.sub_status || 'free';
      default: return '';
    }
  };

  if (!org?.is_reseller || !can.manageMembers(org)) {
    return (
      <Layout flat title="Clients">
        <EmptyState
          icon="ti-building-community"
          title="Not a reseller workspace"
          text="Reselling lets you create and manage your own sub-tenants under your brand. Ask the platform team to enable it on your plan."
        />
      </Layout>
    );
  }

  const viewAsSub = async (subId: string, nm: string) => {
    setViewMsg('Generating sign-in link...');
    try {
      const r = await adminImpersonateLink({ sub: subId });
      try { await navigator.clipboard?.writeText(r.link); } catch { /* */ }
      setViewMsg(`Sign-in link for ${nm} copied - open it in a private window to view that workspace.`);
      setTimeout(() => setViewMsg(''), 8000);
    } catch (e: any) { setViewMsg(e.message || 'Not permitted'); }
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

  return (
    <Layout flat title="Clients">
      <PageHeader
        title="Clients"
        subtitle="Manage your sub-tenants - each has its own workspace under your brand"
        icon="ti-buildings"
        action={
          <button className="btn btn-primary" onClick={() => { setOpen(true); setLink(null); setErr(''); }}>
            <Icon name="ti-plus" />Invite Client
          </button>
        }
      />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {viewMsg && (
        <p className="text-2xs text-accentstrong mb-3 inline-flex items-center gap-1.5">
          <Icon name="ti-info-circle" />{viewMsg}
        </p>
      )}

      <Tabs active={tab} onChange={(k) => setTab(k as 'overview' | 'clients')} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'clients', label: 'All clients', icon: 'ti-list', count: orgs?.length },
      ]} />

      {tab === 'overview' && (
        orgs === null ? <div className="card p-8"><EmptyState icon="ti-buildings" text="Loading..." /></div>
        : orgs.length === 0 ? <div className="card p-8"><EmptyState icon="ti-buildings" text="No clients yet - invite one to get started." /></div>
        : <ResellerOverview orgs={orgs} billing={billing} prices={prices} agencyPlan={org.plan} />
      )}

      {tab === 'clients' && (
        <>
          <ListView
            rows={rows === null ? null : shown}
            rowKey={(o) => o.id}
            cols={COLS}
            prefs={prefs}
            cell={cell}
            selection={rs}
            filters={CLIENT_FILTERS}
            searchPlaceholder="Search by name or slug..."
            groupField={{ value: 'status', label: 'Status' }}
            groupOf={(o) => (o.sub_status === 'active' ? 'active' : 'other')}
            groups={GROUPS}
            onRowClick={(o) => router.push(`/reseller/clients/${o.org_id}`)}
            exportName="reseller-clients"
            exportValue={exportValue}
            emptyIcon="ti-buildings"
            emptyText="No sub-tenants found."
          />

          {invites.length > 0 && (
            <div className="card overflow-hidden mt-6">
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
                        <td className="px-4 py-3 text-muted">{i.org_name || '---'}</td>
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
              {busy ? 'Creating...' : 'Create invite'}
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
              <p className="text-2xs text-muted mb-1.5">Invite link - share it with the sub-tenant owner:</p>
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
