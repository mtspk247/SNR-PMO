'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

async function recalcProgress(projectId: string) {
  const sb = db();
  const { data: tasks } = await sb.from('tasks').select('status').eq('project_id', projectId).is('parent_task_id', null);
  const list = tasks || [];
  const done = list.filter(t => t.status === 'Done').length;
  const prog = list.length ? Math.round((done / list.length) * 100) : 0;
  await sb.from('projects').update({ progress: prog }).eq('id', projectId);
}

export async function createProject(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const name = String(fd.get('name') || '').trim();
  if (!name) return;
  const row = {
    name, description: String(fd.get('description') || ''),
    status: String(fd.get('status') || 'Planning'),
    priority: String(fd.get('priority') || 'Medium'),
    start_date: fd.get('start_date') || null, end_date: fd.get('end_date') || null,
    pm_id: fd.get('pm_id') || s.uid, created_by: s.uid,
  };
  const { data, error } = await db().from('projects').insert(row).select('id').single();
  if (!error) await audit({ user_id: s.uid, username: s.username, action: 'CREATE', entity_type: 'project', entity_id: data?.id, new_value: row });
  revalidatePath('/projects'); revalidatePath('/');
}

export async function updateProject(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = String(fd.get('id'));
  const patch: any = {
    name: fd.get('name'), description: fd.get('description'),
    status: fd.get('status'), priority: fd.get('priority'),
    start_date: fd.get('start_date') || null, end_date: fd.get('end_date') || null,
    pm_id: fd.get('pm_id') || null,
  };
  await db().from('projects').update(patch).eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'UPDATE', entity_type: 'project', entity_id: id, new_value: patch });
  revalidatePath('/projects'); revalidatePath(`/projects/${id}`);
}

export async function deleteProject(fd: FormData) {
  const s = await getSession(); if (!s || s.role !== 'super_admin') return;
  const id = String(fd.get('id'));
  await db().from('projects').delete().eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'DELETE', entity_type: 'project', entity_id: id });
  revalidatePath('/projects');
}
export { recalcProgress };
