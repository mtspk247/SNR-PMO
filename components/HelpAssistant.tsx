import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { askAssistant, AssistantTurn } from '@/lib/db';
import { retrieveSections, sectionPlain, SECTIONS } from '@/lib/docs';

// In-app AI help assistant. Knowledge = the LIVE /docs SECTIONS (lib/docs.ts):
// every question retrieves matching sections at query time and grounds the answer
// in their current text — so editing /docs keeps this current automatically, with
// no retraining. The LLM call is a thin edge-fn proxy; if no key is configured it
// degrades to retrieval (shows the most relevant section + a deep-link).

type Source = { id: string; title: string };
type Msg = { role: 'user' | 'assistant'; content: string; sources?: Source[] };

const HIDE_KEY = 'help_assistant_hidden';

export default function HelpAssistant() {
  const org = useActiveOrg();
  const brand = org?.branding?.name || org?.name || 'the app';
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { try { setHidden(localStorage.getItem(HIDE_KEY) === '1'); } catch { /* */ } }, []);
  useEffect(() => { if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [msgs, open, busy]);
  // Openable from anywhere (e.g. the Shortcuts FAB 'Ask AI' action).
  useEffect(() => {
    const onOpen = () => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* */ } setOpen(true); };
    window.addEventListener('snr:open-assistant', onOpen);
    return () => window.removeEventListener('snr:open-assistant', onOpen);
  }, []);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: AssistantTurn[] = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: question }]);
    setQ('');
    setBusy(true);

    const hits = retrieveSections(question, 3);
    const sources: Source[] = hits.map((h) => ({ id: h.section.id, title: h.section.title }));
    const grounding = hits.map((h) => ({ id: h.section.id, title: h.section.title, text: sectionPlain(h.section) }));

    try {
      const reply = await askAssistant({ question, brand, history, grounding });
      if (reply.configured && reply.answer) {
        setMsgs((m) => [...m, { role: 'assistant', content: reply.answer!, sources }]);
      } else {
        // Retrieval-only fallback (no LLM key configured) — still fully live.
        if (hits.length) {
          const top = hits[0].section;
          const firstP = top.blocks.find((b) => b.kind === 'p') as { text: string } | undefined;
          const body = firstP?.text || sectionPlain(top).split('\n').slice(1, 3).join(' ');
          setMsgs((m) => [...m, { role: 'assistant', content: `Closest match: "${top.title}". ${body}`, sources }]);
        } else {
          setMsgs((m) => [...m, { role: 'assistant', content: "I couldn't find that in the guide. Open the full guide to browse.", sources: [{ id: SECTIONS[0].id, title: 'Open the guide' }] }]);
        }
      }
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Couldn't reach the assistant just now. The guide has the answer — try the sources below.`, sources }]);
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  const SUGGEST = ['How do I invite my team?', 'Set up my business profile', 'How does billing work?'];

  return (
    <div className="fixed right-5 bottom-20 z-40 print:hidden">
      {/* Panel */}
      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-[22rem] max-w-[calc(100vw-2.5rem)] h-[30rem] max-h-[calc(100vh-9rem)] bg-surface border border-line rounded-2xl shadow-xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <span className="w-7 h-7 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-sparkles" className="text-sm" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-content leading-tight truncate">Help</p>
              <p className="text-2xs text-muted leading-tight truncate">Grounded in your guide</p>
            </div>
            <Link href="/docs" title="Open the full guide" className="ml-auto text-muted hover:text-content"><Icon name="ti-book-2" className="text-base" /></Link>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-content"><Icon name="ti-x" className="text-base" /></button>
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-content">Ask me anything about using {brand}.</p>
                <div className="flex flex-col gap-1.5">
                  {SUGGEST.map((s) => (
                    <button key={s} onClick={() => send(s)} className="text-left text-xs px-3 py-2 rounded-lg bg-surface2 hover:bg-accent/10 text-content transition-colors">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={m.role === 'user'
                  ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-accent text-white px-3 py-2 text-sm'
                  : 'max-w-[92%] text-sm text-content'}>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.sources.map((s) => (
                        <Link key={s.id} href={`/docs#${s.id}`} onClick={() => setOpen(false)}
                          className="inline-flex items-center gap-1 text-2xs px-2 py-1 rounded-full bg-surface2 text-muted hover:text-accentstrong hover:bg-accent/10 transition-colors">
                          <Icon name="ti-book-2" className="text-2xs" />{s.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="text-sm text-muted flex items-center gap-1.5"><Icon name="ti-loader-2" className="text-sm animate-spin" />Thinking…</div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="border-t border-line p-2.5 flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question…" disabled={busy}
              className="input flex-1 text-sm" aria-label="Ask the help assistant" />
            <button type="submit" disabled={busy || !q.trim()} aria-label="Send"
              className="w-9 h-9 shrink-0 rounded-lg grid place-items-center bg-accent text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
              <Icon name="ti-arrow-up" className="text-base" />
            </button>
          </form>
        </div>
      )}

      {/* Launcher removed — 'Ask' now lives in the single FAB cluster (ShortcutsFab);
          this panel opens via the 'snr:open-assistant' event the FAB's Ask button fires. */}
    </div>
  );
}
