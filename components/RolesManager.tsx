import { useEffect, useState } from 'react';
import { Spinner, EmptyState, Icon } from '@/components/ui';
import { ViewControls, useViewPrefs, buildGroups } from '@/components/ViewControls';
import { listRoleTemplates, createRoleTemplate, updateRoleTemplate, deleteRoleTemplate, seedDefaultRoles } from '@/lib/db';
import { RoleTemplate, PermKey, FeatureKey } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { FEATURE_LABELS, PERMISSION_LABELS } from '@/lib/entitlements';

const PERM_KEYS = Object.keys(PERMISSION_LABELS) as PermKey[];
const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];

type Draft = { id?: string; name: string; description: string; permissions: Record<string, boolean>; feature_access: string[]; is_system: boolean };
const emptyDraft = (): Draft => ({ name: '', description: '', permissions: {}, feature_access: [], is_system: false });

export default function RolesManager() {
  const org = useActiveOrg();
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [err, setErr] = useState('');

  const load = () => listRoleTemplates().then(setRoles).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to manage roles.</div>;
  }

  const openNew = () => { setErr(''); setSel(emptyDraft()); };
  const openEdit = (r: RoleTemplate) => { setErr(''); setSel({ id: r.id, name: r.name, description: r.description || '', permissions: { ...r.permissions }, feature_access: [...r.feature_access], is_system: r.is_system }); };
  const togglePerm = (k: string) => setSel((d) => d && ({ ...d, permissions: { ...d.permissions, [k]: !d.permissions[k] } }));
  const toggleFeature = (k: string) => setSel((d) => d && ({ ...d, feature_access: d.feature_access.includes(k) ? d.feature_access.filter((x) => x !== k) : [...d.feature_access, k] }));

  const save = async () => {
    if (!sel || !org || !sel.name.trim()) return;
    setBusy(true); setErr('');
    try {
      if (sel.id) await updateRoleTemplate(sel.id, { name: sel.name.trim(), description: sel.description || null, permissions: sel.permissions, feature_access: sel.feature_access });
      else await createRoleTemplate({ org_id: org.id, name: sel.name.trim(), description: sel.description || null, permissions: sel.permissions, feature_access: sel.feature_access });
      await load(); setSel(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (r: RoleTemplate) => {
    if (!confirm(`Delete role "${r.name}"? Users assigned to it keep their current permissions.`)) return;
    try { await deleteRoleTemplate(r.id); setRoles((prev) => prev.filter((x) => x.id !== r.id)); }
    catch (e: any) { alert(e.message); }
  };
  const loadStarter = async () => {
    if (!org) return; setSeeding(true); setErr('');
    try { await seedDefaultRoles(org.id); await load(); } catch (e: any) { setErr(e.message); } finally { setSeeding(false); }
  };

  const permCount = (r: RoleTemplate) => Object.values(r.permissions).filter(Boolean).length;
  const prefs = useViewPrefs('snrpmo.roles.view', { view: 'cards', groupBy: 'type' });
  const VIEWS = [{ id: 'cards', icon: 'ti-layout-grid', label: 'Cards' }, { id: 'list', icon: 'ti-list', label: 'List' }];
  const GROUPS = [{ value: 'none', label: 'No grouping' }, { value: 'type', label: 'Group: Type' }];
  const gKey = (r: RoleTemplate) => (r.is_system ? 'system' : 'custom');
  const gLabel = (k: string) => (k === 'system' ? 'Predefined roles' : 'Custom roles');

  // ---- Dense detail editor (full page, replaces the list) ----
  if (sel) {
    const selectedPerms = PERM_KEYS.filter((k) => sel.permissions[k]).length;
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setSel(null)} className="btn btn-ghost border border-line"><Icon name="ti-arrow-left" />Back to roles</button>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-content truncate inline-flex items-center gap-2"><Icon name="ti-shield-lock" className="text-muted2" />{sel.id ? (sel.name || 'Role') : 'New role'}{sel.is_system && <span className="pill pill-gray">Predefined</span>}</h2>
            <p className="text-2xs text-muted">{selectedPerms} permission{selectedPerms === 1 ? '' : 's'} · {sel.feature_access.length === 0 ? 'all modules' : `${sel.feature_access.length} modules`}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {sel.id && !sel.is_system && <button onClick={() => { const r = roles.find((x) => x.id === sel.id); if (r) remove(r); }} className="btn text-rose-600 border border-rose-300"><Icon name="ti-trash" />Delete</button>}
            <button onClick={save} disabled={busy || !sel.name.trim()} className="btn btn-primary min-w-[7rem]">{busy ? 'Saving…' : 'Save role'}</button>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}

        <div className="card p-5 max-w-3xl">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Role name</label><input disabled={sel.is_system} value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} className="input disabled:opacity-60" placeholder="e.g. QA Tester" />{sel.is_system && <p className="text-2xs text-muted mt-1">Predefined role — name is fixed, but you can tailor its permissions & modules.</p>}</div>
            <div><label className="label">Description</label><input value={sel.description} onChange={(e) => setSel({ ...sel, description: e.target.value })} className="input" placeholder="What this role is for" /></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1"><h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-shield-check" className="text-muted2" />Permissions</h3><button onClick={() => setSel({ ...sel, permissions: Object.fromEntries(PERM_KEYS.map((k) => [k, !(selectedPerms === PERM_KEYS.length)])) })} className="btn-ghost text-2xs">{selectedPerms === PERM_KEYS.length ? 'Clear all' : 'Select all'}</button></div>
            <p className="text-2xs text-muted mb-3">What this role can do across the workspace.</p>
            <div className="divide-y divide-line">
              {PERM_KEYS.map((k) => (
                <label key={k} className="flex items-center justify-between gap-3 py-2.5 cursor-pointer">
                  <span className="text-sm text-content">{PERMISSION_LABELS[k]}</span>
                  <input type="checkbox" checked={!!sel.permissions[k]} onChange={() => togglePerm(k)} className="accent-accent w-4 h-4" />
                </label>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1"><h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-puzzle" className="text-muted2" />Module access</h3><button onClick={() => setSel({ ...sel, feature_access: [] })} className="btn-ghost text-2xs">All modules</button></div>
            <p className="text-2xs text-muted mb-3">Leave all unchecked = access to every module your plan includes. Check specific ones to restrict.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
              {FEATURE_KEYS.map((k) => (
                <label key={k} className="flex items-center justify-between gap-2 py-1.5 cursor-pointer">
                  <span className="text-sm text-content truncate">{FEATURE_LABELS[k]}</span>
                  <input type="checkbox" checked={sel.feature_access.includes(k)} onChange={() => toggleFeature(k)} className="accent-accent w-4 h-4" />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- List ----
  const RoleCard = (r: RoleTemplate) => (
    <button key={r.id} onClick={() => openEdit(r)} className="card p-5 flex flex-col text-left hover:border-borderstrong transition">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold flex items-center gap-2"><Icon name="ti-shield-lock" className="text-muted" />{r.name}</h3>
        {r.is_system && <span className="pill pill-gray">Predefined</span>}
      </div>
      <p className="text-sm text-muted mb-3 min-h-[2.5rem]">{r.description || '—'}</p>
      <div className="text-2xs text-muted space-y-1 mb-3">
        <div><span className="text-content font-medium">{permCount(r)}</span> permission{permCount(r) === 1 ? '' : 's'}</div>
        <div className="truncate">Modules: {r.feature_access.length === 0 ? 'All' : r.feature_access.map((fk) => FEATURE_LABELS[fk as FeatureKey] || fk).join(', ')}</div>
      </div>
      <span className="mt-auto text-2xs text-accentstrong inline-flex items-center gap-1">Open <Icon name="ti-chevron-right" className="text-2xs" /></span>
    </button>
  );
  const RoleRow = (r: RoleTemplate) => (
    <tr key={r.id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => openEdit(r)}>
      <td className="px-4 py-3"><span className="font-medium text-content inline-flex items-center gap-2"><Icon name="ti-shield-lock" className="text-muted" />{r.name}</span>{r.is_system && <span className="pill pill-gray ml-2">Predefined</span>}</td>
      <td className="px-4 py-3 text-muted">{r.description || '—'}</td>
      <td className="px-4 py-3 text-muted tabular-nums">{permCount(r)}</td>
      <td className="px-4 py-3 text-muted">{r.feature_access.length === 0 ? 'All' : r.feature_access.map((fk) => FEATURE_LABELS[fk as FeatureKey] || fk).join(', ')}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap"><Icon name="ti-chevron-right" className="text-muted2" /></td>
    </tr>
  );
  const renderView = (list: RoleTemplate[]) => prefs.view === 'list' ? (
    <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
        <tr><th className="px-4 py-3">Role</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Perms</th><th className="px-4 py-3">Modules</th><th className="px-4 py-3"></th></tr>
      </thead>
      <tbody>{list.map(RoleRow)}</tbody>
    </table></div></div>
  ) : (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{list.map(RoleCard)}</div>
  );

  return (
    <div>
      {loading ? <Spinner /> : (
        <>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div><h3 className="text-sm font-semibold text-content">Roles &amp; permissions</h3><p className="text-2xs text-muted">Click a role to open its full permission detail. Predefined roles are editable.</p></div>
            <div className="flex items-center gap-2"><ViewControls prefs={prefs} views={VIEWS} groupOptions={GROUPS} /><button onClick={loadStarter} disabled={seeding} className="btn btn-ghost border border-line">{seeding ? 'Loading…' : <><Icon name="ti-download" />Load starter roles</>}</button><button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New role</button></div>
          </div>
          {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
          {roles.length === 0 ? <EmptyState text="No roles yet — click “Load starter roles” for a ready-made set." /> : prefs.groupBy === 'none' ? renderView(roles) : (
            <div className="space-y-6">
              {buildGroups(roles, gKey, gLabel, ['system', 'custom']).map((grp) => (
                <div key={grp.key}>
                  <h3 className="text-sm font-semibold text-content mb-3">{grp.label} <span className="text-muted2 font-normal">({grp.items.length})</span></h3>
                  {renderView(grp.items)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
