import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { Spinner, EmptyState, Avatar, Icon } from '@/components/ui';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { useTeams } from '@/lib/queries';
import { FEATURE_LABELS } from '@/lib/entitlements';
import {
  getAdminUser, updateUserAdmin, updateMyProfile, uploadAvatar, avatarSrc,
  getUserActivity, ActivityItem, changeOwnPassword,
  getUserEmail, saveUserEmail, deleteUserEmail, UserEmailConfig,
  listRoleTemplates, getMyNotifSettings, getNotificationPrefs, saveNotificationPrefs, NotifSetting,
} from '@/lib/db';
import { AdminUser, RoleTemplate } from '@/lib/supabase';

const ROLES = ['super_admin', 'pm', 'team_member', 'viewer'];
const PERMS: { key: keyof AdminUser; label: string }[] = [
  { key: 'can_view_all_projects', label: 'View all projects' },
  { key: 'can_edit_all_projects', label: 'Edit all projects' },
  { key: 'can_approve_leaves', label: 'Approve leaves' },
  { key: 'can_delete_tasks', label: 'Delete tasks' },
  { key: 'can_manage_users', label: 'Manage users' },
  { key: 'can_view_dashboard', label: 'View dashboard' },
  { key: 'can_export_data', label: 'Export data' },
];
type Tab = 'profile' | 'access' | 'email' | 'notifications' | 'security' | 'activity';

const Section = ({ children }: { children: React.ReactNode }) => <div className="card p-5 sm:p-6 max-w-3xl space-y-4">{children}</div>;
const Note = ({ msg }: { msg: string }) => msg ? <span className={`text-sm ${/saved|updated|done/i.test(msg) ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span> : null;

export default function UserDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isSelf = !!me?.id && me.id === id;
  const isAdmin = can.manageMembers(org);
  const { data: teams = [] } = useTeams();

  const [u, setU] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('profile');
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getAdminUser(id).then(setU).catch(() => setU(null)).finally(() => setLoading(false));
    listRoleTemplates().then(setRoles).catch(() => {});
  }, [id]);

  if (!isAdmin && !isSelf) {
    return <Layout flat title="User"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You don&rsquo;t have access to this profile.</div></Layout>;
  }

  const patch = async (p: Partial<AdminUser>) => {
    if (!u) return; setBusy(true);
    try { const r = await updateUserAdmin(u.id, p); setU(r); } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const myTeams = teams.filter((t) => (t.members || []).some((m) => m.user_id === id)).map((t) => t.name);

  const tabs: { key: Tab; label: string; icon: string; show: boolean }[] = [
    { key: 'profile', label: 'Profile', icon: 'ti-user', show: true },
    { key: 'access', label: 'Access & roles', icon: 'ti-shield-lock', show: isAdmin },
    { key: 'email', label: 'Email', icon: 'ti-mail', show: isSelf },
    { key: 'notifications', label: 'Notifications', icon: 'ti-bell', show: isSelf },
    { key: 'security', label: 'Security', icon: 'ti-key', show: isSelf },
    { key: 'activity', label: 'Activity', icon: 'ti-history', show: isAdmin || isSelf },
  ].filter((t) => t.show);

  return (
    <Layout flat title={u?.full_name || 'User'}>
      {loading ? <Spinner /> : !u ? <EmptyState text="User not found" icon="ti-user-off" /> : (
        <>
          <div className="flex items-center gap-2 mb-4 text-sm text-muted">
            <Link href="/users" className="hover:text-content inline-flex items-center gap-1"><Icon name="ti-arrow-left" />Users</Link>
          </div>
          <div className="flex items-center gap-4 mb-6">
            <Avatar name={u.full_name} size={64} src={avatarSrc(u.avatar_url || '')} />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">{u.full_name}</h1>
              <p className="text-sm text-muted truncate">{u.email}{u.job_title ? ` · ${u.job_title}` : ''}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <span className="pill pill-gray capitalize">{(u.role || 'viewer').replace('_', ' ')}</span>
                {u.status === 'suspended' && <span className="pill pill-red">Suspended</span>}
                {u.company?.name && <span className="pill pill-gray">{u.company.name}</span>}
                {myTeams.slice(0, 2).map((t) => <span key={t} className="pill pill-gray">{t}</span>)}
              </div>
            </div>
          </div>

          <div className="flex gap-1 border-b border-line mb-5 overflow-x-auto">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${tab === t.key ? 'border-b-accent text-content' : 'border-b-transparent text-muted hover:text-content'}`}>
                <Icon name={t.icon} className="text-base" />{t.label}
              </button>
            ))}
          </div>

          {tab === 'profile' && <ProfileTab u={u} isSelf={isSelf} isAdmin={isAdmin} orgId={org?.id || ''} onSaved={(r) => setU(r)} />}
          {tab === 'access' && isAdmin && <AccessTab u={u} roles={roles} busy={busy} patch={patch} myTeams={myTeams} />}
          {tab === 'email' && isSelf && <EmailTab orgId={org?.id || ''} />}
          {tab === 'notifications' && isSelf && <NotificationsTab orgId={org?.id || ''} userId={u.id} />}
          {tab === 'security' && isSelf && <SecurityTab email={u.email} />}
          {tab === 'activity' && <ActivityTab userId={u.id} />}
        </>
      )}
    </Layout>
  );
}

