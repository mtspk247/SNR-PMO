import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Select from '@/components/Select';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { getAdminUsers, createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, userAffiliations, UserAffiliation } from '@/lib/db';
import { AdminUser, Team } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { useTeams } from '@/lib/queries';
import Dropdown from '@/components/Dropdown';
import { buildGroups } from '@/components/ViewControls';
import RolesManager from '@/components/RolesManager';
import AvatarPicker from '@/components/AvatarPicker';
import { avatarSrc } from '@/lib/db';
import qk from '@/lib/queryKeys';

const SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
type Tab = 'manage' | 'templates' | 'teams';
type TeamDraft = { id?: string; name: string; description: string; color: string; avatar: string };
const emptyTeamDraft = (): TeamDraft => ({ name: '', description: '', color: SWATCHES[0], avatar: '' });

function TeamMembersPanel({ team, users, orgId, onRefresh }: { team: Team; users: AdminUser[]; orgId: string; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const members = team.members || [];
  const memberIds = new Set(members.map((m) => m.user_id));
  const available = users.filter((u) => !memberIds.has(u.id));
  const remove = async (userId: string) => { setBusy(true); try { await removeTeamMember(team.id, userId); onRefresh(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  const add = async (userId: string) => { if (!userId) return; setBusy(true); try { await addTeamMember(team.id, userId, orgId); onRefresh(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="mt-3 border-t border-line pt-3 space-y-2">
      {members.length === 0 && <p className="text-2xs text-muted2">No members yet</p>}
      {members.map((m) => {
        const name = m.users?.full_name || m.user_id;
        return (
          <div key={m.user_id} className="flex items-center gap-2 text-sm">
            <Avatar name={name} size={24} />
            <span className="flex-1 truncate text-content">{name}</span>
            <button onClick={() => remove(m.user_id)} disabled={busy} className="text-muted hover:text-rose-500 transition-colors" title="Remove member"><Icon name="ti-x" className="text-xs" /></button>
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
  const router = useRouter();
  const qc = useQueryClient();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('manage');
  const [uGroup, setUGroup] = useState('none');
  const [uView, setUView] = useState<'list' | 'cards'>('list');
  const [affs, setAffs] = useState<Record<string, { companies: string[]; projects: string[] }>>({});
  const uGroupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'role', label: 'Group by role' },
    { value: 'status', label: 'Group by status' },
    { value: 'team', label: 'Group by team' },
    { value: 'company', label: 'Group by company' },
    { value: 'department', label: 'Group by department' },
  ];
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const teamsFor = (uid: string) => teams.filter((t) => (t.members || []).some((m) => m.user_id === uid)).map((t) => t.name);
  const companiesFor = (uid: string) => affs[uid]?.companies || [];
  const ugKey = (x: AdminUser) => {
    switch (uGroup) {
      case 'role': return x.role || 'viewer';
      case 'status': return x.status || 'active';
      case 'team': { const ts = teamsFor(x.id); return ts[0] || '__noteam__'; }
      case 'company': { const cs = companiesFor(x.id); return cs[0] || '__nocompany__'; }
      case 'department': return x.department || '__nodept__';
      default: return 'all';
    }
  };
  const ugLabel = (k: string) => {
    switch (uGroup) {
      case 'role': return k.replace('_', ' ');
      case 'status': return k === 'suspended' ? 'Suspended' : 'Active';
      case 'team': return k === '__noteam__' ? 'No team' : k;
      case 'company': return k === '__nocompany__' ? 'No company' : k;
      case 'department': return k === '__nodept__' ? 'No department' : k;
      default: return k;
    }
  };

  const [teamDraft, setTeamDraft] = useState<TeamDraft | null>(null);
  const [teamDraftId, setTeamDraftId] = useState<string | undefined>(undefined);
  const [teamBusy, setTeamBusy] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [tView, setTView] = useState<'cards' | 'list'>('cards');
  const [tGroup, setTGroup] = useState('none');
  const tGroupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'status', label: 'Group by status' },
    { value: 'size', label: 'Group by size' },
  ];
  const tcount = (t: Team) => t.members?.length || 0;
  const tgKey = (t: Team) => { const c = tcount(t); switch (tGroup) { case 'status': return c > 0 ? 'active' : 'empty'; case 'size': return c === 0 ? 'empty' : c <= 5 ? 'small' : c <= 15 ? 'medium' : 'large'; default: return 'all'; } };
  const tgLabel = (k: string) => ({ active: 'Active', empty: 'Empty', small: 'Small (1–5)', medium: 'Medium (6–15)', large: 'Large (16+)' } as Record<string, string>)[k] || k;

  useEffect(() => {
    getAdminUsers().then(setUsers).finally(() => setLoading(false));
    if (org?.id) userAffiliations(org.id).then((rows: UserAffiliation[]) => setAffs(Object.fromEntries(rows.map((r) => [r.user_id, { companies: r.companies || [], projects: r.projects || [] }])))).catch(() => {});
  }, [org?.id]);

  if (!can.manageMembers(org)) {
    return <Layout flat title="Users"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to manage users.</div></Layout>;
  }

  const open = (id: string) => router.push(`/users/${id}`);
  const openNewTeam = () => { setTeamDraftId(undefined); setTeamDraft(emptyTeamDraft()); };
  const openEditTeam = (t: Team) => { setTeamDraftId(t.id); setTeamDraft({ name: t.name, description: t.description || '', color: t.color || SWATCHES[0], avatar: t.avatar || '' }); };
  const saveTeam = async () => {
    if (!teamDraft || !org || !teamDraft.name.trim()) return;
    setTeamBusy(true);
    try {
      if (teamDraftId) await updateTeam(teamDraftId, { name: teamDraft.name.trim(), description: teamDraft.description || null, color: teamDraft.color || null, avatar: teamDraft.avatar || null });
      else await createTeam({ org_id: org.id, name: teamDraft.name.trim(), description: teamDraft.description || undefined, color: teamDraft.color || undefined, avatar: teamDraft.avatar || undefined });
      await qc.invalidateQueries({ queryKey: qk.teams(org?.id) });
      setTeamDraft(null);
    } catch (e: any) { alert(e.message); } finally { setTeamBusy(false); }
  };
  const removeTeam = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"? This will remove all members from the team.`)) return;
    try { await deleteTeam(t.id); await qc.invalidateQueries({ queryKey: qk.teams(org?.id) }); } catch (e: any) { alert(e.message); }
  };
  const refreshTeams = () => qc.invalidateQueries({ queryKey: qk.teams(org?.id) });

  const tabLabel = (t: Tab) => t === 'manage' ? 'Manage users' : t === 'templates' ? 'Roles' : `Teams${teams.length ? ` (${teams.length})` : ''}`;

  const UserRow = ({ x }: { x: AdminUser }) => (
    <button onClick={() => open(x.id)} className="w-full text-left grid grid-cols-12 items-center gap-3 px-4 py-3 border-b border-line last:border-0 hover:bg-surface2 transition-colors">
      <span className="col-span-12 sm:col-span-4 flex items-center gap-3 min-w-0"><Avatar name={x.full_name} size={32} /><span className="min-w-0"><span className="block text-sm font-medium truncate">{x.full_name}</span><span className="block text-2xs text-muted truncate">{x.email}</span></span></span>
      <span className="hidden sm:block sm:col-span-2 text-xs text-contentsoft truncate">{x.job_title || '—'}</span>
      <span className="hidden sm:block sm:col-span-2"><span className="pill pill-gray capitalize">{(x.role || 'viewer').replace('_', ' ')}</span></span>
      <span className="hidden sm:block sm:col-span-2 text-xs text-contentsoft truncate">{teamsFor(x.id)[0] || '—'}{teamsFor(x.id).length > 1 ? ` +${teamsFor(x.id).length - 1}` : ''}</span>
      <span className="hidden sm:block sm:col-span-1 text-xs text-contentsoft truncate">{companiesFor(x.id)[0] || x.company?.name || '—'}</span>
      <span className="hidden sm:flex sm:col-span-1 justify-end">{x.status === 'suspended' ? <span className="pill pill-red">Suspended</span> : <span className="pill pill-green">Active</span>}</span>
    </button>
  );

  return (
    <Layout flat title="Users">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Users & roles" subtitle="Everyone in your workspace — open a user to manage profile, access, notifications and more" />

          <div className="card rounded-b-none border-b-0 flex gap-1 px-4 bg-surface2/50 sticky top-0 z-10">
            {(['manage', 'templates', 'teams'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-b-accent text-content' : 'border-b-transparent text-muted hover:text-content'}`}>{tabLabel(t)}</button>
            ))}
          </div>

          {tab === 'manage' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between mb-1 mt-2">
                <span className="text-2xs text-muted2">{users.length} users</span>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center rounded-md border border-line bg-surface p-0.5 h-7">
                    {(['list', 'cards'] as const).map((vv) => (
                      <button key={vv} onClick={() => setUView(vv)} title={vv === 'list' ? 'List' : 'Cards'} className={`h-6 px-1.5 rounded inline-flex items-center text-2xs transition ${uView === vv ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content'}`}><Icon name={vv === 'list' ? 'ti-list' : 'ti-layout-grid'} className="text-2xs" /></button>
                    ))}
                  </div>
                  <Dropdown value={uGroup} onChange={setUGroup} width={180} items={uGroupOptions} trigger={<span className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-line bg-surface text-2xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-layout-rows" className="text-2xs" />{uGroupOptions.find((o) => o.value === uGroup)?.label || 'Group'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
                </div>
              </div>
              <div className="card overflow-y-auto" style={{ maxHeight: '74vh' }}>
                {uView === 'list' && (
                  <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 bg-surface2/70 text-2xs font-medium text-muted2 uppercase tracking-wide sticky top-0 z-10">
                    <span className="col-span-4">User</span><span className="col-span-2">Designation</span><span className="col-span-2">Role</span><span className="col-span-2">Team</span><span className="col-span-1">Company</span><span className="col-span-1 text-right">Status</span>
                  </div>
                )}
                {users.length === 0 ? <EmptyState text="No users" /> : (uGroup === 'none' ? [{ key: 'all', label: '', items: users }] : buildGroups(users, ugKey, ugLabel)).map((g) => (
                  <div key={g.key}>
                    {g.label && <div className="px-4 py-1.5 bg-surface2/70 text-2xs font-medium text-muted2 uppercase tracking-wide capitalize">{g.label} · {g.items.length}</div>}
                    {uView === 'cards' ? (
                      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 p-3">
                        {g.items.map((x) => (
                          <button key={x.id} onClick={() => open(x.id)} className="text-left rounded-xl border border-line hover:border-borderstrong p-3 transition">
                            <div className="flex items-center gap-2.5"><Avatar name={x.full_name} size={36} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium truncate">{x.full_name}</span><span className="block text-2xs text-muted truncate">{x.email}</span></span>{x.status === 'suspended' && <span className="pill pill-red">susp</span>}</div>
                            <div className="flex flex-wrap gap-1 mt-2.5"><span className="pill pill-gray capitalize">{(x.role || 'viewer').replace('_', ' ')}</span>{x.job_title && <span className="pill pill-gray">{x.job_title}</span>}{teamsFor(x.id).slice(0, 1).map((t) => <span key={t} className="pill pill-gray">{t}</span>)}</div>
                          </button>
                        ))}
                      </div>
                    ) : g.items.map((x) => <UserRow key={x.id} x={x} />)}
                  </div>
                ))}
              </div>
            </div>
          ) : tab === 'templates' ? (
            <div className="card rounded-t-none p-5 sm:p-6"><RolesManager /></div>
          ) : (
            <div className="card rounded-t-none p-6">
              <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                <p className="text-sm text-muted">Organise members into teams for project assignment and visibility.</p>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center rounded-md border border-line bg-surface p-0.5 h-7">
                    {(['cards', 'list'] as const).map((vv) => (
                      <button key={vv} onClick={() => setTView(vv)} title={vv === 'list' ? 'List' : 'Cards'} className={`h-6 px-1.5 rounded inline-flex items-center text-2xs transition ${tView === vv ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content'}`}><Icon name={vv === 'list' ? 'ti-list' : 'ti-layout-grid'} className="text-2xs" /></button>
                    ))}
                  </div>
                  <Dropdown value={tGroup} onChange={setTGroup} width={180} items={tGroupOptions} trigger={<span className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-line bg-surface text-2xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-layout-rows" className="text-2xs" />{tGroupOptions.find((o) => o.value === tGroup)?.label || 'Group'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
                  <button onClick={openNewTeam} className="btn btn-primary shrink-0 h-7 py-0"><Icon name="ti-plus" />New team</button>
                </div>
              </div>
              {teamsLoading ? <Spinner /> : teams.length === 0 ? <EmptyState text="No teams yet — create one to get started" /> : (
                <div className="space-y-5">
                  {(tGroup === 'none' ? [{ key: 'all', label: '', items: teams }] : buildGroups(teams, tgKey, tgLabel)).map((g) => (
                    <div key={g.key}>
                      {g.label && <div className="text-2xs font-medium text-muted2 uppercase tracking-wide mb-2 capitalize">{g.label} · {g.items.length}</div>}
                      {tView === 'cards' ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {g.items.map((team) => {
                            const memberCount = team.members?.length || 0;
                            const previewMembers = (team.members || []).slice(0, 4);
                            const overflow = memberCount - previewMembers.length;
                            const isExpanded = expandedTeam === team.id;
                            return (
                              <div key={team.id} className="card p-5 flex flex-col">
                                <div className="flex items-start gap-2 mb-2">
                                  <span className="mt-0.5 shrink-0">{team.avatar ? <Avatar name={team.name} size={28} src={avatarSrc(team.avatar)} /> : <span className="w-7 h-7 rounded-full grid place-items-center text-xs font-semibold text-white" style={{ background: team.color || '#64748b' }}>{(team.name || '?').charAt(0).toUpperCase()}</span>}</span>
                                  <div className="min-w-0 flex-1"><h3 className="font-semibold text-content text-sm leading-tight truncate">{team.name}</h3>{team.description && <p className="text-2xs text-muted mt-0.5 line-clamp-2">{team.description}</p>}</div>
                                </div>
                                <div className="flex items-center gap-1.5 my-3 min-h-[28px]">
                                  {memberCount === 0 ? <span className="text-2xs text-muted2">No members</span> : (
                                    <><div className="flex -space-x-1.5">{previewMembers.map((m) => <Avatar key={m.user_id} name={m.users?.full_name || '?'} size={24} />)}</div><span className="text-2xs text-muted ml-1">{memberCount} member{memberCount !== 1 ? 's' : ''}{overflow > 0 && ` (+${overflow} more)`}</span></>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-auto pt-1">
                                  <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="btn flex-1 text-xs"><Icon name="ti-users" />{isExpanded ? 'Hide' : 'Members'}</button>
                                  <button onClick={() => openEditTeam(team)} className="btn text-xs" title="Edit team"><Icon name="ti-pencil" /></button>
                                  <button onClick={() => removeTeam(team)} className="btn text-rose-600 text-xs" title="Delete team"><Icon name="ti-trash" /></button>
                                </div>
                                {isExpanded && org && <TeamMembersPanel team={team} users={users} orgId={org.id} onRefresh={refreshTeams} />}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="card divide-y divide-line">
                          {g.items.map((team) => {
                            const memberCount = team.members?.length || 0;
                            const isExpanded = expandedTeam === team.id;
                            return (
                              <div key={team.id} className="px-4 py-2.5">
                                <div className="flex items-center gap-3">
                                  {team.avatar ? <Avatar name={team.name} size={22} src={avatarSrc(team.avatar)} /> : <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-2xs font-semibold text-white shrink-0" style={{ background: team.color || '#64748b' }}>{(team.name || '?').charAt(0).toUpperCase()}</span>}
                                  <div className="min-w-0 flex-1"><span className="block text-sm font-medium text-content truncate">{team.name}</span>{team.description && <span className="block text-2xs text-muted truncate">{team.description}</span>}</div>
                                  <div className="hidden sm:flex -space-x-1.5">{(team.members || []).slice(0, 4).map((m) => <Avatar key={m.user_id} name={m.users?.full_name || '?'} size={20} />)}</div>
                                  <span className="text-2xs text-muted2 w-20 text-right shrink-0">{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                                  <div className="flex gap-1 shrink-0">
                                    <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="btn text-xs h-7 py-0"><Icon name="ti-users" />{isExpanded ? 'Hide' : 'Members'}</button>
                                    <button onClick={() => openEditTeam(team)} className="btn text-xs h-7 py-0" title="Edit team"><Icon name="ti-pencil" /></button>
                                    <button onClick={() => removeTeam(team)} className="btn text-rose-600 text-xs h-7 py-0" title="Delete team"><Icon name="ti-trash" /></button>
                                  </div>
                                </div>
                                {isExpanded && org && <TeamMembersPanel team={team} users={users} orgId={org.id} onRefresh={refreshTeams} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Modal open={!!teamDraft} onClose={() => setTeamDraft(null)} title={teamDraftId ? 'Edit team' : 'New team'} icon={teamDraftId ? 'ti-edit' : 'ti-users-group'} size="sm" onSubmit={saveTeam}
            footer={<><button onClick={saveTeam} disabled={teamBusy || !teamDraft?.name.trim()} className="btn btn-primary">{teamBusy ? 'Saving…' : teamDraftId ? 'Save changes' : 'Create team'}</button><button onClick={() => setTeamDraft(null)} className="btn">Cancel</button></>}>
            {teamDraft && (
              <div className="space-y-4">
                <Field label="Name" required><input autoFocus value={teamDraft.name} onChange={(e) => setTeamDraft((d) => d && ({ ...d, name: e.target.value }))} className="input" placeholder="e.g. Engineering" /></Field>
                <Field label="Description"><input value={teamDraft.description} onChange={(e) => setTeamDraft((d) => d && ({ ...d, description: e.target.value }))} className="input" placeholder="Optional short description" /></Field>
                <Field label="Avatar"><AvatarPicker value={teamDraft.avatar} name={teamDraft.name || 'Team'} onChange={(v) => setTeamDraft((d) => d && ({ ...d, avatar: v }))} allowUpload={false} size={44} /></Field>
                <Field label="Color"><div className="flex items-center gap-2 mt-1">{SWATCHES.map((c) => <button key={c} type="button" onClick={() => setTeamDraft((d) => d && ({ ...d, color: c }))} aria-label={c} className={`w-6 h-6 rounded-full transition-shadow ${teamDraft.color === c ? 'ring-2 ring-offset-2 ring-accent' : 'hover:scale-110'}`} style={{ background: c }} />)}</div></Field>
              </div>
            )}
          </Modal>
        </>
      )}
    </Layout>
  );
}
