import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import {
  getOrgCompanies, createOrgCompany, updateOrgCompany, deleteOrgCompany, getProjects, getOrgUsers,
  getMyCompanyManagerships, listCompanyMembers, addCompanyMember,
  updateCompanyMemberRole, removeCompanyMember,
} from '@/lib/db';
import { OrgCompany, Project, OrgUser, CompanyMember, MemberRole } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

export default function CompaniesPage() {
  const org = useActiveOrg();
  const userId = useAuthStore((s) => s.user?.id) || null;
  const admin = can.manageMembers(org);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [mgrIds, setMgrIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [nc, setNc] = useState({ name: '', description: '' });

  // edit modal
  const [editCo, setEditCo] = useState<OrgCompany | null>(null);
  const [ec, setEc] = useState({ name: '', description: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  // member-management modal
  const [memCo, setMemCo] = useState<OrgCompany | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [memErr, setMemErr] = useState('');
  const [addUser, setAddUser] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('member');
  const [memBusy, setMemBusy] = useState(false);

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    Promise.all([
      getOrgCompanies(), getProjects(), getOrgUsers(),
      userId ? getMyCompanyManagerships(userId) : Promise.resolve<string[]>([]),
    ])
      .then(([c, p, u, m]) => { setCompanies(c); setProjects(p); setOrgUsers(u); setMgrIds(new Set(m)); })
      .finally(() => setLoading(false));
  }, [org?.id, userId]);

  const projectCount = (cid: string) => projects.filter((p) => p.company_id === cid).length;
  const canManage = (c: OrgCompany) => admin || mgrIds.has(c.id);

  const submit = async () => {
    if (!org || !nc.name.trim()) return;
    setBusy(true); setErr('');
    try {
      const c = await createOrgCompany({ name: nc.name.trim(), org_id: org.id, description: nc.description.trim() || null });
      setCompanies((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNew(false); setNc({ name: '', description: '' });
    } catch (e: any) { setErr(e.message || 'Could not create company'); }
    finally { setBusy(false); }
  };

  const openEdit = (c: OrgCompany) => {
    setEditCo(c); setEc({ name: c.name, description: c.description || '' }); setEditErr('');
  };
  const submitEdit = async () => {
    if (!editCo || !ec.name.trim()) return;
    setEditBusy(true); setEditErr('');
    try {
      const u = await updateOrgCompany(editCo.id, { name: ec.name.trim(), description: ec.description.trim() || null });
      setCompanies((prev) => prev.map((x) => (x.id === u.id ? u : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditCo(null);
    } catch (e: any) { setEditErr(e.message || 'Could not save changes'); }
    finally { setEditBusy(false); }
  };

  const openMembers = async (c: OrgCompany) => {
    setMemCo(c); setMembers([]); setMemErr(''); setAddUser(''); setAddRole('member'); setMemLoading(true);
    try { setMembers(await listCompanyMembers(c.id)); }
    catch (e: any) { setMemErr(e.message || 'Could not load members'); }
    finally { setMemLoading(false); }
  };
  const doAdd = async () => {
    if (!memCo || !addUser) return;
    setMemBusy(true); setMemErr('');
    try { setMembers(await addCompanyMember(memCo.id, addUser, addRole)); setAddUser(''); setAddRole('member'); }
    catch (e: any) { setMemErr(e.message || 'Could not add member'); }
    finally { setMemBusy(false); }
  };
  const doRole = async (uid: string, role: MemberRole) => {
    if (!memCo) return;
    setMembers((prev) => prev.map((m) => (m.user_id === uid ? { ...m, role } : m)));
    try { await updateCompanyMemberRole(memCo.id, uid, role); }
    catch (e: any) { setMemErr(e.message || 'Could not update role'); openMembers(memCo); }
  };
  const doRemove = async (uid: string) => {
    if (!memCo) return;
    setMemBusy(true); setMemErr('');
    try { await removeCompanyMember(memCo.id, uid); setMembers((prev) => prev.filter((m) => m.user_id !== uid)); }
    catch (e: any) { setMemErr(e.message || 'Could not remove member'); }
    finally { setMemBusy(false); }
  };

  const removeCompany = async (c: OrgCompany) => {
    if (projectCount(c.id) > 0) { alert('Reassign or remove this company’s projects first.'); return; }
    if (!confirm(`Delete company “${c.name}”? Its portfolios and memberships are removed too.`)) return;
    try { await deleteOrgCompany(c.id); setCompanies((p) => p.filter((x) => x.id !== c.id)); }
    catch (e: any) { alert(e.message || 'Could not delete company.'); }
  };

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = orgUsers.filter((u) => !memberIds.has(u.id));

  return (
    <Layout flat title="Companies">
      <PageHeader title="Companies" subtitle={`${companies.length} companies`}
        action={admin ? <button onClick={() => { setErr(''); setShowNew(true); }} className="btn btn-primary"><Icon name="ti-plus" />New company</button> : undefined} />
      {loading ? <Spinner /> : companies.length === 0 ? (
        <EmptyState icon="ti-building" text={admin ? 'No companies yet — create your first one' : 'No companies you can access yet'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name="ti-building" className="text-lg" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/companies/${c.id}`} className="text-sm font-medium truncate hover:text-accentstrong block">{c.name}</Link>
                  <p className="text-2xs text-neutral-400">{projectCount(c.id)} projects</p>
                </div>
                {canManage(c) && (
                  <button onClick={() => openMembers(c)} className="text-2xs text-neutral-500 hover:text-ink inline-flex items-center gap-1 shrink-0" title="Manage members">
                    <Icon name="ti-users" /> Members
                  </button>
                )}
                {admin && (
                  <button onClick={() => openEdit(c)} className="text-neutral-300 hover:text-ink shrink-0" title="Rename company">
                    <Icon name="ti-pencil" />
                  </button>
                )}
                {admin && (
                  <button onClick={() => removeCompany(c)} className="text-neutral-300 hover:text-rose-600 shrink-0" title="Delete company">
                    <Icon name="ti-trash" />
                  </button>
                )}
              </div>
              {c.description && <p className="text-2xs text-neutral-500 mt-2 line-clamp-2">{c.description}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="New company"
        subtitle="Add a company to your organization."
        icon="ti-building-plus"
        onSubmit={() => { if (!busy && nc.name.trim()) submit(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={() => setShowNew(false)} className="btn">Cancel</button>
            <button onClick={submit} disabled={busy || !nc.name.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Creating…' : 'Create company'}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <input autoFocus value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Company name" className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          <Field label="Description" hint="Optional."><textarea value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} className="textarea h-20" placeholder="Optional" /></Field>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      </Modal>

      <Modal
        open={!!editCo}
        onClose={() => setEditCo(null)}
        title="Edit company"
        subtitle="Update the company’s name and description."
        icon="ti-edit"
        onSubmit={() => { if (!editBusy && ec.name.trim()) submitEdit(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={() => setEditCo(null)} className="btn">Cancel</button>
            <button onClick={submitEdit} disabled={editBusy || !ec.name.trim()} className="btn btn-primary min-w-[7.5rem]">{editBusy ? 'Saving…' : 'Save changes'}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <input autoFocus value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} placeholder="Company name" className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          <Field label="Description" hint="Optional."><textarea value={ec.description} onChange={(e) => setEc({ ...ec, description: e.target.value })} className="textarea h-20" placeholder="Optional" /></Field>
          {editErr && <p className="text-sm text-rose-600">{editErr}</p>}
        </div>
      </Modal>

      <Modal
        open={!!memCo}
        onClose={() => setMemCo(null)}
        title="Manage members"
        subtitle={memCo ? `${memCo.name} · managers can edit; members get read access to the company’s projects` : undefined}
        icon="ti-users"
        size="lg"
        footer={<button onClick={() => setMemCo(null)} className="btn">Close</button>}
      >
        {memLoading ? <Spinner /> : (
          <div className="space-y-2 max-h-72 overflow-auto">
            {members.length === 0 && <p className="text-sm text-neutral-400">No members yet.</p>}
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{m.users?.full_name || m.users?.email || m.user_id}</p>
                  {m.users?.full_name && m.users?.email && <p className="text-2xs text-neutral-400 truncate">{m.users.email}</p>}
                </div>
                <select value={m.role} onChange={(e) => doRole(m.user_id, e.target.value as MemberRole)} className="input w-32 py-1">
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                </select>
                <button onClick={() => doRemove(m.user_id)} disabled={memBusy} className="text-neutral-400 hover:text-rose-600 shrink-0" title="Remove"><Icon name="ti-trash" /></button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-line mt-4 pt-4">
          <Field label="Add member">
            <div className="flex gap-2">
              <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className="input flex-1">
                <option value="">Select a user…</option>
                {addable.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
              <select value={addRole} onChange={(e) => setAddRole(e.target.value as MemberRole)} className="input w-32">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
              </select>
              <button onClick={doAdd} disabled={memBusy || !addUser} className="btn btn-primary">Add</button>
            </div>
          </Field>
          {memErr && <p className="text-sm text-rose-600 mt-2">{memErr}</p>}
        </div>
      </Modal>
    </Layout>
  );
}
