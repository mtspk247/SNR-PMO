import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { useTeams, useTasks } from '@/lib/queries';
import qk from '@/lib/queryKeys';
import { createTeam, updateTeam, deleteTeam, addTeamMember, removeTeamMember, getOrgUsers, getTimeEntriesRange } from '@/lib/db';
import { Team, Task, OrgUser, TimeEntry } from '@/lib/supabase';

const SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];
const DAY = 86400000;
const isOpen = (t: Task) => t.status !== 'Done' && t.status !== 'Cancelled';
const isOverdue = (t: Task) => !!t.due_date && t.status !== 'Done' && t.status !== 'Cancelled' && new Date(t.due_date) < new Date(new Date().toDateString());
const minsToH = (m: number) => Math.round((m / 60) * 10) / 10;

type Draft = { name: string; description: string; color: string };

export default function TeamsHub() {
  const org = useActiveOrg();
  const manage = can.manageMembers(org);
  const qc = useQueryClient();
  const { data: teams = [], isLoading } = useTeams();
  const { data: tasks = [] } = useTasks();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [times, setTimes] = useState<TimeEntry[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    getOrgUsers(org.id).then(setUsers).catch(() => {});
    getTimeEntriesRange(org.id, '2000-01-01', new Date(Date.now() + DAY).toISOString().slice(0, 10)).then(setTimes).catch(() => {});
  }, [org?.id]);

  const refresh = () => qc.invalidateQueries({ queryKey: qk.teams(org?.id) });

  const stats = useMemo(() => {
    const open = tasks.filter((t) => !t.parent_task_id && isOpen(t));
    const map = new Map<string, { open: number; overdue: number; hours: number }>();
    for (const tm of teams) {
      const ids = (tm.members || []).map((m) => m.user_id);
      const tt = open.filter((t) => t.team_id === tm.id || (!!t.assignee_id && ids.includes(t.assignee_id)));
      const hrs = minsToH(times.filter((e) => ids.includes(e.user_id)).reduce((s, e) => s + (e.duration_minutes || 0), 0));
      map.set(tm.id, { open: tt.length, overdue: tt.filter(isOverdue).length, hours: hrs });
    }
    return map;
  }, [teams, tasks, times]);

  const openNew = () => { setDraftId(undefined); setDraft({ name: '', description: '', color: SWATCHES[0] }); };
  const openEdit = (t: Team) => { setDraftId(t.id); setDraft({ name: t.name, description: t.description || '', color: t.color || SWATCHES[0] }); };
  const save = async () => {
    if (!draft?.name.trim() || !org) return;
    setBusy(true);
    try {
      if (draftId) await updateTeam(draftId, { name: draft.name.trim(), description: draft.description || null, color: draft.color || null });
      else await createTeam({ org_id: org.id, name: draft.name.trim(), description: draft.description || undefined, color: draft.color || undefined });
      setDraft(null); refresh();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const del = async (t: Team) => {
    if (!confirm(`Delete team "${t.name}"? Members keep their accounts — only the grouping is removed.`)) return;
    setBusy(true);
    try { await deleteTeam(t.id); refresh(); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const addMember = async (teamId: string, userId: string) => {
    if (!org || !userId) return;
    setBusy(true);
    try { await addTeamMember(teamId, userId, org.id); refresh(); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const removeMember = async (teamId: string, userId: string) => {
    setBusy(true);
    try { await removeTeamMember(teamId, userId); refresh(); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Teams">
      <PageHeader title="Teams" subtitle="Groups of people — see what each team is working on" icon="ti-users-group"
        action={manage ? <button className="btn btn-primary" onClick={openNew}><Icon name="ti-plus" />New team</button> : undefined} />

      {isLoading ? <Spinner /> : teams.length === 0 ? (
        <div className="card p-8"><EmptyState icon="ti-users-group" text={manage ? 'No teams yet — create one to group your people.' : 'No teams yet.'} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((tm) => {
            const st = stats.get(tm.id) || { open: 0, overdue: 0, hours: 0 };
            const members = tm.members || [];
            const ex = expanded === tm.id;
            const available = users.filter((u) => !members.some((m) => m.user_id === u.id));
            return (
              <div key={tm.id} className="card p-4 flex flex-col">
                <div className="flex items-start gap-2">
                  <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: tm.color || '#64748b' }} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/teams/${tm.id}`} className="font-semibold text-content text-sm leading-tight hover:text-accent">{tm.name}</Link>
                    {tm.description && <p className="text-2xs text-muted mt-0.5 line-clamp-2">{tm.description}</p>}
                  </div>
                  {manage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(tm)} className="text-muted2 hover:text-content" title="Edit team"><Icon name="ti-pencil" className="text-sm" /></button>
                      <button onClick={() => del(tm)} className="text-muted2 hover:text-rose-500" title="Delete team"><Icon name="ti-trash" className="text-sm" /></button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 my-3 min-h-[28px]">
                  {members.length === 0 ? <span className="text-2xs text-muted2">No members</span> : (
                    <>
                      <div className="flex -space-x-1.5">{members.slice(0, 5).map((m) => <Avatar key={m.user_id} name={m.users?.full_name || '?'} size={24} />)}</div>
                      <span className="text-2xs text-muted ml-1">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="rounded-lg bg-surface2 py-1.5"><div className="text-sm font-semibold tabular-nums text-content">{st.open}</div><div className="text-2xs text-muted2">Open</div></div>
                  <div className="rounded-lg bg-surface2 py-1.5"><div className={`text-sm font-semibold tabular-nums ${st.overdue > 0 ? 'text-rose-500' : 'text-content'}`}>{st.overdue}</div><div className="text-2xs text-muted2">Overdue</div></div>
                  <div className="rounded-lg bg-surface2 py-1.5"><div className="text-sm font-semibold tabular-nums text-content">{st.hours}</div><div className="text-2xs text-muted2">Hours</div></div>
                </div>

                <div className="flex gap-2 mt-auto">
                  <Link href={`/teams/${tm.id}`} className="btn flex-1 text-xs"><Icon name="ti-layout-dashboard" />Overview</Link>
                  {manage && <button onClick={() => setExpanded(ex ? null : tm.id)} className="btn text-xs"><Icon name="ti-users" />{ex ? 'Hide' : 'Members'}</button>}
                </div>

                {ex && manage && (
                  <div className="mt-3 pt-3 border-t border-line space-y-2">
                    {members.map((m) => (
                      <div key={m.user_id} className="flex items-center gap-2 text-sm">
                        <Avatar name={m.users?.full_name || '?'} size={20} />
                        <span className="flex-1 truncate text-content">{m.users?.full_name || 'Unknown'}</span>
                        <button onClick={() => removeMember(tm.id, m.user_id)} disabled={busy} className="text-muted2 hover:text-rose-500" title="Remove"><Icon name="ti-x" className="text-sm" /></button>
                      </div>
                    ))}
                    {available.length > 0 && (
                      <select className="input h-8 w-full text-sm" disabled={busy} value="" onChange={(e) => { if (e.target.value) addMember(tm.id, e.target.value); }}>
                        <option value="">+ Add member…</option>
                        {available.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                      </select>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal open onClose={() => setDraft(null)} title={draftId ? 'Edit team' : 'New team'} icon={draftId ? 'ti-edit' : 'ti-users-group'} size="sm"
          footer={<><button className="btn" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}
          onSubmit={() => { if (!busy && draft.name.trim()) save(); }}>
          <Field label="Name" required><input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Design" autoFocus /></Field>
          <Field label="Description" hint="Optional"><input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What this team does" /></Field>
          <Field label="Colour">
            <div className="flex gap-1.5 mt-1">{SWATCHES.map((c) => <button key={c} type="button" onClick={() => setDraft({ ...draft, color: c })} className={`w-6 h-6 rounded-full border-2 ${draft.color === c ? 'border-content' : 'border-transparent'}`} style={{ background: c }} />)}</div>
          </Field>
        </Modal>
      )}
    </Layout>
  );
}
