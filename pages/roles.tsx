import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { listRoleTemplates, createRoleTemplate, updateRoleTemplate, deleteRoleTemplate } from '@/lib/db';
import { RoleTemplate, PermKey, FeatureKey } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { FEATURE_LABELS, PERMISSION_LABELS } from '@/lib/entitlements';

const PERM_KEYS = Object.keys(PERMISSION_LABELS) as PermKey[];
const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];

type Draft = { id?: string; name: string; description: string; permissions: Record<string, boolean>; feature_access: string[]; is_system: boolean };
const emptyDraft = (): Draft => ({ name: '', description: '', permissions: {}, feature_access: [], is_system: false });

export default function RolesPage() {
  const org = useActiveOrg();
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    listRoleTemplates().then(setRoles).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <Layout title="Roles"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-neutral-300 block mb-2" />You need admin access to manage roles.</div></Layout>;
  }

  const openNew = () => { setErr(''); setDraft(emptyDraft()); };
  const openEdit = (r: RoleTemplate) => { setErr(''); setDraft({ id: r.id, name: r.name, description: r.description || '', permissions: { ...r.permissions }, feature_access: [...r.feature_access], is_system: r.is_system }); };

  const togglePerm = (k: string) => setDraft((d) => d && ({ ...d, permissions: { ...d.permissions, [k]: !d.permissions[k] } }));
  const toggleFeature = (k: string) => setDraft((d) => d && ({ ...d, feature_access: d.feature_access.includes(k) ? d.feature_access.filter((x) => x !== k) : [...d.feature_access, k] }));

  const save = async () => {
    if (!draft || !org) return;
    setBusy(true); setErr('');
    try {
      if (draft.id) {
        const r = await updateRoleTemplate(draft.id, { name: draft.name.trim(), description: draft.description || null, permissions: draft.permissions, feature_access: draft.feature_access });
        setRoles((prev) => prev.map((x) => (x.id === r.id ? r : x)));
      } else {
        const r = await createRoleTemplate({ org_id: org.id, name: draft.name.trim(), description: draft.description || null, permissions: draft.permissions, feature_access: draft.feature_access });
        setRoles((prev) => [...prev, r].sort((a, b) => Number(b.is_system) - Number(a.is_system) || a.name.localeCompare(b.name)));
      }
      setDraft(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (r: RoleTemplate) => {
    if (!confirm(`Delete role "${r.name}"? Users assigned to it keep their current permissions.`)) return;
    try { await deleteRoleTemplate(r.id); setRoles((prev) => prev.filter((x) => x.id !== r.id)); }
    catch (e: any) { alert(e.message); }
  };

  const permCount = (r: RoleTemplate) => Object.values(r.permissions).filter(Boolean).length;

  return (
    <Layout title="Roles">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Roles & permissions" subtitle="Reusable permission templates and module access for your team"
            action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New role</button>} />

          {roles.length === 0 ? <EmptyState text="No roles yet" /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {roles.map((r) => (
                <div key={r.id} className="card p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold flex items-center gap-2"><Icon name="ti-shield-lock" className="text-muted" />{r.name}</h3>
                    {r.is_system && <span className="pill pill-gray">System</span>}
                  </div>
                  <p className="text-sm text-muted mb-3 min-h-[2.5rem]">{r.description || '—'}</p>
                  <div className="text-2xs text-muted space-y-1 mb-4">
                    <div><span className="text-content font-medium">{permCount(r)}</span> permission{permCount(r) === 1 ? '' : 's'}</div>
                    <div>Modules: {r.feature_access.length === 0 ? 'All' : r.feature_access.map((f) => FEATURE_LABELS[f as FeatureKey] || f).join(', ')}</div>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <button onClick={() => openEdit(r)} className="btn flex-1"><Icon name="ti-pencil" />Edit</button>
                    {!r.is_system && <button onClick={() => remove(r)} className="btn text-rose-600" title="Delete"><Icon name="ti-trash" /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {draft && (
            <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setDraft(null)}>
              <div className="bg-surface rounded-lg border border-line w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-base font-semibold mb-4">{draft.id ? 'Edit role' : 'New role'}</h3>
                <div className="space-y-3">
                  <div><label className="label">Name</label><input autoFocus disabled={draft.is_system} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="input disabled:opacity-60" placeholder="e.g. QA Tester" /></div>
                  <div><label className="label">Description</label><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="input" placeholder="Optional" /></div>

                  <div>
                    <p className="text-2xs uppercase tracking-wide text-muted mb-2 mt-1">Permissions</p>
                    <div className="space-y-1">
                      {PERM_KEYS.map((k) => (
                        <label key={k} className="flex items-center justify-between text-sm py-1 cursor-pointer">
                          <span>{PERMISSION_LABELS[k]}</span>
                          <input type="checkbox" checked={!!draft.permissions[k]} onChange={() => togglePerm(k)} className="accent-ink w-4 h-4" />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-2xs uppercase tracking-wide text-muted mb-1 mt-1">Module access</p>
                    <p className="text-2xs text-muted mb-2">None selected = access to all entitled modules.</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {FEATURE_KEYS.map((k) => (
                        <label key={k} className="flex items-center justify-between text-sm py-1 cursor-pointer">
                          <span>{FEATURE_LABELS[k]}</span>
                          <input type="checkbox" checked={draft.feature_access.includes(k)} onChange={() => toggleFeature(k)} className="accent-ink w-4 h-4" />
                        </label>
                      ))}
                    </div>
                  </div>
                  {err && <p className="text-sm text-rose-600">{err}</p>}
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setDraft(null)} className="btn flex-1">Cancel</button>
                  <button onClick={save} disabled={busy || !draft.name.trim()} className="btn btn-primary flex-1">{busy ? 'Saving…' : 'Save role'}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
