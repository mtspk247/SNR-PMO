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

type Tab = 'manage' | 'templates';

export default function UsersPage() {
  const org = useActiveOrg();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('manage');
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAdminUsers().then((u) => { setUsers(u); if (u.length) setSel((s) => s || u[0].id); }).finally(() => setLoading(false));
    listRoleTemplates().then(setRoles).catch(() => {});
  }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <Layout title="Users"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to manage users.</div></Layout>;
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

          {/* Tabs */}
          <div className="card rounded-b-none border-b-0 flex gap-1 px-4 bg-surface2/50 sticky top-0 z-10">
            {(['manage', 'templates'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-b-accent text-content'
                    : 'border-b-transparent text-muted hover:text-content'
                }`}
              >
                {t === 'manage' ? 'Manage users' : 'Role templates'}
              </button>
            ))}
          </div>

          {tab === 'manage' ? (
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="card w-full lg:w-72 lg:shrink-0 rounded-t-none overflow-y-auto" style={{ maxHeight: '72vh' }}>
                {users.map((x) => (
                  <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 transition-colors ${sel === x.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2 border-l-2 border-l-transparent'}`}>
                    <Avatar name={x.full_name} size={32} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.full_name}</span><span className="block text-2xs text-muted truncate">{x.email}</span></span>
                    {x.status === 'suspended' && <span className="pill pill-red">susp</span>}
                  </button>
                ))}
                {users.length === 0 && <EmptyState text="No users" />}
              </div>
              {u ? (
                <div className="card flex-1 p-6 max-w-2xl rounded-t-none">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-line">
                    <Avatar name={u.full_name} size={44} />
                    <div><h3 className="font-semibold text-content">{u.full_name}</h3><p className="text-sm text-muted">{u.email}{u.department ? ` · ${u.department}` : ''}</p></div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="label">Role</label><select value={u.role} disabled={busy} onChange={(e) => patch({ role: e.target.value as any })} className="input">{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select></div>
                      <div><label className="label">Status</label><select value={u.status} disabled={busy} onChange={(e) => patch({ status: e.target.value as any })} className="input"><option value="active">Active</option><option value="suspended">Suspended</option></select></div>
                    </div>
                    <div>
                      <label className="label">Role template</label>
                      <select value={u.role_template_id || ''} disabled={busy} onChange={(e) => patch({ role_template_id: (e.target.value || null) as any })} className="input">
                        <option value="">— None (custom permissions) —</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <p className="text-2xs text-muted mt-1">Assigning a template applies its permissions and module access.</p>
                    </div>
                    <div className="pt-2">
                      <p className="text-2xs uppercase tracking-wide text-muted mb-3 font-medium">Permissions</p>
                      <div className="space-y-2">
                        {PERMS.map((p) => (
                          <label key={String(p.key)} className="flex items-center justify-between text-sm py-1.5 cursor-pointer hover:bg-surface2/50 px-2 rounded">
                            <span className="text-content">{p.label}</span>
                            <input type="checkbox" checked={!!u[p.key]} disabled={busy} onChange={(e) => patch({ [p.key]: e.target.checked } as any)} className="accent-accent w-4 h-4" />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : <div className="card flex-1 p-6 rounded-t-none text-sm text-muted">Select a user</div>}
            </div>
          ) : (
            <div className="card rounded-t-none p-6">
              <p className="text-sm text-muted mb-4">Switch to the Roles section to manage role templates.</p>
              <button onClick={() => window.location.href = '/roles'} className="btn btn-primary">Manage roles</button>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
