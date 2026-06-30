import { useState } from 'react';
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

/** Floating, app-wide feedback capture. Submits via the throttled submit_feedback RPC. */
export default function FeedbackWidget() {
  const org = useActiveOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('idea');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  if (!org?.id) return null;

  const submit = async () => {
    if (!subject.trim()) return;
    setBusy(true); setErr('');
    try {
      const { error } = await sb.rpc('submit_feedback', {
        p_org: org.id, p_kind: kind, p_subject: subject.trim(),
        p_body: body.trim() || null, p_page: router.pathname, p_meta: {},
      });
      if (error) throw new Error(error.message);
      setDone(true); setSubject(''); setBody('');
      setTimeout(() => { setOpen(false); setDone(false); }, 1800);
    } catch (e: any) { setErr(e.message || 'Could not send feedback'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} title="Share feedback"
        className="fixed z-40 bottom-4 left-4 h-10 w-10 rounded-full grid place-items-center bg-accent text-white hover:opacity-90 transition"
        style={{ boxShadow: '0 6px 20px rgba(0,0,0,.18)' }}>
        <Icon name="ti-message-plus" />
      </button>
      {open && (
        <div className="fixed z-50 bottom-16 left-4 w-[320px] card p-4 space-y-3 border border-line shadow-xl">
          {done ? (
            <div className="text-center py-6 space-y-2">
              <Icon name="ti-circle-check" className="text-2xl text-accent" />
              <p className="text-sm font-medium text-content">Thanks for the feedback!</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-content">Share feedback</p>
                <button onClick={() => setOpen(false)} className="text-muted hover:text-content"><Icon name="ti-x" /></button>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {KINDS.map((k) => (
                  <button key={k.k} onClick={() => setKind(k.k)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg text-2xs border transition ${kind === k.k ? 'border-accent text-accentstrong bg-accent/5' : 'border-line text-muted hover:text-content'}`}>
                    <Icon name={k.icon} /> {k.label}
                  </button>
                ))}
              </div>
              <input className="input w-full" placeholder="Short summary" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
              <textarea className="input w-full h-20 resize-none" placeholder="Tell us more (optional)" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
              {err && <p className="text-2xs text-rose-600">{err}</p>}
              <button className="btn btn-primary w-full" disabled={busy || !subject.trim()} onClick={submit}>
                <Icon name={busy ? 'ti-loader-2' : 'ti-send'} className={busy ? 'animate-spin' : ''} />{busy ? 'Sending…' : 'Send feedback'}
              </button>
              <p className="text-[10px] text-muted text-center">Sent privately to your workspace admins.</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
