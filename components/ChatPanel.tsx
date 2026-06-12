import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, Spinner, Avatar, EmptyState } from '@/components/ui';
import { useChatMessages, useProjects } from '@/lib/queries';
import { sendChatMessage, deleteChatMessage, getOrgUsers, getTasks, notify, createReminder } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ChatMessage } from '@/lib/supabase';

// C1 — rich chat: @mentions (notify), #task/#project chips (navigate), /remind.
// Tokens are stored inline in the body: @[Name](user:id) · #[Name](task:id|project:id).
const TOKEN_RE = /([@#])\[([^\]]+)\]\((user|task|project):([0-9a-fA-F-]{36})\)/g;

/** Render a message body with mention highlights + entity link chips. */
function RichBody({ body }: { body: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  const re = new RegExp(TOKEN_RE.source, 'g');
  while ((m = re.exec(body))) {
    if (m.index > last) parts.push(body.slice(last, m.index));
    const [, , label, kind, id] = m;
    if (kind === 'user') {
      parts.push(<span key={i++} className="px-1 rounded bg-accent/15 text-accentstrong font-medium">@{label}</span>);
    } else {
      parts.push(
        <Link key={i++} href={kind === 'task' ? `/tasks?task=${id}` : `/projects/${id}`}
          className="inline-flex items-center gap-0.5 px-1 rounded bg-surface border border-line text-accentstrong hover:bg-accent/10 font-medium">
          <Icon name={kind === 'task' ? 'ti-checkbox' : 'ti-folder'} className="text-2xs" />{label}
        </Link>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <>{parts}</>;
}

/** Parse "/remind <when> <note>" — when = 30m | 2h | 1d | tomorrow | YYYY-MM-DD[ HH:MM]. */
function parseRemind(body: string): { at: Date; note: string } | null {
  const m = body.match(/^\/remind\s+(\S+(?:\s+\d{1,2}:\d{2})?)\s+([\s\S]+)$/);
  if (!m) return null;
  const when = m[1].toLowerCase(); const note = m[2].trim();
  const now = new Date();
  let at: Date | null = null;
  const rel = when.match(/^(\d+)([mhd])$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    at = new Date(now.getTime() + n * (rel[2] === 'm' ? 60e3 : rel[2] === 'h' ? 36e5 : 864e5));
  } else if (when === 'tomorrow') {
    at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  } else if (/^\d{4}-\d{2}-\d{2}/.test(m[1])) {
    const d = new Date(m[1].includes(':') ? m[1].replace(' ', 'T') : m[1] + 'T09:00');
    if (!isNaN(d.getTime())) at = d;
  }
  return at && at > now && note ? { at, note } : null;
}

// ---------------------------------------------------------------------------
// S5 Chat UI. ChatThread is the shared message pane (slide-in panel + /chat
// page both use it); ChatPanel is the Layout slide-over. Polling (12s) lives
// in useChatMessages and stops when the thread unmounts.
// channel = project id, or null for the org-wide channel.
// ---------------------------------------------------------------------------

export function ChatThread({ channel }: { channel: string | null }) {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useChatMessages(channel);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  // autocomplete state: '@' (people) or '#' (tasks/projects)
  const [people, setPeople] = useState<{ id: string; full_name: string }[]>([]);
  const [entities, setEntities] = useState<{ id: string; name: string; kind: 'task' | 'project' }[]>([]);
  const { data: chProjects = [] } = useProjects();
  useEffect(() => { getOrgUsers().then((u: any[]) => setPeople(u)).catch(() => {}); }, [org?.id]);
  useEffect(() => {
    getTasks().then((ts: any[]) => setEntities([
      ...chProjects.map((p: any) => ({ id: p.id, name: p.name, kind: 'project' as const })),
      ...ts.map((t: any) => ({ id: t.id, name: t.name, kind: 'task' as const })),
    ])).catch(() => setEntities(chProjects.map((p: any) => ({ id: p.id, name: p.name, kind: 'project' as const }))));
  }, [org?.id, chProjects.length]);

  const trigger = useMemo(() => {
    const m = draft.match(/(^|\s)([@#])([\w][\w .-]{0,30})?$/);
    if (!m) return null;
    return { sym: m[2] as '@' | '#', q: (m[3] || '').toLowerCase(), start: draft.length - ((m[3] || '').length + 1) };
  }, [draft]);
  const suggestions = useMemo(() => {
    if (!trigger) return [];
    if (trigger.sym === '@') return people.filter((p) => p.full_name.toLowerCase().includes(trigger.q)).slice(0, 6)
      .map((p) => ({ id: p.id, label: p.full_name, kind: 'user' as const }));
    return entities.filter((e) => e.name.toLowerCase().includes(trigger.q)).slice(0, 6)
      .map((e) => ({ id: e.id, label: e.name, kind: e.kind }));
  }, [trigger, people, entities]);
  const pick = (sug: { id: string; label: string; kind: 'user' | 'task' | 'project' }) => {
    if (!trigger) return;
    const sym = sug.kind === 'user' ? '@' : '#';
    setDraft(draft.slice(0, trigger.start) + `${sym}[${sug.label}](${sug.kind}:${sug.id}) `);
  };

  // Keep the latest message in view on new data / channel switch.
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, channel]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !org || !me || busy) return;
    // /remind command — creates a reminder instead of a message
    const rem = parseRemind(body);
    if (body.startsWith('/remind')) {
      if (!rem) { alert('Usage: /remind 30m|2h|1d|tomorrow|YYYY-MM-DD [HH:MM] <note>'); return; }
      setBusy(true);
      try {
        await createReminder({ org_id: org.id, user_id: me.id, note: rem.note, remind_at: rem.at.toISOString(), entity_type: 'chat', entity_id: channel || undefined });
        setDraft(''); alert(`Reminder set for ${rem.at.toLocaleString()}`);
      } catch (e: any) { alert(e?.message || 'Failed'); }
      finally { setBusy(false); }
      return;
    }
    setBusy(true);
    try {
      const msg = await sendChatMessage({ org_id: org.id, project_id: channel, sender_id: me.id, body });
      qc.setQueryData<ChatMessage[]>(qk.chat(org.id, channel), (p) => [...(p || []), msg]);
      setDraft('');
      // notify @mentions (skip self)
      const re = new RegExp(TOKEN_RE.source, 'g'); let mt: RegExpExecArray | null;
      while ((mt = re.exec(body))) {
        if (mt[3] === 'user' && mt[4] !== me.id) {
          notify({ org_id: org.id, user_id: mt[4], type: 'MENTION', title: `${me.full_name || 'Someone'} mentioned you in chat`, body: body.replace(new RegExp(TOKEN_RE.source, 'g'), '$1$2').slice(0, 140), link: '/chat', entity_type: 'chat', entity_id: msg.id }).catch(() => {});
        }
      }
    } catch (e: any) { alert(e?.message || 'Failed to send'); }
    finally { setBusy(false); }
  };

  const remove = async (m: ChatMessage) => {
    if (!org || !confirm('Delete this message?')) return;
    try {
      await deleteChatMessage(m.id);
      qc.setQueryData<ChatMessage[]>(qk.chat(org.id, channel), (p) => (p || []).filter((x) => x.id !== m.id));
    } catch (e: any) { alert(e?.message || 'Failed to delete'); }
  };

  let lastDay = '';
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {isLoading ? <Spinner /> : messages.length === 0 ? (
          <EmptyState icon="ti-messages" text="No messages yet — say hello" />
        ) : messages.map((m) => {
          const mine = m.sender_id === me?.id;
          const day = new Date(m.created_at).toDateString();
          const divider = day !== lastDay; lastDay = day;
          return (
            <div key={m.id}>
              {divider && (
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-line" />
                  <span className="text-2xs text-muted2 shrink-0">{new Date(m.created_at).toLocaleDateString()}</span>
                  <div className="flex-1 h-px bg-line" />
                </div>
              )}
              <div className={`group flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className="shrink-0 self-end"><Avatar name={m.sender?.full_name || '?'} size={26} /></div>
                <div className={`max-w-[78%] min-w-0 ${mine ? 'text-right' : ''}`}>
                  <p className="text-2xs text-muted2 mb-0.5">
                    <span className="font-medium text-muted">{mine ? 'You' : m.sender?.full_name || 'Unknown'}</span>
                    {' · '}
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className={`inline-block text-left text-sm rounded-lg px-3 py-2 whitespace-pre-wrap break-words ${
                    mine ? 'bg-accent/10 border border-accent/20' : 'bg-surface2 border border-line'}`}>
                    <RichBody body={m.body} />
                  </div>
                </div>
                {(mine || isAdmin) && (
                  <button onClick={() => remove(m)} title="Delete message"
                    className="opacity-0 group-hover:opacity-100 self-center p-1 rounded text-muted2 hover:text-rose-500 transition">
                    <Icon name="ti-trash" className="text-xs" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="shrink-0 border-t border-line p-3 relative">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 card shadow-xl border border-line overflow-hidden z-10">
            {suggestions.map((sug) => (
              <button key={`${sug.kind}:${sug.id}`} onClick={() => pick(sug)}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface2">
                <Icon name={sug.kind === 'user' ? 'ti-at' : sug.kind === 'task' ? 'ti-checkbox' : 'ti-folder'} className="text-muted" />
                <span className="truncate">{sug.label}</span>
                <span className="ml-auto text-2xs text-muted2">{sug.kind}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Write a message…  @mention · #task/project · /remind 2h note"
            className="input h-auto min-h-[2.25rem] max-h-32 py-2 resize-none flex-1" />
          <button onClick={send} disabled={busy || !draft.trim()} className="btn btn-primary px-3 shrink-0" title="Send">
            <Icon name="ti-send" className="text-base" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Channel <select> shared by panel + page header. Org channel first, then projects
// the user can see (the projects list is already RLS-scoped).
export function ChannelSelect({ channel, onChange, className = '' }: {
  channel: string | null; onChange: (c: string | null) => void; className?: string;
}) {
  const { data: projects = [] } = useProjects();
  return (
    <select value={channel ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className={`input ${className}`}>
      <option value="">{'# General (everyone)'}</option>
      {projects.map((p) => <option key={p.id} value={p.id}>{`# ${p.name}`}</option>)}
    </select>
  );
}

export default function ChatPanel({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<string | null>(null);
  // Esc closes (matches Modal behaviour).
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40" aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[26rem] bg-surface border-l border-line shadow-2xl flex flex-col">
        <div className="h-14 shrink-0 flex items-center gap-2.5 px-4 border-b border-line">
          <span className="w-8 h-8 rounded-md grid place-items-center bg-accent/10 text-accent shrink-0">
            <Icon name="ti-messages" className="text-base" />
          </span>
          <span className="font-semibold shrink-0">Chat</span>
          <ChannelSelect channel={channel} onChange={setChannel} className="flex-1 min-w-0 h-8 text-xs" />
          <button onClick={onClose} aria-label="Close chat"
            className="p-1.5 rounded-md text-muted hover:text-content hover:bg-surface2 transition shrink-0">
            <Icon name="ti-x" className="text-base" />
          </button>
        </div>
        <ChatThread channel={channel} />
      </aside>
    </>
  );
}
