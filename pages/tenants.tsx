import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { FEATURE_LABELS } from '@/lib/entitlements';
import { listTenants, getTenantInfo, setTenantPlan, setTenantActive, setTenantFeatureOverride, setTenantLimitOverride, listPlans, TenantInfo, tenantSnapshot, wipeTenantData, listTenantSnapshots, restoreTenantSnapshot, TenantSnapshot } from '@/lib/db';
import { Plan } from '@/lib/supabase';

export default function TenantsPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<any[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [info, setInfo] = useState<TenantInfo | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [snaps, setSnaps] = useState<TenantSnapshot[]>([]);
  const [wipeName, setWipeName] = useState(''); const [wiping, setWiping] = useState(false);

  const load = () => { listTenants().then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (platformAdmin) { load(); listPlans().then(setPlans).catch(() => {}); } }, [platformAdmin]);

  const openTenant = async (t: any) => { setSel(t); setInfo(null); setWipeName(''); setSnaps([]); listTenantSnapshots(t.org_id).then(setSnaps).catch(() => setSnaps([])); try { setInfo(await getTenantInfo(t.org_id)); } catch (e: any) { setErr(e.message); } };
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

      {sel && (
        <Modal open onClose={() => { setSel(null); setInfo(null); }} size="lg" icon="ti-building-community" title={sel.org_name} subtitle={sel.slug}
          footer={<button className="btn" onClick={() => { setSel(null); setInfo(null); }}>Close</button>}>
          {!info ? <Spinner /> : (
            <div className="space-y-4">
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
    </Layout>
  );
}
