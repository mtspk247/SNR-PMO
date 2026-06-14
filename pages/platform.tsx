import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, Icon } from '@/components/ui';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import { useAuthStore } from '@/lib/store';
import { listPlans, listFeatures, listPlanFeatures, setPlanFeature, createPlan, updatePlan, deletePlan, PlanPatch, billingGetStatus, billingSetConfig, billingSetPlanPrice, BillingStatus, emailGetStatus, emailSetConfig, EmailStatus, backupGetConfig, backupSetConfig, listBackups, runBackupNow, getBackupDownloadUrl, BackupConfig, BackupRow, listErrors, resolveError, clearErrors, ErrorRow, listPlatformAdmins, addPlatformAdmin, removePlatformAdmin, PlatformAdminRow, ownerDeletionPending, decideOwnerDeletion, OwnerDeletionRequest, platformAccounts, PlatformAccount } from '@/lib/db';
import { Plan, Feature, PlanFeature } from '@/lib/supabase';
import { formatPrice } from '@/lib/entitlements';

type Tab = 'plans' | 'billing' | 'email' | 'backups' | 'errors' | 'owners' | 'accounts';

const PRICING_MODELS: { value: Plan['pricing_model']; label: string }[] = [
  { value: 'flat', label: 'Flat (per org / month)' },
  { value: 'per_user', label: 'Per user / month' },
  { value: 'white_label', label: 'White-label (flat)' },
];

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Create / edit a subscription plan (platform admin only — enforced by plans_write RLS).
function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const editing = !!plan;
  const tabs = useModalTabs('plan');
  const [name, setName] = useState(plan?.name || '');
  const [key, setKey] = useState(plan?.key || '');
  const [keyTouched, setKeyTouched] = useState(editing);
  const [description, setDescription] = useState(plan?.description || '');
  const [pricingModel, setPricingModel] = useState<Plan['pricing_model']>(plan?.pricing_model || 'flat');
  const [price, setPrice] = useState(plan ? String(plan.price_cents / 100) : '0');
  const [billingPeriod, setBillingPeriod] = useState<Plan['billing_period']>(plan?.billing_period || 'monthly');
  const [userLimit, setUserLimit] = useState(plan?.user_limit != null ? String(plan.user_limit) : '');
  const [sortOrder, setSortOrder] = useState(String(plan?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!name.trim() || saving) { tabs.setTab('plan'); return; }
    const cents = Math.round((parseFloat(price) || 0) * 100);
    if (cents < 0) { setErr('Price cannot be negative'); tabs.setTab('pricing'); return; }
    const limit = userLimit.trim() === '' ? null : Math.max(1, parseInt(userLimit, 10) || 1);
    const patch: PlanPatch = {
      name: name.trim(),
      description: description.trim() || null,
      pricing_model: pricingModel,
      price_cents: cents,
      billing_period: billingPeriod,
      user_limit: limit,
      sort_order: parseInt(sortOrder, 10) || 0,
      is_active: isActive,
    };
    setSaving(true); setErr('');
    try {
      if (editing) await updatePlan(plan!.id, patch);
      else await createPlan({ ...patch, key: (key.trim() || slugify(name)), name: name.trim() });
      await onSaved();
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const del = async () => {
    if (!plan || saving) return;
    if (!confirm(`Delete the "${plan.name}" plan? This cannot be undone.`)) return;
    setSaving(true); setErr('');
    try { await deletePlan(plan.id); await onSaved(); onClose(); }
    catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} onSubmit={submit} size="lg" icon="ti-license"
      title={editing ? `Edit plan — ${plan!.name}` : 'New plan'}
      subtitle={editing ? 'Changes apply immediately to every tenant on this plan' : 'Define pricing, seats and billing; toggle features in the matrix after saving'}
      tabs={[
        { key: 'plan', label: 'Plan', icon: 'ti-license' },
        { key: 'pricing', label: 'Pricing', icon: 'ti-currency-dollar' },
      ]}
      {...tabs.bind}
      footer={(
        <div className="flex items-center justify-end gap-2">
          {editing && <button className="btn text-rose-600 mr-auto" onClick={del} disabled={saving} title="Delete plan"><Icon name="ti-trash" />Delete</button>}
          <span className="hidden sm:block text-2xs text-muted2">↵ to save</span>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create plan'}
          </button>
        </div>
      )}>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {tabs.tab === 'plan' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" required>
            <input className="input" value={name} autoFocus placeholder="e.g. Growth"
              onChange={(e) => { setName(e.target.value); if (!keyTouched) setKey(slugify(e.target.value)); }} />
          </Field>
          <Field label="Key" required hint={editing ? 'Immutable — referenced by subscriptions' : 'Unique identifier (auto from name)'}>
            <input className="input font-mono" value={key} disabled={editing}
              onChange={(e) => { setKeyTouched(true); setKey(slugify(e.target.value)); }} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input className="input" value={description} placeholder="Shown on the plan column" onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Sort order" hint="Column position in the matrix">
            <input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <Field label="Status">
            <label className="flex items-center gap-2 h-9 text-sm cursor-pointer select-none">
              <input type="checkbox" className="accent-accent w-4 h-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span className={isActive ? 'text-content' : 'text-muted'}>{isActive ? 'Active — selectable for tenants' : 'Inactive (hidden from new assignments)'}</span>
            </label>
          </Field>
        </div>
      )}
      {tabs.tab === 'pricing' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Pricing model" required>
            <select className="input" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as Plan['pricing_model'])}>
              {PRICING_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Price (USD)" required hint={pricingModel === 'per_user' ? 'Charged per seat per period' : 'Charged per org per period'}>
            <input className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Billing period" required>
            <select className="input" value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value as Plan['billing_period'])}>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          <Field label="Seat limit" hint="Blank = unlimited; enforced on member invites">
            <input className="input" type="number" min="1" placeholder="∞" value={userLimit} onChange={(e) => setUserLimit(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

const WEBHOOK_URL = 'https://dkjdtyzjdkumnpdyezbs.supabase.co/functions/v1/stripe-webhook';

// Billing (Stripe) config — platform admin only. Secrets are write-only from here;
// the status RPC never returns secret values, only whether they are set.
function BillingTab({ plans, onReload }: { plans: Plan[]; onReload: () => Promise<void> }) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState('');
  const [publishable, setPublishable] = useState('');
  const [webhook, setWebhook] = useState('');
  const [mode, setMode] = useState('test');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});

  const loadStatus = async () => {
    setLoading(true);
    try {
      const st = await billingGetStatus();
      setStatus(st);
      if (st?.mode) setMode(st.mode);
    } catch (e: any) { setErr(e?.message || 'Failed to load billing status'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { setPrices(Object.fromEntries(plans.map((p) => [p.id, p.stripe_price_id || '']))); }, [plans]);

  const saveConfig = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await billingSetConfig({ secret, publishable, webhook, mode });
      setSecret(''); setWebhook(''); // clear sensitive inputs after save
      setMsg('Saved. Stripe configuration updated.');
      await loadStatus();
    } catch (e: any) { setErr(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const savePrice = async (planId: string) => {
    setErr(''); setMsg('');
    try { await billingSetPlanPrice(planId, prices[planId] || ''); setMsg('Price ID saved.'); await onReload(); }
    catch (e: any) { setErr(e?.message || 'Failed to save price'); }
  };

  if (loading) return <div className="card rounded-t-none p-6"><Spinner /></div>;

  return (
    <div className="card rounded-t-none p-5 sm:p-6 space-y-7">
      {/* Connection status */}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`pill ${status?.has_secret ? 'pill-green' : 'pill-red'}`}>
          {status?.has_secret ? 'Connected' : 'Not connected'}
        </span>
        <span className="pill pill-gray">Mode: {status?.mode || 'test'}</span>
        <span className={`pill ${status?.has_webhook ? 'pill-green' : 'pill-amber'}`}>
          {status?.has_webhook ? 'Webhook set' : 'Webhook missing'}
        </span>
        {status?.updated_at && <span className="text-2xs text-muted">Updated {new Date(status.updated_at).toLocaleString()}</span>}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {/* Keys form */}
      <div className="space-y-4 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Stripe API keys</h3>
        <p className="text-2xs text-muted">Paste your keys from the Stripe dashboard. Secret values are stored server-side and are never shown back here — leave a field blank to keep its current value.</p>
        <Field label="Secret key" hint={status?.has_secret ? 'A secret key is already set — leave blank to keep it.' : 'sk_test_… or sk_live_…'}>
          <input type="password" className="input" autoComplete="off" placeholder={status?.has_secret ? '•••••••• (unchanged)' : 'sk_test_…'} value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <Field label="Publishable key" hint="pk_test_… or pk_live_… (safe to display)">
          <input className="input" placeholder={status?.publishable_key || 'pk_test_…'} value={publishable} onChange={(e) => setPublishable(e.target.value)} />
        </Field>
        <Field label="Webhook signing secret" hint={status?.has_webhook ? 'Already set — leave blank to keep it.' : 'whsec_… (from the webhook endpoint you create in Stripe)'}>
          <input type="password" className="input" autoComplete="off" placeholder={status?.has_webhook ? '•••••••• (unchanged)' : 'whsec_…'} value={webhook} onChange={(e) => setWebhook(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </Field>
        <button className="btn btn-primary" disabled={saving} onClick={saveConfig}>
          {saving ? 'Saving…' : 'Save Stripe configuration'}
        </button>
      </div>

      {/* Webhook endpoint */}
      <div className="space-y-2 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Webhook endpoint</h3>
        <p className="text-2xs text-muted">In Stripe → Developers → Webhooks, add an endpoint pointing here and subscribe to <span className="font-mono">checkout.session.completed</span>, <span className="font-mono">customer.subscription.updated</span>, <span className="font-mono">customer.subscription.deleted</span>. Then paste its signing secret above.</p>
        <code className="block text-xs bg-surface2 border border-line rounded-md px-3 py-2 break-all">{WEBHOOK_URL}</code>
      </div>

      {/* Per-plan price IDs */}
      <div className="space-y-3 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Plan → Stripe Price ID</h3>
        <p className="text-2xs text-muted">Create a recurring Price for each paid plan in Stripe and paste its Price ID (price_…) here. Plans without a Price ID can't be checked out.</p>
        {plans.filter((p) => p.key !== 'free').map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-sm text-content">{p.name}</span>
            <input className="input flex-1" placeholder="price_…" value={prices[p.id] ?? ''} onChange={(e) => setPrices((s) => ({ ...s, [p.id]: e.target.value }))} />
            <button className="btn btn-ghost border border-line" onClick={() => savePrice(p.id)}>Save</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Transactional email (Resend) config — platform admin only. The API key is write-only;
// status never returns it. In-app notifications are emailed via a server-side outbox + cron drain.
function EmailTab() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [from, setFrom] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    try {
      const st = await emailGetStatus();
      setStatus(st);
      if (st) { setEnabled(st.enabled); setFrom(st.from_email || ''); setReplyTo(st.reply_to || ''); }
    } catch (e: any) { setErr(e?.message || 'Failed to load email status'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadStatus(); /* eslint-disable-next-line */ }, []);

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      await emailSetConfig({ apiKey, from, replyTo, enabled });
      setApiKey('');
      setMsg('Saved. Email configuration updated.');
      await loadStatus();
    } catch (e: any) { setErr(e?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="card rounded-t-none p-6"><Spinner /></div>;

  return (
    <div className="card rounded-t-none p-5 sm:p-6 space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`pill ${status?.has_key ? 'pill-green' : 'pill-red'}`}>{status?.has_key ? 'Connected' : 'Not connected'}</span>
        <span className={`pill ${status?.enabled ? 'pill-green' : 'pill-gray'}`}>{status?.enabled ? 'Sending enabled' : 'Sending paused'}</span>
        <span className="pill pill-gray">Pending: {status?.pending_count ?? 0}</span>
        <span className="pill pill-gray">Sent: {status?.sent_count ?? 0}</span>
        {status?.updated_at && <span className="text-2xs text-muted">Updated {new Date(status.updated_at).toLocaleString()}</span>}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <div className="space-y-4 max-w-xl">
        <h3 className="text-sm font-semibold text-content">Resend</h3>
        <p className="text-2xs text-muted">Paste a Resend API key and a verified sender. The key is stored server-side and never shown back — leave it blank to keep the current one. In-app notifications are emailed automatically via a server-side queue (drained every minute).</p>
        <Field label="API key" hint={status?.has_key ? 'A key is already set — leave blank to keep it.' : 're_…'}>
          <input type="password" className="input" autoComplete="off" placeholder={status?.has_key ? '•••••••• (unchanged)' : 're_…'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Field>
        <Field label="From address" hint='Must use a verified Resend domain, e.g. "SNR-PMO <noreply@yourdomain.com>"'>
          <input className="input" placeholder="SNR-PMO <noreply@yourdomain.com>" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Reply-to" hint="Optional">
          <input className="input" placeholder="support@yourdomain.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-accent w-4 h-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className={enabled ? 'text-content' : 'text-muted'}>{enabled ? 'Sending enabled' : 'Sending paused (queue held until re-enabled)'}</span>
        </label>
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save email configuration'}</button>
      </div>
    </div>
  );
}

function ErrorsTab() {
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = async () => setRows(await listErrors());
  useEffect(() => { load().catch((e: any) => setMsg(e.message)); }, []);
  const last24 = rows.filter((r) => Date.now() - new Date(r.created_at).getTime() < 864e5).length;
  const unresolved = rows.filter((r) => !r.resolved).length;
  const toggle = async (r: ErrorRow) => { try { await resolveError(r.id, !r.resolved); await load(); } catch (e: any) { alert(e.message); } };
  const clearAll = async () => { if (!confirm('Clear all logged errors?')) return; setBusy(true); try { await clearErrors(); await load(); } catch (e: any) { alert(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-4">
      <div className="card rounded-t-none p-5 flex items-center gap-6 flex-wrap">
        <div><p className="text-2xs uppercase tracking-wide text-muted2">Total</p><p className="text-2xl font-semibold tabular-nums">{rows.length}</p></div>
        <div><p className="text-2xs uppercase tracking-wide text-muted2">Last 24h</p><p className="text-2xl font-semibold tabular-nums">{last24}</p></div>
        <div><p className="text-2xs uppercase tracking-wide text-muted2">Unresolved</p><p className={`text-2xl font-semibold tabular-nums ${unresolved ? 'text-rose-600' : ''}`}>{unresolved}</p></div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn" onClick={() => load()}><Icon name="ti-refresh" />Refresh</button>
          <button className="btn text-rose-600" disabled={busy || rows.length === 0} onClick={clearAll}><Icon name="ti-trash" />Clear all</button>
        </div>
        {msg && <span className="text-2xs text-rose-600 w-full">{msg}</span>}
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-surface2 text-left text-2xs uppercase tracking-wide text-muted"><tr>
            <th className="px-4 py-3 font-medium">When</th><th className="px-4 py-3 font-medium">Level</th><th className="px-4 py-3 font-medium">Message</th><th className="px-4 py-3 font-medium">Path</th><th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-line align-top ${r.resolved ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap text-2xs text-muted">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3"><span className={`pill ${r.level === 'error' ? 'pill-red' : 'pill-amber'}`}>{r.level}</span></td>
                <td className="px-4 py-3 max-w-[28rem]"><p className="font-medium text-content break-words">{r.message}</p>{r.stack && <details className="mt-1"><summary className="text-2xs text-muted2 cursor-pointer">stack</summary><pre className="text-2xs text-muted whitespace-pre-wrap mt-1 max-h-40 overflow-y-auto">{r.stack}</pre></details>}</td>
                <td className="px-4 py-3 text-2xs text-muted font-mono">{r.path || '—'}</td>
                <td className="px-4 py-3 text-2xs text-muted">{r.source}</td>
                <td className="px-4 py-3 text-right"><button className="btn btn-ghost h-7 px-2 text-xs" onClick={() => toggle(r)}>{r.resolved ? 'Reopen' : 'Resolve'}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted2">No errors logged — all clear.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function BackupsTab() {
  const [cfg, setCfg] = useState<BackupConfig | null>(null);
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [retention, setRetention] = useState(10);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const c = await backupGetConfig();
    if (c) { setCfg(c); setEnabled(c.enabled); setFrequency(c.frequency); setRetention(c.retention_count); }
    setRows(await listBackups());
  };
  useEffect(() => { load().catch((e: any) => setMsg(e.message)); }, []);
  const save = async () => { setSaving(true); setMsg(''); try { await backupSetConfig({ enabled, frequency, retention }); await load(); setMsg('Settings saved.'); } catch (e: any) { setMsg(e.message); } finally { setSaving(false); } };
  const runNow = async () => { setRunning(true); setMsg(''); try { const r = await runBackupNow(); await load(); setMsg(r?.ok ? `Backup created — ${r.tableCount} tables, ${r.rowCount} rows.` : (r?.error || 'Done.')); } catch (e: any) { setMsg(e.message); } finally { setRunning(false); } };
  const download = async (path: string) => { try { const u = await getBackupDownloadUrl(path); window.open(u, '_blank'); } catch (e: any) { alert(e.message); } };
  const fmtBytes = (n: number | null) => n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  return (
    <div className="space-y-4">
      <div className="card rounded-t-none p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-database-export" className="text-base text-muted2" />Automatic backups</h3>
            <p className="text-2xs text-muted mt-1">Scheduled full-database snapshots, stored securely. {cfg?.last_run_at ? `Last run ${new Date(cfg.last_run_at).toLocaleString()}.` : 'Not run yet.'}</p>
          </div>
          <button className="btn btn-primary shrink-0" disabled={running} onClick={runNow}><Icon name="ti-player-play" />{running ? 'Backing up…' : 'Back up now'}</button>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Frequency"><select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
          <Field label="Keep last (retention)"><input type="number" min={1} max={100} className="input" value={retention} onChange={(e) => setRetention(parseInt(e.target.value) || 1)} /></Field>
          <div className="flex items-end"><label className="flex items-center gap-2 text-sm h-9 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /><span className={enabled ? 'text-content' : 'text-muted'}>{enabled ? 'Auto-backup on' : 'Auto-backup off'}</span></label></div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save schedule'}</button>
          {msg && <span className="text-2xs text-muted">{msg}</span>}
        </div>
        <p className="text-2xs text-muted2">Email, Google Drive and S3 delivery are coming next — this stores backups in-app for download.</p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-surface2 text-left text-2xs uppercase tracking-wide text-muted"><tr>
            <th className="px-4 py-3 font-medium">Created</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Size</th><th className="px-4 py-3 font-medium">Tables / rows</th><th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-line hover:bg-surface2/50">
                <td className="px-4 py-3 tabular-nums">{new Date(b.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 capitalize">{b.kind}</td>
                <td className="px-4 py-3"><span className={`pill ${b.status === 'completed' ? 'pill-green' : b.status === 'failed' ? 'pill-red' : 'pill-amber'}`}>{b.status}</span></td>
                <td className="px-4 py-3 tabular-nums">{fmtBytes(b.size_bytes)}</td>
                <td className="px-4 py-3 tabular-nums text-muted">{b.table_count ?? '—'} / {b.row_count ?? '—'}</td>
                <td className="px-4 py-3 text-right">{b.file_path && b.status === 'completed' ? <button className="btn btn-ghost h-7 px-2 text-xs" onClick={() => download(b.file_path!)}><Icon name="ti-download" />Download</button> : (b.note ? <span className="text-2xs text-rose-500 truncate max-w-[12rem] inline-block" title={b.note}>{b.note}</span> : null)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted2">No backups yet — run one above.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function AccountsTab() {
  const [rows, setRows] = useState<PlatformAccount[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { platformAccounts().then(setRows).catch((e) => { setErr(e?.message || 'Failed to load accounts'); setRows([]); }); }, []);
  if (rows === null) return <div className="card rounded-t-none p-6"><Spinner /></div>;
  const orphans = rows.filter((r) => r.org_count === 0).length;
  return (
    <div className="card rounded-t-none p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-content">Accounts</h3>
        <p className="text-2xs text-muted mt-1 max-w-2xl">Everyone who has signed in across the platform, newest first. {orphans > 0 ? `${orphans} ${orphans === 1 ? 'account has' : 'accounts have'} no workspace yet.` : 'Everyone belongs to a workspace.'}</p>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
          <tr><th className="px-4 py-3 font-medium">Person</th><th className="px-4 py-3 font-medium">Workspaces</th><th className="px-4 py-3 font-medium">Signed up</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t border-line hover:bg-surface2/50">
              <td className="px-4 py-3"><span className="block font-medium text-content">{r.full_name || r.email}</span><span className="block text-2xs text-muted">{r.email}</span></td>
              <td className="px-4 py-3">
                {r.org_count === 0
                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-500/10 text-amber-600">No workspace</span>
                  : <span className="flex flex-wrap gap-1">{r.orgs.map((o) => <span key={o} className="pill pill-gray">{o}</span>)}</span>}
              </td>
              <td className="px-4 py-3 text-2xs text-muted2">{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

function OwnersTab() {
  const [rows, setRows] = useState<PlatformAdminRow[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<OwnerDeletionRequest[]>([]);

  const load = async () => {
    try { setRows(await listPlatformAdmins()); }
    catch (e: any) { setErr(e?.message || 'Failed to load owners'); setRows([]); }
    try { setPending(await ownerDeletionPending()); } catch { /* ignore */ }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const iAmPrimary = !!rows?.some((r) => r.is_self && r.is_primary);
  const decide = async (id: string, approve: boolean) => {
    if (busy) return;
    if (!confirm(approve ? 'Approve this owner removal? This permanently removes the platform owner.' : 'Reject this owner-removal request?')) return;
    setBusy(true); setErr(''); setMsg('');
    try { const r = await decideOwnerDeletion(id, approve); setMsg(r.ok ? (approve ? 'Owner removed.' : 'Request rejected.') : (r.reason || 'Could not complete.')); await load(); }
    catch (e: any) { setErr(e?.message || 'Could not decide'); } finally { setBusy(false); }
  };

  const add = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await addPlatformAdmin(email.trim());
      setMsg(`Added ${email.trim()} as a platform owner.`);
      setEmail('');
      await load();
    } catch (e: any) { setErr(e?.message || 'Could not add owner'); }
    finally { setBusy(false); }
  };

  const remove = async (r: PlatformAdminRow) => {
    if (busy) return;
    if (!confirm(`Remove ${r.full_name || r.email} as a platform owner?`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await removePlatformAdmin(r.user_id);
      setMsg(res.status === 'pending_approval'
        ? 'Removal requested — it needs the primary owner\u2019s approval. An email was sent to the primary owner.'
        : 'Owner removed.');
      await load();
    } catch (e: any) { setErr(e?.message || 'Could not remove owner'); }
    finally { setBusy(false); }
  };

  if (rows === null) return <div className="card rounded-t-none p-6"><Spinner /></div>;

  return (
    <div className="card rounded-t-none p-5 sm:p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-content">Platform owners</h3>
        <p className="text-2xs text-muted mt-1 max-w-2xl">Platform owners have full cross-tenant administration access — this console, every tenant, plans and billing. Add a co-owner by the email of an existing user (they must have signed in to the app at least once). The primary owner can&rsquo;t be removed, and there must always be at least one owner.</p>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <div className="flex flex-wrap items-end gap-2 max-w-xl">
        <div className="flex-1 min-w-[14rem]">
          <Field label="Add co-owner by email" hint="Must be an existing user">
            <input className="input" type="email" autoComplete="off" placeholder="person@company.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy || !email.trim()} onClick={add}><Icon name="ti-user-plus" className="text-base" />Add owner</button>
      </div>

      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4">
          <p className="text-sm font-semibold text-content flex items-center gap-2"><Icon name="ti-shield-lock" className="text-amber-600" />Owner-removal approvals</p>
          <p className="text-2xs text-muted mt-0.5 mb-3">{iAmPrimary ? 'A co-owner requested removing another owner. Only you (the primary owner) can approve.' : 'Pending the primary owner\u2019s approval.'}</p>
          <div className="space-y-2">
            {pending.map((pr) => (
              <div key={pr.id} className="flex flex-wrap items-center gap-2 text-sm bg-surface border border-line rounded-md px-3 py-2">
                <span className="text-content font-medium">{pr.target_name}</span>
                <span className="text-2xs text-muted">requested by {pr.requested_by || '—'} · {new Date(pr.created_at).toLocaleString()}</span>
                {iAmPrimary && (
                  <span className="ml-auto flex items-center gap-2">
                    <button className="btn btn-danger h-7 py-0" disabled={busy} onClick={() => decide(pr.id, true)}><Icon name="ti-check" className="text-sm" />Approve removal</button>
                    <button className="btn h-7 py-0" disabled={busy} onClick={() => decide(pr.id, false)}>Reject</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-3 font-medium">Owner</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Since</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id} className="border-t border-line hover:bg-surface2/50">
              <td className="px-4 py-3">
                <span className="block font-medium text-content">{r.full_name || r.email}{r.is_self && <span className="text-2xs text-muted2"> (you)</span>}</span>
                <span className="block text-2xs text-muted">{r.email}</span>
              </td>
              <td className="px-4 py-3">{r.is_primary ? <span className="pill pill-green">Primary owner</span> : <span className="pill pill-gray">Co-owner</span>}</td>
              <td className="px-4 py-3 text-muted">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                {r.is_primary
                  ? <span className="text-2xs text-muted2">Protected</span>
                  : <button className="btn btn-danger h-8 py-0" disabled={busy} onClick={() => remove(r)}><Icon name="ti-user-minus" className="text-sm" />Remove</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}

export default function PlatformPage() {
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [pf, setPf] = useState<PlanFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('plans');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [planModal, setPlanModal] = useState<Plan | 'new' | null>(null);

  const load = async () => {
    const [p, f, m] = await Promise.all([listPlans(), listFeatures(), listPlanFeatures()]);
    setPlans(p); setFeatures(f); setPf(m);
  };
  useEffect(() => { if (platformAdmin) load().catch((e) => setErr(e.message)).finally(() => setLoading(false)); else setLoading(false); }, [platformAdmin]);

  if (!platformAdmin) {
    return <Layout title="Platform"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />Platform administration is restricted to the platform team.</div></Layout>;
  }

  const enabled = (planId: string, fk: string) => pf.some((x) => x.plan_id === planId && x.feature_key === fk && x.enabled);

  const toggleFeature = async (planId: string, fk: string, on: boolean) => {
    setBusy(true); setErr('');
    setPf((prev) => {
      const i = prev.findIndex((x) => x.plan_id === planId && x.feature_key === fk);
      if (i >= 0) { const c = prev.slice(); c[i] = { ...c[i], enabled: on }; return c; }
      return [...prev, { plan_id: planId, feature_key: fk, enabled: on }];
    });
    try { await setPlanFeature(planId, fk, on); } catch (e: any) { setErr(e.message); await load(); }
    finally { setBusy(false); }
  };


  return (
    <Layout title="Platform">
      {loading ? <Spinner /> : (
        <>
          <PageHeader title="Plans & billing" subtitle="Cross-tenant administration — plans, seats, features, billing and ops. Manage individual tenants under Tenants."
            action={tab === 'plans' ? (
              <button className="btn btn-primary" onClick={() => setPlanModal('new')}>
                <Icon name="ti-plus" className="text-base" /> New plan
              </button>
            ) : undefined} />

          {/* Tabs */}
          <div className="card rounded-b-none border-b-0 flex gap-1 px-4 bg-surface2/50 sticky top-0 z-10">
            {(['plans', 'billing', 'email', 'backups', 'errors', 'owners', 'accounts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-b-accent text-content'
                    : 'border-b-transparent text-muted hover:text-content'
                }`}
              >
                {t === 'plans' ? 'Plans & features' : t === 'billing' ? 'Billing (Stripe)' : t === 'email' ? 'Email' : t === 'backups' ? 'Backups' : t === 'errors' ? 'Errors' : t === 'owners' ? 'Co-owners' : 'Accounts'}
              </button>
            ))}
          </div>

          {err && <p className="text-sm text-rose-600 mb-3 px-4 pt-4 card rounded-t-none">{err}</p>}

          {tab === 'plans' ? (
            <div className="card overflow-x-auto rounded-t-none">
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface2 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-2xs uppercase tracking-wide text-muted">Feature</th>
                    {plans.map((p) => (
                      <th key={p.id} className="px-4 py-3 text-center">
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="font-semibold text-content">{p.name}</span>
                          {!p.is_active && <span className="pill pill-gray">inactive</span>}
                          <button className="text-muted2 hover:text-accentstrong transition-colors" title={`Edit ${p.name}`}
                            onClick={() => setPlanModal(p)}>
                            <Icon name="ti-pencil" className="text-sm" />
                          </button>
                        </span>
                        <span className="block text-2xs text-muted font-normal">{formatPrice(p.price_cents, p.pricing_model)}{p.billing_period === 'annual' ? ' (annual)' : ''}</span>
                        <span className="block text-2xs text-muted font-normal">{p.user_limit == null ? 'unlimited seats' : `${p.user_limit} seats`}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {features.map((f) => (
                    <tr key={f.key} className="border-t border-line hover:bg-surface2/50">
                      <td className="px-4 py-3">
                        <span className="block font-medium text-content">{f.name}</span>
                        <span className="block text-2xs text-muted">{f.description}</span>
                      </td>
                      {plans.map((p) => (
                        <td key={p.id} className="px-4 py-3 text-center">
                          <input type="checkbox" className="accent-accent w-4 h-4" disabled={busy}
                            checked={enabled(p.id, f.key)}
                            onChange={(e) => toggleFeature(p.id, f.key, e.target.checked)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="px-4 py-3 text-2xs text-muted border-t border-line">Changes apply immediately to every tenant on that plan (enforced server-side via RLS).</div>
            </div>
          ) : tab === 'billing' ? (
            <BillingTab plans={plans} onReload={load} />
          ) : tab === 'email' ? (
            <EmailTab />
          ) : tab === 'backups' ? (
            <BackupsTab />
          ) : tab === 'errors' ? (
            <ErrorsTab />
          ) : tab === 'owners' ? (
            <OwnersTab />
          ) : (
            <AccountsTab />
          )}

          {planModal && (
            <PlanModal plan={planModal === 'new' ? null : planModal} onClose={() => setPlanModal(null)} onSaved={load} />
          )}
        </>
      )}
    </Layout>
  );
}
