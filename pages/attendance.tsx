import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { useAttendance } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { getMyOpenToday, checkIn, checkOut } from '@/lib/db';
import { Attendance } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const ATT_PILL: Record<string, string> = { OPEN: 'pill-amber', CLOSED: 'pill-green', AUTO_CHECKOUT: 'pill-gray' };
const ATT_LABEL: Record<string, string> = { OPEN: 'Open', CLOSED: 'Closed', AUTO_CHECKOUT: 'Auto' };

export default function AttendancePage() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useAttendance();
  const [openRow, setOpenRow] = useState<Attendance | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    getMyOpenToday(me.id).then(setOpenRow);
  }, [me?.id]);

  const isAdmin = can.manageMembers(org);
  const mine = rows.filter((r) => r.user_id === me?.id);
  const month = new Date().toISOString().slice(0, 7);
  const todayMine = mine.find((r) => r.work_date === new Date().toISOString().slice(0, 10));
  const monthHours = mine.filter((r) => r.work_date.slice(0, 7) === month).reduce((a, r) => a + (Number(r.hours) || 0), 0);
  const visible = isAdmin ? rows : mine;
  const pg = usePagination(visible, 25);

  const doCheckIn = async () => {
    if (!me || !org) return; setBusy(true);
    try { const r = await checkIn(me.id, org.id); setOpenRow(r); qc.invalidateQueries({ queryKey: qk.attendance(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const doCheckOut = async () => {
    if (!openRow || !org) return; setBusy(true);
    try { const r = await checkOut(openRow); setOpenRow(null); qc.invalidateQueries({ queryKey: qk.attendance(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout title="Attendance">
      {isLoading ? <Spinner /> : (
        <>
          <PageHeader title="Attendance" subtitle={isAdmin ? 'Your time plus the team’s recent activity' : 'Track your working hours'}
            action={openRow
              ? <button onClick={doCheckOut} disabled={busy} className="btn btn-primary"><Icon name="ti-logout" />Check out</button>
              : <button onClick={doCheckIn} disabled={busy} className="btn btn-primary"><Icon name="ti-login" />Check in</button>} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Status" value={openRow ? 'Checked in' : 'Checked out'} icon="ti-clock" hint={openRow ? `since ${fmtTime(openRow.check_in)}` : undefined} hintTone={openRow ? 'up' : 'muted'} />
            <StatCard label="Today" value={`${todayMine?.hours ?? (openRow ? '…' : 0)} h`} icon="ti-hourglass" />
            <StatCard label="This month" value={`${Math.round(monthHours * 10) / 10} h`} icon="ti-calendar" />
            <StatCard label="Days logged" value={mine.length} icon="ti-checklist" />
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-2xs uppercase tracking-wide text-muted2 border-b border-line">
                  {isAdmin && <th className="text-left font-medium px-4 py-2.5">Person</th>}
                  <th className="text-left font-medium px-4 py-2.5">Date</th>
                  <th className="text-left font-medium px-4 py-2.5">In</th>
                  <th className="text-left font-medium px-4 py-2.5">Out</th>
                  <th className="text-left font-medium px-4 py-2.5">Hours</th>
                  <th className="text-left font-medium px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {pg.pageItems.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    {isAdmin && <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2"><Avatar name={r.users?.full_name || '?'} size={22} />{r.users?.full_name || '—'}</span></td>}
                    <td className="px-4 py-2.5">{r.work_date}</td>
                    <td className="px-4 py-2.5">{fmtTime(r.check_in)}</td>
                    <td className="px-4 py-2.5">{fmtTime(r.check_out)}</td>
                    <td className="px-4 py-2.5">{r.hours ?? '—'}</td>
                    <td className="px-4 py-2.5"><span className={`pill ${ATT_PILL[r.status] || 'pill-gray'}`}>{ATT_LABEL[r.status] || r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {visible.length === 0 && <EmptyState icon="ti-clock" text="No attendance yet — check in to start" />}
            {visible.length > 0 && <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />}
          </div>
        </>
      )}
    </Layout>
  );
}