function ProfileTab({ u, isSelf, isAdmin, orgId, onSaved }: { u: AdminUser; isSelf: boolean; isAdmin: boolean; orgId: string; onSaved: (r: AdminUser) => void }) {
  const [fullName, setFullName] = useState(u.full_name || '');
  const [jobTitle, setJobTitle] = useState(u.job_title || '');
  const [phone, setPhone] = useState(u.phone || '');
  const [department, setDepartment] = useState(u.department || '');
  const [avatar, setAvatar] = useState(u.avatar_url || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const canEdit = isSelf || isAdmin;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f || !orgId) return;
    setBusy(true); setMsg('');
    try { const path = await uploadAvatar(orgId, u.id, f); setAvatar(path); setMsg('Photo updated'); }
    catch (er: any) { setMsg(er.message || 'Upload failed'); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      if (isSelf) await updateMyProfile(u.id, { full_name: fullName.trim() || null, job_title: jobTitle.trim() || null, phone: phone.trim() || null, avatar_url: avatar.trim() || null });
      else { const r = await updateUserAdmin(u.id, { full_name: fullName.trim(), job_title: (jobTitle.trim() || null) as any, phone: (phone.trim() || null) as any, department: (department.trim() || null) as any }); onSaved(r); }
      setMsg('Saved');
    } catch (e: any) { setMsg(e.message || 'Save failed'); } finally { setBusy(false); }
  };

  return (
    <Section>
      <div className="flex items-center gap-4">
        <Avatar name={fullName || u.full_name || 'U'} size={56} src={avatarSrc(avatar)} />
        {isSelf && <div className="flex items-center gap-2">
          <label className="btn cursor-pointer"><Icon name="ti-upload" className="text-sm" />Upload photo<input type="file" accept="image/*" className="hidden" onChange={onFile} /></label>
          {avatar && <button type="button" onClick={() => setAvatar('')} className="btn-ghost text-xs text-muted">Remove</button>}
        </div>}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="label">Full name</label><input className="input" value={fullName} disabled={!canEdit} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><label className="label">Job title / designation</label><input className="input" value={jobTitle} disabled={!canEdit} onChange={(e) => setJobTitle(e.target.value)} placeholder="Project Manager" /></div>
        <div><label className="label">Phone</label><input className="input" value={phone} disabled={!canEdit} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 1234" /></div>
        <div><label className="label">Department</label><input className="input" value={department} disabled={!isAdmin} onChange={(e) => setDepartment(e.target.value)} placeholder="Operations" /></div>
        <div><label className="label">Email</label><input className="input" value={u.email} disabled /></div>
        <div><label className="label">Company</label><input className="input" value={u.company?.name || '—'} disabled /></div>
      </div>
      {canEdit && <div className="flex items-center gap-3 pt-2 border-t border-line"><button onClick={save} disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : 'Save profile'}</button><Note msg={msg} /></div>}
    </Section>
  );
}

