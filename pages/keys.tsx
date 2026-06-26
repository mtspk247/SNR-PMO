import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Icon, Spinner, EmptyState } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import {
  assistantGetStatus, emailGetStatus, smsGetConfig, billingGetStatus,
} from '@/lib/db';

// Read-only registry of the platform SECRETS this workspace uses (AI, email, SMS, billing):
// which are configured/active, what each one powers, and how recently it was set. Secrets are
// secret-isolated server-side — the status RPCs return has_key/metadata ONLY, never the value,
// so nothing sensitive ever reaches the browser (the repo is public). Admin/owner only.

function ago(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime(); if (isNaN(t)) return '—';
  const s = Math.max(0, Date.now() - t), day = 86400000;
  if (s < 3600000) return Math.max(1, Math.round(s / 60000)) + ' min ago';
  if (s < day) return Math.round(s / 3600000) + ' h ago';
  const d = Math.round(s / day);
  if (d < 30) return d + ' day' + (d === 1 ? '' : 's') + ' ago';
  if (d < 365) return Math.round(d / 30) + ' mo ago';
  return Math.round(d / 365) + ' yr ago';
}
const mask = (v: string | null) => (v ? '••••' + v.slice(-4) : '');

type Row = {
  key: string; name: string; icon: string; powers: string;
  manageHref: string; manageLabel: string;
  active: boolean | null; detail: string; updated: string | null; accessible: boolean;
};

export default function KeysPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!org?.id || !admin) { setLoading(false); return; }
    let alive = true;
    (async () => {
      const [a, e, s, b] = await Promise.allSettled([
        assistantGetStatus(), emailGetStatus(), smsGetConfig(org.id), billingGetStatus(),
      ]);
      const A = a.status === 'fulfilled' ? a.value : null;
      const E = e.status === 'fulfilled' ? e.value : null;
      const S = s.status === 'fulfilled' ? s.value : null;
      const B = b.status === 'fulfilled' ? b.value : null;
      const out: Row[] = [
        {
          key: 'ai', name: 'AI Assistant & Agents', icon: 'ti-robot',
          powers: 'AI agents, the in-app docs assistant, AI custom fields, and natural-language chat commands.',
          manageHref: '/platform?tab=assistant', manageLabel: 'Console ▸ AI assistant',
          accessible: a.status === 'fulfilled', active: A ? A.has_key : null,
          detail: A ? ([A.provider, A.model].filter(Boolean).join(' · ') || 'Configured') : 'Managed at the platform level',
          updated: A ? A.updated_at : null,
        },
        {
          key: 'email', name: 'Email', icon: 'ti-mail',
          powers: 'Transactional email (invites, alerts, notifications) and marketing campaigns.',
          manageHref: '/platform?tab=email', manageLabel: 'Console ▸ Email',
          accessible: e.status === 'fulfilled', active: E ? (E.has_key || E.has_smtp_pass || E.gmail_connected) : null,
          detail: E ? (E.gmail_connected ? ('Gmail' + (E.gmail_email ? (' · ' + E.gmail_email) : '')) : (E.smtp_host ? ('SMTP · ' + E.smtp_host) : (E.provider || 'Configured'))) : 'Managed at the platform level',
          updated: E ? E.updated_at : null,
        },
        {
          key: 'sms', name: 'SMS / Messaging', icon: 'ti-message-2',
          powers: 'Two-way SMS inbox, booking reminders, and approved agent SMS.',
          manageHref: '/messaging', manageLabel: 'Messaging settings',
          accessible: s.status === 'fulfilled', active: S ? (S.configured || S.has_token) : null,
          detail: S ? ([S.provider, S.from_number].filter(Boolean).join(' · ') || 'Configured') : 'Not configured',
          updated: null,
        },
        {
          key: 'billing', name: 'Billing (Stripe)', icon: 'ti-credit-card',
          powers: 'Plan subscriptions, checkout, and metered agent billing.',
          manageHref: '/platform?tab=billing', manageLabel: 'Console ▸ Billing',
          accessible: b.status === 'fulfilled', active: B ? B.has_secret : null,
          detail: B ? ('Stripe · ' + B.mode + (B.publishable_key ? (' · ' + mask(B.publishable_key)) : '')) : 'Managed at the platform level',
          updated: B ? B.updated_at : null,
        },
      ];
      if (alive) { setRows(out); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [org?.id, admin]);

  if (!org) return <Layout flat title="API keys"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="API keys"><EmptyState icon="ti-lock" title="Admins only" text="API keys and integrations are managed by workspace owners and admins." /></Layout>;

  return (
    <Layout flat title="API keys">
      <PageHeader title="API keys & integrations" subtitle="What's connected, what each key powers, and how recently it was set." icon="ti-key" help="api-keys" />
      <div className="card p-3 mb-4 flex items-start gap-2 border border-line">
        <Icon name="ti-shield-lock" className="text-accentstrong mt-0.5 shrink-0" />
        <p className="text-2xs text-muted">Secrets are stored encrypted server-side and are <strong>never shown here or sent to your browser</strong> — only their status. These provider keys carry no fixed expiry; rotate them periodically and re-enter the key on each integration's manage page.</p>
      </div>
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((r) => (
            <div key={r.key} className="card p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface2 shrink-0"><Icon name={r.icon} className="text-accentstrong text-lg" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-content">{r.name}</span>
                    {r.active === null
                      ? <span className="rounded-md px-1.5 py-0.5 text-2xs font-medium bg-surface2 text-muted2">Restricted</span>
                      : r.active
                        ? <span className="rounded-md px-1.5 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#16a34a22', color: '#16a34a' }}>● Active</span>
                        : <span className="rounded-md px-1.5 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#9ca3af22', color: '#6b7280' }}>○ Not configured</span>}
                  </div>
                  <p className="text-2xs text-muted mt-0.5 font-mono truncate">{r.detail}</p>
                </div>
              </div>
              <p className="text-2xs text-muted2 mt-3"><span className="text-muted">Powers:</span> {r.powers}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-line gap-2">
                <span className="text-2xs text-muted2 truncate">{r.active ? ('Updated ' + ago(r.updated)) : (r.accessible ? 'No key on file' : 'Managed elsewhere')}</span>
                <Link href={r.manageHref} className="btn btn-sm shrink-0"><Icon name="ti-settings" className="text-sm" />{r.manageLabel}</Link>
              </div>
            </div>
          ))}
          <div className="card p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface2 shrink-0"><Icon name="ti-code" className="text-accentstrong text-lg" /></span>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-content">Your API keys (outbound)</span>
                <p className="text-2xs text-muted mt-0.5">Keys you issue for Zapier, Make, and the public API.</p>
              </div>
            </div>
            <p className="text-2xs text-muted2 mt-3"><span className="text-muted">Powers:</span> external access to your workspace data via the developer API and webhooks.</p>
            <div className="flex items-center justify-end mt-3 pt-3 border-t border-line">
              <Link href="/developer" className="btn btn-sm"><Icon name="ti-key" className="text-sm" />Manage API keys</Link>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
