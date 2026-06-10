import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import {
  getPortfolios, createPortfolio, getOrgCompanies, getOrgUsers,
  getMyCompanyManagerships, listPortfolioMembers, addPortfolioMember,
  updatePortfolioMemberRole, removePortfolioMember,
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
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [np, setNp] = useState({ name: '', company_id: '', description: '' });

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
    ])
      .then(([pf, c, u, m]) => { setPortfolios(pf); setCompanies(c); setOrgUsers(u); setMgrIds(new Set(m)); })
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
  const canManage = (pf: Portfolio) => admin || mgrIds.has(pf.company_id);

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
              </div>
              {pf.description && <p className="text-2xs text-neutral-500 mt-2 line-clamp-2">{pf.description}</p>}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">New portfolio</h3>
            <div className="space-y-3">
              <div><label className="label">Company</label>
                <select value={np.company_id} onChange={(e) => setNp({ ...np, company_id: e.target.value })} className="input">
                  <option value="">Select a company…</option>
                  {createableCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label className="label">Name</label><input autoFocus value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} className="input" placeholder="Portfolio name" /></div>
              <div><label className="label">Description</label><textarea value={np.description} onChange={(e) => setNp({ ...np, description: e.target.value })} className="w-full px-3 py-2 rounded-md border border-line bg-white text-sm text-ink placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 h-20 resize-none" placeholder="Optional" /></div>
              {err && <p className="text-sm text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="btn flex-1">Cancel</button>
              <button onClick={submit} disabled={busy || !np.name.trim() || !np.company_id} className="btn btn-primary flex-1">{busy ? 'Creating…' : 'Create portfolio'}</button>
            </div>
          </div>
        </div>
      )}

      {memPf && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4" onClick={() => setMemPf(null)}>
          <div className="bg-white rounded-lg border border-line w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold">Members</h3>
              <button onClick={() => setMemPf(null)} className="text-neutral-400 hover:text-ink"><Icon name="ti-x" /></button>
            </div>
            <p className="text-2xs text-neutral-400 mb-4">{memPf.name} · managers can edit; members get read access to the portfolio’s projects</p>

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
              <label className="label">Add member</label>
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
              {memErr && <p className="text-sm text-rose-600 mt-2">{memErr}</p>}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
