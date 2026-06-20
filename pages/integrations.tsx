import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, StatCard, Spinner, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

// Honest integrations catalog. Three kinds:
//  - webhook : genuinely works now — registers a webhook_endpoint that the events
//              bus delivers to (Slack/Discord get their native payload shape).
//  - link    : a real capability that lives elsewhere in the app (deep-link).
//  - planned : not built yet — shown honestly, never a fake "Connected".
type Kind = 'webhook' | 'link' | 'planned';
type Item = {
  key: string; name: string; icon: string; category: string; kind: Kind;
  format?: 'slack' | 'discord' | 'json'; href?: string; cta?: string;
  blurb: string; help?: string;
};

const CATALOG: Item[] = [
  { key: 'slack', name: 'Slack', icon: 'ti-brand-slack', category: 'Communication', kind: 'webhook', format: 'slack',
    blurb: 'Post a message to a Slack channel when deals, invoices, projects or clients change.',
    help: 'In Slack: Apps → Incoming Webhooks → add to a channel → copy the webhook URL (https://hooks.slack.com/services/…).' },
  { key: 'discord', name: 'Discord', icon: 'ti-brand-discord', category: 'Communication', kind: 'webhook', format: 'discord',
    blurb: 'Send event notifications to a Discord channel.',
    help: 'In Discord: Channel → Edit → Integrations → Webhooks → New Webhook → copy the URL.' },
  { key: 'webhook', name: 'Custom webhook', icon: 'ti-webhook', category: 'Developer', kind: 'webhook', format: 'json',
    blurb: 'POST the full signed event JSON to any endpoint and wire up your own service.',
    help: 'We POST signed JSON (verify the X-SNRPMO-Signature HMAC). See Developer for the payload shape.' },
  { key: 'zapier', name: 'Zapier', icon: 'ti-bolt', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key + webhooks',
    blurb: 'Connect to thousands of apps using your API key and webhooks.' },
  { key: 'stripe', name: 'Stripe', icon: 'ti-credit-card', category: 'Payments', kind: 'link', href: '/billing', cta: 'Open billing',
    blurb: 'Subscription billing and secure checkout — configured under Billing.' },
  { key: 'email', name: 'Gmail / SMTP', icon: 'ti-mail', category: 'Email', kind: 'link', href: '/users', cta: 'Open Users ▸ Email',
    blurb: 'Send reports and automations from your own mailbox (open your user, then the Email tab).' },
  { key: 'gcal', name: 'Google Calendar', icon: 'ti-calendar', category: 'Calendar', kind: 'planned', blurb: 'Two-way calendar sync for tasks and events.' },
  { key: 'quickbooks', name: 'QuickBooks', icon: 'ti-calculator', category: 'Accounting', kind: 'planned', blurb: 'Push invoices and payments to QuickBooks.' },
  { key: 'hubspot', name: 'HubSpot', icon: 'ti-affiliate', category: 'CRM', kind: 'planned', blurb: 'Sync contacts and deals with HubSpot.' },
  { key: 'github', name: 'GitHub', icon: 'ti-brand-github', category: 'Development', kind: 'planned', blurb: 'Link issues and pull requests to tasks.' },
];

type Endpoint = { id: string; url: string; label: string | null; format: string | null; events: string[]; active: boolean };

