import { useEffect, useState } from 'react';
import Select from '@/components/Select';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { getAdminUsers, updateUserAdmin, listRoleTemplates, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember } from '@/lib/db';
import { AdminUser, RoleTemplate, Team } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { useTeams } from '@/lib/queries';
import Dropdown from '@/components/Dropdown';
import { buildGroups } from '@/components/ViewControls';
import qk from '@/lib/queryKeys';

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

const SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

type Tab = 'manage' | 'templates' | 'teams';

type TeamDraft = { id?: string; name: string; description: string; color: string };
const emptyTeamDraft = (): TeamDraft => ({ name: '', description: '', color: SWATCHES[0] });

function TeamMembersPanel({
  team,
  users,
  orgId,
  onRefresh,
}: {
  team: Team;
  users: AdminUser[];
  orgId: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const members = team.members || [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const available = users.filter((u) => !memberIds.has(u.id));

  const remove = async (userId: string) => {
    setBusy(true);
    try { await removeTeamMember(team.id, userId); onRefresh(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  const add = async (userId: string) => {
    if (!userId) return;
    setBusy(true);
    try { await addTeamMember(team.id, userId, orgId); onRefresh(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      {members.length === 0 && <p className="text-2xs text-muted2">No members yet</p>}
      {members.map((m) => {
        const name = m.users?.full_name || m.user_id;
        return (
          <div key={m.user_id} className="flex items-center gap-2 text-sm">
            <Avatar name={name} size={24} />
            <span className="flex-1 truncate text-content">{name}</span>
            <button
              onClick={() => remove(m.user_id)}
              disabled={busy}
              className="text-muted hover:text-rose-500 transition-colors"
              title="Remove member"
            >
              <Icon name="ti-x" className="text-xs" />
            </button>
          </div>
        );
      })}
      {available.length > 0 && (
        <Select value="" disabled={busy} onChange={(v) => add(v)} className="h-8 py-0 text-xs mt-1" placeholder="+ Add member…" options={[{ value: '', label: '+ Add member…' }, ...available.map((u) => ({ value: u.id, label: `${u.full_name} (${u.email})` }))]} />
      )}
    </div>
  );
}

export default function UsersPage() {
  const org = useActiveOrg();
  const qc = useQueryClient();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('manage');
  const [sel, setSel] = useState<string | null>(null);
  const [uGroup, setUGroup] = useState('none');
  const uGroupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'role', label: 'Group by role' },
    { value: 'status', label: 'Group by status' },
  ];
  const ugKey = (x: AdminUser) => uGroup === 'role' ? (x.role || 'viewer') : uGroup === 'status' ? (x.status || 'active') : 'all';
  const ugLabel = (k: string) => uGroup === 'role' ? k.replace('_', ' ') : uGroup === 'status' ? (k === 'suspended' ? 'Suspended' : 'Active') : k;
  const [busy, setBusy] = useState(false);

  // Teams state
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [teamDraftId, setTeamDraftId] = useState<string | undefined>(undefined);
  const [teamBusy, setTeamBusy] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  useEffect(() => {
    getAdminUsers().then((u) => { setUsers(u); if (u.length) setSel((s) => s || u[0].id); }).finally(() => setLoading(false));
    listRoleTemplates().then(setRoles).catch(() => {});
  }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <Layout flat title="Users"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to manage users.</div></Layout>;
  }

  const u = users.find((x) => x.id === sel) || null;
  const patch = async (p: Partial<AdminUser>) => {
    if (!u) return; setBusy(true);
    try { const r = await updateUserAdmin(u.id, p); setUsers((prev) => prev.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  // Team handlers
  const openNewTeam = () => { setTeamDraftId(undefined); setTeamDraft(emptyTeamDraft()); };
  const openEditTeam = (t: Team) => { setTeamDraftId(t.id); setTeamDraft({ name: t.name, description: t.description || '', color: t.color || SWATCHES[0] }); };

  const saveTeam = async () => {
    if (!teamDraft || !org) return;
    if (!teamDraft.name.trim()) return;
    setTeamBusy(true);
    try {
      if (teamDraftId) {
        await updateTeam(teamDraftId, { name: teamDraft.name.trim(), description: teamDraft.description || null, color: teamDraft.color || null });
      } else {
        await createTeam({ org_id: org.id, name: teamDraft.name.trim(), description: teamDraft.description || undefined, color: teamDraft.color || undefined });
      }
      await qc.invalidateQueries({ queryKey: qk.teams(org?.id) });
      setTeamDraft(null);
    } catch (e: any) { alert(e.message); }
    finally { setTeamBusy(false); }
  };

  const removeTeam = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"? This will remove all members from the team.`)) return;
    try {
      await deleteTeam(t.id);
      await qc.invalidateQueries({ queryKey: qk.teams(org?.id) });
    } catch (e: any) { alert(e.message); }
  };

  const refreshTeams = () => qc.invalidateQueries({ queryKey: qk.teams(org?.id) });

  const tabLabel = (t: Tab) => {
    if (t === 'manage') return 'Manage users';
    if (t === 'templates') return 'Role templates';
    return `Teams${teams.length ? ` (${teams.length})` : ''}`;
  };

  return (
    <Layout flat title="Users">
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
                {tabLabel(t)}
              </button>
            ))}
          </div>

          {tab === 'manage' ? (
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-72 lg:shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xs text-muted2">{users.length} users</span>
                  <Dropdown value={uGroup} onChange={setUGroup} width={170} items={uGroupOptions}
                    trigger={<span className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-line bg-surface text-2xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-layout-rows" className="text-2xs" />{uGroupOptions.find((o) => o.value === uGroup)?.label || 'Group'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
                </div>
                <div className="card rounded-t-none overflow-y-auto" style={{ maxHeight: '72vh' }}>
                  {users.length === 0 ? <EmptyState text="No users" /> : (uGroup === 'none' ? [{ key: 'all', label: '', items: users }] : buildGroups(users, ugKey, ugLabel)).map((g) => (
                    <div key={g.key}>
                      {g.label && <div className="px-4 py-1.5 bg-surface2/70 text-2xs font-medium text-muted2 uppercase tracking-wide sticky top-0 z-10 capitalize">{g.label} · {g.items.length}</div>}
                      {g.items.map((x) => (
                        <button key={x.id} onClick={() => setSel(x.id)} className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 transition-colors ${sel === x.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2 border-l-2 border-l-transparent'}`}>
                          <Avatar name={x.full_name} size={32} />
                          <span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.full_name}</span><span className="block text-2xs text-muted truncate">{x.email}</span></span>
                          {x.status === 'suspended' && <span className="pill pill-red">susp</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {u ? (
                <div className="card flex-1 p-6 max-w-2xl rounded-t-none">
                  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-line">
                    <Avatar name={u.full_name} size={44} />
                    <div><h3 className="font-semibold text-content">{u.full_name}</h3><p className="text-sm text-muted">{u.email}{u.department ? ` · ${u.department}` : ''}</p></div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div><label className="label">Role</label><Select value={u.role} disabled={busy} onChange={(v) => patch({ role: v as any })} options={ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') }))} /></div>
                      <div><label className="label">Status</label><Select value={u.status} disabled={busy} onChange={(v) => patch({ status: v as any })} options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} /></div>
                    </div>
                    <div>
                      <label className="label">Role template</label>
                      <Select value={u.role_template_id || ''} disabled={busy} onChange={(v) => patch({ role_template_id: (v || null) as any })} options={[{ value: '', label: 'None (custom permissions)' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
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
          ) : tab === 'templates' ? (
            <div className="card rounded-t-none p-6">
              <p className="text-sm text-muted mb-4">Switch to the Roles section to manage role templates.</p>
              <button onClick={() => window.location.href = '/roles'} className="btn btn-primary">Manage roles</button>
            </div>
          ) : (
            /* ── Teams tab ─────────────────────────────────────────── */
            <div className="card rounded-t-none p-6">
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm text-muted">Organise members into teams for project assignment and visibility.</p>
                <button onClick={openNewTeam} className="btn btn-primary shrink-0">
                  <Icon name="ti-plus" />New team
                </button>
              </div>

              {teamsLoading ? <Spinner /> : teams.length === 0 ? (
                <EmptyState text="No teams yet — create one to get started" />
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teams.map((team) => {
                    const memberCount = team.members?.length || 0;
                    const previewMembers = (team.members || []).slice(0, 4);
                    const overflow = memberCount - previewMembers.length;
                    const isExpanded = expandedTeam === team.id;

                    return (
                      <div key={team.id} className="card p-5 flex flex-col">
                        {/* Header */}
                        <div className="flex items-start gap-2 mb-2">
                          <span
                            className="w-3 h-3 rounded-full mt-1 shrink-0"
                            style={{ background: team.color || '#64748b' }}
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-content text-sm leading-tight truncate">{team.name}</h3>
                            {team.description && (
                              <p className="text-2xs text-muted mt-0.5 line-clamp-2">{team.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Member preview */}
                        <div className="flex items-center gap-1.5 my-3 min-h-[28px]">
                          {memberCount === 0 ? (
                            <span className="text-2xs text-muted2">No members</span>
                          ) : (
                            <>
                              <div className="flex -space-x-1.5">
                                {previewMembers.map((m) => (
                                  <Avatar
                                    key={m.user_id}
                                    name={m.users?.full_name || '?'}
                                    size={24}
                                  />
                                ))}
                              </div>
                              <span className="text-2xs text-muted ml-1">
                                {memberCount} member{memberCount !== 1 ? 's' : ''}
                                {overflow > 0 && ` (+${overflow} more)`}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-auto pt-1">
                          <button
                            onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                            className="btn flex-1 text-xs"
                          >
                            <Icon name="ti-users" />
                            {isExpanded ? 'Hide' : 'Members'}
                          </button>
                          <button onClick={() => openEditTeam(team)} className="btn text-xs" title="Edit team">
                            <Icon name="ti-pencil" />
                          </button>
                          <button onClick={() => removeTeam(team)} className="btn text-rose-600 text-xs" title="Delete team">
                            <Icon name="ti-trash" />
                          </button>
                        </div>

                        {/* Inline members panel */}
                        {isExpanded && org && (
                          <TeamMembersPanel
                            team={team}
                            users={users}
                            orgId={org.id}
                            onRefresh={refreshTeams}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Team create/edit modal */}
          <Modal
            open={!!teamDraft}
            onClose={() => setTeamDraft(null)}
            title={teamDraftId ? 'Edit team' : 'New team'}
            icon={teamDraftId ? 'ti-edit' : 'ti-users-group'}
            size="sm"
            onSubmit={saveTeam}
            footer={
              <>
                <button onClick={saveTeam} disabled={teamBusy || !teamDraft?.name.trim()} className="btn btn-primary">
                  {teamBusy ? 'Saving…' : teamDraftId ? 'Save changes' : 'Create team'}
                </button>
                <button onClick={() => setTeamDraft(null)} className="btn">Cancel</button>
              </>
            }
          >
            {teamDraft && (
              <div className="space-y-4">
                <Field label="Name" required>
                  <input
                    autoFocus
                    value={teamDraft.name}
                    onChange={(e) => setTeamDraft((d) => d && ({ ...d, name: e.target.value }))}
                    className="input"
                    placeholder="e.g. Engineering"
                  />
                </Field>
                <Field label="Description">
                  <input
                    value={teamDraft.description}
                    onChange={(e) => setTeamDraft((d) => d && ({ ...d, description: e.target.value }))}
                    className="input"
                    placeholder="Optional short description"
                  />
                </Field>
                <Field label="Color">
                  <div className="flex items-center gap-2 mt-1">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setTeamDraft((d) => d && ({ ...d, color: c }))}
                        aria-label={c}
                        className={`w-6 h-6 rounded-full transition-shadow ${teamDraft.color === c ? 'ring-2 ring-offset-2 ring-accent' : 'hover:scale-110'}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </Modal>
        </>
      )}
    </Layout>
  );
}
