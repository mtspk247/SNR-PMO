import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import EmployeeModal, { EmployeeFormValues } from '@/components/EmployeeModal';
import { useEmployees, useOrgCompanies } from '@/lib/queries';
import { createEmployee, getAvatarUrl } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

export default function EmployeesPage() {
  const org = useActiveOrg();
  const qc = useQueryClient();
  const isAdmin = can.manageMembers(org);
  const { data: rows = [], isLoading } = useEmployees();
  const { data: companies = [] } = useOrgCompanies();
  const [q, setQ] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  // avatar signed-URL cache: path → url
  const [avatarMap, setAvatarMap] = useState<Map<string, string>>(new Map());
  const resolvedPaths = useRef<Set<string>>(new Set());

  useEffect(() => {
    const pending = rows
      .map((e) => e.avatar_url)
      .filter((p): p is string => !!p && !resolvedPaths.current.has(p));
    if (!pending.length) return;
    pending.forEach((p) => resolvedPaths.current.add(p));
    Promise.all(pending.map(async (p) => ({ p, url: await getAvatarUrl(p).catch(() => null) }))).then((results) => {
      setAvatarMap((prev) => {
        const next = new Map(prev);
        results.forEach(({ p, url }) => { if (url) next.set(p, url); });
        return next;
      });
    });
  }, [rows]);

  const create = async (v: EmployeeFormValues) => {
    if (!org) return; setBusy(true);
    try {
      await createEmployee({ org_id: org.id, ...v });
      qc.invalidateQueries({ queryKey: qk.employees(org.id) });
      setShowNew(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((e) =>
      e.full_name?.toLowerCase().includes(term) ||
      e.email?.toLowerCase().includes(term) ||
      e.department?.toLowerCase().includes(term) ||
      e.role?.toLowerCase().includes(term)
    );
  }, [rows, q]);

  const pg = usePagination(filtered, 25);

  const activeCount = useMemo(() => rows.filter((e) => e.status === 'active').length, [rows]);
  const deptCount = useMemo(() => new Set(rows.map((e) => e.department).filter(Boolean)).size, [rows]);

  return (
    <Layout title="Employees">
      <PageHeader title="Employee directory" subtitle="Everyone in your organization, with role, department and manager"
        action={isAdmin ? <button onClick={() => setShowNew(true)} className="btn btn-primary"><Icon name="ti-user-plus" />New employee</button> : undefined} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Headcount" value={rows.length} icon="ti-users" />
        <StatCard label="Active" value={activeCount} icon="ti-user-check" hintTone="up" hint={rows.length ? `${Math.round((activeCount / rows.length) * 100)}% of team` : undefined} />
        <StatCard label="Suspended" value={rows.length - activeCount} icon="ti-user-off" hintTone={rows.length - activeCount > 0 ? 'down' : 'muted'} />
        <StatCard label="Departments" value={deptCount} icon="ti-building-community" />
      </div>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Icon name="ti-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2 text-sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, department, role…"
            className="input pl-9" />
        </div>
      </div>

      {isLoading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="ti-users" text={rows.length === 0 ? 'No employees yet' : 'No employees match your search'} />
      ) : (
        <div className="bg-surface overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-muted border-b border-line">
                <th className="th text-left">Name</th>
                <th className="th text-left">Role</th>
                <th className="th text-left">Department</th>
                <th className="th text-left">Status</th>
                <th className="th text-left">Manager</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((e) => {
                const avatarSrc = e.avatar_url ? avatarMap.get(e.avatar_url) : undefined;
                return (
                  <tr key={e.id} className="row border-b border-line last:border-0">
                    <td className="td">
                      <Link href={`/employees/${e.id}`} className="inline-flex items-center gap-2.5 hover:text-accentstrong">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt={e.full_name} width={28} height={28}
                            style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <Avatar name={e.full_name || '?'} size={28} />
                        )}
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{e.full_name}</span>
                          <span className="block text-2xs text-muted2 truncate">{e.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="td capitalize">{(e.role || '').replace('_', ' ')}</td>
                    <td className="td">{e.department || '—'}</td>
                    <td className="td">
                      <span className={`pill ${e.status === 'active' ? 'pill-green' : 'pill-red'}`}>{e.status}</span>
                    </td>
                    <td className="td">{e.manager?.full_name || '—'}</td>
                    <td className="td text-right">
                      <Link href={`/employees/${e.id}`} className="btn btn-ghost h-7 px-2 text-xs">
                        View<Icon name="ti-chevron-right" className="text-sm" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />
        </div>
      )}

      {showNew && (
        <EmployeeModal people={rows} companies={companies} busy={busy}
          onClose={() => setShowNew(false)} onSubmit={create} />
      )}
    </Layout>
  );
}
