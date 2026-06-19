import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  resellerListOrgs, resellerPendingInvites, resellerCreateInvite,
  adminImpersonateLink, snapshotList,
  ResellerOrg, ResellerInvite, WorkspaceSnapshot,
} from '@/lib/db';

const PLANS = [{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }, { value: 'enterprise', label: 'Enterprise' }];

export default function ResellerClientsPage() {
  const org = useActiveOrg();

  // Data
  const [orgs, setOrgs] = useState<ResellerOrg[] | null>(null);
  const [invites, setInvites] = useState<ResellerInvite[]>([]);
  const [snaps, setSnaps] = useState<WorkspaceSnapshot[]>([]);
  const [err, setErr] = useState('');

  // Invite modal
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('pro');
  const [snapId, setSnapId] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // View-as
  const [viewMsg, setViewMsg] = useState('');

  // Filter bar
  const [q, setQ] = useState('');
  const [fPlan, setFPlan] = useState('all');
  const [fStatus, setFStatus] = useState('all');

  const load = () => {
    if (!org) return;
    resellerListOrgs(org.id).then(setOrgs).catch((e) => { setErr(e.message); setOrgs([]); });
    resellerPendingInvites(org.id).then(setInvites).catch(() => {});
    snapshotList(org.id).then(setSnaps).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  // All hooks before any early return
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

  const planOptions = useMemo(() => {
    const keys = new Set((orgs || []).map((o) => o.plan_key || o.plan_name || 'free').filter(Boolean));
    return [{ value: 'all', label: 'All plans' }, ...[...keys].map((k) => ({ value: k, label: k }))];
  }, [orgs]);

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
    setViewMsg('Generating sign-in link…');
    try {
      const r = await adminImpersonateLink({ sub: subId });
      try { await navigator.clipboard?.writeText(r.link); } catch { /* */ }
      setViewMsg(`Sign-in link for ${nm} copied — open it in a private window to view that workspace.`);
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
        subtitle="Manage your sub-tenants — each has its own workspace under your brand"
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

      {/* Pending invitations */}
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

      {/* Invite sub-tenant modal */}
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
