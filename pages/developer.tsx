import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon, Spinner, EmptyState } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { sb } from '@/lib/supabase';

const API_BASE = 'https://dkjdtyzjdkumnpdyezbs.supabase.co/functions/v1/api-v1';
const RESOURCES = ['tasks', 'projects', 'deals', 'contacts', 'companies', 'invoices'];

type KeyRow = { id: string; name: string; key_prefix: string; scopes: string[]; last_used_at: string | null; revoked_at: string | null; created_at: string };

export default function DeveloperPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    if (!org) return;
    sb.rpc('api_key_list', { p_org: org.id }).then(({ data, error }) => {
      if (error) { setErr(error.message); setKeys([]); } else setKeys((data as KeyRow[]) || []);
    });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const create = async () => {
    if (!org || busy) return;
    setBusy(true); setErr(''); setReveal(null);
    try {
      const { data, error } = await sb.rpc('api_key_create', { p_org: org.id, p_name: name.trim() || 'API key', p_scopes: ['read', 'write'] });
      if (error) throw error;
      setReveal((data as any)?.api_key || null);
      setName('');
      load();
    } catch (e: any) { setErr(e.message || 'Could not create key'); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any integration using it will stop working immediately.')) return;
    try { const { error } = await sb.rpc('api_key_revoke', { p_id: id }); if (error) throw error; load(); }
    catch (e: any) { setErr(e.message); }
  };
  const copy = (t: string) => { navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };

  if (!org) return <Layout flat title="Developer"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="Developer"><EmptyState icon="ti-lock" title="Admins only" text="API keys are managed by workspace owners and admins." /></Layout>;

  return (
    <Layout flat title="Developer">
      <PageHeader title="Developer" subtitle="API keys and integration access for this workspace" icon="ti-code" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="card p-5 mb-5 max-w-4xl">
        <p className="text-sm font-semibold text-content mb-1">Create an API key</p>
        <p className="text-2xs text-muted mb-3">Keys are scoped to this workspace and shown once. Use as a bearer token: <code className="px-1 rounded bg-surface2">Authorization: Bearer snrp_…</code></p>
        <div className="flex items-center gap-2">
          <input className="input h-9 flex-1 max-w-sm" placeholder="Key name (e.g. Zapier, Internal script)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" disabled={busy} onClick={create}><Icon name="ti-plus" />Generate key</button>
        </div>
        {reveal && (
          <div className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/60">
            <p className="text-2xs font-medium text-emerald-800 mb-1">Copy your key now — you won't see it again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all text-emerald-900 bg-white/70 rounded px-2 py-1.5 border border-emerald-200">{reveal}</code>
              <button className="btn-ghost text-2xs" onClick={() => copy(reveal)}><Icon name={copied ? 'ti-check' : 'ti-copy'} />{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card p-0 mb-5 max-w-4xl overflow-hidden">
        <div className="px-5 py-4 border-b border-line"><p className="text-sm font-semibold text-content">API keys</p></div>
        {keys === null ? <div className="p-8"><Spinner /></div> : keys.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-key" text="No API keys yet. Generate one above to start integrating." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="bg-surface2/50 text-left text-2xs uppercase tracking-wide text-muted2">
              <th className="px-5 py-2.5 font-medium">Name</th><th className="px-3 py-2.5 font-medium">Key</th><th className="px-3 py-2.5 font-medium">Last used</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-5 py-2.5 font-medium text-right"></th>
            </tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-line hover:bg-surface2/40">
                  <td className="px-5 py-3 font-medium text-content">{k.name}</td>
                  <td className="px-3 py-3 text-muted"><code className="text-2xs">{k.key_prefix}…</code></td>
                  <td className="px-3 py-3 text-2xs text-muted">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'never'}</td>
                  <td className="px-3 py-3"><span className={`pill ${k.revoked_at ? 'pill-gray' : 'pill-green'}`}>{k.revoked_at ? 'Revoked' : 'Active'}</span></td>
                  <td className="px-5 py-3 text-right">{!k.revoked_at && <button onClick={() => revoke(k.id)} className="btn-ghost text-2xs text-rose-600"><Icon name="ti-ban" />Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="card p-5 max-w-4xl">
        <p className="text-sm font-semibold text-content mb-1">API reference</p>
        <p className="text-2xs text-muted mb-3">Read-only REST endpoints (v1). All responses are scoped to your workspace by the key.</p>
        <div className="text-2xs text-muted mb-2">Base URL</div>
        <code className="block text-xs bg-surface2 rounded px-3 py-2 mb-3 break-all">{API_BASE}</code>
        <div className="text-2xs text-muted mb-2">Resources</div>
        <div className="flex flex-wrap gap-1.5 mb-3">{RESOURCES.map((r) => <span key={r} className="pill pill-gray">GET /{r}</span>)}</div>
        <div className="text-2xs text-muted mb-2">Example</div>
        <pre className="text-xs bg-surface2 rounded px-3 py-2 overflow-x-auto">{`curl -H "Authorization: Bearer snrp_…" \\
  "${API_BASE}/tasks?limit=50&offset=0"`}</pre>
      </div>
    </Layout>
  );
}
