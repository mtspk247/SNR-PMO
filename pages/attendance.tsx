import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, Avatar, Icon } from '@/components/ui';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';
import { useAttendance } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { getMyOpenToday } from '@/lib/db';
import { performCheckIn, performCheckOut } from '@/lib/attendance';
import { Attendance } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

const fmtTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const ATT_PILL: Record<string, string> = { OPEN: 'pill-amber', CLOSED: 'pill-green', AUTO_CHECKOUT: 'pill-gray' };
const ATT_LABEL: Record<string, string> = { OPEN: 'Open', CLOSED: 'Closed', AUTO_CHECKOUT: 'Auto' };

const GROUP_ORDER = ['OPEN', 'CLOSED', 'AUTO_CHECKOUT'] as const;
const GROUPS: GroupMeta[] = GROUP_ORDER.map((st) => ({ value: st, label: ATT_LABEL[st], pill: ATT_PILL[st] || 'pill-gray' }));

const FILTERS: FilterDef[] = [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }, { value: 'AUTO_CHECKOUT', label: 'Auto' }] }];

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

  const COLS: ColDef[] = useMemo(() => [
    ...(isAdmin ? [{ id: 'person', label: 'Person' }] : []),
    { id: 'date', label: 'Date', locked: true },
    { id: 'in', label: 'In' }, { id: 'out', label: 'Out' }, { id: 'hours', label: 'Hours' }, { id: 'status', label: 'Status' },
  ], [isAdmin]);

  const prefs = useListPrefs(`snr-attendance-view-${me?.id || 'anon'}`, COLS, { entity: 'attendance', orgId: org?.id, canManage: isAdmin });

  const shown = useMemo(() => {
    const term = prefs.query.trim().toLowerCase();
    return visible.filter((r) => {
      if (term && !(`${r.users?.full_name || ''} ${r.work_date}`.toLowerCase().includes(term))) return false;
      if (prefs.filters.status && prefs.filters.status !== 'all' && r.status !== prefs.filters.status) return false;
      return true;
    });
  }, [visible, prefs.query, prefs.filters]);

  const rs = useRowSelection(shown);

  const cell = (id: string, r: Attendance) => {
    switch (id) {
      case 'person': return <span className="inline-flex items-center gap-2"><Avatar name={r.users?.full_name || '?'} size={22} />{r.users?.full_name || '—'}</span>;
      case 'date': return r.work_date;
      case 'in': return fmtTime(r.check_in);
      case 'out': return fmtTime(r.check_out);
      case 'hours': return r.hours ?? '—';
      case 'status': return <span className={`pill ${ATT_PILL[r.status] || 'pill-gray'}`}>{ATT_LABEL[r.status] || r.status}</span>;
      default: return '—';
    }
  };

  const exportValue = (id: string, r: Attendance) => {
    switch (id) {
      case 'person': return r.users?.full_name || '';
      case 'date': return r.work_date;
      case 'in': return fmtTime(r.check_in);
      case 'out': return fmtTime(r.check_out);
      case 'hours': return String(r.hours ?? '');
      case 'status': return ATT_LABEL[r.status] || r.status;
      default: return '';
    }
  };

  const doCheckIn = async () => {
    if (!me || !org) return; setBusy(true);
    try { const r = await performCheckIn(me, org); setOpenRow(r); qc.invalidateQueries({ queryKey: qk.attendance(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const doCheckOut = async () => {
    if (!openRow || !org) return; setBusy(true);
    try { await performCheckOut(openRow); setOpenRow(null); qc.invalidateQueries({ queryKey: qk.attendance(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Attendance">
      {isLoading ? <Spinner /> : (
        <>
          <PageHeader help="hr" title="Attendance" subtitle={isAdmin ? 'Your time plus the team’s recent activity' : 'Track your working hours'}
            action={openRow
              ? <button onClick={doCheckOut} disabled={busy} className="btn btn-primary"><Icon name="ti-logout" />Check out</button>
              : <button onClick={doCheckIn} disabled={busy} className="btn btn-primary"><Icon name="ti-login" />Check in</button>} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Status" value={openRow ? 'Checked in' : 'Checked out'} icon="ti-clock" hint={openRow ? `since ${fmtTime(openRow.check_in)}` : undefined} hintTone={openRow ? 'up' : 'muted'} />
            <StatCard label="Today" value={`${todayMine?.hours ?? (openRow ? '…' : 0)} h`} icon="ti-hourglass" />
            <StatCard label="This month" value={`${Math.round(monthHours * 10) / 10} h`} icon="ti-calendar" />
            <StatCard label="Days logged" value={mine.length} icon="ti-checklist" />
          </div>
          <ListView
            rows={rows.length === 0 && !isLoading ? null : shown}
            rowKey={(r) => r.id}
            cols={COLS}
            prefs={prefs}
            cell={cell}
            selection={rs}
            filters={FILTERS}
            searchPlaceholder="Search attendance…"
            groupField={{ value: 'status', label: 'Status' }}
            groupOf={(r) => r.status}
            groups={GROUPS}
            exportName="attendance"
            exportValue={exportValue}
            emptyIcon="ti-clock"
            emptyText="No attendance yet — check in to start"
          />
        </>
      )}
    </Layout>
  );
}
