import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
export default function TimeTracking({ taskId, orgId, projectId, variant = 'full' }: {
  taskId: string; orgId: string; projectId?: string | null; variant?: 'full' | 'icon';
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

  if (variant === 'icon') {
    return runningHere ? (
      <button onClick={onStop} disabled={busy} title="Stop timer"
        className="inline-flex items-center gap-1.5 h-8 px-2 rounded-lg text-xs font-medium text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30">
        <Icon name="ti-player-stop" className="text-base" /><Elapsed since={runningHere.started_at} />
      </button>
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <button onClick={onStart} disabled={busy || !!runningElsewhere} title={runningElsewhere ? 'A timer is already running on another task' : 'Start timer'}
          className="h-8 w-8 grid place-items-center rounded-lg text-accentstrong border border-line hover:bg-surface2 disabled:opacity-50">
          <Icon name="ti-player-play" className="text-base" />
        </button>
        {total > 0 && <span className="text-xs text-muted2 tabular-nums">{fmtMins(total)}</span>}
      </span>
    );
  }

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

/** Compact running-timer chip for the app header — clickable task + project; Start/Stop toggle + X close. */
const PKEY = (uid?: string) => `snr-paused-timer-${uid || 'anon'}`;
type Paused = { taskId: string; projectId: string | null; orgId: string; taskName: string; projectName: string | null };

export function TimerChip() {
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: myTimer } = useMyOpenTimer(me?.id);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<Paused | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(PKEY(me?.id)); setPaused(raw ? JSON.parse(raw) : null); } catch { /* ignore */ }
  }, [me?.id]);
  const savePaused = (p: Paused | null) => {
    setPaused(p);
    try { if (p) localStorage.setItem(PKEY(me?.id), JSON.stringify(p)); else localStorage.removeItem(PKEY(me?.id)); } catch { /* ignore */ }
  };
  useEffect(() => { if (myTimer && paused) savePaused(null); /* eslint-disable-next-line */ }, [myTimer?.id]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['myTimer'] }); if (myTimer) qc.invalidateQueries({ queryKey: qk.taskTime(myTimer.task_id) }); };

  // Toggle: when running -> Stop (save the entry, keep the chip so it can be restarted); when stopped -> Start a new entry.
  const onToggle = async () => {
    if (busy) return; setBusy(true);
    try {
      if (myTimer) {
        await stopTimer(myTimer);
        savePaused({ taskId: myTimer.task_id, projectId: myTimer.project_id ?? null, orgId: myTimer.org_id, taskName: myTimer.task?.name || 'Task', projectName: myTimer.project?.name ?? null });
        invalidate();
      } else if (me && paused) {
        await startTimer({ org_id: paused.orgId, task_id: paused.taskId, project_id: paused.projectId, user_id: me.id });
        savePaused(null); qc.invalidateQueries({ queryKey: ['myTimer'] });
      }
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  // X: close the chip entirely (stop the timer first if it is running).
  const onClose = async () => {
    if (busy) return; setBusy(true);
    try { if (myTimer) await stopTimer(myTimer); savePaused(null); invalidate(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const running = !!myTimer;
  if (!running && !paused) return null;
  const taskId = running ? myTimer!.task_id : paused!.taskId;
  const taskName = running ? (myTimer!.task?.name || 'Timer') : paused!.taskName;
  const projectName = running ? (myTimer!.project?.name ?? null) : paused!.projectName;

  return (
    <div className={`hidden sm:flex items-center gap-2 h-9 pl-2.5 pr-1 rounded-md text-xs font-medium max-w-[22rem] ${running ? 'bg-accent/10 text-accentstrong' : 'bg-amber-500/10 text-amber-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${running ? 'bg-accentstrong animate-pulse' : 'bg-amber-500'}`} />
      <Link href={`/tasks?task=${taskId}`} className="min-w-0 leading-tight hover:underline" title="Open task">
        <span className="block truncate max-w-[10rem]">{taskName}</span>
        <span className="block truncate max-w-[10rem] text-2xs opacity-70 font-normal">{projectName || 'No project'}{running ? '' : ' · stopped'}</span>
      </Link>
      <span className="opacity-50 shrink-0">·</span>
      {running ? <Elapsed since={myTimer!.started_at} /> : <span className="tabular-nums font-mono">stopped</span>}
      <span className="flex items-center gap-0.5 shrink-0">
        <button onClick={onToggle} disabled={busy} title={running ? 'Stop (keeps it so you can restart)' : 'Start again'}
          className={`h-7 w-7 grid place-items-center rounded ${running ? 'text-rose-500 hover:bg-rose-500/20' : 'text-accentstrong hover:bg-accent/20'}`}>
          <Icon name={running ? 'ti-player-stop' : 'ti-player-play'} className="text-sm" />
        </button>
        <button onClick={onClose} disabled={busy} title="Close" className="h-7 w-7 grid place-items-center rounded text-muted hover:bg-surface2"><Icon name="ti-x" className="text-sm" /></button>
      </span>
    </div>
  );
}
