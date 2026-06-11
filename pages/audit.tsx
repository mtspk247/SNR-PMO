import { useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { useAuditLog } from '@/lib/queries';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

export default function AuditPage() {
  const org = useActiveOrg();
  const { data: rows = [], isLoading } = useAuditLog();
  const [q, setQ] = useState('');

  if (!can.manageMembers(org)) {
    return <Layout title="Audit log"><div className="card p-10 text-center text-sm text-neutral-500"><Icon name="ti-lock" className="text-2xl text-neutral-300 block mb-2" />You need admin access to view the audit log.</div></Layout>;
  }

  const filtered = rows.filter((r) => !q || [r.action, r.username, r.entity_type, r.entity_id].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase())));
  const pg = usePagination(filtered, 25);

  return (
    <Layout title="Audit log">
      {isLoading ? <Spinner /> : (
        <>
          <PageHeader title="Audit log" subtitle="Recent activity across the workspace"
            action={<div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-white"><Icon name="ti-search" className="text-neutral-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter" className="bg-transparent outline-none text-sm" /></div>} />
          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-2xs uppercase tracking-wide text-neutral-400 border-b border-line">
                <th className="text-left font-medium px-4 py-2.5">When</th><th className="text-left font-medium px-4 py-2.5">Who</th><th className="text-left font-medium px-4 py-2.5">Action</th><th className="text-left font-medium px-4 py-2.5">Entity</th>
              </tr></thead>
              <tbody>{pg.pageItems.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">{new Date(r.ts).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{r.username || '—'}</td>
                  <td className="px-4 py-2.5"><span className="pill pill-blue">{r.action}</span></td>
                  <td className="px-4 py-2.5 text-neutral-500">{r.entity_type ? `${r.entity_type}${r.entity_id ? ' · ' + String(r.entity_id).slice(0, 8) : ''}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {filtered.length === 0 && <EmptyState icon="ti-history" text="No audit entries" />}
            {filtered.length > 0 && <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />}
          </div>
        </>
      )}
    </Layout>
  );
}
