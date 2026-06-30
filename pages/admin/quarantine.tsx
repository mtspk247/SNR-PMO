import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatusBadge } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { fileScanQuarantineList, fileScanRequestRescan, fileScanDeleteObject, fileScanDismiss, QuarantineRow } from '@/lib/db';

// Admin view of files the malware scanner has BLOCKED, errored on, or is still checking.
// Visibility is server-enforced: platform admins see every tenant; an org owner/admin sees only
// their own org (RPC file_scan_quarantine_list filters by is_platform_admin / is_org_role). There is
// deliberately NO "force clean" action — releasing an unscanned/infected file would bypass the
// download gate. The safe path back to downloadable is Re-scan (a clean verdict releases it).

const STATUSES = ['all', 'infected', 'error', 'pending'];
function fmtBytes(n: number | null): string {
  if (!n || n <= 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
function ago(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime(); if (isNaN(t)) return '—';
  const s = Math.max(0, Date.now() - t), day = 86400000;
  if (s < 3600000) return Math.max(1, Math.round(s / 60000)) + ' min ago';
  if (s < day) return Math.round(s / 3600000) + ' h ago';
  const d = Math.round(s / day);
  return d < 30 ? d + ' day' + (d === 1 ? '' : 's') + ' ago' : Math.round(d / 30) + ' mo ago';
}

export default function QuarantinePage() {
  const org = useActiveOrg();
  const orgAdmin = can.manageOrg(org);
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const allowed = orgAdmin || platformAdmin;

  const [rows, setRows] = useState<QuarantineRow[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [allTenants, setAllTenants] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (!allowed) { setRows([]); return; }
    const scope = platformAdmin && allTenants ? null : (org?.id ?? null);
    fileScanQuarantineList(scope, 500)
      .then(setRows)
      .catch((e) => { setErr(e?.message || 'Failed to load'); setRows([]); });
  }, [allowed, platformAdmin, allTenants, org?.id]);
  useEffect(() => { load(); }, [load]);

  const shown = (rows || []).filter((r) => filter === 'all' || r.status === filter);
  const rowKey = (r: QuarantineRow) => `${r.bucket}|${r.path}`;

  const doRescan = async (r: QuarantineRow) => {
    setBusy(rowKey(r)); setErr('');
    try { await fileScanRequestRescan(r.bucket, r.path); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not queue a re-scan'); } finally { setBusy(''); }
  };
  const doDelete = async (r: QuarantineRow) => {
    if (!window.confirm(`Permanently delete "${r.filename || r.path}"? This removes the file and its scan record.`)) return;
    setBusy(rowKey(r)); setErr('');
    try { await fileScanDeleteObject(r.bucket, r.path); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not delete'); } finally { setBusy(''); }
  };
  const doDismiss = async (r: QuarantineRow) => {
    if (!window.confirm('Dismiss this scan record? The file is already gone; this just clears the entry.')) return;
    setBusy(rowKey(r)); setErr('');
    try { await fileScanDismiss(r.bucket, r.path); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not dismiss'); } finally { setBusy(''); }
  };

  if (!allowed) return <Layout flat title="File security"><EmptyState icon="ti-lock" title="Admins only" text="File-scanning controls are available to workspace owners, admins, and platform staff." /></Layout>;

  return (
    <Layout flat title="File security">
      <PageHeader title="File security" subtitle="Files blocked, held, or still being checked by malware scanning" icon="ti-shield-check" help="file-security" />

      <div className="card p-3 mb-4 flex items-start gap-2 border border-line">
        <Icon name="ti-shield-lock" className="text-accentstrong mt-0.5 shrink-0" />
        <p className="text-2xs text-muted">Every uploaded file is virus-scanned. <strong>Infected</strong> files are removed automatically and can never be downloaded. <strong>Pending</strong> means a scan is in progress; <strong>Error</strong> means a scan could not finish — both stay un-downloadable until a clean result. Use <strong>Re-scan</strong> to re-check a file (a clean result releases it). There is no manual "mark clean" — that would bypass the scanner.</p>
      </div>

      {err && <div className="card p-2.5 mb-3 text-2xs text-rose-600 bg-rose-500/10 border border-rose-500/20 flex items-center gap-2"><Icon name="ti-alert-triangle" />{err}</div>}

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`h-8 px-3 rounded-lg text-sm capitalize transition ${filter === s ? 'bg-accent/15 text-accentstrong font-medium' : 'text-muted hover:text-content border border-line'}`}>{s}</button>
        ))}
        <div className="flex-1" />
        {platformAdmin && (
          <label className="flex items-center gap-1.5 text-2xs text-muted cursor-pointer select-none">
            <input type="checkbox" checked={allTenants} onChange={(e) => setAllTenants(e.target.checked)} /> All tenants
          </label>
        )}
        <button onClick={load} className="btn btn-sm"><Icon name="ti-refresh" className="text-sm" />Refresh</button>
      </div>

      {rows === null ? <Spinner /> : shown.length === 0 ? (
        <EmptyState icon="ti-shield-check" title="All clear" text="No files are blocked, errored, or pending. Everything uploaded has passed scanning." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs text-muted2 border-b border-line">
                <th className="px-3 py-2 font-medium">File</th>
                {platformAdmin && allTenants && <th className="px-3 py-2 font-medium">Tenant</th>}
                <th className="px-3 py-2 font-medium">Bucket</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Detail</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Seen</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const k = rowKey(r); const working = busy === k;
                return (
                  <tr key={k} className="border-b border-line/60 hover:bg-surface2/40">
                    <td className="px-3 py-2 max-w-[260px]"><div className="truncate font-medium text-content" title={r.path}>{r.filename || r.path.split('/').pop()}</div></td>
                    {platformAdmin && allTenants && <td className="px-3 py-2 text-2xs text-muted truncate max-w-[140px]">{r.org_name || '—'}</td>}
                    <td className="px-3 py-2 text-2xs text-muted2 font-mono">{r.bucket}</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-2 text-2xs text-muted2 font-mono truncate max-w-[180px]" title={r.verdict || ''}>{r.verdict || '—'}</td>
                    <td className="px-3 py-2 text-2xs text-muted2">{fmtBytes(r.size_bytes)}</td>
                    <td className="px-3 py-2 text-2xs text-muted2">{ago(r.created_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {working ? <Icon name="ti-loader-2" className="animate-spin text-muted2" /> : (<>
                          {r.object_present && r.status !== 'infected' && (
                            <button onClick={() => doRescan(r)} className="btn btn-sm" title="Queue a fresh scan"><Icon name="ti-refresh" className="text-sm" />Re-scan</button>
                          )}
                          {r.object_present ? (
                            <button onClick={() => doDelete(r)} className="btn btn-sm text-rose-600" title="Delete file and record"><Icon name="ti-trash" className="text-sm" />Delete</button>
                          ) : (
                            <button onClick={() => doDismiss(r)} className="btn btn-sm" title="Clear this record"><Icon name="ti-x" className="text-sm" />Dismiss</button>
                          )}
                        </>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
