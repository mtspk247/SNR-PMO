import { useEffect, useState } from 'react';
import { Icon, Avatar } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { getMyProfile, updateMyProfile, uploadAvatar, avatarSrc, MyProfile } from '@/lib/db';

/**
 * Dashboard nudge to complete a user's profile (full name, job title, phone).
 * Visibility is driven by the SAVED profile snapshot — NOT the live inputs — so the
 * card never unmounts mid-typing. Dismissible per-user (localStorage); auto-hides
 * once the required fields are saved.
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

  const isGuest = org?.member_role === 'guest';
  // SAVED-state visibility (the fix): only the persisted profile decides show/hide.
  const savedMissing = p ? [p.full_name, p.job_title, p.phone].filter((v) => !(v || '').trim()).length : 0;
  const show = !!p && !isGuest && !done && !dismissed && savedMissing > 0;
  if (!show) return null;

  // Progress bar reflects live inputs for nice feedback while typing.
  const liveFilled = [fullName, jobTitle, phone].filter((v) => v.trim()).length;
  const pct = Math.round((liveFilled / 3) * 100);

  const dismiss = () => { if (typeof window !== 'undefined' && dismissKey) window.localStorage.setItem(dismissKey, '1'); setDismissed(true); };
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
      // Update the saved snapshot AFTER a successful save so visibility recomputes correctly.
      setP((x) => x ? { ...x, full_name: fullName, job_title: jobTitle, phone, avatar_url: avatar } : x);
      if (fullName.trim() && jobTitle.trim() && phone.trim()) setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5 mb-5 relative">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 transition"><Icon name="ti-x" className="text-sm" /></button>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-user-circle" className="text-lg" /></span>
        <div><h3 className="text-sm font-semibold text-content">Complete your profile</h3>
          <p className="text-2xs text-muted">{liveFilled} of 3 done — add a few details so teammates know who you are.</p></div>
      </div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden my-3"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="label">Full name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></div>
        <div><label className="label">Job title</label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Project Manager" /></div>
        <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" /></div>
        <div className="sm:col-span-2"><label className="label">Photo <span className="text-muted2">(optional)</span></label>
          <div className="flex items-center gap-3">
            <Avatar name={fullName || me?.full_name || 'U'} size={44} src={avatarSrc(avatar)} />
            <label className="btn cursor-pointer"><Icon name="ti-upload" className="text-sm" />Upload photo<input type="file" accept="image/*" className="hidden" onChange={onFile} /></label>
            {avatar && <button type="button" onClick={() => setAvatar('')} className="btn-ghost text-xs text-muted">Remove</button>}
          </div></div>
      </div>
      {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
      <div className="flex items-center gap-2 mt-3">
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>
        <button type="button" className="btn-ghost text-2xs text-muted" onClick={dismiss}>Skip for now</button>
      </div>
    </div>
  );
}
