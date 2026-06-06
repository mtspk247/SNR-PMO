'use server';
import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { recalcProgress } from './projects';
import { revalidatePath } from 'next/cache';

export async function createTask(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const project_id = fd.get('project_id') || null;
  const parent_task_id = fd.get('parent_task_id') || null;
  const assignee_id = fd.get('assignee_id') || null;
  const row: any = {
    project_id, parent_task_id,
    name: String(fd.get('name') || '').trim(),
    description: String(fd.get('description') || ''),
    status: String(fd.get('status') || 'Backlog'),
    priority: String(fd.get('priority') || 'Medium'),
    assignee_id, due_date: fd.get('due_date') || null,
    estimated_hours: Number(fd.get('estimated_hours') || 0),
    created_by: s.uid,
  };
  if (!row.name) return;
  const { data } = await db().from('tasks').insert(row).select('id,project_id').single();
  await audit({ user_id: s.uid, username: s.username, action: 'CREATE', entity_type: 'task', entity_id: data?.id, new_value: row });
  if (assignee_id) await notify({ user_id: String(assignee_id), type: 'TASK_ASSIGNED', title: `New task: ${row.name}`, link: `/tasks/${data?.id}`, entity_type: 'task', entity_id: data?.id });
  if (project_id) await recalcProgress(String(project_id));
  revalidatePath('/tasks'); if (project_id) revalidatePath(`/projects/${project_id}`);
}

export async function updateTaskStatus(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = String(fd.get('id'));
  const status = String(fd.get('status'));
  const sb = db();
  const { data: task } = await sb.from('tasks').select('*').eq('id', id).single();
  if (!task) return;
  // Blocking rule: parent cannot be Done until all subtasks Done.
  if (status === 'Done') {
    const { data: subs } = await sb.from('tasks').select('status').eq('parent_task_id', id);
    if ((subs || []).some(x => x.status !== 'Done' && x.status !== 'Cancelled')) {
      return { error: 'All subtasks must be Done first.' };
    }
  }
  await sb.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'STATUS_CHANGE', entity_type: 'task', entity_id: id, old_value: { status: task.status }, new_value: { status } });
  if (task.assignee_id && task.assignee_id !== s.uid)
    await notify({ user_id: task.assignee_id, type: 'TASK_ASSIGNED', title: `Task "${task.name}" → ${status}`, link: `/tasks/${id}`, entity_type: 'task', entity_id: id });
  if (task.project_id) await recalcProgress(task.project_id);
  revalidatePath('/tasks'); revalidatePath(`/tasks/${id}`);
}

export async function updateTask(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = String(fd.get('id'));
  const patch: any = {
    name: fd.get('name'), description: fd.get('description'),
    priority: fd.get('priority'), assignee_id: fd.get('assignee_id') || null,
    due_date: fd.get('due_date') || null, estimated_hours: Number(fd.get('estimated_hours') || 0),
    actual_hours: Number(fd.get('actual_hours') || 0), updated_at: new Date().toISOString(),
  };
  await db().from('tasks').update(patch).eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'UPDATE', entity_type: 'task', entity_id: id, new_value: patch });
  revalidatePath(`/tasks/${id}`); revalidatePath('/tasks');
}

export async function deleteTask(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = String(fd.get('id'));
  await db().from('tasks').delete().eq('id', id);
  await audit({ user_id: s.uid, username: s.username, action: 'DELETE', entity_type: 'task', entity_id: id });
  revalidatePath('/tasks');
}

export async function addComment(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const entity_type = String(fd.get('entity_type'));
  const entity_id = String(fd.get('entity_id'));
  const body = String(fd.get('body') || '').trim();
  if (!body) return;
  const sb = db();
  // parse @mentions
  const handles = Array.from(body.matchAll(/@([\w.@-]+)/g)).map(m => m[1]);
  let mentions: string[] = [];
  if (handles.length) {
    const { data: us } = await sb.from('users').select('id,username,email').or(handles.map(h => `username.eq.${h},email.eq.${h}`).join(','));
    mentions = (us || []).map(u => u.id);
  }
  const { data: c } = await sb.from('comments').insert({ entity_type, entity_id, author_id: s.uid, body, mentions }).select('id').single();
  await audit({ user_id: s.uid, username: s.username, action: 'CREATE', entity_type: 'comment', entity_id: c?.id, new_value: { entity_type, entity_id } });
  const link = entity_type === 'task' ? `/tasks/${entity_id}` : `/projects/${entity_id}`;
  for (const m of mentions) if (m !== s.uid) await notify({ user_id: m, type: 'MENTION', title: `${s.full_name} mentioned you`, body, link, entity_type, entity_id });
  // notify task assignee + followers
  if (entity_type === 'task') {
    const { data: t } = await sb.from('tasks').select('assignee_id,followers,name').eq('id', entity_id).single();
    const targets = new Set<string>([...(t?.followers || []), ...(t?.assignee_id ? [t.assignee_id] : [])]);
    for (const u of targets) if (u !== s.uid && !mentions.includes(u)) await notify({ user_id: u, type: 'COMMENT', title: `New comment on "${t?.name}"`, body, link, entity_type, entity_id });
  }
  revalidatePath(link);
}

export async function createTag(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const scope = String(fd.get('scope') || 'Personal');
  if (scope === 'Global' && !['super_admin','pm'].includes(s.role)) return;
  await db().from('tags').insert({ name: String(fd.get('name')), color: String(fd.get('color') || '#3b82f6'), scope, created_by: s.uid });
  revalidatePath('/tasks');
}
