import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { useProjects } from '@/lib/queries';
import { listGuests, revokeGuest, createGuest, GuestRow } from '@/lib/db';

export default function GuestsPage() {
  const org = useActiveOrg();
  const manage = can.manageMembers(org);
  const { data: projects = [] } = useProjects();
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [invite, setInvite] = useState<{ name: string; email: string; projectId: string } | null>(null);

  const load = async () => {
    try { setGuests(await listGuests()); }
    catch (e: any) { setErr(e?.message || 'Failed to load guests'); setGuests([]); }
  };
  useEffect(() => { if (org?.id) load(); /* eslint-disable-next-line */ }, [org?.id]);

  const totals = useMemo(() => {
    const g = guests || [];
    return { total: g.length, active: g.filter((x) => x.is_linked).length, pending: g.filter((x) => !x.is_linked).length };
  }, [guests]);

  const submitInvite = async () => {
    if (!invite || !org || !invite.name.trim() || !invite.email.trim() || !invite.projectId || busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await createGuest({ org_id: org.id, email: invite.email.trim(), name: invite.name.trim(), project_id: invite.projectId });
      setMsg(`Invited ${invite.email.trim()}.`);
      setInvite(null);
      await load();
    } catch (e: any) { setErr(e?.message || 'Could not invite guest'); }
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

  return (
    <Layout flat title="Guests">
      <PageHeader title="Guests" subtitle="External people with limited, project-scoped access" icon="ti-user-question"
        action={<button className="btn btn-primary" onClick={() => setInvite({ name: '', email: '', projectId: projects[0]?.id || '' })}><Icon name="ti-user-plus" />Invite guest</button>} />

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
            <div className="card overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 font-medium">Guest</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Projects</th>
                    <th className="px-4 py-3 font-medium">Added</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => (
                    <tr key={g.user_id + g.org_id} className="border-t border-line hover:bg-surface2/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={g.full_name || g.email} size={26} />
                          <div className="min-w-0"><span className="block font-medium text-content truncate">{g.full_name || g.email}</span><span className="block text-2xs text-muted truncate">{g.email}</span></div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className={`pill ${g.is_linked ? 'pill-green' : 'pill-amber'}`}>{g.is_linked ? 'Active' : 'Pending'}</span></td>
                      <td className="px-4 py-3">
                        {g.projects.length === 0 ? <span className="text-2xs text-muted2">None</span> : (
                          <div className="flex flex-wrap gap-1">{g.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="chip hover:text-content">{p.name}</Link>)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{new Date(g.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-right"><button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => revoke(g)}><Icon name="ti-user-minus" className="text-sm" />Revoke</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          )}
        </>
      )}

      {invite && (
        <Modal open onClose={() => setInvite(null)} title="Invite a guest" icon="ti-user-plus" size="sm"
          footer={<><button className="btn" onClick={() => setInvite(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !invite.name.trim() || !invite.email.trim() || !invite.projectId} onClick={submitInvite}>{busy ? 'Inviting…' : 'Invite guest'}</button></>}
          onSubmit={() => submitInvite()}>
          <Field label="Name" required><input className="input" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Full name" autoFocus /></Field>
          <Field label="Email" required><input className="input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="person@company.com" /></Field>
          <Field label="Project" required hint="Guests get viewer access to this project">
            <select className="input" value={invite.projectId} onChange={(e) => setInvite({ ...invite, projectId: e.target.value })}>
              <option value="">Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </Layout>
  );
}
