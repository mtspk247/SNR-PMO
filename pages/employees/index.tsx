import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { getEmployees } from '@/lib/db';
import { Employee } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';

export default function EmployeesPage() {
  const org = useActiveOrg();
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    setLoading(true);
    getEmployees().then(setRows).finally(() => setLoading(false));
  }, [org?.id]);

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

  return (
    <Layout title="Employees">
      <PageHeader title="Employee directory" subtitle="Everyone in your organization, with role, department and manager" />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Icon name="ti-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2 text-sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, department, role…"
            className="input pl-9" />
        </div>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="ti-users" text={rows.length === 0 ? 'No employees yet' : 'No employees match your search'} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
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
              {filtered.map((e) => (
                <tr key={e.id} className="row border-b border-line last:border-0">
                  <td className="td">
                    <Link href={`/employees/${e.id}`} className="inline-flex items-center gap-2.5 hover:text-accentstrong">
                      <Avatar name={e.full_name || '?'} size={28} />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
