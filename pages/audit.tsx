import { useMemo, useState } from 'react';
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
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const [etype, setEType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const actions = useMemo(() => Array.from(new Set(rows.map((r) => r.action).filter(Boolean))).sort() as string[], [rows]);
  const users = useMemo(() => Array.from(new Set(rows.map((r) => r.username).filter(Boolean))).sort() as string[], [rows]);
  const etypes = useMemo(() => Array.from(new Set(rows.map((r) => r.entity_type).filter(Boolean))).sort() as string[], [rows]);

  const filtered = rows.filter((r) => {
    if (q && ![r.action, r.username, r.entity_type, r.entity_id].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()))) return false;
    if (action && r.action !== action) return false;
    if (user && r.username !== user) return false;
    if (etype && r.entity_type !== etype) return false;
    if (from && new Date(r.ts) < new Date(from)) return false;
    if (to && new Date(r.ts) > new Date(to + 'T23:59:59')) return false;
    return true;
  });
  const pg = usePagination(filtered, 25);
  const hasFilters = !!(q || action || user || etype || from || to);
  const reset = () => { setQ(''); setAction(''); setUser(''); setEType(''); setFrom(''); setTo(''); };

  const exportCsv = () => {
    const esc = (v: any) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = ['When', 'Who', 'Action', 'Entity type', 'Entity id', 'Old value', 'New value'];
    const lines = [header.join(',')].concat(
      filtered.map((r) => [new Date(r.ts).toISOString(), r.username, r.action, r.entity_type, r.entity_id, r.old_value, r.new_value].map(esc).join(','))
    );
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (!can.manageMembers(org)) {
    return <Layout flat title="Audit log"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to view the audit log.</div></Layout>;
  }

  return (
    <Layout flat title="Audit log">
      {isLoading ? <Spinner /> : (
        <>
          <PageHeader title="Audit log" subtitle="Recent activity across the workspace"
            action={<button className="btn btn-ghost border border-line" disabled={filtered.length === 0} onClick={exportCsv}><Icon name="ti-download" />Export CSV</button>} />

          <div className="card p-3 mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-surface flex-1 min-w-[12rem]">
              <Icon name="ti-search" className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action, user, entity…" className="bg-transparent outline-none text-sm text-content placeholder:text-muted w-full" />
            </div>
            <select className="input h-9 py-0 w-auto" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>{actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="input h-9 py-0 w-auto" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="">All users</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <select className="input h-9 py-0 w-auto" value={etype} onChange={(e) => setEType(e.target.value)}>
              <option value="">All entities</option>{etypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" className="input h-9 py-0 w-auto" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
            <input type="date" className="input h-9 py-0 w-auto" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
            {hasFilters && <button className="btn btn-ghost h-9 py-0" onClick={reset}><Icon name="ti-x" />Clear</button>}
            <span className="text-2xs text-muted ml-auto">{filtered.length} of {rows.length}</span>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="text-2xs uppercase tracking-wide text-muted bg-surface2 border-b border-line">
                <th className="text-left font-medium px-4 py-3">When</th><th className="text-left font-medium px-4 py-3">Who</th><th className="text-left font-medium px-4 py-3">Action</th><th className="text-left font-medium px-4 py-3">Entity</th>
              </tr></thead>
              <tbody>{pg.pageItems.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface2/50">
                  <td className="px-4 py-3 text-muted whitespace-nowrap text-2xs">{new Date(r.ts).toLocaleString()}</td>
                  <td className="px-4 py-3 text-content">{r.username || '—'}</td>
                  <td className="px-4 py-3"><span className="pill pill-blue">{r.action}</span></td>
                  <td className="px-4 py-3 text-muted font-mono text-2xs">{r.entity_type ? `${r.entity_type}${r.entity_id ? ' · ' + String(r.entity_id).slice(0, 8) : ''}` : '—'}</td>
                </tr>
              ))}</tbody>
            </table></div>
            {filtered.length === 0 && <EmptyState icon="ti-history" text={hasFilters ? 'No entries match your filters' : 'No audit entries'} />}
            {filtered.length > 0 && <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />}
          </div>
        </>
      )}
    </Layout>
  );
}