function AccessTab({ u, roles, busy, patch, myTeams }: { u: AdminUser; roles: RoleTemplate[]; busy: boolean; patch: (p: Partial<AdminUser>) => void; myTeams: string[] }) {
  const t = u.role_template_id ? roles.find((r) => r.id === u.role_template_id) : null;
  const isSuper = u.role === 'super_admin';
  const permLabels = isSuper ? ['Full access'] : (t ? PERMS.filter((p) => (t.permissions as any)[p.key as string]).map((p) => p.label) : PERMS.filter((p) => !!u[p.key]).map((p) => p.label));
  const modules = isSuper ? 'All modules' : (t ? (t.feature_access.length ? t.feature_access.map((fk) => FEATURE_LABELS[fk as keyof typeof FEATURE_LABELS] || fk).join(', ') : 'All modules') : 'All modules');
  return (
    <Section>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="label">Role</label><Select value={u.role} disabled={busy} onChange={(v) => patch({ role: v as any })} options={ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') }))} /></div>
        <div><label className="label">Status</label><Select value={u.status} disabled={busy} onChange={(v) => patch({ status: v as any })} options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} /></div>
      </div>
      <div>
        <label className="label">Role template</label>
        <Select value={u.role_template_id || ''} disabled={busy} onChange={(v) => patch({ role_template_id: (v || null) as any })} options={[{ value: '', label: 'None (custom permissions)' }, ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
        <p className="text-2xs text-muted mt-1">Assigning a template applies its permissions and module access. Manage templates under the Roles tab on the Users page.</p>
      </div>
      <div className="rounded-lg border border-line bg-surface2/40 p-4">
        <p className="text-2xs uppercase tracking-wide text-muted mb-2 font-medium">Effective access
          {t && <span className="pill pill-gray ml-1.5 normal-case">via {t.name}</span>}
          {isSuper && <span className="pill pill-green ml-1.5 normal-case">Super admin</span>}
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">{permLabels.length ? permLabels.map((l) => <span key={l} className="pill pill-gray">{l}</span>) : <span className="text-2xs text-muted">No permissions granted</span>}</div>
        <p className="text-2xs text-muted"><span className="font-medium text-content">Modules:</span> {modules}</p>
        <p className="text-2xs text-muted mt-1"><span className="font-medium text-content">Teams:</span> {myTeams.length ? myTeams.join(', ') : 'None'}</p>
      </div>
      <div className="pt-2">
        <p className="text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Custom permissions</p>
        <p className="text-2xs text-muted mb-3">{u.role_template_id ? 'A role template is assigned — effective access is shown above. These toggles apply only when no template is set.' : 'Used as this user’s effective access (no template assigned).'}</p>
        <div className="space-y-2">
          {PERMS.map((p) => (
            <label key={String(p.key)} className="flex items-center justify-between text-sm py-1.5 cursor-pointer hover:bg-surface2/50 px-2 rounded">
              <span className="text-content">{p.label}</span>
              <input type="checkbox" checked={!!u[p.key]} disabled={busy} onChange={(e) => patch({ [p.key]: e.target.checked } as any)} className="accent-accent w-4 h-4" />
            </label>
          ))}
        </div>
      </div>
    </Section>
  );
}

function EmailTab({ orgId }: { orgId: string }) {
  const [c, setC] = useState<UserEmailConfig | null>(null);
  const [provider, setProvider] = useState<'smtp' | 'gmail'>('smtp');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(true);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => { if (!orgId) return; getUserEmail(orgId).then((r) => {
    setC(r);
    if (r) { setProvider((r.provider as any) || 'smtp'); setFromName(r.from_name || ''); setFromEmail(r.from_email || ''); setReplyTo(r.reply_to || ''); setHost(r.smtp_host || ''); setPort(r.smtp_port || 587); setSecure(r.smtp_secure ?? true); setSmtpUser(r.smtp_user || ''); setEnabled(r.enabled); }
  }).catch(() => {}); };
  useEffect(load, [orgId]);

  const pickGmail = () => { setProvider('gmail'); setHost('smtp.gmail.com'); setPort(587); setSecure(true); };
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      await saveUserEmail(orgId, { provider, from_name: fromName.trim() || null, from_email: fromEmail.trim() || null, reply_to: replyTo.trim() || null, smtp_host: (provider === 'gmail' ? 'smtp.gmail.com' : host.trim()) || null, smtp_port: provider === 'gmail' ? 587 : port, smtp_secure: secure, smtp_user: smtpUser.trim() || fromEmail.trim() || null, smtp_pass: smtpPass || '', enabled });
      setSmtpPass(''); setMsg('Saved'); load();
    } catch (e: any) { setMsg(e.message || 'Save failed'); } finally { setBusy(false); }
  };
  const remove = async () => { if (!confirm('Remove your email configuration?')) return; setBusy(true); try { await deleteUserEmail(orgId); setMsg('Removed'); setC(null); setFromEmail(''); setHost(''); setEnabled(false); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };

  return (
    <Section>
      <div>
        <p className="text-sm font-semibold">Your sending email</p>
        <p className="text-2xs text-muted mt-1">Connect your own mailbox so reports and (future) automations send as you. Secrets are stored encrypted server-side and never shown back. This is separate from the platform email used for sign-in and system notices.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setProvider('smtp')} className={`btn ${provider === 'smtp' ? 'btn-primary' : ''}`}><Icon name="ti-server" />Custom SMTP</button>
        <button type="button" onClick={pickGmail} className={`btn ${provider === 'gmail' ? 'btn-primary' : ''}`}><Icon name="ti-brand-google" />Gmail</button>
      </div>
      {provider === 'gmail' && <p className="text-2xs text-muted -mt-1">Gmail uses an <strong>App Password</strong> (Google account → Security → App passwords) with host smtp.gmail.com. One-click OAuth connect arrives with the automations release.</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="label">From name</label><input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Jane Doe" /></div>
        <div><label className="label">From address</label><input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="jane@company.com" /></div>
        <div><label className="label">Reply-to (optional)</label><input className="input" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} /></div>
        {provider === 'smtp' && <div><label className="label">SMTP host</label><input className="input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.yourhost.com" /></div>}
        {provider === 'smtp' && <div><label className="label">Port</label><input type="number" className="input" value={port} onChange={(e) => setPort(parseInt(e.target.value) || 587)} /></div>}
        <div><label className="label">SMTP username</label><input className="input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder={fromEmail || 'username'} /></div>
        <div><label className="label">{provider === 'gmail' ? 'App password' : 'SMTP password'}</label><input type="password" className="input" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder={c?.has_smtp_pass ? '•••••••• (unchanged)' : ''} /></div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="accent-accent w-4 h-4" />Use TLS/SSL</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-accent w-4 h-4" />Enable sending</label>
        {c?.status && <span className={`pill ${c.status === 'configured' ? 'pill-green' : 'pill-gray'}`}>{c.status}</span>}
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-line">
        <button onClick={save} disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : 'Save email settings'}</button>
        {c && <button onClick={remove} disabled={busy} className="btn text-rose-600">Remove</button>}
        <Note msg={msg} />
      </div>
    </Section>
  );
}

