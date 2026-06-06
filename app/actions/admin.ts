'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { makeSalt, hashPassword } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function createUser(fd: FormData) {
  const s = await getSession(); if (!s || s.role !== 'super_admin') return;
  const salt = makeSalt();
  const pwd = String(fd.get('password') || 'Welcome@2026');
  const row: any = {
    username: String(fd.get('username')).trim(), email: String(fd.get('email')).trim(),
    full_name: String(fd.get('full_name')), role: String(fd.get('role') || 'team_member'),
    department: String(fd.get('department') || ''), status: 'active',
    reports_to: fd.get('reports_to') || null, salt, password_hash: hashPassword(pwd, salt),
    created_by: s.uid,
  };
  const { error } = await db().from('users').insert(row);
  if (error) return { error: error.message };
  await audit({ user_id: s.uid, username: s.username, action: 'CREATE', entity_type: 'user', new_value: { username: row.username, role: row.role } });
  revalidatePath('/users');
}

export async function updateUser(fd: FormData) {
  const s = await getSession(); if (!s || s.role !== 'super_admin') return;
  const id = String(fd.get('id'));
  const patch: any = {
    full_name: fd.get('full_name'), email: fd.get('email'),
    role: fd.get('role'), department: fd.get('department'),
    status: fd.get('status'), reports_to: fd.get('reports_to') || null,
    annual_balance: Number(fd.get('annual_balance') || 0),
    sick_balance: Number(fd.get('sick_balance') || 0),
    casual_balance: Number(fd.get('casual_balance') || 0),
    can_view_all_projects: fd.get('can_view_all_projects') === 'on',
    can_edit_all_projects: fd.get('can_edit_all_projects') === 'on',
    can_approve_leaves: fd.get('can_approve_leaves') === 'on',
    can_delete_tasks: fd.get('can_delete_tasks') === 'on',
    can_manage_users: fd.get('can_manage_users') === 'on',
    can_export_data: fd.get('can_export_data') === 'on',
  };
  const newPwd = String(fd.get('password') || '');
  if (newPwd) { const salt = makeSalt(); patch.salt = salt; patch.password_hash = hashPassword(newPwd, salt); }
  await db().from('users').update(patch).eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'UPDATE', entity_type: 'user', entity_id: id, new_value: { role: patch.role, status: patch.status } });
  revalidatePath('/users');
}

export async function saveSetting(fd: FormData) {
  const s = await getSession(); if (!s || s.role !== 'super_admin') return;
  const key = String(fd.get('key')); const value = String(fd.get('value'));
  await db().from('config').upsert({ key, value, updated_at: new Date().toISOString() });
  await audit({ user_id: s.uid, username: s.username, action: 'UPDATE', entity_type: 'config', entity_id: key, new_value: { value } });
  revalidatePath('/settings');
}
