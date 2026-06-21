import { Fragment, useEffect, useMemo, useState } from 'react';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { DataList, GroupMeta } from '@/components/DataList';
import Select from '@/components/Select';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { PlanBadge } from '@/components/PlanBadge';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { listTenants, listPlans, listOrgInvites, createOrgInvite, setOrgInviteSource, revokeOrgInvite, platformAccounts, PlatformAccount, emailGetStatus, EmailStatus, adminImpersonateLink, setTenantReseller } from '@/lib/db';
import { Plan, OrgInvite } from '@/lib/supabase';
import { GroupHeader } from '@/components/GroupHeader';
import Dropdown from '@/components/Dropdown';
import TenantsOverview from '@/components/TenantsOverview';

const SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'ads', label: 'Ads' },
  { value: 'search', label: 'Search engine' },
  { value: 'ai', label: 'AI / chatbot' },
  { value: 'referral', label: 'Referral' },
  { value: 'link', label: 'Direct link' },
  { value: 'other', label: 'Other' },
];
const sourceLabel = (s?: string | null) => SOURCES.find((x) => x.value === s)?.label || (s || '—');

type TenantGroupBy = 'category' | 'industry' | 'plan' | 'status' | 'hierarchy' | 'none';

const TENANT_COLS: ColDef[] = [
  { id: 'org', label: 'Organization', locked: true, width: 280 },
  { id: 'plan', label: 'Plan', width: 120 },
  { id: 'members', label: 'Members', width: 90 },
  { id: 'seats', label: 'Seats', width: 90 },
  { id: 'status', label: 'Status', width: 100 },
  { id: 'joined', label: 'Joined', width: 110 },
  { id: 'actions', label: '', width: 120 },
];

