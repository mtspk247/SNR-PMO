import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { useAuthStore } from '@/lib/store';
import { getMyPendingPolls, voteIdeaPoll, PendingPoll } from '@/lib/db';

// Global "your vote is needed" popup. Surfaces open idea-polls where the current
// user is an invited stakeholder who hasn't voted; stays (minimizable) until they
// vote. Shows a deadline countdown when set. Read RPC is stakeholder-scoped + RLS-safe.
const CHOICES: { key: 'yes' | 'no' | 'abstain'; label: string; cls: string }[] = [
  { key: 'yes', label: 'Yes', cls: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
  { key: 'no', label: 'No', cls: 'bg-rose-500 hover:bg-rose-600 text-white' },
  { key: 'abstain', label: 'Abstain', cls: 'bg-surface2 hover:bg-surface text-content border border-line' },
];

function dueLabel(deadline: string | null): { text: string; urgent: boolean } | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { text: 'closing now', urgent: true };
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  const text = days >= 1 ? `${days}d left to vote` : hrs >= 1 ? `${hrs}h left to vote` : `${mins}m left to vote`;
  return { text, urgent: ms < 24 * 3600 * 1000 };
}

export default function PollPopup() {
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [polls, setPolls] = useState<PendingPoll[]>([]);
  const [busy, setBusy] = useState(false);
  const [min, setMin] = useState(false);

  const refresh = useCallback(() => {
    if (!me) { setPolls([]); return; }
    getMyPendingPolls().then(setPolls).catch(() => {});
  }, [me?.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    try { setMin(localStorage.getItem('snr_poll_min') === '1'); } catch { /* ignore */ }
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    const onPoke = () => refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('snr:polls-refresh', onPoke);
    const t = setInterval(refresh, 4 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('snr:polls-refresh', onPoke); clearInterval(t); };
  }, [refresh]);

  if (!me || polls.length === 0) return null;
  const cur = polls[0];
  const remaining = polls.length;
  const setMinP = (v: boolean) => { setMin(v); try { localStorage.setItem('snr_poll_min', v ? '1' : '0'); } catch { /* ignore */ } };

  const vote = async (choice: 'yes' | 'no' | 'abstain') => {
    if (busy) return; setBusy(true);
    try { await voteIdeaPoll(cur.id, choice); setPolls((p) => p.filter((x) => x.id !== cur.id)); }
    catch { /* keep popup so the vote can be retried */ } finally { setBusy(false); }
  };

  if (min) {
    return (
      <button onClick={() => setMinP(false)} title="Open pending polls"
        className="fixed bottom-16 right-4 z-50 print:hidden inline-flex items-center gap-2 rounded-full bg-accent text-white shadow-lg px-3.5 py-2 text-xs font-medium hover:opacity-90 animate-[fadein_.2s_ease-out]">
        <Icon name="ti-chart-bar" className="text-sm" />{remaining} poll{remaining > 1 ? 's' : ''} need your vote
      </button>
    );
  }
  const due = dueLabel(cur.deadline);
  return (
    <div className="fixed bottom-16 right-4 z-50 print:hidden w-[21rem] max-w-[calc(100vw-2rem)] animate-[fadein_.2s_ease-out]">
      <div className="rounded-xl bg-surface border border-line shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3.5 py-2 bg-accent/10 border-b border-line">
          <Icon name="ti-chart-bar" className="text-accentstrong text-sm" />
          <span className="text-2xs font-semibold uppercase tracking-wide text-accentstrong">Your vote is needed</span>
          {remaining > 1 && <span className="text-2xs text-muted2">1 of {remaining}</span>}
          <button onClick={() => setMinP(true)} title="Minimize" className="ml-auto text-muted2 hover:text-content"><Icon name="ti-minus" className="text-sm" /></button>
        </div>
        <div className="p-3.5">
          <button onClick={() => router.push(`/ideas/${cur.idea_id}`)} className="text-2xs text-muted2 hover:text-accentstrong truncate block max-w-full text-left">{cur.idea_title || 'Idea'}</button>
          <p className="text-sm font-medium text-content mt-0.5">{cur.question}</p>
          {due && <p className={`text-2xs mt-1.5 inline-flex items-center gap-1 ${due.urgent ? 'text-rose-600 font-medium' : 'text-muted2'}`}><Icon name="ti-clock" className="text-2xs" />{due.text}</p>}
          <div className="flex items-center gap-2 mt-3">
            {CHOICES.map((c) => (
              <button key={c.key} disabled={busy} onClick={() => vote(c.key)} className={`flex-1 h-9 rounded-lg text-xs font-semibold transition disabled:opacity-60 ${c.cls}`}>{c.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
