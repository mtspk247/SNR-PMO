import { useState } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { INDUSTRIES, withCurrent } from '@/lib/taxonomy';
import { seedDemoData } from '@/lib/db';

// Self-serve, industry-specific demo data generator (owner-gated by the RPC).
// Additive — clearing data lives in the Danger zone (tenant_wipe_data).
export default function DemoDataCard({ orgId, defaultIndustry }: { orgId: string; defaultIndustry?: string | null }) {
  const [industry, setIndustry] = useState(defaultIndustry || '');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<Record<string, number> | null>(null);

  const run = async () => {
    setBusy(true); setErr(''); setDone(null);
    try { setDone(await seedDemoData(orgId, industry || null)); setConfirm(false); }
    catch (e: any) { setErr(e.message || 'Seed failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card p-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-accent/10 text-accentstrong ring-1 ring-inset ring-accent/15"><Icon name="ti-sparkles" className="text-xl" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content">Demo data</h3>
          <p className="text-2xs text-muted mt-0.5">Populate this workspace with realistic, industry-specific sample data across every module your plan includes — projects &amp; tasks, CRM, companies, teams, ideas, products, invoices, support tickets, risk register and ledger. Only modules your plan enables are populated. Great for trials and demos. This adds data — to clear everything, use the Danger zone.</p>
        </div>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Industry flavor</span>
          <Select search placeholder="Generic (any industry)" value={industry}
            options={withCurrent(INDUSTRIES, industry)} onChange={(v) => { setIndustry(v); setDone(null); }} />
        </label>
      </div>
      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      {done && (
        <p className="text-sm text-emerald-600 mt-3 inline-flex items-center gap-1 flex-wrap">
          <Icon name="ti-check" />Added {Object.entries(done).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'sample data'} (only modules your plan enables).
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        {!confirm ? (
          <button className="btn btn-primary" onClick={() => { setConfirm(true); setDone(null); }}><Icon name="ti-wand" />Generate demo data</button>
        ) : (
          <>
            <span className="text-sm text-content">Generate sample {industry || 'generic'} data now?</span>
            <button className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Generating…' : 'Confirm'}</button>
            <button className="btn" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}
