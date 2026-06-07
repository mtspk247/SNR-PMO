import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { getIntegrations, setIntegrationStatus } from '@/lib/db';
import { Integration } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';

export default function IntegrationsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => { getIntegrations().then(setItems).finally(() => setLoading(false)); }, [org?.id]);
  const admin = can.manageIntegrations(org);

  const toggle = async (it: Integration) => {
    if (!me) return; setBusy(it.id);
    try { const next = it.status === 'connected' ? 'disconnected' : 'connected'; const r = await setIntegrationStatus(it.id, next, me.id); setItems((p) => p.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(''); }
  };

  const cats = Array.from(new Set(items.map((i) => i.category || 'Other')));
  const connected = items.filter((i) => i.status === 'connected').length;

  return (
    <Layout title="Integrations">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Integrations" subtitle={`${connected} connected · ${admin ? 'connect the tools your team uses' : 'admins can connect tools'}`} />
          {items.length === 0 ? <EmptyState icon="ti-plug" text="No integrations available" /> : cats.map((cat) => (
            <div key={cat} className="mb-6">
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">{cat}</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.filter((i) => (i.category || 'Other') === cat).map((it) => (
                  <div key={it.id} className="card p-4 flex flex-col">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-md bg-neutral-100 grid place-items-center text-neutral-500 shrink-0"><Icon name={it.icon || 'ti-plug'} className="text-lg" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{it.name}</p>
                        <span className={`pill ${it.status === 'connected' ? 'pill-green' : 'pill-gray'} mt-0.5`}>{it.status}</span>
                      </div>
                    </div>
                    {it.description && <p className="text-2xs text-neutral-500 mt-2 line-clamp-2">{it.description}</p>}
                    <button onClick={() => toggle(it)} disabled={!admin || busy === it.id} className={`btn mt-3 ${it.status === 'connected' ? '' : 'btn-primary'} ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {busy === it.id ? '…' : it.status === 'connected' ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Layout>
  );
}
