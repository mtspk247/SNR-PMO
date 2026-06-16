import { useEffect, useMemo, useRef, useState } from 'react';
import { titleCase } from '@/lib/format';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import EmployeeModal, { EmployeeFormValues } from '@/components/EmployeeModal';
import { useEmployees, useOrgCompanies } from '@/lib/queries';
import { createEmployee, getAvatarUrl } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { can } from '@/lib/authz';

const COLS: ColDef[] = [
  { id: 'name', label: 'Name', locked: true },
  { id: 'role', label: 'Role' },
  { id: 'department', label: 'Department' },
  { id: 'status', label: 'Status' },
  { id: 'manager', label: 'Manager' },
];

export default function EmployeesPage() {
  const org = useActiveOrg();
  const qc = useQueryClient();
  const isAdmin = can.manageMembers(org);
  const { data: rows = [], isLoading } = useEmployees();
  const { data: companies = [] } = useOrgCompanies();
  const me = useAuthStore((s) => s.user);
  const [showNew, setShowNew] = useState(false);
  const lp = useListPrefs(`snr-employees-view-${me?.id || 'anon'}`, COLS);
  const FILTERS: FilterDef[] = useMemo(() => {
    const depts = Array.from(new Set(rows.map((e) => e.department).filter(Boolean))) as string[];
    const roles = Array.from(new Set(rows.map((e) => e.role).filter(Boolean))) as string[];
    return [
      { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }] },
      { id: 'department', label: 'Department', options: [{ value: 'all', label: 'All departments' }, ...depts.map((d) => ({ value: d, label: titleCase(d) }))] },
      { id: 'role', label: 'Role', options: [{ value: 'all', label: 'All roles' }, ...roles.map((r) => ({ value: r, label: r.replace('_', ' ') }))] },
    ];
  }, [rows]);
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
    const term = lp.query.trim().toLowerCase();
    return rows.filter((e) => {
      if (term && !(`${e.full_name || ''} ${e.email || ''} ${e.department || ''} ${e.role || ''}`.toLowerCase().includes(term))) return false;
      const fs = lp.filters;
      if (fs.status && fs.status !== 'all' && e.status !== fs.status) return false;
      if (fs.department && fs.department !== 'all' && (e.department || '') !== fs.department) return false;
      if (fs.role && fs.role !== 'all' && (e.role || '') !== fs.role) return false;
      return true;
    });
  }, [rows, lp.query, lp.filters]);

  const pg = usePagination(filtered, 25);

  const activeCount = useMemo(() => rows.filter((e) => e.status === 'active').length, [rows]);
  const deptCount = useMemo(() => new Set(rows.map((e) => e.department).filter(Boolean)).size, [rows]);

  return (
    <Layout flat title="Employees">
      <PageHeader title="Employee directory" subtitle="Everyone in your organization, with role, department and manager"
        action={isAdmin ? <button onClick={() => setShowNew(true)} className="btn btn-primary"><Icon name="ti-user-plus" />New employee</button> : undefined} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Headcount" value={rows.length} icon="ti-users" />
        <StatCard label="Active" value={activeCount} icon="ti-user-check" hintTone="up" hint={rows.length ? `${Math.round((activeCount / rows.length) * 100)}% of team` : undefined} />
        <StatCard label="Suspended" value={rows.length - activeCount} icon="ti-user-off" hintTone={rows.length - activeCount > 0 ? 'down' : 'muted'} />
        <StatCard label="Departments" value={deptCount} icon="ti-building-community" />
      </div>

      <ListToolbar prefs={lp} cols={COLS} filters={FILTERS} placeholder="Search by name, email, department, role…" />

      {isLoading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="ti-users" text={rows.length === 0 ? 'No employees yet' : 'No employees match your search'} />
      ) : (
        <div className="bg-surface overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-muted border-b border-line">
                {lp.ordered.map((id) => <th key={id} className="th text-left">{COLS.find((c) => c.id === id)?.label}</th>)}
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((e) => {
                const avatarSrc = e.avatar_url ? avatarMap.get(e.avatar_url) : undefined;
                const cell = (id: string) => {
                  switch (id) {
                    case 'name': return (
                      <Link href={`/employees/${e.id}`} className="inline-flex items-center gap-2.5 hover:text-accentstrong">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt={e.full_name} width={28} height={28} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (<Avatar name={e.full_name || '?'} size={28} />)}
                        <span className="min-w-0"><span className="block font-medium truncate">{e.full_name}</span><span className="block text-2xs text-muted2 truncate">{e.email}</span></span>
                      </Link>);
                    case 'role': return <span className="capitalize">{(e.role || '').replace('_', ' ')}</span>;
                    case 'department': return e.department || '—';
                    case 'status': return <span className={`pill ${e.status === 'active' ? 'pill-green' : 'pill-red'}`}>{e.status}</span>;
                    case 'manager': return e.manager?.full_name || '—';
                    default: return null;
                  }
                };
                return (
                  <tr key={e.id} className="row border-b border-line last:border-0">
                    {lp.ordered.map((id) => <td key={id} className="td">{cell(id)}</td>)}
                    <td className="td text-right">
                      <Link href={`/employees/${e.id}`} className="btn btn-ghost h-7 px-2 text-xs">View<Icon name="ti-chevron-right" className="text-sm" /></Link>
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
