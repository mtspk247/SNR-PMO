import { db } from './supabase';

// Bubble a notification up the reports-to hierarchy (recipient + supervisors).
export async function notify(opts: {
  user_id: string; type: string; title: string; body?: string;
  link?: string; entity_type?: string; entity_id?: string; urgent?: boolean;
}) {
  const sb = db();
  const recipients = new Set<string>();
  let current: string | null = opts.user_id;
  let guard = 0;
  while (current && guard < 8) {
    if (recipients.has(current)) break;
    recipients.add(current);
    const { data } = await sb.from('users').select('reports_to').eq('id', current).single();
    current = (data?.reports_to as string) || null;
    guard++;
  }
  const rows = Array.from(recipients).map((uid) => ({
    user_id: uid, type: opts.type, title: opts.title, body: opts.body ?? null,
    link: opts.link ?? null, entity_type: opts.entity_type ?? null,
    entity_id: opts.entity_id ?? null, urgent: !!opts.urgent,
  }));
  if (rows.length) await sb.from('notifications').insert(rows);
}
