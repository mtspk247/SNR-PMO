'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { todayISO, daysBetween } from '@/lib/util';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

async function ip() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0] || 'unknown';
}

export async function checkIn() {
  const s = await getSession(); if (!s) return;
  const sb = db(); const date = todayISO();
  const { data: existing } = await sb.from('attendance').select('*').eq('user_id', s.uid).eq('work_date', date).maybeSingle();
  if (existing && existing.status === 'OPEN') return { error: 'Already checked in.' };
  if (existing && existing.check_out) return { error: 'Already completed attendance for today.' };
  const addr = await ip();
  await sb.from('attendance').upsert({ user_id: s.uid, work_date: date, check_in: new Date().toISOString(), status: 'OPEN', check_in_ip: addr }, { onConflict: 'user_id,work_date' });
  await audit({ user_id: s.uid, username: s.username, action: 'CHECK_IN', entity_type: 'attendance', entity_id: date, ip: addr });
  await notify({ user_id: s.uid, type: 'CHECK_IN', title: `${s.full_name} checked in` });
  revalidatePath('/attendance'); revalidatePath('/dashboard');
}

export async function checkOut() {
  const s = await getSession(); if (!s) return;
  const sb = db(); const date = todayISO();
  const { data: rec } = await sb.from('attendance').select('*').eq('user_id', s.uid).eq('work_date', date).maybeSingle();
  if (!rec || rec.status !== 'OPEN') return { error: 'No open check-in found.' };
  const now = new Date();
  const hours = Math.round(((now.getTime() - new Date(rec.check_in).getTime()) / 3600000) * 100) / 100;
  const addr = await ip();
  await sb.from('attendance').update({ check_out: now.toISOString(), hours, status: 'CLOSED', check_out_ip: addr }).eq('id', rec.id);
  await audit({ user_id: s.uid, username: s.username, action: 'CHECK_OUT', entity_type: 'attendance', entity_id: date, new_value: { hours }, ip: addr });
  await notify({ user_id: s.uid, type: 'CHECK_OUT', title: `${s.full_name} checked out (${hours}h)` });
  revalidatePath('/attendance'); revalidatePath('/dashboard');
}

export async function requestLeave(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const sb = db();
  const type = String(fd.get('type'));
  const start = String(fd.get('start_date')); const end = String(fd.get('end_date'));
  const reason = String(fd.get('reason') || '');
  const days = daysBetween(start, end);
  if (days <= 0) return { error: 'Invalid date range.' };
  // balance check (except Unpaid / WFH)
  if (!['Unpaid', 'Work From Home'].includes(type)) {
    const { data: u } = await sb.from('users').select('annual_balance,sick_balance,casual_balance').eq('id', s.uid).single();
    const bal = type === 'Annual' ? u?.annual_balance : type === 'Sick' ? u?.sick_balance : u?.casual_balance;
    if ((bal ?? 0) < days) return { error: `Insufficient ${type} balance (${bal} left, ${days} requested).` };
  }
  const { data: me } = await sb.from('users').select('reports_to').eq('id', s.uid).single();
  let approver = me?.reports_to as string | null;
  if (!approver) { const { data: admin } = await sb.from('users').select('id').eq('role', 'super_admin').limit(1).single(); approver = admin?.id || null; }
  const { data: lv } = await sb.from('leaves').insert({ user_id: s.uid, type, start_date: start, end_date: end, days, reason, status: 'Pending', approver_id: approver }).select('id').single();
  await audit({ user_id: s.uid, username: s.username, action: 'LEAVE_APPLY', entity_type: 'leave', entity_id: lv?.id, new_value: { type, days } });
  if (approver) await notify({ user_id: approver, type: 'LEAVE_STATUS', title: `${s.full_name} requested ${days}d ${type} leave`, link: '/leave/approvals', entity_type: 'leave', entity_id: lv?.id });
  revalidatePath('/leave');
}

export async function decideLeave(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const sb = db();
  const id = String(fd.get('id'));
  const decision = String(fd.get('decision')); // Approved | Rejected
  const comment = String(fd.get('comment') || '');
  const override = fd.get('override') === 'on';
  const { data: lv } = await sb.from('leaves').select('*').eq('id', id).single();
  if (!lv || lv.status !== 'Pending') return { error: 'Already decided.' };
  if (decision === 'Approved' && !['Unpaid', 'Work From Home'].includes(lv.type)) {
    const col = lv.type === 'Annual' ? 'annual_balance' : lv.type === 'Sick' ? 'sick_balance' : 'casual_balance';
    const { data: u } = await sb.from('users').select(col).eq('id', lv.user_id).single();
    const cur = (u as any)?.[col] ?? 0;
    if (cur < lv.days && !override) return { error: 'Insufficient balance — use admin override.' };
    await sb.from('users').update({ [col]: Math.max(0, cur - lv.days) }).eq('id', lv.user_id);
  }
  await sb.from('leaves').update({ status: decision, approver_id: s.uid, decision_comment: comment, admin_override: override, decided_at: new Date().toISOString() }).eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'LEAVE_APPROVE', entity_type: 'leave', entity_id: id, new_value: { decision, override } });
  await notify({ user_id: lv.user_id, type: 'LEAVE_STATUS', title: `Leave ${decision}`, body: comment, link: '/leave', entity_type: 'leave', entity_id: id });
  revalidatePath('/leave/approvals'); revalidatePath('/leave');
}

export async function cancelLeave(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = String(fd.get('id'));
  await db().from('leaves').update({ status: 'Cancelled' }).eq('id', id).eq('user_id', s.uid).eq('status', 'Pending');
  revalidatePath('/leave');
}

export async function markNotificationsRead() {
  const s = await getSession(); if (!s) return;
  await db().from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('user_id', s.uid).eq('is_read', false);
  revalidatePath('/notifications'); revalidatePath('/dashboard');
}
