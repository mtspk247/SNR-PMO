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
//  - soon    : not built yet — shown honestly with a "Coming soon" tag (NEVER a fake
//              "Connected"). One-click OAuth for these is rolling out via our connector engine.
type Kind = 'webhook' | 'link' | 'soon';
type Item = {
  key: string; name: string; icon: string; category: string; kind: Kind;
  format?: 'slack' | 'discord' | 'json'; href?: string; cta?: string; blurb: string; help?: string;
};

const CATALOG: Item[] = [
  // Communication
  { key: 'slack', name: 'Slack', icon: 'ti-brand-slack', category: 'Communication', kind: 'webhook', format: 'slack', blurb: 'Post to a Slack channel when deals, invoices, projects or clients change.', help: 'Slack → Apps → Incoming Webhooks → add to a channel → copy the URL (https://hooks.slack.com/services/…).' },
  { key: 'discord', name: 'Discord', icon: 'ti-brand-discord', category: 'Communication', kind: 'webhook', format: 'discord', blurb: 'Send event notifications to a Discord channel.', help: 'Discord → Channel → Edit → Integrations → Webhooks → New Webhook → copy URL.' },
  { key: 'teams', name: 'Microsoft Teams', icon: 'ti-brand-teams', category: 'Communication', kind: 'soon', blurb: 'Post activity to a Teams channel.' },
  { key: 'telegram', name: 'Telegram', icon: 'ti-brand-telegram', category: 'Communication', kind: 'soon', blurb: 'Notify a Telegram chat or channel.' },
  { key: 'twilio', name: 'Twilio SMS', icon: 'ti-message', category: 'Communication', kind: 'soon', blurb: 'Send SMS alerts on key events.' },
  { key: 'whatsapp', name: 'WhatsApp', icon: 'ti-brand-whatsapp', category: 'Communication', kind: 'soon', blurb: 'Message clients and teammates on WhatsApp.' },
  // Automation
  { key: 'zapier', name: 'Zapier', icon: 'ti-bolt', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Connect to thousands of apps with your API key + webhooks.' },
  { key: 'make', name: 'Make', icon: 'ti-settings-automation', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Build visual scenarios off our API and webhooks.' },
  { key: 'n8n', name: 'n8n', icon: 'ti-hierarchy-2', category: 'Automation', kind: 'link', href: '/developer', cta: 'Get API key', blurb: 'Self-hosted workflow automation via our API.' },
  // Project tools (competitors — migrate in)
  { key: 'clickup', name: 'ClickUp', icon: 'ti-checklist', category: 'Project tools', kind: 'soon', blurb: 'Import your spaces, lists and tasks from ClickUp.' },
  { key: 'monday', name: 'monday.com', icon: 'ti-layout-board', category: 'Project tools', kind: 'soon', blurb: 'Bring boards and items over from monday.' },
  { key: 'asana', name: 'Asana', icon: 'ti-circle-check', category: 'Project tools', kind: 'soon', blurb: 'Import projects and tasks from Asana.' },
  { key: 'trello', name: 'Trello', icon: 'ti-brand-trello', category: 'Project tools', kind: 'soon', blurb: 'Pull in Trello boards and cards.' },
  { key: 'jira', name: 'Jira', icon: 'ti-ticket', category: 'Project tools', kind: 'soon', blurb: 'Sync issues and sprints with Jira.' },
  { key: 'notion', name: 'Notion', icon: 'ti-brand-notion', category: 'Project tools', kind: 'soon', blurb: 'Connect Notion databases and docs.' },
  { key: 'linear', name: 'Linear', icon: 'ti-brand-linear', category: 'Project tools', kind: 'soon', blurb: 'Link Linear issues to tasks.' },
  { key: 'ghl', name: 'GoHighLevel', icon: 'ti-rocket', category: 'Project tools', kind: 'soon', blurb: 'Migrate sub-accounts, contacts and pipelines from GHL.' },
  // CRM
  { key: 'hubspot', name: 'HubSpot', icon: 'ti-affiliate', category: 'CRM', kind: 'soon', blurb: 'Two-way sync contacts and deals.' },
  { key: 'salesforce', name: 'Salesforce', icon: 'ti-cloud', category: 'CRM', kind: 'soon', blurb: 'Sync leads, contacts and opportunities.' },
  { key: 'pipedrive', name: 'Pipedrive', icon: 'ti-target-arrow', category: 'CRM', kind: 'soon', blurb: 'Connect your Pipedrive pipeline.' },
  { key: 'zohocrm', name: 'Zoho CRM', icon: 'ti-briefcase', category: 'CRM', kind: 'soon', blurb: 'Sync with Zoho CRM.' },
  // Payments & accounting
  { key: 'stripe', name: 'Stripe', icon: 'ti-credit-card', category: 'Payments & accounting', kind: 'link', href: '/billing', cta: 'Open billing', blurb: 'Subscriptions and checkout — configured under Billing.' },
  { key: 'paypal', name: 'PayPal', icon: 'ti-brand-paypal', category: 'Payments & accounting', kind: 'soon', blurb: 'Accept payments via PayPal.' },
  { key: 'quickbooks', name: 'QuickBooks', icon: 'ti-calculator', category: 'Payments & accounting', kind: 'soon', blurb: 'Push invoices and payments to QuickBooks.' },
  { key: 'xero', name: 'Xero', icon: 'ti-receipt', category: 'Payments & accounting', kind: 'soon', blurb: 'Sync invoices with Xero.' },
  // Calendar
  { key: 'gcal', name: 'Google Calendar', icon: 'ti-calendar', category: 'Calendar', kind: 'soon', blurb: 'Two-way calendar sync for tasks and events.' },
  { key: 'outlookcal', name: 'Outlook Calendar', icon: 'ti-calendar-event', category: 'Calendar', kind: 'soon', blurb: 'Sync with your Outlook calendar.' },
  { key: 'calendly', name: 'Calendly', icon: 'ti-calendar-time', category: 'Calendar', kind: 'soon', blurb: 'Turn bookings into tasks and events.' },
  // Email & marketing
  { key: 'email', name: 'Gmail / SMTP', icon: 'ti-mail', category: 'Email & marketing', kind: 'link', href: '/users', cta: 'Open Users ▸ Email', blurb: 'Send reports and automations from your own mailbox.' },
  { key: 'outlook', name: 'Outlook', icon: 'ti-mail-opened', category: 'Email & marketing', kind: 'soon', blurb: 'Send from your Outlook mailbox.' },
  { key: 'mailchimp', name: 'Mailchimp', icon: 'ti-brand-mailchimp', category: 'Email & marketing', kind: 'soon', blurb: 'Sync contacts to Mailchimp audiences.' },
  { key: 'sendgrid', name: 'SendGrid', icon: 'ti-send', category: 'Email & marketing', kind: 'soon', blurb: 'Transactional email via SendGrid.' },
  // Storage
  { key: 'gdrive', name: 'Google Drive', icon: 'ti-brand-google-drive', category: 'Storage', kind: 'soon', blurb: 'Attach and sync files from Drive.' },
  { key: 'dropbox', name: 'Dropbox', icon: 'ti-brand-dropbox', category: 'Storage', kind: 'soon', blurb: 'Connect Dropbox files.' },
  { key: 'onedrive', name: 'OneDrive', icon: 'ti-brand-onedrive', category: 'Storage', kind: 'soon', blurb: 'Sync files from OneDrive.' },
  { key: 'box', name: 'Box', icon: 'ti-box', category: 'Storage', kind: 'soon', blurb: 'Connect Box file storage.' },
  // Developer
  { key: 'webhook', name: 'Custom webhook', icon: 'ti-webhook', category: 'Developer', kind: 'webhook', format: 'json', blurb: 'POST the full signed event JSON to any endpoint.', help: 'We POST signed JSON (verify X-SNRPMO-Signature). See Developer for the payload shape.' },
  { key: 'github', name: 'GitHub', icon: 'ti-brand-github', category: 'Developer', kind: 'soon', blurb: 'Link issues and pull requests to tasks.' },
  { key: 'gitlab', name: 'GitLab', icon: 'ti-brand-gitlab', category: 'Developer', kind: 'soon', blurb: 'Connect GitLab issues and merge requests.' },
  // Support
  { key: 'zendesk', name: 'Zendesk', icon: 'ti-headset', category: 'Support', kind: 'soon', blurb: 'Turn tickets into tasks.' },
  { key: 'intercom', name: 'Intercom', icon: 'ti-message-chatbot', category: 'Support', kind: 'soon', blurb: 'Sync conversations and contacts.' },
  { key: 'freshdesk', name: 'Freshdesk', icon: 'ti-lifebuoy', category: 'Support', kind: 'soon', blurb: 'Connect Freshdesk tickets.' },
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
  const liveCount = CATALOG.filter((i) => i.kind !== 'soon').length;

  const categories = useMemo(() => Array.from(new Set(CATALOG.map((i) => i.category))), []);
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

  return (
    <Layout flat title="Integrations">
      <PageHeader title="Integrations" subtitle="Connect SNR-PMO to the tools your team already uses." help="connections" />

      <div className="flex items-start gap-3 rounded-lg bg-accent/10 border border-accent/20 px-4 py-3 mb-5">
        <Icon name="ti-plug-connected" className="text-base text-accentstrong mt-0.5 shrink-0" />
        <p className="text-sm text-content leading-relaxed">Slack, Discord and custom webhooks work today and fire on real activity (a deal is won, an invoice is paid…). One-click sign-in for the rest is rolling out — they&apos;re shown honestly as <span className="font-medium">Coming soon</span>, never a fake &ldquo;Connected.&rdquo;</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Icon name="ti-search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted2 text-base" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search integrations…" className="input w-full pl-9" />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {['All', ...categories].map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`px-3 h-8 rounded-full text-xs font-medium whitespace-nowrap transition ${cat === c ? 'bg-accent text-accentfg' : 'bg-surface2 text-muted hover:text-content'}`}>{c}</button>
          ))}
        </div>
        <span className="text-2xs text-muted sm:ml-auto shrink-0">{liveCount} live · {connectedCount} connected · {CATALOG.length} in catalog</span>
      </div>

      {loading ? <Spinner /> : groups.map(([c, list]) => (
        <div key={c} className="mb-7">
          <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-3">{c} <span className="text-muted2">· {list.length}</span></p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((it) => {
              const on = it.kind === 'webhook' && isConnected(it);
              return (
                <div key={it.key} className={`card p-4 flex flex-col ${on ? 'ring-1 ring-accent/30' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${on ? 'bg-accent/15 text-accentstrong' : 'bg-surface2 text-muted'}`}><Icon name={it.icon} className="text-lg" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-content">{it.name}</p>
                      {it.kind === 'webhook' && <span className={`pill ${on ? 'pill-green' : 'pill-gray'} mt-1`}>{on ? 'Connected' : 'Available'}</span>}
                      {it.kind === 'link' && <span className="pill pill-sky mt-1">Available</span>}
                      {it.kind === 'soon' && <span className="pill pill-gray mt-1">Coming soon</span>}
                    </div>
                  </div>
                  <p className="text-2xs text-muted mt-2.5 line-clamp-2 min-h-[2rem]">{it.blurb}</p>
                  {it.kind === 'webhook' && (on ? (
                    <button onClick={() => disconnect(it)} disabled={!admin || busy === it.key} className="btn mt-3 w-full justify-center">{busy === it.key ? <Icon name="ti-loader-2" className="animate-spin" /> : 'Disconnect'}</button>
                  ) : (
                    <button onClick={() => { setErr(''); setUrl(''); setModal(it); }} disabled={!admin} className={`btn btn-primary mt-3 w-full justify-center ${!admin ? 'opacity-50 cursor-not-allowed' : ''}`}>Connect</button>
                  ))}
                  {it.kind === 'link' && <Link href={it.href || '#'} className="btn btn-primary mt-3 w-full justify-center">{it.cta || 'Open'}</Link>}
                  {it.kind === 'soon' && <button disabled className="btn mt-3 w-full justify-center opacity-50 cursor-not-allowed">Coming soon</button>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
            <p className="text-2xs text-muted mt-1.5">We&apos;ll post here on workspace events. Fine-tune which events under Developer ▸ Webhooks.</p>
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
