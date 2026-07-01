import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { socialProviderStatus, socialProviderSetConfig, SocialProviderStatus } from '@/lib/db';

const PROVIDERS: { key: string; label: string; icon: string; scopes: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin', scopes: 'openid profile w_member_social' },
  { key: 'facebook', label: 'Facebook', icon: 'ti-brand-facebook', scopes: 'pages_manage_posts pages_read_engagement' },
  { key: 'instagram', label: 'Instagram', icon: 'ti-brand-instagram', scopes: 'instagram_basic instagram_content_publish' },
  { key: 'x', label: 'X (Twitter)', icon: 'ti-brand-x', scopes: 'tweet.read tweet.write users.read offline.access' },
  { key: 'youtube', label: 'YouTube', icon: 'ti-brand-youtube', scopes: 'https://www.googleapis.com/auth/youtube.upload' },
  { key: 'tiktok', label: 'TikTok', icon: 'ti-brand-tiktok', scopes: 'video.publish' },
  { key: 'threads', label: 'Threads', icon: 'ti-brand-threads', scopes: 'threads_basic threads_content_publish' },
  { key: 'pinterest', label: 'Pinterest', icon: 'ti-brand-pinterest', scopes: 'boards:read pins:write' },
  { key: 'google_business', label: 'Google Business', icon: 'ti-brand-google', scopes: 'https://www.googleapis.com/auth/business.manage' },
];

export default function PlatformSocial() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [rows, setRows] = useState<SocialProviderStatus[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [f, setF] = useState({ client_id: '', client_secret: '', redirect_uri: '', scopes: '', enabled: false });

  const byProvider = useMemo(() => Object.fromEntries(rows.map((r) => [r.provider, r])), [rows]);
  const load = () => { socialProviderStatus().then(setRows).catch((e) => setErr(e.message)); };
  useEffect(() => { if (platformAdmin) load(); }, [platformAdmin]);

  if (!platformAdmin) {
    return <Layout title="Social Providers"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />Platform administration is restricted to the platform team.</div></Layout>;
  }

  const openEdit = (key: string) => {
    const cur = byProvider[key]; const def = PROVIDERS.find((p) => p.key === key);
    setF({ client_id: '', client_secret: '', redirect_uri: cur?.redirect_uri || (typeof window !== 'undefined' ? `${window.location.origin}/api/social/oauth/${key}/callback` : ''), scopes: cur?.scopes || def?.scopes || '', enabled: cur?.enabled || false });
    setEdit(key);
  };
  const save = async () => {
    if (!edit) return; setBusy(true); setErr('');
    try { await socialProviderSetConfig({ provider: edit, ...f }); setEdit(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout title="Social Providers">
      <PageHeader title="Social Providers" icon="ti-plug-connected"
        subtitle="Register each network's OAuth app once — tenants then connect their own accounts. Secrets are write-only and never displayed." />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="card divide-y divide-line">
        {PROVIDERS.map((p) => {
          const st = byProvider[p.key];
          const configured = st?.configured; const enabled = st?.enabled;
          return (
            <div key={p.key} className="flex items-center gap-3 p-3">
              <Icon name={p.icon} className="text-xl text-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-content">{p.label}</div>
                <div className="text-2xs text-muted2">
                  {configured ? <span className="text-emerald-600">Credentials set</span> : 'Not configured'}
                  {' · '}{enabled ? <span className="text-emerald-600">Enabled</span> : 'Disabled'}
                  {st?.updated_at ? ` · updated ${new Date(st.updated_at).toLocaleDateString()}` : ''}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => openEdit(p.key)}><Icon name="ti-settings" />Configure</button>
            </div>
          );
        })}
      </div>
      <p className="text-2xs text-muted2 mt-3">Once a provider is configured and enabled, tenants see a Connect button on their channels (Marketing ▸ Social &amp; Content) to authorize their own accounts. Access tokens are stored encrypted at rest and are never readable by tenant users or this console — only the publishing service uses them.</p>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Configure ${PROVIDERS.find((p) => p.key === edit)?.label || ''}`} icon="ti-plug-connected"
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
        <div className="space-y-3">
          <Field label="Client ID" hint="From the provider's developer app"><input className="input" value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })} placeholder={byProvider[edit || '']?.configured ? '•••••• (leave blank to keep)' : 'App client id'} /></Field>
          <Field label="Client Secret" hint="Write-only — leave blank to keep the current secret"><input className="input" type="password" value={f.client_secret} onChange={(e) => setF({ ...f, client_secret: e.target.value })} placeholder={byProvider[edit || '']?.configured ? '•••••• (unchanged)' : 'App client secret'} /></Field>
          <Field label="Redirect URI" hint="Add this exact URL to the provider app's allowed callbacks"><input className="input" value={f.redirect_uri} onChange={(e) => setF({ ...f, redirect_uri: e.target.value })} /></Field>
          <Field label="Scopes"><input className="input" value={f.scopes} onChange={(e) => setF({ ...f, scopes: e.target.value })} /></Field>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Enabled (tenants can connect accounts)</label>
        </div>
      </Modal>
    </Layout>
  );
}
