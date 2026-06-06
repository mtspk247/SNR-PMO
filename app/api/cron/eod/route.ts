import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { todayISO } from '@/lib/util';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('key') === secret;
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EOD_FROM || 'SNR-PMO <onboarding@resend.dev>';
  if (!key) return { sent: false, reason: 'no RESEND_API_KEY' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return { sent: res.ok };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const sb = db();
  const date = todayISO();
  const { data: users } = await sb.from('users').select('*').eq('status', 'active');
  const all = users || [];
  const pms = all.filter(u => u.role === 'pm' || u.role === 'super_admin');
  const [{ data: att }, { data: tasks }, { data: leaves }] = await Promise.all([
    sb.from('attendance').select('*').eq('work_date', date),
    sb.from('tasks').select('assignee_id,status,due_date,name,updated_at'),
    sb.from('leaves').select('approver_id,status'),
  ]);
  const attMap = new Map((att || []).map(a => [a.user_id, a]));
  const results: any[] = [];

  for (const pm of pms) {
    const team = all.filter(u => u.reports_to === pm.id || (pm.role === 'super_admin' && u.id !== pm.id));
    if (team.length === 0) continue;
    let rows = '';
    for (const m of team) {
      const a = attMap.get(m.id);
      const mine = (tasks || []).filter(t => t.assignee_id === m.id);
      const done = mine.filter(t => t.status === 'Done').length;
      const inprog = mine.filter(t => t.status === 'In Progress').length;
      const overdue = mine.filter(t => t.due_date && t.due_date < date && t.status !== 'Done').length;
      const checkIn = a ? new Date(a.check_in).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : '—';
      const checkOut = a ? (a.check_out ? new Date(a.check_out).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : 'Still Checked In') : 'No activity recorded';
      rows += `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${m.full_name}</b><br><span style="color:#6b7280;font-size:12px">${m.role}</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${checkIn} → ${checkOut}<br><span style="color:#6b7280">${a?.hours ?? 0}h</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">✓ ${done} · ▶ ${inprog} · <span style="color:#ef4444">⚠ ${overdue}</span></td></tr>`;
    }
    const pendingLeaves = (leaves || []).filter(l => l.approver_id === pm.id && l.status === 'Pending').length;
    const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto">
      <div style="background:#1e3a8a;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0"><h2 style="margin:0">SNR-PMO Daily Summary</h2>
      <div style="opacity:.85">${date} · ${pm.full_name} · Team of ${team.length}</div></div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:16px;border-radius:0 0 10px 10px">
      ${pendingLeaves ? `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:8px;margin-bottom:12px">${pendingLeaves} pending leave approval(s)</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:#6b7280">
      <th style="padding:6px 10px">Member</th><th style="padding:6px 10px">Attendance</th><th style="padding:6px 10px">Tasks (Done·Active·Overdue)</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">Automated end-of-day report · SNR-PMO</p></div></div>`;
    const r = await sendEmail(pm.email, `[SNR-PMO] Daily Summary — ${date} — ${pm.full_name}`, html);
    if (!r.sent) await notify({ user_id: pm.id, type: 'SYSTEM', title: `EOD summary ready (${date})`, body: `${team.length} team members. ${pendingLeaves} pending leave(s). Configure RESEND_API_KEY to email.` });
    results.push({ pm: pm.username, team: team.length, emailed: r.sent });
  }
  return NextResponse.json({ ok: true, date, summaries: results });
}
