import { useEffect, useState } from 'react';
import { Icon, Avatar } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { getMyProfile, updateMyProfile, uploadAvatar, avatarSrc, MyProfile } from '@/lib/db';

/**
 * Login-time modal nudging a user to complete their profile (full name, job title,
 * phone). Shown as a centered overlay in front of the app on first login, dismissible
 * by ESC, backdrop click, the close button, or "Skip for now". Visibility is driven by
 * the SAVED profile snapshot (not live inputs) and a per-user localStorage dismiss flag,
 * and auto-hides once the required fields are saved.
 */
export default function ProfileCompletion() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const [p, setP] = useState<MyProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = me?.id ? `snr_profile_dismissed_${me.id}` : '';
  useEffect(() => { if (typeof window !== 'undefined' && dismissKey) setDismissed(window.localStorage.getItem(dismissKey) === '1'); }, [dismissKey]);

  useEffect(() => {
    if (!me?.id) return;
    getMyProfile(me.id).then((r) => {
      setP(r); setFullName(r.full_name || ''); setJobTitle(r.job_title || ''); setPhone(r.phone || ''); setAvatar(r.avatar_url || '');
    }).catch(() => {});
  }, [me?.id]);

  const dismiss = () => { if (typeof window !== 'undefined' && dismissKey) window.localStorage.setItem(dismissKey, '1'); setDismissed(true); };

  const isGuest = org?.member_role === 'guest';
  // SAVED-state visibility (the fix): only the persisted profile decides show/hide.
  const savedMissing = p ? [p.full_name, p.job_title, p.phone].filter((v) => !(v || '').trim()).length : 0;
  const show = !!p && !isGuest && !done && !dismissed && savedMissing > 0;

  // While open: ESC closes and the background is scroll-locked. Gated on `show` so the
  // listener is only active when the modal is actually visible.
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show) return null;

  // Progress bar reflects live inputs for nice feedback while typing.
  const liveFilled = [fullName, jobTitle, phone].filter((v) => v.trim()).length;
  const pct = Math.round((liveFilled / 3) * 100);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f || !me?.id || !org?.id) return;
    setBusy(true); setErr('');
    try { const path = await uploadAvatar(org.id, me.id, f); setAvatar(path); }
    catch (er: any) { setErr(er.message); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!me?.id) return; setBusy(true); setErr('');
    try {
      await updateMyProfile(me.id, { full_name: fullName.trim() || null, job_title: jobTitle.trim() || null, phone: phone.trim() || null, avatar_url: avatar.trim() || null });
      setP((x) => x ? { ...x, full_name: fullName, job_title: jobTitle, phone, avatar_url: avatar } : x);
      if (fullName.trim() && jobTitle.trim() && phone.trim()) setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 sm:p-6 bg-black/50 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"
      onMouseDown={dismiss}
    >
      <div className="card p-5 sm:p-6 w-full max-w-xl relative shadow-2xl my-auto" onMouseDown={(e) => e.stopPropagation()}>
        <button onClick={dismiss} aria-label="Close" className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentstrong/40 transition"><Icon name="ti-x" className="text-base" /></button>
        <div className="flex items-center gap-3 mb-1 pr-8">
          <span className="w-10 h-10 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-user-circle" className="text-xl" /></span>
          <div><h3 id="profile-modal-title" className="text-base font-semibold text-content">Complete your profile</h3>
            <p className="text-2xs text-muted">{liveFilled} of 3 done — add a few details so teammates know who you are.</p></div>
        </div>
        <div className="h-1.5 rounded-full bg-surface2 overflow-hidden my-4"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Full name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></div>
          <div><label className="label">Job title</label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Project Manager" /></div>
          <div><label className="label">Phone</label><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" /></div>
          <div className="sm:col-span-2"><label className="label">Photo <span className="text-muted2">(optional)</span></label>
            <div className="flex items-center gap-3">
              <Avatar name={fullName || me?.full_name || 'U'} size={44} src={avatarSrc(avatar)} />
              <label className="btn cursor-pointer"><Icon name="ti-upload" className="text-sm" />Upload photo<input type="file" accept="image/*" className="hidden" onChange={onFile} /></label>
              {avatar && <button type="button" onClick={() => setAvatar('')} className="btn-ghost text-xs text-muted">Remove</button>}
            </div></div>
        </div>
        {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
        <div className="flex items-center gap-2 mt-4">
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
          <button type="button" className="btn-ghost text-2xs text-muted" onClick={dismiss}>Skip for now</button>
          <span className="ml-auto text-2xs text-muted2 hidden sm:inline">Press Esc to close</span>
        </div>
      </div>
    </div>
  );
}
