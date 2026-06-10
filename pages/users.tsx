import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { getAdminUsers, updateUserAdmin, listRoleTemplates } from '@/lib/db';
import { AdminUser, RoleTemplate } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

const ROLES = ['super_admin', 'pm', 'team_member', 'viewer'];
const PERMS: { key: keyof AdminUser; label: string }[] = [
  { key: 'can_view_all_projects', label: 'View all projects' },
  { key: 'can_edit_all_projects', label: 'Edit all projects' },
  { key: 'can_approve_leaves', label: 'Approve leaves' },
  { key: 'can_delete_tasks', label: 'Delete tasks' },
  { key: 'can_manage_users', label: 'Manage users' },
  { key: 'can_view_dashboard', label: 'View dashboard' },
  { key: 'can_export_data', label: 'Export data' },
];

export default function UsersPage() {
  const org = useActiveOrg();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminUsers().then((u) => { setUsers(u); if (u.length) setSel((s) => s || u[0].id); }).finally(() => setLoading(false));
    listRoleTemplates().then(setRoles).catch(() => {});
  }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <Layout title="Users"><div className="card p-10 text-center text-sm text-neutral-500"><Icon name="ti-lock" className="text-2xl text-neutral-300 block mb-2" />You need admin access to manage users.</div></Layout>;
  }

  const u = users.find((x) => x.id === sel) || null;
  const patch = async (p: Partial<AdminUser>) => {
    if (!u) return; setBusy(true);
    try { const r = await updateUserAdmin(u.id, p); setUsers((prev) => prev.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout title="Users">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Users & roles" subtitle="Manage team access and permissions" />
          <div className="flex gap-4">
            <div className="card w-72 shrink-0 overflow-y-auto" style={{ maxHeight: '72vh' }}>
              {users.map((x) => (
                <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 ${sel === x.id ? 'bg-sky-50/60 border-l-2 border-l-sky-500' : 'hover:bg-paper border-l-2 border-l-transparent'}`}>
                  <Avatar name={x.full_name} size={32} />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.full_name}</span><span className="block text-2xs text-neutral-500 truncate">{x.email}</span></span>
                  {x.status === 'suspended' && <span className="pill pill-red">susp</span>}
                </button>
              ))}
              {users.length === 0 && <EmptyState text="No users" />}
            </div>
            {u ? (
              <div className="card flex-1 p-6 max-w-2xl">
                <div className="flex items-center gap-3 mb-5">
                  <Avatar name={u.full_name} size={44} />
                  <div><h3 className="font-semibold">{u.full_name}</h3><p className="text-sm text-neutral-500">{u.email}{u.department ? ` · ${u.department}` : ''}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div><label className="label">Role</label><select value={u.role} disabled={busy} onChange={(e) => patch({ role: e.target.value as any })} className="input">{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></div>
                  <div><label className="label">Status</label><select value={u.status} disabled={busy} onChange={(e) => patch({ status: e.target.value as any })} className="input"><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
                </div>
                <div className="mb-5">
                  <label className="label">Role template</label>
                  <select value={u.role_template_id || ''} disabled={busy} onChange={(e) => patch({ role_template_id: (e.target.value || null) as any })} className="input">
                    <option value="">— None (custom permissions) —</option>
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <p className="text-2xs text-neutral-400 mt-1">Assigning a template applies its permissions and module access below.</p>
                </div>
                <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Permissions</p>
                <div className="space-y-1.5">
                  {PERMS.map((p) => (
                    <label key={String(p.key)} className="flex items-center justify-between text-sm py-1 cursor-pointer">
                      <span>{p.label}</span>
                      <input type="checkbox" checked={!!u[p.key]} disabled={busy} onChange={(e) => patch({ [p.key]: e.target.checked } as any)} className="accent-ink w-4 h-4" />
                    </label>
                  ))}
                </div>
              </div>
            ) : <div className="card flex-1 p-6 text-sm text-neutral-400">Select a user</div>}
          </div>
        </>
      )}
    </Layout>
  );
}