function NotificationsTab({ orgId, userId }: { orgId: string; userId: string }) {
  const [rows, setRows] = useState<NotifSetting[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (!orgId) return; Promise.all([getMyNotifSettings(orgId), getNotificationPrefs(userId)]).then(([s, p]) => { setRows(s); setPrefs(p); }).catch(() => {}); }, [orgId, userId]);
  const toggle = async (key: string, val: boolean) => {
    const next = { ...prefs, [key]: val }; setPrefs(next); setBusy(true); setMsg('');
    try { await saveNotificationPrefs(userId, next); setRows(await getMyNotifSettings(orgId)); setMsg('Saved'); }
    catch (e: any) { setMsg(e.message || 'Save failed'); } finally { setBusy(false); }
  };
  const cats = Array.from(new Set(rows.map((r) => r.category || 'General')));
  return (
    <Section>
      <div><p className="text-sm font-semibold">Your notifications</p><p className="text-2xs text-muted mt-1">Choose what you receive. Required ones are set by your admin and can&rsquo;t be turned off. Options shown reflect your role and your plan.</p></div>
      {rows.length === 0 ? <EmptyState text="No notification types available" icon="ti-bell-off" /> : cats.map((cat) => (
        <div key={cat}>
          <p className="text-2xs uppercase tracking-wide text-muted2 font-medium mb-1">{cat}</p>
          <div className="divide-y divide-line">
            {rows.filter((r) => (r.category || 'General') === cat).map((r) => (
              <label key={r.key} className={`flex items-center justify-between gap-4 py-2.5 ${r.locked ? 'opacity-70' : 'cursor-pointer'}`}>
                <span><span className="text-sm text-content">{r.label}</span>{r.description && <span className="block text-2xs text-muted">{r.description}</span>}</span>
                <span className="flex items-center gap-2 shrink-0">{r.locked && <span className="pill pill-gray">Required</span>}<input type="checkbox" disabled={r.locked || busy} checked={r.locked ? true : (prefs[r.key] ?? r.enabled)} onChange={(e) => toggle(r.key, e.target.checked)} className="accent-accent w-4 h-4" /></span>
              </label>
            ))}
          </div>
        </div>
      ))}
      <Note msg={msg} />
    </Section>
  );
}

