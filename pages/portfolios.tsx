import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import {
  getPortfolios, createPortfolio, getOrgCompanies, getOrgUsers,
  getMyCompanyManagerships, getMyPortfolioManagerships, listPortfolioMembers, addPortfolioMember,
  updatePortfolioMemberRole, removePortfolioMember, deletePortfolio, updatePortfolio,
} from '@/lib/db';
import { Portfolio, OrgCompany, OrgUser, PortfolioMember, MemberRole } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

export default function PortfoliosPage() {
  const org = useActiveOrg();
  const userId = useAuthStore((s) => s.user?.id) || null;
  const admin = can.manageMembers(org);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [mgrIds, setMgrIds] = useState<Set<string>>(new Set());
  const [pfMgrIds, setPfMgrIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [np, setNp] = useState({ name: '', company_id: '', description: '' });

  // edit modal
  const [editPf, setEditPf] = useState<Portfolio | null>(null);
  const [ep, setEp] = useState({ name: '', description: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  // member-management modal
  const [memPf, setMemPf] = useState<Portfolio | null>(null);
  const [members, setMembers] = useState<PortfolioMember[]>([]);
  const [memLoading, setMemLoading] = useState(false);
  const [memErr, setMemErr] = useState('');
  const [addUser, setAddUser] = useState('');
  const [addRole, setAddRole] = useState<MemberRole>('member');
  const [memBusy, setMemBusy] = useState(false);

  useEffect(() => {
    if (!org) return;
    setLoading(true);
    Promise.all([
      getPortfolios(), getOrgCompanies(), getOrgUsers(),
      userId ? getMyCompanyManagerships(userId) : Promise.resolve<string[]>([]),
      userId ? getMyPortfolioManagerships(userId) : Promise.resolve<string[]>([]),
    ])
      .then(([pf, c, u, m, pm]) => { setPortfolios(pf); setCompanies(c); setOrgUsers(u); setMgrIds(new Set(m)); setPfMgrIds(new Set(pm)); })
      .finally(() => setLoading(false));
  }, [org?.id, userId]);

  const companyName = (cid: string) => companies.find((c) => c.id === cid)?.name || '—';
  // Companies the user may create portfolios under (RLS pf_write = org owner/admin
  // OR company manager). Admin → all; otherwise the companies they manage.
  const createableCompanies = useMemo(
    () => (admin ? companies : companies.filter((c) => mgrIds.has(c.id))),
    [admin, companies, mgrIds]
  );
  const canCreate = createableCompanies.length > 0;
  const canManage = (pf: Portfolio) => admin || mgrIds.has(pf.company_id) || pfMgrIds.has(pf.id);
  const removePortfolio = async (pf: Portfolio) => {
    if (!confirm(`Delete portfolio “${pf.name}”? Any projects must be reassigned first.`)) return;
    try { await deletePortfolio(pf.id); setPortfolios((prev) => prev.filter((x) => x.id !== pf.id)); }
    catch (e: any) { alert(e.message || 'Could not delete — reassign its projects first.'); }
  };

  const submit = async () => {
    if (!org || !np.name.trim() || !np.company_id) return;
    setBusy(true); setErr('');
    try {
      const list = await createPortfolio({ name: np.name.trim(), org_id: org.id, company_id: np.company_id, description: np.description.trim() || null });
      setPortfolios(list);
      setShowNew(false); setNp({ name: '', company_id: '', description: '' });
    } catch (e: any) { setErr(e.message || 'Could not create portfolio'); }
    finally { setBusy(false); }
  };

  const openEdit = (pf: Portfolio) => {
    setEditPf(pf); setEp({ name: pf.name, description: pf.description || '' }); setEditErr('');
  };
  const submitEdit = async () => {
    if (!editPf || !ep.name.trim()) return;
    setEditBusy(true); setEditErr('');
    try {
      const list = await updatePortfolio(editPf.id, { name: ep.name.trim(), description: ep.description.trim() || null });
      setPortfolios(list);
      setEditPf(null);
    } catch (e: any) { setEditErr(e.message || 'Could not save changes'); }
    finally { setEditBusy(false); }
  };

  const openMembers = async (pf: Portfolio) => {
    setMemPf(pf); setMembers([]); setMemErr(''); setAddUser(''); setAddRole('member'); setMemLoading(true);
    try { setMembers(await listPortfolioMembers(pf.id)); }
    catch (e: any) { setMemErr(e.message || 'Could not load members'); }
    finally { setMemLoading(false); }
  };
  const doAdd = async () => {
    if (!memPf || !addUser) return;
    setMemBusy(true); setMemErr('');
    try { setMembers(await addPortfolioMember(memPf.id, addUser, addRole)); setAddUser(''); setAddRole('member'); }
    catch (e: any) { setMemErr(e.message || 'Could not add member'); }
    finally { setMemBusy(false); }
  };
  const doRole = async (uid: string, role: MemberRole) => {
    if (!memPf) return;
    setMembers((prev) => prev.map((m) => (m.user_id === uid ? { ...m, role } : m)));
    try { await updatePortfolioMemberRole(memPf.id, uid, role); }
    catch (e: any) { setMemErr(e.message || 'Could not update role'); openMembers(memPf); }
  };
  const doRemove = async (uid: string) => {
    if (!memPf) return;
    setMemBusy(true); setMemErr('');
    try { await removePortfolioMember(memPf.id, uid); setMembers((prev) => prev.filter((m) => m.user_id !== uid)); }
    catch (e: any) { setMemErr(e.message || 'Could not remove member'); }
    finally { setMemBusy(false); }
  };

  const memberIds = new Set(members.map((m) => m.user_id));
  const addable = orgUsers.filter((u) => !memberIds.has(u.id));

  return (
    <Layout title="Portfolios">
      <PageHeader title="Portfolios" subtitle={`${portfolios.length} portfolios`}
        action={canCreate ? <button onClick={() => { setErr(''); setNp({ name: '', company_id: createableCompanies[0]?.id || '', description: '' }); setShowNew(true); }} className="btn btn-primary"><Icon name="ti-plus" />New portfolio</button> : undefined} />
      {loading ? <Spinner /> : portfolios.length === 0 ? (
        <EmptyState icon="ti-stack-2" text={canCreate ? 'No portfolios yet — create your first one' : 'No portfolios you can access yet'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {portfolios.map((pf) => (
            <div key={pf.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name="ti-stack-2" className="text-lg" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{pf.name}</p>
                  <p className="text-2xs text-neutral-400 inline-flex items-center gap-1"><Icon name="ti-building" /> {companyName(pf.company_id)}</p>
                </div>
                {canManage(pf) && (
                  <button onClick={() => openMembers(pf)} className="text-2xs text-neutral-500 hover:text-ink inline-flex items-center gap-1 shrink-0" title="Manage members">
                    <Icon name="ti-users" /> Members
                  </button>
                )}
                {canManage(pf) && (
                  <button onClick={() => openEdit(pf)} className="text-neutral-300 hover:text-ink shrink-0" title="Rename portfolio">
                    <Icon name="ti-pencil" />
                  </button>
                )}
                {canManage(pf) && (
                  <button onClick={() => removePortfolio(pf)} className="text-neutral-300 hover:text-rose-600 shrink-0" title="Delete portfolio">
                    <Icon name="ti-trash" />
                  </button>
                )}
              </div>
              {pf.description && <p className="text-2xs text-neutral-500 mt-2 line-clamp-2">{pf.description}</p>}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="New portfolio"
        subtitle="Group related projects under a company."
        icon="ti-stack-2"
        onSubmit={() => { if (!busy && np.name.trim() && np.company_id) submit(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={() => setShowNew(false)} className="btn">Cancel</button>
            <button onClick={submit} disabled={busy || !np.name.trim() || !np.company_id} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Creating…' : 'Create portfolio'}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label="Company" required>
            <select value={np.company_id} onChange={(e) => setNp({ ...np, company_id: e.target.value })} className="input">
              <option value="">Select a company…</option>
              {createableCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <input autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Portfolio name" className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          <Field label="Description" hint="Optional."><textarea value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} className="textarea h-20" placeholder="Optional" /></Field>
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>
      </Modal>

      <Modal
        open={!!editPf}
        onClose={() => setEditPf(null)}
        title="Edit portfolio"
        subtitle="Update the portfolio’s name and description."
        icon="ti-edit"
        onSubmit={() => { if (!editBusy && ep.name.trim()) submitEdit(); }}
        footer={
          <>
            <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
            <button onClick={() => setEditPf(null)} className="btn">Cancel</button>
            <button onClick={submitEdit} disabled={editBusy || !ep.name.trim()} className="btn btn-primary min-w-[7.5rem]">{editBusy ? 'Saving…' : 'Save changes'}</button>
          </>
        }
      >
        <div className="space-y-3.5">
          <input autoFocus value={ep.name} onChange={(e) => setEp({ ...ep, name: e.target.value })} placeholder="Portfolio name" className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          <Field label="Description" hint="Optional."><textarea value={ep.description} onChange={(e) => setEp({ ...ep, description: e.target.value })} className="textarea h-20" placeholder="Optional" /></Field>
          {editErr && <p className="text-sm text-rose-600">{editErr}</p>}
        </div>
      </Modal>

      <Modal
        open={!!memPf}
        onClose={() => setMemPf(null)}
        title="Manage members"
        subtitle={memPf ? `${memPf.name} · managers can edit; members get read access to the portfolio’s projects` : undefined}
        icon="ti-users"
        size="lg"
        footer={<button onClick={() => setMemPf(null)} className="btn">Close</button>}
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
