import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { Icon } from '@/components/ui';

const KINDS = [
  { k: 'idea', label: 'Idea', icon: 'ti-bulb' },
  { k: 'bug', label: 'Bug', icon: 'ti-bug' },
  { k: 'praise', label: 'Praise', icon: 'ti-heart' },
  { k: 'other', label: 'Other', icon: 'ti-message-dots' },
];

/** Rich client metadata captured with each submission (display-only diagnostics). */
function collectMeta(rating: number): Record<string, any> {
  if (typeof window === 'undefined') return { app_version: '1' };
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Other';
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { /* ignore */ }
  return {
    rating: rating || undefined,
    device: /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop', browser, os,
    screen: `${window.screen.width}x${window.screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}`,
    locale: navigator.language, timezone: tz,
    mode: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    referrer: document.referrer || undefined, online: navigator.onLine, href: window.location.href, app_version: '1',
  };
}

/** Feedback capture panel — no button of its own; opened from the Shortcuts FAB ('snr:open-feedback'). */
export default function FeedbackWidget() {
  const org = useActiveOrg(); const router = useRouter();
  const [open, setOpen] = useState(false); const [kind, setKind] = useState('idea'); const [subject, setSubject] = useState('');
  const [body, setBody] = useState(''); const [rating, setRating] = useState(0); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { const onOpen = () => { setDone(false); setErr(''); setOpen(true); }; window.addEventListener('snr:open-feedback', onOpen); return () => window.removeEventListener('snr:open-feedback', onOpen); }, []);
  if (!open) return null;
  const submit = async () => {
    if (!subject.trim() || !org?.id) return; setBusy(true); setErr('');
    try { const { error } = await sb.rpc('submit_feedback', { p_org: org.id, p_kind: kind, p_subject: subject.trim(), p_body: body.trim() || null, p_page: router.pathname, p_meta: collectMeta(rating) }); if (error) throw new Error(error.message);
      setDone(true); setSubject(''); setBody(''); setRating(0); setTimeout(() => { setOpen(false); setDone(false); }, 1600); }
    catch (e: any) { setErr(e.message || 'Could not send feedback'); } finally { setBusy(false); }
  };
  return (
    <div className="fixed z-[60] bottom-5 right-5 w-[330px] card p-4 space-y-3 border border-line shadow-2xl">
      {done ? (
        <div className="text-center py-6 space-y-2"><Icon name="ti-circle-check" className="text-2xl text-accent" /><p className="text-sm font-medium text-content">Thanks for the feedback!</p></div>
      ) : (
        <>
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-content">Share feedback</p><button onClick={() => setOpen(false)} className="text-muted hover:text-content"><Icon name="ti-x" /></button></div>
          {!org?.id && <p className="text-2xs text-muted">Open a workspace to send feedback.</p>}
          <div className="grid grid-cols-4 gap-1">{KINDS.map((k) => (<button key={k.k} onClick={() => setKind(k.k)} className={`flex flex-col items-center gap-1 py-2 rounded-lg text-2xs border transition ${kind === k.k ? 'border-accent text-accentstrong bg-accent/5' : 'border-line text-muted hover:text-content'}`}><Icon name={k.icon} /> {k.label}</button>))}</div>
          <div className="flex items-center gap-1"><span className="text-2xs text-muted mr-1">Rate:</span>{[1, 2, 3, 4, 5].map((n) => (<button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} className="text-base leading-none" style={{ color: n <= rating ? '#f59e0b' : '#9ca3af' }}>★</button>))}</div>
          <input className="input w-full" placeholder="Short summary" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="input w-full h-20 resize-none" placeholder="Tell us more (optional)" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          {err && <p className="text-2xs text-rose-600">{err}</p>}
          <button className="btn btn-primary w-full" disabled={busy || !subject.trim() || !org?.id} onClick={submit}><Icon name={busy ? 'ti-loader-2' : 'ti-send'} className={busy ? 'animate-spin' : ''} />{busy ? 'Sending…' : 'Send feedback'}</button>
          <p className="text-[10px] text-muted text-center">Sent privately to your workspace admins.</p>
        </>
      )}
    </div>
  );
}
