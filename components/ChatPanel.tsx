import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, Spinner, Avatar, EmptyState } from '@/components/ui';
import { useChatMessages, useProjects } from '@/lib/queries';
import { sendChatMessage, deleteChatMessage } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { ChatMessage } from '@/lib/supabase';

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

  // Keep the latest message in view on new data / channel switch.
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, channel]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !org || !me || busy) return;
    setBusy(true);
    try {
      const msg = await sendChatMessage({ org_id: org.id, project_id: channel, sender_id: me.id, body });
      qc.setQueryData<ChatMessage[]>(qk.chat(org.id, channel), (p) => [...(p || []), msg]);
      setDraft('');
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
                    {m.body}
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
      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Write a message…  (Enter to send, Shift+Enter for newline)"
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
