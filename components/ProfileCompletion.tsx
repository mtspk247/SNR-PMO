import { useEffect, useState } from 'react';
import { Icon, Avatar } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { getMyProfile, updateMyProfile, uploadAvatar, avatarSrc, MyProfile } from '@/lib/db';

/**
 * Dashboard nudge to fill in the rest of a user's profile after onboarding.
 * Required-for-completion: full name, job title, phone (avatar optional).
 * Per-user localStorage dismiss; auto-hides once the required fields are set.
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

  useEffect(() => {
    if (!me?.id) return;
    getMyProfile(me.id).then((r) => {
      setP(r); setFullName(r.full_name || ''); setJobTitle(r.job_title || ''); setPhone(r.phone || ''); setAvatar(r.avatar_url || '');
    }).catch(() => {});
  }, [me?.id]);

  const key = me ? `snr_profile_dismiss_${me.id}` : '';
  const dismissed = typeof window !== 'undefined' && key ? window.localStorage.getItem(key) === '1' : false;
  const isGuest = org?.member_role === 'guest';
  const required: [string, string][] = [['full_name', fullName], ['job_title', jobTitle], ['phone', phone]];
  const missing = required.filter(([, v]) => !v.trim()).length;
  const show = !!p && !isGuest && !dismissed && !done && missing > 0;
  if (!show) return null;

  const filled = required.length - missing;
  const pct = Math.round((filled / required.length) * 100);
  const dismiss = () => { if (typeof window !== 'undefined' && key) window.localStorage.setItem(key, '1'); setDone(true); };
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
      if (fullName.trim() && jobTitle.trim() && phone.trim()) setDone(true);
      else setP((x) => x ? { ...x, full_name: fullName, job_title: jobTitle, phone, avatar_url: avatar } : x);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card p-5 mb-5 relative">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 transition"><Icon name="ti-x" className="text-sm" /></button>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-user-circle" className="text-lg" /></span>
        <div><h3 className="text-sm font-semibold text-content">Complete your profile</h3>
          <p className="text-2xs text-muted">{filled} of {required.length} done — add a few details so teammates know who you are.</p></div>
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
        <button className="btn-ghost text-2xs" onClick={dismiss}>Maybe later</button>
      </div>
    </div>
  );
}
