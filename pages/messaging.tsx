import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { toast } from '@/lib/toast';
import { smsGetConfig, smsSetConfig, listMessages, sendSms, listSuppression, addSuppression, removeSuppression, SmsConfigStatus, CommsMessage, SuppressionEntry } from '@/lib/db';

const PROVIDERS = [{ value: 'twilio', label: 'Twilio' }, { value: 'telnyx', label: 'Telnyx' }, { value: 'plivo', label: 'Plivo' }, { value: 'custom', label: 'Custom (HTTP)' }];
const STATUS_COLOR: Record<string, string> = { sent: '#16a34a', delivered: '#16a34a', queued: '#d97706', pending: '#d97706', failed: '#dc2626', received: '#2563eb' };

export default function MessagingPage() {
  const org = useActiveOrg();
  const enabled = hasFeature(org, 'comms');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [cfg, setCfg] = useState<SmsConfigStatus | null>(null);
  const [msgs, setMsgs] = useState<CommsMessage[]>([]);
  const [supp, setSupp] = useState<SuppressionEntry[]>([]);
  const [form, setForm] = useState({ provider: 'twilio', account_sid: '', auth_token: '', from_number: '', custom_url: '', enabled: false, monthly_cap_usd: '' });
  const [compose, setCompose] = useState({ to: '', body: '' });
  const [suppAddr, setSuppAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    if (isAdmin) smsGetConfig(org.id).then((c) => { setCfg(c); if (c) setForm((f) => ({ ...f, provider: c.provider || 'twilio', from_number: c.from_number || '', custom_url: c.custom_url || '', enabled: c.enabled, monthly_cap_usd: c.monthly_cap_usd != null ? String(c.monthly_cap_usd) : '' })); }).catch((e) => setErr(e.message));
    listMessages(org.id).then(setMsgs).catch(() => {});
    listSuppression(org.id).then(setSupp).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) load(); /* eslint-disable-next-line */ }, [org?.id, enabled, isAdmin]);

  const saveCfg = async () => {
    if (!org || busy) return; setBusy(true); setErr('');
    try {
      await smsSetConfig({ org_id: org.id, provider: form.provider, account_sid: form.account_sid || undefined, auth_token: form.auth_token || undefined, from_number: form.from_number || undefined, custom_url: form.custom_url || undefined, enabled: form.enabled, monthly_cap_usd: form.monthly_cap_usd ? Number(form.monthly_cap_usd) : null });
      setForm((f) => ({ ...f, account_sid: '', auth_token: '' }));
      toast('Messaging settings saved', 'success'); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const send = async () => {
    if (!org || !compose.to.trim() || !compose.body.trim() || busy) return; setBusy(true); setErr('');
    try { await sendSms(org.id, compose.to.trim(), compose.body.trim()); setCompose({ to: '', body: '' }); toast('Message queued', 'success'); setTimeout(load, 1500); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const addSupp = async () => { if (!org || !suppAddr.trim()) return; try { await addSuppression(org.id, suppAddr.trim()); setSuppAddr(''); listSuppression(org.id).then(setSupp); } catch (e: any) { setErr(e.message); } };
  const delSupp = async (id: string) => { try { await removeSuppression(id); setSupp((s) => s.filter((x) => x.id !== id)); } catch (e: any) { setErr(e.message); } };

  if (!enabled) return <Layout flat title="Messaging"><EmptyState icon="ti-message-2" title="Messaging not in your plan" text="Upgrade to send SMS from your own Twilio, Telnyx or Plivo account." /></Layout>;

  return (
    <Layout flat title="Messaging">
      <PageHeader title="Messaging" subtitle="Send SMS from your own provider - logged, consent-aware, spend-capped." icon="ti-message-2" help="messaging" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Status" value={cfg?.configured ? 'Live' : (cfg?.has_token ? 'Set up' : 'Not connected')} icon="ti-plug" />
        <StatCard label="Provider" value={cfg ? (cfg.provider || '-') : '-'} icon="ti-router" />
        <StatCard label="This month" value={cfg ? ('$' + (Number(cfg.month_cost_usd) || 0).toFixed(2)) : '$0.00'} icon="ti-coin" />
        <StatCard label="Suppressed" value={String(supp.length)} icon="ti-ban" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Icon name="ti-send" className="text-muted2" />Send a message</h3>
          {!cfg?.configured && <p className="text-2xs text-amber-600 mb-2">Connect &amp; enable a provider before sending.</p>}
          <input className="input mb-2" placeholder="+15551234567" value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} />
          <textarea className="input min-h-[90px] resize-y" placeholder="Your message" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} maxLength={1600} />
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xs text-muted2">{compose.body.length}/1600</span>
            <button className="btn btn-primary btn-sm" disabled={busy || !compose.to.trim() || !compose.body.trim()} onClick={send}><Icon name="ti-send" className="text-sm" />{busy ? 'Sending...' : 'Send'}</button>
          </div>
        </div>

        {isAdmin ? (
          <div className="card p-5">
            <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Icon name="ti-settings" className="text-muted2" />Provider settings</h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <label className="block"><span className="label">Provider</span><Select value={form.provider} onChange={(v) => setForm({ ...form, provider: v })} options={PROVIDERS} /></label>
              <label className="block"><span className="label">From number</span><input className="input" value={form.from_number} onChange={(e) => setForm({ ...form, from_number: e.target.value })} placeholder="+15550000000" /></label>
              <label className="block"><span className="label">{form.provider === 'telnyx' ? 'Messaging profile id (opt.)' : 'Account SID / id'}</span><input className="input" value={form.account_sid} onChange={(e) => setForm({ ...form, account_sid: e.target.value })} placeholder={cfg?.has_account ? 'saved - blank keeps it' : ''} /></label>
              <label className="block"><span className="label">Auth token / API key</span><input className="input" type="password" value={form.auth_token} onChange={(e) => setForm({ ...form, auth_token: e.target.value })} placeholder={cfg?.has_token ? 'saved - blank keeps it' : ''} /></label>
              {form.provider === 'custom' && <label className="block sm:col-span-2"><span className="label">Custom endpoint URL</span><input className="input" value={form.custom_url} onChange={(e) => setForm({ ...form, custom_url: e.target.value })} placeholder="https://..." /></label>}
              <label className="block"><span className="label">Monthly spend cap (USD)</span><input className="input" type="number" min="0" step="1" value={form.monthly_cap_usd} onChange={(e) => setForm({ ...form, monthly_cap_usd: e.target.value })} placeholder="no cap" /></label>
              <label className="flex items-center gap-2 text-sm mt-6 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />Enabled</label>
            </div>
            <div className="flex justify-end mt-3"><button className="btn btn-primary btn-sm" disabled={busy} onClick={saveCfg}>{busy ? 'Saving...' : 'Save settings'}</button></div>
            <p className="text-2xs text-muted2 mt-2"><Icon name="ti-shield-lock" className="text-xs" /> Your token is stored encrypted and never shown back.</p>
          </div>
        ) : (
          <div className="card p-5 flex items-center text-2xs text-muted">Provider settings are managed by an owner or admin.</div>
        )}
      </div>

      <div className="card p-5 mt-5">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Icon name="ti-history" className="text-muted2" />Recent messages</h3>
        {msgs.length === 0 ? <p className="text-2xs text-muted">No messages yet.</p> : (
          <div className="space-y-1.5">
            {msgs.slice(0, 25).map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                <span className="text-2xs text-muted2 w-10 shrink-0">{m.direction === 'inbound' ? 'IN' : 'OUT'}</span>
                <span className="text-sm text-content shrink-0 w-32 truncate">{m.to_addr}</span>
                <span className="text-xs text-muted truncate min-w-0 flex-1">{m.body}</span>
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium shrink-0" style={{ backgroundColor: (STATUS_COLOR[m.status] || '#6b7280') + '22', color: STATUS_COLOR[m.status] || '#6b7280' }}>{m.status}</span>
                <span className="text-2xs text-muted2 shrink-0 hidden sm:inline">{new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5 mt-5">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Icon name="ti-ban" className="text-muted2" />Opt-out / suppression list</h3>
        <div className="flex items-center gap-2 mb-3 max-w-sm">
          <input className="input" placeholder="+15551234567" value={suppAddr} onChange={(e) => setSuppAddr(e.target.value)} />
          <button className="btn btn-sm" disabled={!suppAddr.trim()} onClick={addSupp}>Add</button>
        </div>
        {supp.length === 0 ? <p className="text-2xs text-muted">No suppressed numbers.</p> : (
          <div className="flex flex-wrap gap-2">
            {supp.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-content">{s.address}<button className="text-muted2 hover:text-rose-500" onClick={() => delSupp(s.id)}><Icon name="ti-x" className="text-xs" /></button></span>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
