import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui';
import { startTimer, stopTimer, addManualTime, deleteTimeEntry } from '@/lib/db';
import { useTaskTime, useMyOpenTimer } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { useAuthStore } from '@/lib/store';
import { TimeEntry } from '@/lib/supabase';

export function fmtMins(total: number): string {
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
}

function Elapsed({ since }: { since: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const secs = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="tabular-nums font-mono">{h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`}</span>;
}

/** W1 — per-task time tracking block (task drawer). Timer + manual entries + log. */
export default function TimeTracking({ taskId, orgId, projectId }: {
  taskId: string; orgId: string; projectId?: string | null;
}) {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: entries = [] } = useTaskTime(taskId);
  const { data: myTimer } = useMyOpenTimer(me?.id);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [hh, setHh] = useState(''); const [mm, setMm] = useState('');
  const [note, setNote] = useState('');

  const total = useMemo(() => entries.reduce((a, e) => a + (e.duration_minutes || 0), 0), [entries]);
  const runningHere = myTimer && myTimer.task_id === taskId ? myTimer : null;
  const runningElsewhere = myTimer && myTimer.task_id !== taskId ? myTimer : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.taskTime(taskId) });
    qc.invalidateQueries({ queryKey: ['myTimer'] });
  };
  const onStart = async () => {
    if (!me) return; setBusy(true);
    try { await startTimer({ org_id: orgId, task_id: taskId, project_id: projectId, user_id: me.id }); refresh(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const onStop = async () => {
    if (!myTimer) return; setBusy(true);
    try { await stopTimer(myTimer); refresh(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const onManual = async () => {
    const mins = (parseInt(hh || '0', 10) * 60) + parseInt(mm || '0', 10);
    if (!me || !mins || mins <= 0) return; setBusy(true);
    try { await addManualTime({ org_id: orgId, task_id: taskId, project_id: projectId, user_id: me.id, minutes: mins, notes: note.trim() || undefined }); setHh(''); setMm(''); setNote(''); setManual(false); refresh(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const onDelete = async (e: TimeEntry) => {
    setBusy(true);
    try { await deleteTimeEntry(e.id); refresh(); } catch (er: any) { alert(er.message); } finally { setBusy(false); }
  };

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="flex items-center justify-between mb-2">
        <p className="text-2xs uppercase tracking-wide text-muted2">Time tracked</p>
        <span className="text-xs font-semibold text-content">{total ? fmtMins(total) : '—'}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {runningHere ? (
          <button onClick={onStop} disabled={busy} className="btn h-8 px-3 text-xs bg-rose-500/10 text-rose-500 border-rose-500/30 hover:bg-rose-500/20">
            <Icon name="ti-player-stop" className="mr-1" />Stop · <Elapsed since={runningHere.started_at} />
          </button>
        ) : (
          <button onClick={onStart} disabled={busy || !!runningElsewhere} className="btn h-8 px-3 text-xs"
            title={runningElsewhere ? 'A timer is already running on another task' : undefined}>
            <Icon name="ti-player-play" className="mr-1 text-accentstrong" />Start timer
          </button>
        )}
        {manual ? (
          <span className="flex items-center gap-1.5 flex-wrap">
            <input value={hh} onChange={(e) => setHh(e.target.value.replace(/\D/g, ''))} placeholder="h" className="input h-8 w-12 text-sm" inputMode="numeric" />
            <input value={mm} onChange={(e) => setMm(e.target.value.replace(/\D/g, ''))} placeholder="m" className="input h-8 w-12 text-sm" inputMode="numeric" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="note (optional)" className="input h-8 w-32 text-sm" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onManual(); } }} />
            <button onClick={onManual} disabled={busy} className="btn h-8 px-2 text-xs"><Icon name="ti-check" /></button>
            <button onClick={() => setManual(false)} className="btn-ghost h-8 px-2 text-xs"><Icon name="ti-x" /></button>
          </span>
        ) : (
          <button onClick={() => setManual(true)} className="btn-ghost h-8 px-2 text-xs text-muted"><Icon name="ti-plus" />Log time</button>
        )}
      </div>
      {entries.length > 0 && (
        <div className="mt-3 space-y-1 max-h-40 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div key={e.id} className="group flex items-center gap-2 text-xs text-muted">
              <Icon name={e.ended_at ? (e.is_manual ? 'ti-pencil' : 'ti-clock') : 'ti-player-play'} className={e.ended_at ? 'text-muted2' : 'text-accentstrong'} />
              <span className="text-content font-medium">{e.duration_minutes != null ? fmtMins(e.duration_minutes) : 'running'}</span>
              <span className="truncate">{e.user?.full_name}{e.notes ? ` · ${e.notes}` : ''}</span>
              <span className="ml-auto text-2xs text-muted2 shrink-0">{new Date(e.started_at).toLocaleDateString()}</span>
              {(e.user_id === me?.id) && e.ended_at && (
                <button onClick={() => onDelete(e)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted2 hover:text-rose-500" aria-label="Delete entry">
                  <Icon name="ti-trash" className="text-2xs" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Compact running-timer chip for the app header — visible on every page. */
export function TimerChip() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: myTimer } = useMyOpenTimer(me?.id);
  const [busy, setBusy] = useState(false);
  if (!myTimer) return null;
  const stop = async () => {
    setBusy(true);
    try { await stopTimer(myTimer); qc.invalidateQueries({ queryKey: ['myTimer'] }); qc.invalidateQueries({ queryKey: qk.taskTime(myTimer.task_id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <button onClick={stop} disabled={busy} title="Click to stop the running timer"
      className="hidden sm:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium bg-accent/10 text-accentstrong hover:bg-accent/20 transition-colors max-w-[18rem]">
      <span className="w-1.5 h-1.5 rounded-full bg-accentstrong animate-pulse shrink-0" />
      <span className="truncate max-w-[9rem]">{myTimer.task?.name || 'Timer'}</span>
      <span className="opacity-50 shrink-0">·</span>
      <Elapsed since={myTimer.started_at} />
      <Icon name="ti-player-stop" className="text-sm shrink-0" />
    </button>
  );
}
