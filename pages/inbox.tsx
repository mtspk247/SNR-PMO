import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listMessages, sendSms, CommsMessage } from '@/lib/db';

type Thread = { addr: string; msgs: CommsMessage[]; last: CommsMessage; lastInbound: boolean };

export default function InboxPage() {
  const org = useActiveOrg();
  const enabled = hasFeature(org, 'comms');
  const [msgs, setMsgs] = useState<CommsMessage[] | null>(null);
  const [sel, setSel] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (org) listMessages(org.id).then(setMsgs).catch((e) => setErr(e.message)); };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, CommsMessage[]>();
    for (const m of (msgs || [])) {
      const addr = (m.direction === 'inbound' ? m.from_addr : m.to_addr) || 'unknown';
      const arr = map.get(addr) || []; arr.push(m); map.set(addr, arr);
    }
    const out: Thread[] = [];
    for (const entry of Array.from(map.entries())) {
      const addr = entry[0];
      const sorted = entry[1].slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      const last = sorted[sorted.length - 1];
      out.push({ addr, msgs: sorted, last, lastInbound: last.direction === 'inbound' });
    }
    out.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
    return out;
  }, [msgs]);

  const active = threads.find((t) => t.addr === sel) || null;

  const send = async () => {
    if (!org || !active || !reply.trim() || busy) return; setBusy(true); setErr('');
    try { await sendSms(org.id, active.addr, reply.trim()); setReply(''); setTimeout(load, 1200); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return <Layout flat title="Inbox"><EmptyState icon="ti-inbox" title="Inbox not in your plan" text="Upgrade for two-way SMS conversations with your contacts." /></Layout>;

  return (
    <Layout flat title="Inbox">
      <PageHeader title="Inbox" subtitle="Two-way SMS conversations with your contacts." icon="ti-inbox" help="messaging" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid lg:grid-cols-3 gap-4" style={{ minHeight: '60vh' }}>
        <div className={'card p-0 overflow-hidden lg:col-span-1 ' + (active ? 'hidden lg:block' : '')}>
          <div className="px-4 py-3 border-b border-line text-sm font-semibold">Conversations</div>
          {threads.length === 0 ? <p className="p-4 text-2xs text-muted">No conversations yet. Send an SMS from Messaging, and replies land here.</p> : (
            <div className="divide-y divide-line max-h-[70vh] overflow-y-auto">
              {threads.map((t) => (
                <button key={t.addr} onClick={() => setSel(t.addr)} className={'w-full text-left px-4 py-3 hover:bg-surface2 ' + (sel === t.addr ? 'bg-surface2' : '')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-content truncate">{t.addr}</span>
                    <span className="text-2xs text-muted2 shrink-0">{new Date(t.last.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <p className="text-2xs text-muted truncate mt-0.5">{t.lastInbound ? '' : 'You: '}{t.last.body}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="card p-0 overflow-hidden lg:col-span-2 flex flex-col">
          {!active ? (
            <div className="flex-1 grid place-items-center text-2xs text-muted p-6">Select a conversation</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                <button className="lg:hidden text-muted2" onClick={() => setSel('')}><Icon name="ti-arrow-left" /></button>
                <span className="text-sm font-semibold text-content">{active.addr}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh]">
                {active.msgs.map((m) => (
                  <div key={m.id} className={'flex ' + (m.direction === 'inbound' ? 'justify-start' : 'justify-end')}>
                    <div className={'max-w-[75%] rounded-2xl px-3 py-2 text-sm ' + (m.direction === 'inbound' ? 'bg-surface2 text-content' : 'bg-accent/15 text-content')}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="text-2xs text-muted2 mt-1">{new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}{m.direction !== 'inbound' && m.status ? ' - ' + m.status : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line p-3 flex items-center gap-2">
                <input className="input flex-1" placeholder="Type a reply" value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }} />
                <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={send}><Icon name="ti-send" className="text-sm" />{busy ? '...' : 'Send'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
