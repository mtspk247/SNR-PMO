import { useEffect, useState } from 'react';
import { Icon, Avatar } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { getMyProfile, updateMyProfile, uploadAvatar, avatarSrc, MyProfile } from '@/lib/db';
import AvatarPicker from '@/components/AvatarPicker';

/** Persistent "Your profile" editor (name, title, phone, photo) — for everyone, in Settings. */
export default function ProfileSettings() {
  const me = useAuthStore((s) => s.user);
  const org = useActiveOrg();
  const [p, setP] = useState<MyProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!me?.id) return;
    getMyProfile(me.id).then((r) => { setP(r); setFullName(r.full_name || ''); setJobTitle(r.job_title || ''); setPhone(r.phone || ''); setAvatar(r.avatar_url || ''); }).catch(() => {});
  }, [me?.id]);

  if (!p) return null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f || !me?.id || !org?.id) return;
    setBusy(true); setMsg('');
    try { const path = await uploadAvatar(org.id, me.id, f); setAvatar(path); setMsg('Photo updated'); }
    catch (er: any) { setMsg(er.message || 'Upload failed'); } finally { setBusy(false); }
  };
  const save = async () => {
    if (!me?.id) return; setBusy(true); setMsg('');
    try {
      await updateMyProfile(me.id, { full_name: fullName.trim() || null, job_title: jobTitle.trim() || null, phone: phone.trim() || null, avatar_url: avatar.trim() || null });
      setMsg('Saved');
    } catch (e: any) { setMsg(e.message || 'Save failed'); } finally { setBusy(false); }
  };

  return (
    <div className="card p-6 mb-6 max-w-4xl">
      <p className="section-label mb-4">Your profile</p>
      <div className="mb-5">
        <AvatarPicker value={avatar} name={fullName || me?.full_name} onChange={setAvatar} onUpload={(file) => uploadAvatar(org!.id, me!.id, file)} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="label">Full name</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" /></div>
        <div><label className="label">Job title</label><input className="input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Project Manager" /></div>
        <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" /></div>
      </div>
      <div className="flex items-center gap-3 mt-5 pt-4 border-t border-line">
        <button onClick={save} disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : 'Save profile'}</button>
        {msg && <span className={`text-sm ${msg === 'Saved' || msg === 'Photo updated' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span>}
      </div>
    </div>
  );
}
