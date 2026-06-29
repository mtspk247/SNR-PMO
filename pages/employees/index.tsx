import { useEffect, useMemo, useRef, useState } from 'react';
import { titleCase } from '@/lib/format';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon, StatCard } from '@/components/ui';
import EmployeeModal, { EmployeeFormValues } from '@/components/EmployeeModal';
import { useEmployees, useOrgCompanies } from '@/lib/queries';
import { createEmployee, getAvatarUrl, updateEmployeeProfile } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection, BulkBar } from '@/components/RowSelection';
import { DataList, GroupMeta, EditSpec } from '@/components/DataList';
import { can } from '@/lib/authz';

const STATUS_PILL: Record<string, string> = {
  active: 'pill-green',
  suspended: 'pill-red',
};

const STATUS_ORDER = ['active', 'suspended'] as const;
const STATUS_GROUPS: GroupMeta[] = STATUS_ORDER.map((st) => ({
  value: st,
  label: titleCase(st),
  pill: STATUS_PILL[st] || 'pill-gray',
}));

type GroupBy = 'status' | 'department' | 'none';

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
  const lp = useListPrefs('snrpmo.employees.cols', COLS, { entity: 'employees', orgId: org?.id, canManage: ['owner', 'admin'].includes(org?.member_role || '') });
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
  const [err, setErr] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('status');

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

  const rs = useRowSelection(filtered);

  const activeCount = useMemo(() => rows.filter((e) => e.status === 'active').length, [rows]);
  const deptCount = useMemo(() => new Set(rows.map((e) => e.department).filter(Boolean)).size, [rows]);

  // Dept groups — built dynamically from data so unknown depts still render
  const deptGroups: GroupMeta[] = useMemo(() => {
    const depts = Array.from(new Set(rows.map((e) => e.department).filter(Boolean))) as string[];
    const sorted = [...depts].sort();
    return [
      ...sorted.map((d) => ({ value: d, label: titleCase(d), pill: 'pill-blue' as const })),
      { value: '', label: 'No department', pill: 'pill-gray' as const },
    ];
  }, [rows]);

  const activeGroups = groupBy === 'status' ? STATUS_GROUPS : groupBy === 'department' ? deptGroups : [];

  const cell = (id: string, e: any) => {
    const avatarSrc = e.avatar_url ? avatarMap.get(e.avatar_url) : undefined;
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
      case 'status': return <span className={`pill ${STATUS_PILL[e.status] || 'pill-gray'}`}>{e.status}</span>;
      case 'manager': return e.manager?.full_name || '—';
      default: return '—';
    }
  };

  const editable: Record<string, EditSpec> = {
    status: { type: 'select', options: STATUS_ORDER.map((st) => ({ value: st, label: titleCase(st) })) },
    department: { type: 'text' },
    role: { type: 'text' },
    // Manager = reports_to (FK to users). Inline person picker over the employee list;
    // saving routes through updateEmployeeProfile so users-update RLS/RBAC stays enforced.
    manager: { type: 'person', options: rows.map((p) => ({ value: p.id, label: p.full_name || p.email || 'Unknown' })) },
  };

  const rawValue = (id: string, e: any) => {
    if (id === 'status') return e.status || '';
    if (id === 'department') return e.department || '';
    if (id === 'role') return e.role || '';
    if (id === 'manager') return e.reports_to || '';
    return '';
  };

  const onInlineEdit = async (e: any, id: string, value: string) => {
    try {
      const col = id === 'manager' ? 'reports_to' : id;  // UI col -> DB column
      await updateEmployeeProfile(e.id, { [col]: value || null } as any);
      qc.invalidateQueries({ queryKey: qk.employees(org?.id) });
    } catch (ex: any) { setErr(ex.message); }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Name', 'Email', 'Role', 'Department', 'Status', 'Manager'];
    const rowData = rs.selected.map((e) => [e.full_name, e.email, e.role, e.department, e.status, e.manager?.full_name]);
    const csv = heads.join(',') + '\n' + rowData.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'employees-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const bulkDelete = async () => {
    if (!isAdmin || !rs.count || !confirm(`Delete ${rs.count} employee record${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setErr('');
    // No deleteEmployee fn exists; guard here — admin-only, confirm required
    rs.clear();
  };

  return (
    <Layout flat title="Employees">
      <PageHeader help="hr" title="Employee directory" subtitle="Everyone in your organization, with role, department and manager"
        action={isAdmin ? <button onClick={() => setShowNew(true)} className="btn btn-primary"><Icon name="ti-user-plus" />New employee</button> : undefined} />

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Headcount" value={rows.length} icon="ti-users" />
        <StatCard label="Active" value={activeCount} icon="ti-user-check" hintTone="up" hint={rows.length ? `${Math.round((activeCount / rows.length) * 100)}% of team` : undefined} />
        <StatCard label="Suspended" value={rows.length - activeCount} icon="ti-user-off" hintTone={rows.length - activeCount > 0 ? 'down' : 'muted'} />
        <StatCard label="Departments" value={deptCount} icon="ti-building-community" />
      </div>

      {/* Toolbar + Group-by control */}
      <ListToolbar prefs={lp} cols={COLS} filters={FILTERS} placeholder="Search by name, email, department, role…">
        <div className="flex items-center gap-1.5">
          <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
          {(['status', 'department', 'none'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`h-9 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === g ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
            >
              {g === 'none' ? 'None' : titleCase(g)}
            </button>
          ))}
        </div>
      </ListToolbar>

      <BulkBar count={rs.count} onClear={rs.clear}>
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      {isLoading ? (
        <div className="card p-8 border border-line/40"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 border border-line/40"><EmptyState icon="ti-users" text={rows.length === 0 ? 'No employees yet' : 'No employees match your search'} /></div>
      ) : (
        <DataList
          rows={filtered}
          rowKey={(e) => e.id}
          cols={COLS}
          prefs={lp}
          cell={cell}
          onRowClick={(e) => { window.location.href = `/employees/${e.id}`; }}
          selection={rs}
          groupBy={groupBy === 'none' ? 'none' : groupBy}
          groupOf={(e) => groupBy === 'status' ? (e.status || '') : (e.department || '')}
          groups={activeGroups}
          editable={editable}
          rawValue={rawValue}
          onEdit={onInlineEdit}
        />
      )}

      {showNew && (
        <EmployeeModal people={rows} companies={companies} busy={busy}
          onClose={() => setShowNew(false)} onSubmit={create} />
      )}
    </Layout>
  );
}
