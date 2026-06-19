import { Fragment, useEffect, useState } from 'react';
import Select from '@/components/Select';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { PlanBadge } from '@/components/PlanBadge';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { listTenants, listPlans, listOrgInvites, createOrgInvite, setOrgInviteSource, revokeOrgInvite, platformAccounts, PlatformAccount, emailGetStatus, EmailStatus, adminImpersonateLink, setTenantReseller } from '@/lib/db';
import { Plan, OrgInvite } from '@/lib/supabase';
import { GroupHeader } from '@/components/GroupHeader';
import Dropdown from '@/components/Dropdown';

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

type TenantGroup = { label: string; items: any[] };
function groupsFor(rows: any[], groupBy: 'hierarchy' | 'plan' | 'none'): TenantGroup[] {
  if (groupBy === 'plan') {
    const m = new Map<string, any[]>();
    for (const t of rows) { const k = t.plan_name || t.plan_key || 'Free'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
  }
  if (groupBy === 'hierarchy') {
    const resellers = rows.filter((r) => r.is_reseller);
    const byParent = new Map<string, any[]>();
    for (const t of rows) if (t.parent_org_id) { if (!byParent.has(t.parent_org_id)) byParent.set(t.parent_org_id, []); byParent.get(t.parent_org_id)!.push(t); }
    const groups: TenantGroup[] = []; const claimed = new Set<string>();
    for (const rsl of resellers) {
      const subs = byParent.get(rsl.org_id) || [];
      groups.push({ label: rsl.org_name + ' · reseller', items: [rsl, ...subs] });
      claimed.add(rsl.org_id); subs.forEach((x) => claimed.add(x.org_id));
    }
    const others = rows.filter((r) => !claimed.has(r.org_id));
    if (others.length) groups.push({ label: 'Direct tenants', items: others });
    return groups;
  }
  return [{ label: '', items: rows }];
}

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
  const [orphans, setOrphans] = useState<PlatformAccount[]>([]);
  const [invSource, setInvSource] = useState('website');
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [impMsg, setImpMsg] = useState('');
  const [groupBy, setGroupBy] = useState<'hierarchy' | 'plan' | 'none'>('hierarchy');
  const toggleReseller = async (orgId: string, on: boolean) => { try { await setTenantReseller(orgId, on); load(); } catch (e: any) { alert(e.message); } };
  const openAsOwner = async (orgId: string, nm: string) => { setImpMsg('Generating sign-in link…'); try { const r = await adminImpersonateLink({ org: orgId }); try { await navigator.clipboard?.writeText(r.link); } catch { /* */ } setImpMsg(`Sign-in link for ${nm} copied — open it in a private/incognito window to view that workspace as its owner.`); setTimeout(() => setImpMsg(''), 8000); } catch (e: any) { setImpMsg(e.message || 'Failed'); } };

  const load = () => { listTenants().then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  const loadInvites = () => listOrgInvites().then(setInvites).catch(() => {});
  useEffect(() => { if (platformAdmin) { load(); loadInvites(); listPlans().then(setPlans).catch(() => {}); platformAccounts().then((a) => setOrphans(a.filter((x) => x.org_count === 0))).catch(() => {}); emailGetStatus().then(setEmailStatus).catch(() => {}); } }, [platformAdmin]);

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
      {rows && rows.length > 0 && (
        <div className="flex items-center gap-1 mb-3 text-2xs"><span className="text-muted mr-1">Group by:</span>
          {([['hierarchy', 'Reseller'], ['plan', 'Plan'], ['none', 'None']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setGroupBy(v)} className={`btn-ghost ${groupBy === v ? 'text-accentstrong font-medium' : ''}`}>{l}</button>
          ))}
        </div>
      )}
      <div className="card overflow-hidden">
        {rows === null ? <div className="p-8"><Spinner /></div> : rows.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-building-community" text="No tenants." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-surface2/60 text-muted text-left text-2xs uppercase tracking-wider font-semibold sticky top-0 z-10">
              <tr><th className="px-4 py-2.5 text-muted2">Organization</th><th className="px-4 py-2.5 text-muted2">Plan</th><th className="px-4 py-2.5 text-muted2">Members</th><th className="px-4 py-2.5 text-muted2">Seats</th><th className="px-4 py-2.5 text-muted2">Status</th><th className="px-4 py-2.5 text-muted2"></th></tr>
            </thead>
            <tbody>
              {groupsFor(rows, groupBy).map((g) => (
                <Fragment key={g.label || 'all'}>
                  {g.label && <GroupHeader label={g.label} count={g.items.length} asTableRow colSpan={6} />}
                  {g.items.map((t) => (
                    <tr key={t.org_id} className="border-t border-line hover:bg-surface2/60 cursor-pointer transition-colors" style={t.is_reseller ? { background: 'rgb(139 92 246 / .06)' } : undefined} onClick={() => router.push(`/tenants/${t.org_id}`)}>
                      <td className="px-4 py-3"><span className="font-medium text-content">{t.parent_org_id ? '↳ ' : ''}{t.org_name}</span><span className="block text-2xs text-muted2">{t.slug}{t.parent_org_id ? ` · under ${(rows || []).find((x: any) => x.org_id === t.parent_org_id)?.org_name || 'reseller'}` : ''}</span></td>
                      <td className="px-4 py-3"><PlanBadge planKey={t.plan_key} planName={t.plan_name} size="sm" /></td>
                      <td className="px-4 py-3 text-muted tabular-nums">{t.member_count ?? '—'}</td>
                      <td className="px-4 py-3 text-muted tabular-nums">{t.seats ?? 0}{t.seat_limit ? ` / ${t.seat_limit}` : ''}</td>
                      <td className="px-4 py-3"><span className={`pill ${t.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{t.sub_status || 'free'}</span></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {t.is_reseller && <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/50 bg-violet-500/10 px-2 py-0.5 text-2xs font-medium text-violet-600"><Icon name="ti-building-community" className="text-2xs" />Reseller</span>}
                          <button onClick={(e) => { e.stopPropagation(); openAsOwner(t.org_id, t.org_name); }} title="View as owner (opens in a private window)" aria-label="View as owner" className="h-8 w-8 grid place-items-center rounded-md border border-line text-muted hover:bg-surface2 hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentstrong/40 transition-colors"><Icon name="ti-login-2" /></button>
                          <Dropdown align="right" width={208}
                            trigger={<span className="h-8 w-8 grid place-items-center rounded-md border border-line text-muted hover:bg-surface2 hover:text-content transition-colors" title="More actions" aria-label="More actions"><Icon name="ti-dots-vertical" /></span>}
                            items={[{ value: 'open', label: 'Open details', icon: 'ti-arrow-right' }, { value: 'reseller', label: t.is_reseller ? 'Unset reseller' : 'Make reseller', icon: t.is_reseller ? 'ti-circle-minus' : 'ti-building-community' }]}
                            onChange={(v) => { if (v === 'open') router.push(`/tenants/${t.org_id}`); else if (v === 'reseller') toggleReseller(t.org_id, !t.is_reseller); }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

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
              {[...invites.reduce((mm: Map<string, typeof invites>, iv) => { const k = iv.parent_org_id ? `${(rows || []).find((x: any) => x.org_id === iv.parent_org_id)?.org_name || 'Reseller'} \u00b7 invitations` : 'Platform invitations'; if (!mm.has(k)) mm.set(k, [] as any); (mm.get(k) as any).push(iv); return mm; }, new Map()).entries()].map(([label, items]) => (
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