export default function TenantsPage() {
  const router = useRouter();
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [tab, setTab] = useState<'overview' | 'all'>('overview');
  const [rows, setRows] = useState<any[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [err, setErr] = useState('');
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [invEmail, setInvEmail] = useState(''); const [invName, setInvName] = useState(''); const [invPlan, setInvPlan] = useState('free');
  const [invBusy, setInvBusy] = useState(false); const [invErr, setInvErr] = useState(''); const [invLink, setInvLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [orphans, setOrphans] = useState<PlatformAccount[]>([]);
  const [invSource, setInvSource] = useState('website');
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [impMsg, setImpMsg] = useState('');
  const [groupBy, setGroupBy] = useState<TenantGroupBy>('category');
  useEffect(() => { try { const v = localStorage.getItem('snr-tenants-groupby'); if (v) setGroupBy(v as TenantGroupBy); } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem('snr-tenants-groupby', groupBy); } catch { /* ignore */ } }, [groupBy]);
  // Filter-bar state (All tenants tab).
  const [q, setQ] = useState('');
  const [fPlan, setFPlan] = useState('all');
  const [fType, setFType] = useState<'all' | 'direct' | 'reseller' | 'sub'>('all');
  const [fStatus, setFStatus] = useState<'all' | 'active' | 'other'>('all');
  const toggleReseller = async (orgId: string, on: boolean) => { try { await setTenantReseller(orgId, on); load(); } catch (e: any) { alert(e.message); } };
  const openAsOwner = async (orgId: string, nm: string) => { setImpMsg('Generating sign-in link…'); try { const r = await adminImpersonateLink({ org: orgId }); try { await navigator.clipboard?.writeText(r.link); } catch { /* */ } setImpMsg(`Sign-in link for ${nm} copied — open it in a private/incognito window to view that workspace as its owner.`); setTimeout(() => setImpMsg(''), 8000); } catch (e: any) { setImpMsg(e.message || 'Failed'); } };

  const load = () => { listTenants().then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  const loadInvites = () => listOrgInvites().then(setInvites).catch(() => {});
  useEffect(() => { if (platformAdmin) { load(); loadInvites(); listPlans().then(setPlans).catch(() => {}); platformAccounts().then((a) => setOrphans(a.filter((x) => x.org_count === 0))).catch(() => {}); emailGetStatus().then(setEmailStatus).catch(() => {}); } }, [platformAdmin]);

  // Rows after applying the filter bar — filtering happens BEFORE grouping.
  const filteredRows = useMemo(() => {
    const all = rows || [];
    const term = q.trim().toLowerCase();
    return all.filter((t) => {
      if (term && !(`${t.org_name || ''}`.toLowerCase().includes(term) || `${t.slug || ''}`.toLowerCase().includes(term))) return false;
      if (fPlan !== 'all' && (t.plan_key || t.plan_name) !== fPlan) return false;
      if (fType === 'reseller' && !t.is_reseller) return false;
      if (fType === 'sub' && !t.parent_org_id) return false;
      if (fType === 'direct' && (t.is_reseller || t.parent_org_id)) return false;
      if (fStatus === 'active' && t.sub_status !== 'active') return false;
      if (fStatus === 'other' && t.sub_status === 'active') return false;
      return true;
    });
  }, [rows, q, fPlan, fType, fStatus]);
  const filtersOn = q.trim() !== '' || fPlan !== 'all' || fType !== 'all' || fStatus !== 'all';
  const tenantPrefs = useListPrefs('snrpmo.tenants.cols', TENANT_COLS, { canManage: false });

  const copyLink = (link: string) => { try { navigator.clipboard?.writeText(link); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitInvite = async () => {
    if (!invEmail.trim() || !invName.trim()) return;
    setInvBusy(true); setInvErr(''); setInvLink(null);
    try { const r = await createOrgInvite(invEmail.trim(), invName.trim(), invPlan); try { await setOrgInviteSource(r.id, invSource); } catch {} setInvLink(r.link); setInvEmail(''); setInvName(''); loadInvites(); }
    catch (e: any) { setInvErr(e.message); } finally { setInvBusy(false); }
  };
  const doRevoke = async (id: string) => { if (!confirm('Revoke this invitation? The link will stop working.')) return; try { await revokeOrgInvite(id); loadInvites(); } catch (e: any) { setErr(e.message); } };

  if (!platformAdmin) return <Layout flat title="Tenants"><EmptyState icon="ti-lock" title="Platform admins only" text="Tenant management is restricted to platform administrators." /></Layout>;

  return (
    <Layout flat title="Tenants">
      <PageHeader title="Tenants" subtitle="Manage every organization — plan, features, quotas and access" icon="ti-building-community" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {impMsg && <p className="text-2xs text-accentstrong mb-3 inline-flex items-center gap-1.5"><Icon name="ti-info-circle" />{impMsg}</p>}

      <Tabs
        active={tab}
        onChange={(k) => setTab(k as 'overview' | 'all')}
        tabs={[
          { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
          { key: 'all', label: 'All tenants', icon: 'ti-list', count: rows?.length },
        ]}
      />

      {tab === 'overview' && (
        rows === null ? <div className="card p-8"><Spinner /></div>
          : rows.length === 0 ? <div className="card p-8"><EmptyState icon="ti-building-community" text="No tenants yet." /></div>
          : <TenantsOverview rows={rows} plans={plans} onOpenTenant={(id) => router.push(`/tenants/${id}`)} />
      )}

      {tab === 'all' && (
      <>
      {/* Filter bar — applies to rows before grouping. */}
      {rows && rows.length > 0 && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2 text-sm pointer-events-none" />
            <input className="input pl-8 w-full" placeholder="Search by name or slug…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-40"><Select value={fPlan} onChange={setFPlan} options={[{ value: 'all', label: 'All plans' }, ...plans.map((p) => ({ value: p.key, label: p.name }))]} /></div>
          <div className="w-40"><Select value={fType} onChange={(v) => setFType(v as any)} options={[{ value: 'all', label: 'All types' }, { value: 'direct', label: 'Direct' }, { value: 'reseller', label: 'Resellers' }, { value: 'sub', label: 'Sub-tenants' }]} /></div>
          <div className="w-36"><Select value={fStatus} onChange={(v) => setFStatus(v as any)} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'other', label: 'Other' }]} /></div>
          <div className="ml-auto flex items-center gap-1 text-2xs"><span className="text-muted mr-1">Group by:</span>
            {([['category', 'Category'], ['industry', 'Industry'], ['plan', 'Plan'], ['status', 'Status'], ['hierarchy', 'Reseller'], ['none', 'None']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setGroupBy(v)} className={`btn-ghost ${groupBy === v ? 'text-accentstrong font-medium' : ''}`}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {/* ── Tenant list columns ─────────────────────────────────────────────── */}
      {(() => {
        const tenantCell = (id: string, t: any) => {
          if (id === 'org') {
            const subCount = (rows || []).filter((x: any) => x.parent_org_id === t.org_id).length;
            const parentName = t.parent_org_id ? ((rows || []).find((x: any) => x.org_id === t.parent_org_id)?.org_name || 'reseller') : '';
            return (
              <span>
                <span className="font-medium text-content">{t.parent_org_id ? '↳ ' : ''}{t.org_name}</span>
                {t.is_reseller && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-medium text-violet-600 align-middle">
                    <Icon name="ti-buildings" className="text-2xs" />{subCount} sub-tenant{subCount === 1 ? '' : 's'}
                  </span>
                )}
                <span className="block text-2xs text-muted2">{t.slug}{t.parent_org_id ? ` · under ${parentName}` : ''}</span>
              </span>
            );
          }
          if (id === 'plan') return <PlanBadge planKey={t.plan_key} planName={t.plan_name} size="sm" />;
          if (id === 'members') return <span className="tabular-nums">{t.member_count ?? '—'}</span>;
          if (id === 'seats') return <span className="tabular-nums">{t.seats ?? 0}{t.seat_limit ? ` / ${t.seat_limit}` : ''}</span>;
          if (id === 'status') return <span className={`pill ${t.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{t.sub_status || 'free'}</span>;
          if (id === 'joined') return <span className="text-2xs text-muted2 whitespace-nowrap">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</span>;
          if (id === 'actions') return (
            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {t.is_reseller && <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2 py-0.5 text-2xs font-medium text-violet-600"><Icon name="ti-building-community" className="text-2xs" />Reseller</span>}
              <button onClick={(e) => { e.stopPropagation(); openAsOwner(t.org_id, t.org_name); }} title="View as owner (opens in a private window)" aria-label="View as owner" className="h-8 w-8 grid place-items-center rounded-md border border-line text-muted hover:bg-surface2 hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentstrong/40 transition-colors"><Icon name="ti-login-2" /></button>
              <Dropdown align="right" width={208}
                trigger={<span className="h-8 w-8 grid place-items-center rounded-md border border-line text-muted hover:bg-surface2 hover:text-content transition-colors" title="More actions" aria-label="More actions"><Icon name="ti-dots-vertical" /></span>}
                items={[{ value: 'open', label: 'Open details', icon: 'ti-arrow-right' }, { value: 'reseller', label: t.is_reseller ? 'Unset reseller' : 'Make reseller', icon: t.is_reseller ? 'ti-circle-minus' : 'ti-building-community' }]}
                onChange={(v) => { if (v === 'open') router.push(`/tenants/${t.org_id}`); else if (v === 'reseller') toggleReseller(t.org_id, !t.is_reseller); }}
              />
            </div>
          );
          return null;
        };

        // ── Grouping props for DataList ────────────────────────────────────────
        // hierarchy: use childrenOf so sub-tenants nest under their reseller row.
        // other modes: native DataList groupBy/groupOf/groups.
        const sorted = [...filteredRows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        let dlRows: any[] = sorted;
        let dlGroupBy: string = groupBy;
        let dlGroupOf: ((r: any) => string) | undefined;
        let dlGroups: GroupMeta[] | undefined;
        let dlChildrenOf: ((r: any) => any[]) | undefined;

        if (groupBy === 'hierarchy') {
          // Top-level rows: resellers + tenants with no parent that aren't sub-tenants.
          // Sub-tenants are surfaced via childrenOf on their parent.
          const byParent = new Map<string, any[]>();
          for (const t of sorted) {
            if (t.parent_org_id) {
              if (!byParent.has(t.parent_org_id)) byParent.set(t.parent_org_id, []);
              byParent.get(t.parent_org_id)!.push(t);
            }
          }
          dlRows = sorted.filter((r) => !r.parent_org_id);
          dlChildrenOf = (r: any) => byParent.get(r.org_id) || [];
          dlGroupBy = 'none';
        } else if (groupBy === 'none') {
          dlGroupBy = 'none';
        } else {
          const keyOf = (t: any) =>
            groupBy === 'plan' ? (t.plan_name || t.plan_key || 'Free')
            : groupBy === 'category' ? (t.category || 'Uncategorized')
            : groupBy === 'industry' ? (t.industry || 'No industry')
            : (t.sub_status || 'free');
          dlGroupOf = keyOf;
          // Build ordered GroupMeta list (same order as groupsFor: fallbacks last, else alpha).
          const FALLBACK = new Set(['Uncategorized', 'No industry']);
          const seen = new Map<string, number>();
          for (const t of sorted) { const k = keyOf(t); if (!seen.has(k)) seen.set(k, seen.size); }
          const ordered = [...seen.keys()].sort((a, b) => (FALLBACK.has(a) ? 1 : 0) - (FALLBACK.has(b) ? 1 : 0) || a.localeCompare(b));
          dlGroups = ordered.map((v) => ({ value: v, label: v }));
        }

        return (
          <div className="card overflow-hidden">
            {rows === null ? <div className="p-8"><Spinner /></div> : rows.length === 0 ? (
              <div className="p-8"><EmptyState icon="ti-building-community" text="No tenants." /></div>
            ) : filteredRows.length === 0 ? (
              <div className="p-8"><EmptyState icon="ti-search" title="No matches" text="No tenants match the current filters." action={filtersOn ? <button className="btn" onClick={() => { setQ(''); setFPlan('all'); setFType('all'); setFStatus('all'); }}>Clear filters</button> : undefined} /></div>
            ) : (
              <DataList
                rows={dlRows}
                rowKey={(t) => t.org_id}
                cols={TENANT_COLS}
                prefs={tenantPrefs}
                cell={tenantCell}
                nameCol="org"
                onRowClick={(t) => router.push(`/tenants/${t.org_id}`)}
                groupBy={dlGroupBy}
                groupOf={dlGroupOf}
                groups={dlGroups}
                childrenOf={dlChildrenOf}
              />
            )}
          </div>
        );
      })()}

      <div className="card overflow-hidden mt-4">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
          <div><h3 className="text-sm font-semibold text-content">Invitations</h3>
            <p className="text-2xs text-muted">Invite a tenant to provision a new workspace. They set up their account via a secure signup link.{emailStatus && !emailStatus.enabled ? ' Email isn’t configured — share the link directly.' : ' An email is also queued.'}</p></div>
          <button className="btn btn-primary shrink-0" onClick={() => { setInvOpen(true); setInvLink(null); setInvErr(''); }}><Icon name="ti-mail-plus" />Invite tenant</button>
        </div>
        {invites.length === 0 ? <div className="p-6"><EmptyState icon="ti-mail" text="No invitations yet." /></div> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2/60 text-muted2 text-left text-2xs uppercase tracking-wider font-semibold">
              <tr><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Workspace</th><th className="px-4 py-2.5">Plan</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Expires</th><th className="px-4 py-2.5"></th></tr>
            </thead>
            <tbody>
              {[...invites.reduce((mm: Map<string, typeof invites>, iv) => { const k = iv.parent_org_id ? `${(rows || []).find((x: any) => x.org_id === iv.parent_org_id)?.org_name || 'Reseller'} · invitations` : 'Platform invitations'; if (!mm.has(k)) mm.set(k, [] as any); (mm.get(k) as any).push(iv); return mm; }, new Map()).entries()].map(([label, items]) => (
                <Fragment key={label}>
                  <GroupHeader label={label} count={(items as any).length} asTableRow colSpan={7} />
                  {(items as any).map((iv: any) => (
                <tr key={iv.id} className="border-t border-line hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3 text-content">{iv.email}</td>
                  <td className="px-4 py-3 text-muted">{iv.org_name || '—'}</td>
                  <td className="px-4 py-3"><span className="pill pill-gray">{iv.plan_key}</span></td>
                  <td className="px-4 py-3 text-2xs text-muted2">{sourceLabel(iv.source)}</td>
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
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {orphans.length > 0 && (
        <div className="card overflow-hidden mt-4">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="text-sm font-semibold text-content">Accounts without a workspace</h3>
            <p className="text-2xs text-muted">{orphans.length} {orphans.length === 1 ? 'person has' : 'people have'} signed in but don&rsquo;t belong to any tenant yet.</p>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2/60 text-muted2 text-left text-2xs uppercase tracking-wider font-semibold">
              <tr><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Signed up</th></tr>
            </thead>
            <tbody>
              {orphans.map((a) => (
                <tr key={a.user_id} className="border-t border-line hover:bg-surface2/60 transition-colors">
                  <td className="px-4 py-3"><span className="block font-medium text-content">{a.full_name || a.email}</span><span className="block text-2xs text-muted">{a.email}</span></td>
                  <td className="px-4 py-3 text-2xs text-muted2">{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      </>
      )}

      {invOpen && (
        <Modal open onClose={() => setInvOpen(false)} size="md" icon="ti-mail-plus" title="Invite a tenant" subtitle="Provision a new workspace via a secure signup link"
          footer={invLink
            ? <button className="btn" onClick={() => setInvOpen(false)}>Done</button>
            : <><button className="btn" onClick={() => setInvOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={invBusy || !invEmail.trim() || !invName.trim()} onClick={submitInvite}>{invBusy ? 'Creating…' : 'Create invite'}</button></>}>
          {invLink ? (
            <div className="space-y-3">
              <p className="text-sm text-content">{emailStatus && !emailStatus.enabled ? 'Invitation created. Email isn’t set up yet — share this secure link with them directly to join.' : 'Invitation created — an email was queued. You can also share this secure link directly.'}</p>
              <div className="flex items-center gap-2">
                <input className="input flex-1 font-mono text-2xs" readOnly value={invLink} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn btn-primary shrink-0" onClick={() => copyLink(invLink)}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
              <p className="text-2xs text-muted">Expires in 14 days. The owner must sign up with this exact email address.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Tenant email" required><input className="input" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="owner@company.com" /></Field>
              <Field label="Workspace name" required hint="The new tenant is provisioned when the owner accepts."><input className="input" value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Acme Inc" /></Field>
              <Field label="Plan"><Select value={invPlan} onChange={(v) => setInvPlan(v)} options={[...plans.map((p) => ({ value: p.key, label: p.name }))]} /></Field>
              <Field label="Lead source" hint="How this tenant found us"><Select value={invSource} onChange={setInvSource} options={SOURCES} /></Field>
              {invErr && <p className="text-sm text-rose-600">{invErr}</p>}
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}