export default function IntegrationsPage() {
  const org = useActiveOrg();
  const admin = can.manageIntegrations(org);
  const [eps, setEps] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Item | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    if (!org?.id) return;
    setLoading(true);
    sb.from('webhook_endpoints').select('id, url, label, format, events, active').eq('org_id', org.id)
      .then(({ data }) => { setEps((data as Endpoint[]) || []); setLoading(false); });
  };
  useEffect(load, [org?.id]);

  // A catalog item is "connected" if it owns at least one labelled endpoint.
  const connFor = (it: Item) => eps.filter((e) => e.label === it.name);
  const isConnected = (it: Item) => connFor(it).length > 0;
  const connectedCount = CATALOG.filter((it) => it.kind === 'webhook' && isConnected(it)).length;

  const openConnect = (it: Item) => { setErr(''); setUrl(''); setModal(it); };

  const save = async () => {
    if (!modal || !org) return;
    const u = url.trim();
    if (!/^https:\/\/.+/i.test(u)) { setErr('Enter a valid https:// webhook URL.'); return; }
    setBusy('save'); setErr('');
    try {
      const { error } = await sb.from('webhook_endpoints').insert({
        org_id: org.id, url: u, label: modal.name, format: modal.format || 'json', events: ['*'], active: true,
      } as any);
      if (error) throw error;
      setModal(null); load();
    } catch (e: any) { setErr(e.message || 'Could not connect.'); } finally { setBusy(''); }
  };

  const disconnect = async (it: Item) => {
    if (!org || !confirm(`Disconnect ${it.name}? This removes its webhook${connFor(it).length > 1 ? 's' : ''}.`)) return;
    setBusy(it.key);
    try { await sb.from('webhook_endpoints').delete().eq('org_id', org.id).eq('label', it.name); load(); }
    finally { setBusy(''); }
  };

  const groups = useMemo(() => {
    const g: Record<string, Item[]> = {};
    CATALOG.forEach((i) => { (g[i.category] = g[i.category] || []).push(i); });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  const live = CATALOG.filter((i) => i.kind !== 'planned').length;

  return (
    <Layout flat title="Integrations">
      <PageHeader title="Integrations" subtitle="Connect SNR-PMO to the tools your team already uses." help="connections" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Available now" value={live} hint="Real, working connections" icon="ti-plug-connected" />
        <StatCard label="Connected" value={connectedCount} hint={connectedCount ? 'Active' : 'None yet'} hintTone={connectedCount ? 'up' : 'muted'} icon="ti-bolt" />
        <StatCard label="Powered by" value="Events + Webhooks" hint="Fires on real activity" icon="ti-webhook" />
        <StatCard label="On the roadmap" value={CATALOG.filter((i) => i.kind === 'planned').length} hint="Native apps coming" icon="ti-map-pin" />
      </div>

      {loading ? <Spinner /> : groups.map(([cat, list]) => (
        <div key={cat} className="mb-7">
          <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-3">{cat}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((it) => {
              const on = it.kind === 'webhook' && isConnected(it);
              return (
                <div key={it.key} className={`card p-4 flex flex-col ${on ? 'ring-1 ring-accent/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted'}`}>
                      <Icon name={it.icon} className="text-lg" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-content">{it.name}</p>
                      {it.kind === 'webhook' && <span className={`pill ${on ? 'pill-green' : 'pill-gray'} mt-1`}>{on ? 'Connected' : 'Not connected'}</span>}
                      {it.kind === 'link' && <span className="pill pill-sky mt-1">Available</span>}
                      {it.kind === 'planned' && <span className="pill pill-gray mt-1">Planned</span>}
                    </div>
                  </div>
                  <p className="text-2xs text-muted mt-2.5 line-clamp-2 min-h-[2rem]">{it.blurb}</p>

                  {it.kind === 'webhook' && (
                    on ? (
                      <button onClick={() => disconnect(it)} disabled={!admin || busy === it.key} className="btn mt-3 w-full justify-center">
                        {busy === it.key ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Disconnect'}
                      </button>
                    ) : (
                      <button onClick={() => openConnect(it)} disabled={!admin} className={`btn btn-primary mt-3 w-full justify-center ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}>Connect</button>
                    )
                  )}
                  {it.kind === 'link' && (
                    <Link href={it.href || '#'} className="btn btn-primary mt-3 w-full justify-center">{it.cta || 'Open'}</Link>
                  )}
                  {it.kind === 'planned' && (
                    <button disabled className="btn mt-3 w-full justify-center opacity-50 cursor-not-allowed">On the roadmap</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!admin && <p className="text-2xs text-muted mt-2">Only admins can connect integrations for the workspace.</p>}

      {/* Connect modal */}
      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setModal(null)}>
          <div className="card p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/15 text-accentstrong"><Icon name={modal.icon} className="text-lg" /></span>
              <p className="text-sm font-semibold text-content">Connect {modal.name}</p>
            </div>
            {modal.help && <p className="text-2xs text-muted mb-3 leading-relaxed">{modal.help}</p>}
            <label className="label mb-1 block">Webhook URL</label>
            <input className="input w-full" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <p className="text-2xs text-muted mt-1.5">We&apos;ll post here on every workspace event. You can fine-tune which events under Developer ▸ Webhooks.</p>
            {err && <p className="text-sm text-rose-600 mt-2">{err}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Connecting…' : 'Connect'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
