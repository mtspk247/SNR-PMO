import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, EmptyState, Icon } from '@/components/ui';
import { getIntegrations, setIntegrationStatus } from '@/lib/db';
import { Integration } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import Dropdown from '@/components/Dropdown';

export default function IntegrationsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const [group, setGroup] = useState('category');

  useEffect(() => { getIntegrations().then(setItems).finally(() => setLoading(false)); }, [org?.id]);
  const admin = can.manageIntegrations(org);

  const toggle = async (it: Integration) => {
    if (!me) return; setBusy(it.id);
    try { const next = it.status === 'connected' ? 'disconnected' : 'connected'; const r = await setIntegrationStatus(it.id, next, me.id); setItems((p) => p.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(''); }
  };

  const cats = useMemo(() => Array.from(new Set(items.map((i) => i.category || 'Other'))).sort(), [items]);
  const connected = items.filter((i) => i.status === 'connected').length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== 'All' && (i.category || 'Other') !== cat) return false;
      if (!needle) return true;
      return (i.name + ' ' + (i.description || '')).toLowerCase().includes(needle);
    });
  }, [items, q, cat]);

  const groupOptions = [
    { value: 'category', label: 'Group by category' },
    { value: 'status', label: 'Group by status' },
    { value: 'none', label: 'No grouping' },
  ];
  const gkey = (i: Integration) => group === 'status' ? (i.status === 'connected' ? 'Connected' : 'Not connected') : group === 'none' ? 'All' : (i.category || 'Other');
  const groups = useMemo(() => {
    const g: Record<string, Integration[]> = {};
    visible.forEach((i) => { const c = gkey(i); (g[c] = g[c] || []).push(i); });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, group]);

  return (
    <Layout flat title="Integrations">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Integrations" subtitle={admin ? 'Connect the tools your team already uses.' : 'Admins can connect tools for the workspace.'} />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Available" value={items.length} hint={`${cats.length} categories`} icon="ti-plug" />
            <StatCard label="Connected" value={connected} hint={connected ? 'Active now' : 'None yet'} hintTone={connected ? 'up' : 'muted'} icon="ti-plug-connected" />
            <StatCard label="Not connected" value={items.length - connected} hint="Ready to add" icon="ti-plug-off" />
            <StatCard label="Categories" value={cats.length} hint="Across catalog" icon="ti-category" />
          </div>

          {/* Toolbar: search + category filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <div className="relative flex-1 max-w-sm">
              <Icon name="ti-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2 text-base" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search integrations…"
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-surface border border-line text-sm text-content placeholder:text-muted2 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {['All', ...cats].map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`px-3 h-8 rounded-full text-xs font-medium whitespace-nowrap transition ${cat === c ? 'bg-accent text-accentfg' : 'bg-surface2 text-muted hover:text-content'}`}
                >{c}</button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 sm:ml-auto shrink-0">
              <div className="inline-flex items-center rounded-md border border-line bg-surface p-0.5 h-8">
                {(['cards', 'list'] as const).map((vv) => (
                  <button key={vv} onClick={() => setView(vv)} title={vv === 'list' ? 'List' : 'Cards'} className={`h-7 px-2 rounded inline-flex items-center text-xs transition ${view === vv ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content'}`}><Icon name={vv === 'list' ? 'ti-list' : 'ti-layout-grid'} /></button>
                ))}
              </div>
              <Dropdown value={group} onChange={setGroup} width={190} items={groupOptions} trigger={<span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-line bg-surface text-xs text-content cursor-pointer hover:border-borderstrong"><Icon name="ti-layout-rows" />{groupOptions.find((o) => o.value === group)?.label || 'Group'}<Icon name="ti-chevron-down" className="text-muted2" /></span>} />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="ti-plug" text={items.length === 0 ? 'No integrations available' : 'No integrations match your search'} />
          ) : groups.map(([c, list]) => (
            <div key={c} className="mb-7">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-2xs uppercase tracking-wide text-muted font-medium">{c}</p>
                <span className="text-2xs text-muted">· {list.length}</span>
              </div>
              {view === 'cards' ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((it) => {
                  const on = it.status === 'connected';
                  return (
                    <div key={it.id} className={`card p-4 flex flex-col transition hover:shadow-sm ${on ? 'ring-1 ring-accent/30' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted'}`}>
                          <Icon name={it.icon || 'ti-plug'} className="text-lg" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate text-content">{it.name}</p>
                          <span className={`pill ${on ? 'pill-green' : 'pill-gray'} mt-1`}>{on ? 'Connected' : 'Not connected'}</span>
                        </div>
                      </div>
                      <p className="text-2xs text-muted mt-2.5 line-clamp-2 min-h-[2rem]">{it.description || 'No description provided.'}</p>
                      <button
                        onClick={() => toggle(it)}
                        disabled={!admin || busy === it.id}
                        className={`btn mt-3 w-full justify-center ${on ? '' : 'btn-primary'} ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {busy === it.id ? <Icon name="ti-loader-2" className="animate-spin" /> : on ? 'Disconnect' : 'Connect'}
                      </button>
                    </div>
                  );
                })}
              </div>
              ) : (
                <div className="card divide-y divide-line">
                  {list.map((it) => {
                    const on = it.status === 'connected';
                    return (
                      <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted'}`}><Icon name={it.icon || 'ti-plug'} className="text-base" /></span>
                        <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate text-content">{it.name}</p>{it.description && <p className="text-2xs text-muted truncate">{it.description}</p>}</div>
                        <span className={`pill ${on ? 'pill-green' : 'pill-gray'} shrink-0`}>{on ? 'Connected' : 'Not connected'}</span>
                        <button onClick={() => toggle(it)} disabled={!admin || busy === it.id} className={`btn h-7 py-0 shrink-0 ${on ? '' : 'btn-primary'} ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}>{busy === it.id ? <Icon name="ti-loader-2" className="animate-spin" /> : on ? 'Disconnect' : 'Connect'}</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </Layout>
  );
}