function SecurityTab({ email }: { email: string }) {
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    setMsg('');
    if (nw.length < 8) { setMsg('New password must be at least 8 characters'); return; }
    if (nw !== cf) { setMsg('New passwords do not match'); return; }
    setBusy(true);
    try { await changeOwnPassword(email, cur, nw); setMsg('Password updated'); setCur(''); setNw(''); setCf(''); }
    catch (e: any) { setMsg(e.message || 'Could not update password'); } finally { setBusy(false); }
  };
  return (
    <Section>
      <div><p className="text-sm font-semibold">Change password</p><p className="text-2xs text-muted mt-1">Enter your current password, then your new one.</p></div>
      <div className="grid gap-4 max-w-md">
        <div><label className="label">Current password</label><input type="password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} /></div>
        <div><label className="label">New password</label><input type="password" className="input" value={nw} onChange={(e) => setNw(e.target.value)} /></div>
        <div><label className="label">Confirm new password</label><input type="password" className="input" value={cf} onChange={(e) => setCf(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-line"><button onClick={submit} disabled={busy || !cur || !nw} className="btn btn-primary">{busy ? 'Updating…' : 'Update password'}</button><Note msg={msg} /></div>
    </Section>
  );
}

function ActivityTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getUserActivity(userId, 40).then(setItems).catch(() => {}).finally(() => setLoading(false)); }, [userId]);
  return (
    <Section>
      <p className="text-sm font-semibold">Recent activity</p>
      {loading ? <Spinner /> : items.length === 0 ? <EmptyState text="No recorded activity" icon="ti-history" /> : (
        <div className="divide-y divide-line">
          {items.map((a) => (
            <div key={a.id} className="flex items-start gap-3 py-2.5">
              <Icon name="ti-point-filled" className="text-muted2 text-xs mt-1" />
              <div className="min-w-0 flex-1"><p className="text-sm text-content">{a.action.replace(/_/g, ' ')}{a.entity_type ? ` · ${a.entity_type}` : ''}</p><p className="text-2xs text-muted">{new Date(a.ts).toLocaleString()}</p></div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
