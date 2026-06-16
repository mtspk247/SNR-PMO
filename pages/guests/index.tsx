import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/Select';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { useProjects } from '@/lib/queries';
import Dropdown from '@/components/Dropdown';
import { buildGroups } from '@/components/ViewControls';
import { listGuests, revokeGuest, createGuest, guestSetAccess, GuestRow } from '@/lib/db';

const LEVEL_META: Record<string, { label: string; pill: string; desc: string }> = {
  viewer: { label: 'Viewer', pill: 'pill-gray', desc: 'Oversight — view, comment, reports, submit documents, propose changes. No direct edits.' },
  collaborator: { label: 'Collaborator', pill: 'pill-amber', desc: 'Collaborates — can be assigned work and proposes edits for approval.' },
  contributor: { label: 'Contributor', pill: 'pill-green', desc: 'Delivers — direct edits and time logging on their tasks.' },
};
const lvlDefault = (level: string, perm: 'direct_edit' | 'log_work') => level === 'contributor';

export default function GuestsPage() {
  const org = useActiveOrg();
  const router = useRouter();
  const manage = can.manageMembers(org);
  const { data: projects = [] } = useProjects();
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [invite, setInvite] = useState<{ name: string; email: string; projectId: string; level: string } | null>(null);
  const [access, setAccess] = useState<{ g: GuestRow; level: string; directEdit: boolean; logWork: boolean } | null>(null);

  const load = async () => {
    try { setGuests(await listGuests()); }
    catch (e: any) { setErr(e?.message || 'Failed to load guests'); setGuests([]); }
  };
  useEffect(() => { if (org?.id) load(); /* eslint-disable-next-line */ }, [org?.id]);

  const totals = useMemo(() => {
    const g = guests || [];
    return { total: g.length, active: g.filter((x) => x.is_linked).length, pending: g.filter((x) => !x.is_linked).length };
  }, [guests]);
  const [groupBy, setGroupBy] = useState('none');
  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'level', label: 'Group by access level' },
    { value: 'status', label: 'Group by status' },
  ];
  const gKey = (g: GuestRow) => groupBy === 'level' ? (g.guest_level || 'viewer') : groupBy === 'status' ? (g.is_linked ? 'active' : 'pending') : 'all';
  const gLabel = (k: string) => groupBy === 'level' ? (LEVEL_META[k]?.label || k) : groupBy === 'status' ? (k === 'active' ? 'Active' : 'Pending') : k;
  const groups = groupBy === 'none' ? [{ key: 'all', label: '', items: guests || [] }] : buildGroups(guests || [], gKey, gLabel);

  const submitInvite = async () => {
    if (!invite || !org || !invite.name.trim() || !invite.email.trim() || !invite.projectId || busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await createGuest({ org_id: org.id, email: invite.email.trim(), name: invite.name.trim(), project_id: invite.projectId, level: invite.level });
      setMsg(`Invited ${invite.email.trim()} as ${LEVEL_META[invite.level].label}.`);
      setInvite(null);
      await load();
    } catch (e: any) { setErr(e?.message || 'Could not invite guest'); }
    finally { setBusy(false); }
  };

  const openAccess = (g: GuestRow) => setAccess({
    g, level: g.guest_level || 'viewer',
    directEdit: g.guest_perms?.direct_edit ?? lvlDefault(g.guest_level || 'viewer', 'direct_edit'),
    logWork: g.guest_perms?.log_work ?? lvlDefault(g.guest_level || 'viewer', 'log_work'),
  });
  const changeLevel = (level: string) => setAccess((a) => a && { ...a, level, directEdit: lvlDefault(level, 'direct_edit'), logWork: lvlDefault(level, 'log_work') });
  const saveAccess = async () => {
    if (!access || busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await guestSetAccess(access.g.user_id, access.g.org_id, access.level, { direct_edit: access.directEdit, log_work: access.logWork });
      setMsg('Guest access updated.'); setAccess(null); await load();
    } catch (e: any) { setErr(e?.message || 'Could not update access'); }
    finally { setBusy(false); }
  };

  const revoke = async (g: GuestRow) => {
    if (busy) return;
    if (!confirm(`Revoke ${g.full_name || g.email}? They lose access to all projects in ${g.org_name}.`)) return;
    setBusy(true); setErr(''); setMsg('');
    try { await revokeGuest(g.user_id, g.org_id); setMsg('Guest revoked.'); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not revoke guest'); }
    finally { setBusy(false); }
  };

  if (!manage) {
    return <Layout flat title="Guests"><EmptyState icon="ti-lock" title="Admins only" text="Guest management is available to organization owners and admins." /></Layout>;
  }

  const GuestTable = ({ items }: { items: GuestRow[] }) => (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm list-card">
        <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 font-medium">Guest</th>
            <th className="px-4 py-3 font-medium">Access</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Projects</th>
            <th className="px-4 py-3 font-medium">Added</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => {
            const meta = LEVEL_META[g.guest_level] || LEVEL_META.viewer;
            const directEdit = g.guest_perms?.direct_edit ?? lvlDefault(g.guest_level || 'viewer', 'direct_edit');
            return (
              <tr key={g.user_id + g.org_id} className="border-t border-line hover:bg-surface2/50 cursor-pointer" onClick={() => router.push(`/guests/${g.user_id}`)}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={g.full_name || g.email} size={26} />
                    <div className="min-w-0"><Link href={`/guests/${g.user_id}`} className="block font-medium text-content hover:text-accent truncate">{g.full_name || g.email}</Link><span className="block text-2xs text-muted truncate">{g.email}</span></div>
                  </div>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openAccess(g)} className="inline-flex items-center gap-1.5 group" title="Edit access">
                    <span className={`pill ${meta.pill}`}>{meta.label}</span>
                    {directEdit && <span className="text-2xs text-amber-600" title="Can edit directly"><Icon name="ti-pencil" className="text-xs" /></span>}
                    <Icon name="ti-settings" className="text-muted2 text-sm opacity-0 group-hover:opacity-100" />
                  </button>
                </td>
                <td className="px-4 py-3"><span className={`pill ${g.is_linked ? 'pill-green' : 'pill-amber'}`}>{g.is_linked ? 'Active' : 'Pending'}</span></td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {g.projects.length === 0 ? <span className="text-2xs text-muted2">None</span> : (
                    <div className="flex flex-wrap gap-1">{g.projects.map((pr) => <Link key={pr.id} href={`/projects/${pr.id}`} className="chip hover:text-content">{pr.name}</Link>)}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{new Date(g.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <Link href={`/guests/${g.user_id}`} className="btn h-8 py-0 mr-1"><Icon name="ti-user" className="text-sm" />Details</Link>
                  <button className="btn h-8 py-0 mr-1" disabled={busy} onClick={() => openAccess(g)}><Icon name="ti-adjustments" className="text-sm" />Access</button>
                  <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => revoke(g)}><Icon name="ti-user-minus" className="text-sm" />Revoke</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </div>
  );
  return (
    <Layout flat title="Guests">
      <PageHeader title="Guests" subtitle="External people with limited, project-scoped access" icon="ti-user-question"
        action={<button className="btn btn-primary" onClick={() => setInvite({ name: '', email: '', projectId: projects[0]?.id || '', level: 'viewer' })}><Icon name="ti-user-plus" />Invite guest</button>} />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}

      {guests === null ? <Spinner /> : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard label="Guests" value={totals.total} icon="ti-users" />
            <StatCard label="Active" value={totals.active} hint="Signed in" hintTone="up" icon="ti-user-check" />
            <StatCard label="Pending" value={totals.pending} hint="Invite not yet accepted" icon="ti-user-exclamation" />
          </div>

          {guests.length === 0 ? (
            <div className="card p-8"><EmptyState icon="ti-user-question" text="No guests yet — invite an external collaborator to a project." /></div>
          ) : (
            <>
              <div className="flex items-center justify-end mb-3">
                <Dropdown value={groupBy} onChange={setGroupBy} width={190} items={groupOptions}
                  trigger={<span className="btn h-9 cursor-pointer"><Icon name="ti-layout-rows" className="text-sm" />{groupOptions.find((o) => o.value === groupBy)?.label || 'Group'}<Icon name="ti-chevron-down" className="text-2xs text-muted2" /></span>} />
              </div>
              <div className="space-y-5">
                {groups.map((grp) => (
                  <div key={grp.key}>
                    {grp.label && <div className="flex items-center gap-2 mb-2"><h3 className="text-sm font-semibold text-content">{grp.label}</h3><span className="text-2xs text-muted2 bg-surface2 rounded-full px-2 py-0.5">{grp.items.length}</span></div>}
                    <GuestTable items={grp.items} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {invite && (
        <Modal open onClose={() => setInvite(null)} title="Invite a guest" icon="ti-user-plus" size="sm"
          footer={<><button className="btn" onClick={() => setInvite(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !invite.name.trim() || !invite.email.trim() || !invite.projectId} onClick={submitInvite}>{busy ? 'Inviting…' : 'Invite guest'}</button></>}
          onSubmit={() => submitInvite()}>
          <Field label="Name" required><input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Full name" autoFocus /></Field>
          <Field label="Email" required><input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="person@company.com" /></Field>
          <Field label="Project" required hint="Guests get access to this project"><Select value={invite.projectId} onChange={(v) => setInvite({ ...invite, projectId: v })} options={[{ value: '', label: 'Select a project…' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} /></Field>
          <Field label="Access level"><Select value={invite.level} onChange={(v) => setInvite({ ...invite, level: v })} options={[...Object.entries(LEVEL_META).map(([k, v]) => ({ value: k, label: v.label }))]} /><p className="text-2xs text-muted mt-1">{LEVEL_META[invite.level].desc}</p></Field>
        </Modal>
      )}

      {access && (
        <Modal open onClose={() => setAccess(null)} title={`Access — ${access.g.full_name || access.g.email}`} icon="ti-adjustments" size="sm"
          footer={<><button className="btn" onClick={() => setAccess(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={saveAccess}>{busy ? 'Saving…' : 'Save access'}</button></>}
          onSubmit={() => saveAccess()}>
          <Field label="Level">
            <div className="space-y-1.5">
              {Object.entries(LEVEL_META).map(([k, v]) => (
                <label key={k} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition ${access.level === k ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface2'}`}>
                  <input type="radio" name="lvl" className="mt-0.5 accent-accent" checked={access.level === k} onChange={() => changeLevel(k)} />
                  <span className="min-w-0"><span className="block text-sm font-medium text-content">{v.label}</span><span className="block text-2xs text-muted">{v.desc}</span></span>
                </label>
              ))}
            </div>
          </Field>
          <Field label="Overrides" hint="Fine-tune on top of the level">
            <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="accent-accent w-4 h-4" checked={access.directEdit} onChange={(e) => setAccess({ ...access, directEdit: e.target.checked })} /><span className={access.directEdit ? 'text-content' : 'text-muted'}>Allow direct edits (otherwise changes go through approval)</span></label>
            <label className="flex items-center gap-2 text-sm py-1"><input type="checkbox" className="accent-accent w-4 h-4" checked={access.logWork} onChange={(e) => setAccess({ ...access, logWork: e.target.checked })} /><span className={access.logWork ? 'text-content' : 'text-muted'}>Allow time logging</span></label>
          </Field>
        </Modal>
      )}
    </Layout>
  );
}
