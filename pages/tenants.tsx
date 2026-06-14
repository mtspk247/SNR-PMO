import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { FEATURE_LABELS } from '@/lib/entitlements';
import { listTenants, getTenantInfo, setTenantPlan, setTenantActive, setTenantFeatureOverride, setTenantLimitOverride, listPlans, TenantInfo, tenantSnapshot, wipeTenantData, listTenantSnapshots, restoreTenantSnapshot, TenantSnapshot, getTenantUsage, getOrgActivity, TenantUsage, ActivityItem, listOrgInvites, createOrgInvite, revokeOrgInvite, getTenantDomain, setCustomDomain, verifyCustomDomain, TenantDomain } from '@/lib/db';
import { Plan, OrgInvite } from '@/lib/supabase';

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : null;
  const over = pct != null && pct >= 90;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs mb-1"><span className="text-muted">{label}</span>
        <span className={over ? 'text-rose-600 font-medium' : 'text-content'}>{used}{limit != null ? ` / ${limit}` : ' / ∞'}{pct != null ? ` (${pct}%)` : ''}</span></div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden"><div className={`h-full ${over ? 'bg-rose-500' : 'bg-accent'}`} style={{ width: `${pct ?? 4}%` }} /></div>
    </div>
  );
}

export default function TenantsPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<any[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [snaps, setSnaps] = useState<TenantSnapshot[]>([]);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [wipeName, setWipeName] = useState(''); const [wiping, setWiping] = useState(false);
  const [invites, setInvites] = useState<OrgInvite[]>([]);
  const [invOpen, setInvOpen] = useState(false);
  const [invEmail, setInvEmail] = useState(''); const [invName, setInvName] = useState(''); const [invPlan, setInvPlan] = useState('free');
  const [invBusy, setInvBusy] = useState(false); const [invErr, setInvErr] = useState(''); const [invLink, setInvLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const loadInvites = () => listOrgInvites().then(setInvites).catch(() => {});
  const copyLink = (link: string) => { try { navigator.clipboard?.writeText(link); } catch {} setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const submitInvite = async () => {
    if (!invEmail.trim() || !invName.trim()) return;
    setInvBusy(true); setInvErr(''); setInvLink(null);
    try { const r = await createOrgInvite(invEmail.trim(), invName.trim(), invPlan); setInvLink(r.link); setInvEmail(''); setInvName(''); loadInvites(); }
    catch (e: any) { setInvErr(e.message); } finally { setInvBusy(false); }
  };
  const doRevoke = async (id: string) => { if (!confirm('Revoke this invitation? The link will stop working.')) return; try { await revokeOrgInvite(id); loadInvites(); } catch (e: any) { setErr(e.message); } };
  const [dom, setDom] = useState<TenantDomain | null>(null);
  const [domInput, setDomInput] = useState(''); const [domBusy, setDomBusy] = useState(false);
  const loadDomain = (orgId: string) => getTenantDomain(orgId).then((d) => { setDom(d); setDomInput(d.custom_domain || ''); }).catch(() => setDom(null));
  const saveDomain = async () => { if (!sel) return; setDomBusy(true); setErr(''); try { const d = await setCustomDomain(sel.org_id, domInput.trim()); setDom(d); setDomInput(d.custom_domain || ''); } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); } };
  const verifyDomain = async () => { if (!sel) return; setDomBusy(true); setErr(''); try { await verifyCustomDomain(sel.org_id); await loadDomain(sel.org_id); } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); } };
  const removeDomain = async () => { if (!sel) return; setDomBusy(true); setErr(''); try { const d = await setCustomDomain(sel.org_id, ''); setDom(d); setDomInput(''); } catch (e: any) { setErr(e.message); } finally { setDomBusy(false); } };

  const load = () => { listTenants().then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (platformAdmin) { load(); loadInvites(); listPlans().then(setPlans).catch(() => {}); } }, [platformAdmin]);

  const openTenant = async (t: any) => { setSel(t); setInfo(null); setWipeName(''); setSnaps([]); setUsage(null); setActivity([]); setDom(null); loadDomain(t.org_id); listTenantSnapshots(t.org_id).then(setSnaps).catch(() => setSnaps([])); getTenantUsage(t.org_id).then(setUsage).catch(() => {}); getOrgActivity(t.org_id).then(setActivity).catch(() => {}); try { setInfo(await getTenantInfo(t.org_id)); } catch (e: any) { setErr(e.message); } };
  const refreshSnaps = async () => { if (sel) setSnaps(await listTenantSnapshots(sel.org_id)); };
  const doWipe = async () => {
    if (!sel || wipeName.trim() !== sel.org_name) return;
    setWiping(true); setErr('');
    try { await tenantSnapshot(sel.org_id, 'Pre-wipe backup'); await wipeTenantData(sel.org_id); setWipeName(''); await refreshSnaps(); await refreshInfo(); load(); }
    catch (e: any) { setErr(e.message); } finally { setWiping(false); }
  };
  const doRestore = async (id: string) => {
    if (!confirm('Restore this snapshot? It re-inserts the backed-up records.')) return;
    setWiping(true); setErr('');
    try { await restoreTenantSnapshot(id); await refreshInfo(); load(); }
    catch (e: any) { setErr(e.message); } finally { setWiping(false); }
  };
  const refreshInfo = async () => { if (sel) setInfo(await getTenantInfo(sel.org_id)); };

  const changePlan = async (key: string) => { if (!sel) return; setBusy(true); try { await setTenantPlan(sel.org_id, key); await refreshInfo(); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggleActive = async () => { if (!sel || !info) return; setBusy(true); try { await setTenantActive(sel.org_id, !info.active); await refreshInfo(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const setFeature = async (key: string, val: boolean | null) => { if (!sel) return; setBusy(true); try { await setTenantFeatureOverride(sel.org_id, key, val); await refreshInfo(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const saveQuota = async (mb: string) => { if (!sel) return; setBusy(true); try { await setTenantLimitOverride(sel.org_id, 'storage_mb', mb === '' ? null : Number(mb)); await refreshInfo(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

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
              <tr><th className="px-4 py-3">Organization</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Seats</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.org_id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => openTenant(t)}>
                  <td className="px-4 py-3"><span className="font-medium text-content">{t.org_name}</span><span className="block text-2xs text-muted2">{t.slug}</span></td>
                  <td className="px-4 py-3"><span className="pill pill-gray">{t.plan_name || t.plan_key || '—'}</span></td>
                  <td className="px-4 py-3 text-muted tabular-nums">{t.member_count ?? '—'}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">{t.seats ?? 0}{t.seat_limit ? ` / ${t.seat_limit}` : ''}</td>
                  <td className="px-4 py-3"><span className={`pill ${t.sub_status === 'active' ? 'pill-green' : 'pill-gray'}`}>{t.sub_status || 'free'}</span></td>
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

      {sel && (
        <Modal open onClose={() => { setSel(null); setInfo(null); }} size="lg" icon="ti-building-community" title={sel.org_name} subtitle={sel.slug}
          footer={<button className="btn" onClick={() => { setSel(null); setInfo(null); }}>Close</button>}>
          {!info ? <Spinner /> : (
            <div className="space-y-4">
              {usage && (
                <div className="rounded-lg border border-line p-3 space-y-3 bg-surface2/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[['Plan', usage.plan || '—'], ['Owner', usage.owner || '—'],
                      ['Created', usage.created_at ? new Date(usage.created_at).toLocaleDateString() : '—'],
                      ['Status', usage.active ? 'Active' : 'Suspended']].map(([k, val]) => (
                      <div key={k}><p className="text-2xs uppercase tracking-wide text-muted2">{k}</p><p className="text-sm font-medium text-content truncate">{val}</p></div>
                    ))}
                  </div>
                  <UsageBar label="Members (seats)" used={usage.seat_count} limit={usage.seat_limit} />
                  <UsageBar label="Storage (MB)" used={usage.storage_used_mb} limit={usage.storage_limit_mb} />
                  <div className="flex items-center justify-between text-2xs"><span className="text-muted">Guests invited</span><span className="text-content font-medium">{usage.guests}</span></div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {Object.entries(usage.counts).map(([k, val]) => (
                      <div key={k} className="rounded-md border border-line bg-surface p-2 text-center"><p className="text-sm font-semibold tabular-nums text-content">{val}</p><p className="text-2xs text-muted2 capitalize">{k}</p></div>
                    ))}
                  </div>
                  <div>
                    <p className="text-2xs uppercase tracking-wide text-muted2 mb-1.5">Features enabled</p>
                    <div className="flex flex-wrap gap-1.5">{usage.features.map((f) => <span key={f} className="pill pill-green text-2xs">{FEATURE_LABELS[f as keyof typeof FEATURE_LABELS] || f}</span>)}</div>
                  </div>
                </div>
              )}
              {activity.length > 0 && (
                <div>
                  <p className="text-2xs uppercase tracking-wide text-muted2 mb-1.5">Recent activity</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-line p-2">
                    {activity.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-2xs">
                        <span className="text-content font-medium">{(a.username || 'Someone').split(' ')[0]}</span>
                        <span className="text-muted">{({ INSERT: 'created', UPDATE: 'updated', DELETE: 'deleted' } as Record<string, string>)[a.action] || a.action.toLowerCase()} {(a.entity_type || '').replace(/_/g, ' ')}</span>
                        <span className="text-muted2 ml-auto whitespace-nowrap">{new Date(a.ts).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`pill ${info.active ? 'pill-green' : 'pill-red'}`}>{info.active ? 'Active' : 'Suspended'}</span>
                <button className={`btn h-8 py-0 ${info.active ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={toggleActive}>
                  <Icon name={info.active ? 'ti-ban' : 'ti-circle-check'} />{info.active ? 'Suspend tenant' : 'Reactivate'}
                </button>
              </div>

              <Field label="Plan">
                <select className="input" value={info.plan || ''} disabled={busy} onChange={(e) => changePlan(e.target.value)}>
                  <option value="">—</option>{plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
              </Field>

              <div>
                <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Feature overrides</p>
                <div className="divide-y divide-line">
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const ov = info.features[key]; // true=forced on, false=forced off, undefined=plan default
                    return (
                      <div key={key} className="flex items-center gap-2 py-2">
                        <span className="text-sm text-content flex-1">{label}</span>
                        <div className="flex items-center rounded-lg border border-line overflow-hidden text-2xs">
                          {([['default', undefined], ['on', true], ['off', false]] as const).map(([lab, val]) => {
                            const activeSel = ov === val;
                            return <button key={lab} disabled={busy} onClick={() => setFeature(key, (val as boolean | undefined) ?? null)}
                              className={`px-2.5 h-7 capitalize transition ${activeSel ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:bg-surface2'}`}>{lab}</button>;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Field label="Storage quota override (MB)" hint="Blank = use plan default">
                <input className="input" type="number" defaultValue={info.limits.storage_mb ?? ''} disabled={busy}
                  onBlur={(e) => saveQuota(e.target.value)} placeholder="e.g. 51200" />
              </Field>

              <div className="rounded-lg border border-line p-3">
                <p className="text-2xs uppercase tracking-wide text-muted2 font-semibold mb-1">Custom domain</p>
                <p className="text-2xs text-muted mb-2">Serve this tenant on its own domain. Their logo, colors and name load automatically once the domain is verified.</p>
                <div className="flex items-center gap-2">
                  <input className="input flex-1" value={domInput} onChange={(e) => setDomInput(e.target.value)} placeholder="pm.acme.com" disabled={domBusy} />
                  <button className="btn btn-primary shrink-0" disabled={domBusy} onClick={saveDomain}>{domBusy ? '…' : 'Save'}</button>
                  {dom?.custom_domain && <button className="btn shrink-0" disabled={domBusy} onClick={removeDomain}>Remove</button>}
                </div>
                {dom?.custom_domain && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium ${dom.verified ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>{dom.verified ? 'Verified' : 'Pending verification'}</span>
                      {!dom.verified && <button className="btn-ghost text-2xs" disabled={domBusy} onClick={verifyDomain}><Icon name="ti-check" />Mark verified</button>}
                    </div>
                    {!dom.verified && (
                      <div className="rounded-md bg-surface2 p-2.5 text-2xs text-muted space-y-1.5">
                        <p className="font-medium text-content">Add these DNS records, then add the domain to the Vercel project:</p>
                        <p>1. <span className="font-mono text-content">CNAME</span> <span className="font-mono text-content">{dom.custom_domain}</span> → <span className="font-mono">cname.vercel-dns.com</span></p>
                        <p>2. <span className="font-mono text-content">TXT</span> <span className="font-mono text-content">_snr-verify.{dom.custom_domain}</span> → <span className="font-mono break-all text-content">{dom.token}</span></p>
                        <p className="text-muted2">Once DNS resolves and the domain is added in Vercel, click “Mark verified”.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                <p className="text-2xs uppercase tracking-wide text-rose-600 font-semibold mb-1">Danger zone — wipe data</p>
                <p className="text-2xs text-muted mb-2">Permanently clears all business data (projects, tasks, CRM, HR, finance, drives…). Keeps the org, members, plan, branding and roles. A restorable snapshot is taken automatically first.</p>
                {snaps.length > 0 && (
                  <div className="mb-2 space-y-1">
                    {snaps.map((s2) => (
                      <div key={s2.id} className="flex items-center gap-2 text-2xs">
                        <Icon name="ti-database-export" className="text-muted2 shrink-0" />
                        <span className="flex-1 text-muted truncate">{new Date(s2.created_at).toLocaleString()} · {s2.row_count} rows</span>
                        <button className="btn btn-ghost h-7 py-0 border border-line shrink-0" disabled={busy || wiping} onClick={() => doRestore(s2.id)}>Restore</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="text-2xs text-muted">Type <span className="font-mono font-semibold text-content">{sel.org_name}</span> to confirm</label>
                <input className="input mt-1" value={wipeName} onChange={(e) => setWipeName(e.target.value)} placeholder={sel.org_name} />
                <button className="btn btn-danger mt-2" disabled={wiping || busy || wipeName.trim() !== sel.org_name} onClick={doWipe}>
                  <Icon name="ti-trash-x" />{wiping ? 'Backing up & wiping…' : 'Back up & wipe tenant data'}
                </button>
              </div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
          )}
        </Modal>
      )}
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
