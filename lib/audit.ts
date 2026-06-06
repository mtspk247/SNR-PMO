import { db } from './supabase';

export async function audit(opts: {
  user_id?: string; username?: string; action: string;
  entity_type?: string; entity_id?: string;
  old_value?: any; new_value?: any; ip?: string;
}) {
  try {
    await db().from('audit_log').insert({
      user_id: opts.user_id ?? null,
      username: opts.username ?? null,
      action: opts.action,
      entity_type: opts.entity_type ?? null,
      entity_id: opts.entity_id ?? null,
      old_value: opts.old_value ?? null,
      new_value: opts.new_value ?? null,
      ip: opts.ip ?? null,
    });
  } catch (e) { console.error('audit failed', e); }
}
