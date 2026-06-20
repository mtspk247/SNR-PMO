import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Icon, Spinner } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';

// Honest, Claude-style integrations catalog. Kinds:
//  - webhook : works TODAY — registers a webhook_endpoint the events bus delivers to
//              (Slack/Discord get their native payload; "custom" gets signed JSON).
//  - link    : a real capability elsewhere in the app (deep-link).
//  - import  : migrate your data in via the CSV importer (/import) — works today.
//  - api     : connect via our public API + webhooks / Zapier / Make (/developer) — works today.
//              (Native one-click OAuth for these is also rolling out via our connector engine.)
type Kind = 'webhook' | 'link' | 'import' | 'api';
type Item = {
  key: string; name: string; icon: string; category: string; kind: Kind;
  format?: 'slack' | 'discord' | 'teams' | 'json'; href?: string; cta?: string; blurb: string; help?: string;
};

const CATALOG: Item[] = [
  // Communication — real webhooks (push notifications on events)
  { key: 'slack', name: 'Slack', icon: 'ti-brand-slack', category: 'Communication', kind: 'webhook', format: 'slack', blurb: 'Post to a Slack channel when deals, invoices, projects or clients change.', help: 'Slack → Apps → Incoming Webhooks → add to a channel → copy the URL (https://hooks.slack.com/services/…).' },
  { key: 'discord', name: 'Discord', icon: 'ti-brand-discord', category: 'Communication', kind: 'webhook', format: 'discord', blurb: 'Send event notifications to a Discord channel.', help: 'Discord → Channel → Edit → Integrations → Webhooks → New Webhook → copy URL.' },
  { key: 'teams', name: 'Microsoft Teams', icon: 'ti-brand-teams', category: 'Communication', kind: 'webhook', format: 'teams', blurb: 'Post activity to a Microsoft Teams channel.', help: 'Teams → channel → ⋯ → Workflows/Connectors → Incoming Webhook → copy the URL.' },
  { key: 'telegram', name: 'Telegram', icon: 'ti-brand-telegram', category: 'Communication', kind: 'api', blurb: 'Notify a Telegram chat via your API key + a Zapier/Make scenario.' },
  { key: 'twilio', name: 'Twilio SMS', icon: 'ti-message', category: 'Communication', kind: 'api', blurb: 'Send SMS alerts on key events via Zapier/Make + your API key.' },
  { key: 'whatsapp', name: 'WhatsApp', icon: 'ti-brand-whatsapp', category: 'Communication', kind: 'api', blurb: 'Message clients via Zapier/Make using your API key.' },
  // Automation — connect via API/webhooks
  { key: 'zapier', name: 'Zapier', icon: 'ti-bolt', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Connect to thousands of apps with your API key + webhooks.' },
  { key: 'make', name: 'Make', icon: 'ti-settings-automation', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Build visual scenarios off our API and webhooks.' },
  { key: 'n8n', name: 'n8n', icon: 'ti-hierarchy-2', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Self-hosted workflow automation via our API.' },
  // Project tools — migrate your data in (real, via the importer)
  { key: 'clickup', name: 'ClickUp', icon: 'ti-checklist', category: 'Project tools', kind: 'import', blurb: 'Import your lists and tasks from ClickUp (export CSV → Import).' },
  { key: 'monday', name: 'monday.com', icon: 'ti-layout-board', category: 'Project tools', kind: 'import', blurb: 'Bring boards and items over from monday.' },
  { key: 'asana', name: 'Asana', icon: 'ti-circle-check', category: 'Project tools', kind: 'import', blurb: 'Import projects and tasks from Asana.' },
  { key: 'trello', name: 'Trello', icon: 'ti-brand-trello', category: 'Project tools', kind: 'import', blurb: 'Pull in Trello boards and cards.' },
  { key: 'jira', name: 'Jira', icon: 'ti-ticket', category: 'Project tools', kind: 'import', blurb: 'Import issues and projects from Jira.' },
  { key: 'notion', name: 'Notion', icon: 'ti-brand-notion', category: 'Project tools', kind: 'import', blurb: 'Import Notion database rows as projects or tasks.' },
  { key: 'linear', name: 'Linear', icon: 'ti-brand-linear', category: 'Project tools', kind: 'import', blurb: 'Import Linear issues as tasks.' },
  { key: 'ghl', name: 'GoHighLevel', icon: 'ti-rocket', category: 'Project tools', kind: 'import', blurb: 'Migrate contacts and pipelines from GoHighLevel.' },
  // CRM — migrate clients & deals in
  { key: 'hubspot', name: 'HubSpot', icon: 'ti-affiliate', category: 'CRM', kind: 'import', blurb: 'Import contacts and deals from HubSpot.' },
  { key: 'salesforce', name: 'Salesforce', icon: 'ti-cloud', category: 'CRM', kind: 'import', blurb: 'Import accounts and opportunities from Salesforce.' },
  { key: 'pipedrive', name: 'Pipedrive', icon: 'ti-target-arrow', category: 'CRM', kind: 'import', blurb: 'Import your Pipedrive contacts and deals.' },
  { key: 'zohocrm', name: 'Zoho CRM', icon: 'ti-briefcase', category: 'CRM', kind: 'import', blurb: 'Import clients and deals from Zoho CRM.' },
  // Payments & accounting
  { key: 'stripe', name: 'Stripe', icon: 'ti-credit-card', category: 'Payments & accounting', kind: 'link', href: '/billing', cta: 'Open billing', blurb: 'Subscriptions and checkout — configured under Billing.' },
  { key: 'paypal', name: 'PayPal', icon: 'ti-brand-paypal', category: 'Payments & accounting', kind: 'api', blurb: 'Connect PayPal via Zapier/Make + your API key.' },
  { key: 'quickbooks', name: 'QuickBooks', icon: 'ti-calculator', category: 'Payments & accounting', kind: 'api', blurb: 'Sync invoices to QuickBooks via Zapier/Make + your API key.' },
  { key: 'xero', name: 'Xero', icon: 'ti-receipt', category: 'Payments & accounting', kind: 'api', blurb: 'Connect Xero via Zapier/Make + your API key.' },
  // Calendar
  { key: 'gcal', name: 'Google Calendar', icon: 'ti-calendar', category: 'Calendar', kind: 'api', blurb: 'Sync tasks/events to Google Calendar via Zapier/Make.' },
  { key: 'outlookcal', name: 'Outlook Calendar', icon: 'ti-calendar-event', category: 'Calendar', kind: 'api', blurb: 'Connect Outlook Calendar via Zapier/Make.' },
  { key: 'calendly', name: 'Calendly', icon: 'ti-calendar-time', category: 'Calendar', kind: 'api', blurb: 'Turn Calendly bookings into tasks via Zapier/Make.' },
  // Email & marketing
  { key: 'email', name: 'Gmail / SMTP', icon: 'ti-mail', category: 'Email & marketing', kind: 'link', href: '/users', cta: 'Open Users ▸ Email', blurb: 'Send reports and automations from your own mailbox.' },
  { key: 'outlook', name: 'Outlook', icon: 'ti-mail-opened', category: 'Email & marketing', kind: 'api', blurb: 'Connect Outlook mail via Zapier/Make + your API key.' },
  { key: 'mailchimp', name: 'Mailchimp', icon: 'ti-brand-mailchimp', category: 'Email & marketing', kind: 'api', blurb: 'Sync contacts to Mailchimp via Zapier/Make.' },
  { key: 'sendgrid', name: 'SendGrid', icon: 'ti-send', category: 'Email & marketing', kind: 'api', blurb: 'Transactional email via SendGrid + your API key.' },
  // Storage
  { key: 'gdrive', name: 'Google Drive', icon: 'ti-brand-google-drive', category: 'Storage', kind: 'api', blurb: 'Connect Google Drive via Zapier/Make + your API key.' },
  { key: 'dropbox', name: 'Dropbox', icon: 'ti-brand-dropbox', category: 'Storage', kind: 'api', blurb: 'Connect Dropbox via Zapier/Make + your API key.' },
  { key: 'onedrive', name: 'OneDrive', icon: 'ti-brand-onedrive', category: 'Storage', kind: 'api', blurb: 'Connect OneDrive via Zapier/Make + your API key.' },
  { key: 'box', name: 'Box', icon: 'ti-box', category: 'Storage', kind: 'api', blurb: 'Connect Box via Zapier/Make + your API key.' },
  // Developer
  { key: 'webhook', name: 'Custom webhook', icon: 'ti-webhook', category: 'Developer', kind: 'webhook', format: 'json', blurb: 'POST the full signed event JSON to any endpoint.', help: 'We POST signed JSON (verify X-SNRPMO-Signature). See Developer for the payload shape.' },
  { key: 'github', name: 'GitHub', icon: 'ti-brand-github', category: 'Developer', kind: 'api', blurb: 'Link issues/PRs via Zapier/Make + your API key.' },
  { key: 'gitlab', name: 'GitLab', icon: 'ti-brand-gitlab', category: 'Developer', kind: 'api', blurb: 'Connect GitLab via Zapier/Make + your API key.' },
  // Support
  { key: 'zendesk', name: 'Zendesk', icon: 'ti-headset', category: 'Support', kind: 'api', blurb: 'Turn Zendesk tickets into tasks via Zapier/Make.' },
  { key: 'intercom', name: 'Intercom', icon: 'ti-message-chatbot', category: 'Support', kind: 'api', blurb: 'Sync Intercom conversations via Zapier/Make.' },
  { key: 'freshdesk', name: 'Freshdesk', icon: 'ti-lifebuoy', category: 'Support', kind: 'api', blurb: 'Connect Freshdesk via Zapier/Make + your API key.' },
];

type Endpoint = { id: string; url: string; label: string | null; format: string | null };

export default function IntegrationsPage() {
  const org = useActiveOrg();
  const admin = can.manageIntegrations(org);
  const [eps, setEps] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [modal, setModal] = useState<Item | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = () => {
    if (!org?.id) return;
    setLoading(true);
    sb.from('webhook_endpoints').select('id, url, label, format').eq('org_id', org.id)
      .then(({ data }) => { setEps((data as Endpoint[]) || []); setLoading(false); });
  };
  useEffect(load, [org?.id]);

  const isConnected = (it: Item) => eps.some((e) => e.label === it.name);
  const connectedCount = CATALOG.filter((it) => it.kind === 'webhook' && isConnected(it)).length;
  const liveCount = CATALOG.length;

  const categories = useMemo(() => Array.from(new Set(CATALOG.map((i) => i.category))), []);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { All: CATALOG.length };
    categories.forEach((c) => { counts[c] = CATALOG.filter((i) => i.category === c).length; });
    return counts;
  }, [categories]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATALOG.filter((i) => (cat === 'All' || i.category === cat) && (!needle || (i.name + ' ' + i.blurb).toLowerCase().includes(needle)));
  }, [q, cat]);

  const groups = useMemo(() => {
    const g: Record<string, Item[]> = {};
    visible.forEach((i) => { (g[i.category] = g[i.category] || []).push(i); });
    return Object.entries(g);
  }, [visible]);

  const save = async () => {
    if (!modal || !org) return;
    const u = url.trim();
    if (!/^https:\/\/.+/i.test(u)) { setErr('Enter a valid https:// webhook URL.'); return; }
    setBusy('save'); setErr('');
    try {
      const { error } = await sb.from('webhook_endpoints').insert({ org_id: org.id, url: u, label: modal.name, format: modal.format || 'json', events: ['*'], active: true } as any);
      if (error) throw error;
      setModal(null); load();
    } catch (e: any) { setErr(e.message || 'Could not connect.'); } finally { setBusy(''); }
  };

  const disconnect = async (it: Item) => {
    if (!org || !confirm(`Disconnect ${it.name}?`)) return;
    setBusy(it.key);
    try { await sb.from('webhook_endpoints').delete().eq('org_id', org.id).eq('label', it.name); load(); } finally { setBusy(''); }
  };

  const allCats = ['All', ...categories];

  return (
    <Layout flat title="Integrations">
      <PageHeader title="Integrations" subtitle="Connect SNR-PMO to the tools your team already uses." help="connections" />

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 border border-accent/20">
          <Icon name="ti-plug-connected" className="text-sm text-accentstrong" />
          <span className="text-xs font-medium text-accentstrong">{liveCount} live</span>
        </div>
        {connectedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface2 border border-line">
            <Icon name="ti-circle-check" className="text-sm text-emerald-600" />
            <span className="text-xs font-medium text-content">{connectedCount} connected</span>
          </div>
        )}
        <p className="text-xs text-muted ml-auto hidden sm:block">
          Webhooks fire on live events, competitor tools migrate your data in, and the rest connect via your API. Nothing is faked.
        </p>
      </div>

      {/* Two-column layout: left rail + right grid */}
      <div className="flex gap-6 items-start">

        {/* ── Left category rail (lg+); collapses to select on mobile ── */}
        <aside className="hidden lg:flex flex-col gap-0.5 w-44 shrink-0 sticky top-20">
          <p className="text-2xs uppercase tracking-wide text-muted font-medium px-2 mb-2">Categories</p>
          {allCats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={[
                'flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-sm transition',
                cat === c
                  ? 'bg-accent/10 text-accentstrong font-medium'
                  : 'text-muted hover:text-content hover:bg-surface2',
              ].join(' ')}
            >
              <span className="truncate">{c}</span>
              <span className={[
                'text-2xs font-medium tabular-nums shrink-0',
                cat === c ? 'text-accentstrong' : 'text-muted2',
              ].join(' ')}>
                {catCounts[c]}
              </span>
            </button>
          ))}
        </aside>

        {/* ── Right: search + mobile category selector + grid ── */}
        <div className="flex-1 min-w-0">

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            {/* Search */}
            <div className="relative flex-1">
              <Icon name="ti-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2 text-sm pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search integrations…"
                className="input w-full pl-9"
              />
            </div>

            {/* Mobile category selector — flex-wrap, NO overflow-x */}
            <div className="flex flex-wrap gap-1.5 lg:hidden">
              {allCats.map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={[
                    'px-3 h-7 rounded-full text-xs font-medium whitespace-nowrap transition',
                    cat === c ? 'bg-accent text-accentfg' : 'bg-surface2 text-muted hover:text-content',
                  ].join(' ')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Grid content */}
          {loading ? (
            <div className="flex items-center justify-center py-16"><Spinner /></div>
          ) : groups.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
              <span className="w-12 h-12 rounded-xl bg-surface2 grid place-items-center text-muted2">
                <Icon name="ti-plug-x" className="text-xl" />
              </span>
              <p className="text-sm font-medium text-content">No integrations match your search</p>
              <p className="text-xs text-muted">Try a different keyword or select a different category.</p>
              <button
                onClick={() => { setQ(''); setCat('All'); }}
                className="btn mt-1"
              >
                Clear filters
              </button>
            </div>
          ) : (
            groups.map(([c, list]) => (
              <div key={c} className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs uppercase tracking-wide text-muted font-semibold">{c}</p>
                  <span className="pill pill-gray">{list.length}</span>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((it) => {
                    const on = it.kind === 'webhook' && isConnected(it);
                    return (
                      <div
                        key={it.key}
                        className={[
                          'card p-4 flex flex-col gap-3 transition',
                          on ? 'ring-1 ring-accent/30' : '',
                        ].join(' ')}
                      >
                        {/* Card header */}
                        <div className="flex items-start gap-3">
                          <span className={[
                            'w-10 h-10 rounded-xl grid place-items-center shrink-0',
                            on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted',
                          ].join(' ')}>
                            <Icon name={it.icon} className="text-lg" />
                          </span>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-sm font-semibold text-content truncate leading-tight">{it.name}</p>
                            <div className="mt-1.5">
                              {it.kind === 'webhook' && (
                                <span className={`pill ${on ? 'pill-green' : 'pill-gray'}`}>
                                  {on ? 'Connected' : 'Available'}
                                </span>
                              )}
                              {it.kind === 'link' && <span className="pill pill-sky">Available</span>}
                              {it.kind === 'import' && <span className="pill pill-violet">Migrate in</span>}
                              {it.kind === 'api' && <span className="pill pill-sky">Via API</span>}
                            </div>
                          </div>
                        </div>

                        {/* Blurb */}
                        <p className="text-xs text-muted leading-relaxed line-clamp-2 flex-1">{it.blurb}</p>

                        {/* Action */}
                        <div>
                          {it.kind === 'webhook' && (on ? (
                            <button
                              onClick={() => disconnect(it)}
                              disabled={!admin || busy === it.key}
                              className="btn w-full justify-center text-xs"
                            >
                              {busy === it.key ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Disconnect'}
                            </button>
                          ) : (
                            <button
                              onClick={() => { setErr(''); setUrl(''); setModal(it); }}
                              disabled={!admin}
                              className={`btn btn-primary w-full justify-center text-xs ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              Connect
                            </button>
                          ))}
                          {it.kind === 'link' && (
                            <Link href={it.href || '#'} className="btn btn-primary w-full justify-center text-xs">
                              {it.cta || 'Open'}
                            </Link>
                          )}
                          {it.kind === 'import' && (
                            <Link href="/import" className="btn btn-primary w-full justify-center text-xs">
                              <Icon name="ti-file-import" className="text-xs" />Import data
                            </Link>
                          )}
                          {it.kind === 'api' && (
                            <Link href="/developer" className="btn w-full justify-center text-xs">
                              Connect via API
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Connect modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setModal(null)}
        >
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-accent/15 text-accentstrong shrink-0">
                <Icon name={modal.icon} className="text-lg" />
              </span>
              <div>
                <p className="text-sm font-semibold text-content">Connect {modal.name}</p>
                <p className="text-xs text-muted mt-0.5">Paste your incoming webhook URL below.</p>
              </div>
            </div>

            {/* Help instructions */}
            {modal.help && (
              <div className="rounded-lg bg-surface2 border border-line px-3 py-2.5 mb-4">
                <p className="text-xs text-muted leading-relaxed">{modal.help}</p>
              </div>
            )}

            {/* Input */}
            <label className="label mb-1 block">Webhook URL</label>
            <input
              className="input w-full"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              We&apos;ll post here on workspace events. Fine-tune which events under Developer ▸ Webhooks.
            </p>

            {err && (
              <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                <Icon name="ti-alert-circle" className="text-sm text-rose-600 mt-0.5 shrink-0" />
                <p className="text-xs text-rose-700">{err}</p>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={busy === 'save'}>
                {busy === 'save' ? (
                  <span className="flex items-center gap-1.5"><Icon name="ti-loader-2" className="animate-spin text-sm" />Connecting…</span>
                ) : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
