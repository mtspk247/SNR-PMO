import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, Spinner } from '@/components/ui';
import Select from '@/components/Select';
import AgentPanel from '@/components/AgentPanel';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listConversations, listSocialMessages, sendSocialReply, setConversationStatus, markConversationRead,
  SocialConversation, SocialMessage,
} from '@/lib/db';

const PLAT_ICON: Record<string, string> = {
  facebook: 'ti-brand-facebook', instagram: 'ti-brand-instagram', linkedin: 'ti-brand-linkedin', x: 'ti-brand-x',
  youtube: 'ti-brand-youtube', tiktok: 'ti-brand-tiktok', threads: 'ti-brand-threads', pinterest: 'ti-brand-pinterest', google_business: 'ti-brand-google',
};
const KIND_ICON: Record<string, string> = { comment: 'ti-message-2', dm: 'ti-mail', mention: 'ti-at', reply: 'ti-arrow-back-up' };
const STATUS_PILL: Record<string, string> = { open: 'pill-amber', pending: 'pill-blue', closed: 'pill-green' };
const ago = (s: string) => { const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h' : Math.floor(m / 1440) + 'd'; };

export default function SocialInbox() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [convs, setConvs] = useState<SocialConversation[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<SocialMessage[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (org) listConversations(org.id, filter).then(setConvs).catch((e) => { setErr(e.message); setConvs([]); }); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id, filter]);
  useEffect(() => { if (sel) listSocialMessages(sel).then(setMsgs).catch(() => setMsgs([])); else setMsgs([]); }, [sel]);

  const current = useMemo(() => (convs || []).find((c) => c.id === sel) || null, [convs, sel]);
  const openConv = (c: SocialConversation) => { setSel(c.id); if (c.unread) markConversationRead(c.id).then(load).catch(() => {}); };

  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Social Inbox"><EmptyState icon="ti-inbox" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const doReply = async () => {
    if (!org || !me || !sel || !reply.trim()) return;
    setBusy(true); setErr('');
    try { await sendSocialReply(org.id, sel, reply.trim(), me.id); setReply(''); listSocialMessages(sel).then(setMsgs); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const setStatus = async (st: 'open' | 'pending' | 'closed') => { if (!sel) return; try { await setConversationStatus(sel, st); load(); } catch (e: any) { setErr(e.message); } };

  const unreadCount = (convs || []).filter((c) => c.unread).length;

  return (
    <Layout flat title="Social Inbox">
      <PageHeader help="social" title="Social Inbox" icon="ti-inbox"
        subtitle="Every comment, mention and DM across your channels — one place"
        action={<Select value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'pending', label: 'Pending' }, { value: 'closed', label: 'Closed' }]} />}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {convs === null ? <div className="p-10"><Spinner /></div> : convs.length === 0 ? (
        <EmptyState icon="ti-inbox" title="Inbox is empty" text="Replies, comments, mentions and DMs land here once your channels are connected for two-way messaging." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="card overflow-hidden lg:col-span-1 max-h-[70vh] overflow-y-auto">
            <div className="px-3 py-2 border-b border-line text-2xs text-muted2">{convs.length} conversations · {unreadCount} unread</div>
            <ul className="divide-y divide-line">
              {convs.map((c) => (
                <li key={c.id}>
                  <button onClick={() => openConv(c)} className={`w-full text-left px-3 py-2.5 hover:bg-surface2/50 transition ${sel === c.id ? 'bg-surface2/70' : ''}`}>
                    <div className="flex items-center gap-2">
                      <Icon name={PLAT_ICON[c.platform || ''] || 'ti-world'} className="text-muted shrink-0" />
                      <span className={`flex-1 min-w-0 truncate text-sm ${c.unread ? 'font-semibold text-content' : 'text-content'}`}>{c.participant_name || c.participant_handle || 'Someone'}</span>
                      {c.unread && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                      <span className="text-[10px] text-muted2 shrink-0">{ago(c.last_message_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon name={KIND_ICON[c.kind] || 'ti-message'} className="text-2xs text-muted2 shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-2xs text-muted">{c.subject || c.kind}</span>
                      <span className={`pill ${STATUS_PILL[c.status] || 'pill-gray'} text-[10px] shrink-0`}>{c.status}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Thread */}
          <div className="lg:col-span-2 space-y-4">
            {!current ? (
              <div className="card p-10"><EmptyState icon="ti-message-2" title="Select a conversation" text="Pick a conversation on the left to read and reply." /></div>
            ) : (
              <div className="card overflow-hidden flex flex-col max-h-[70vh]">
                <div className="px-4 py-2.5 border-b border-line flex items-center gap-2">
                  <Icon name={PLAT_ICON[current.platform || ''] || 'ti-world'} className="text-muted" />
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{current.participant_name || current.participant_handle}</p><p className="text-2xs text-muted2 truncate">{current.participant_handle} · {current.kind}</p></div>
                  <Select value={current.status} onChange={(v) => setStatus(v as any)} options={[{ value: 'open', label: 'Open' }, { value: 'pending', label: 'Pending' }, { value: 'closed', label: 'Closed' }]} />
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.direction === 'outbound' ? 'bg-accent/15 text-content' : 'bg-surface2 text-content'}`}>
                        {m.status === 'draft' && <span className="pill pill-gray text-[10px] mr-1">draft</span>}
                        {m.body}
                        <div className="text-[10px] text-muted2 mt-0.5">{m.author || (m.direction === 'outbound' ? 'You' : '')} · {ago(m.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-line p-2.5 flex items-end gap-2">
                  <textarea className="input flex-1 min-h-[42px] max-h-32" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doReply(); }} />
                  <button className="btn btn-primary" disabled={busy || !reply.trim()} onClick={doReply}><Icon name="ti-send" />Reply</button>
                </div>
              </div>
            )}
            <AgentPanel domain="marketing" />
          </div>
        </div>
      )}
    </Layout>
  );
}
