import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { INDUSTRIES, withCurrent } from '@/lib/taxonomy';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { buildDemoPayload, trimDemoPayload } from '@/lib/demoSeed';
import { seedDemoCustom, seedDemoSmartColumns, unseedDemoSmartColumns, seedStarterAgents, seedBuiltinChatCommands, seedAgentRoiDemo, tenantSnapshot, restoreTenantSnapshot, listTenantSnapshots, TenantSnapshot, seedDefaultRoles, seedDemoCrmExtra } from '@/lib/db';

type Leaf = { key: string; label: string };
const GROUPS: { group: string; icon: string; items: Leaf[] }[] = [
  { group: 'Work', icon: 'ti-briefcase', items: [{ key: 'projects', label: 'Projects' }, { key: '__tasks', label: 'Tasks / project' }, { key: 'ideas', label: 'Ideas' }] },
  { group: 'CRM', icon: 'ti-users', items: [{ key: 'clients', label: 'Clients' }, { key: 'leads', label: 'Leads' }, { key: 'deals', label: 'Deals' }, { key: 'proposals', label: 'Proposals' }, { key: 'contracts', label: 'Contracts' }] },
  { group: 'Accounting', icon: 'ti-report-money', items: [{ key: 'invoices', label: 'Invoices' }, { key: 'products', label: 'Products' }, { key: 'ledger', label: 'Ledger entries' }, { key: 'risks', label: 'Risks' }] },
  { group: 'People', icon: 'ti-users-group', items: [{ key: 'teams', label: 'Teams' }] },
  { group: 'Support', icon: 'ti-lifebuoy', items: [{ key: 'support', label: 'Tickets' }] },
  { group: 'Automation', icon: 'ti-bolt', items: [{ key: 'automations', label: 'Automations' }, { key: 'templates', label: 'Templates' }] },
];

// Granular, reversible demo seeder: a module -> area tree with per-area counts. Builds the full
// industry payload, then trims it to the selection client-side and feeds the existing
// tenant_seed_demo RPC. Reuses the smart-columns + starter-agents seeders. Reversible via the
// Danger zone wipe (which takes an automatic restore point).
export default function DemoSeedTree({ orgId, defaultIndustry }: { orgId: string; defaultIndustry?: string | null }) {
  const activeOrg = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const agentsAvail = !!activeOrg && activeOrg.id === orgId && hasFeature(activeOrg, 'agents');

  const [industry, setIndustry] = useState(defaultIndustry || '');
  const full = useMemo(() => buildDemoPayload(industry || null), [industry]);
  const maxOf = (key: string): number => key === '__tasks'
    ? Math.max(0, ...full.projects.map((p) => p.tasks.length))
    : (((full as unknown as Record<string, unknown[]>)[key])?.length ?? 0);

  const defaults = useMemo(() => {
    const d: Record<string, number> = {};
    GROUPS.forEach((g) => g.items.forEach((it) => { d[it.key] = maxOf(it.key); }));
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cur = (key: string) => (sel[key] ?? defaults[key] ?? 0);

  const [withSmart, setWithSmart] = useState(true);
  const [withAgents, setWithAgents] = useState(true);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [withRoles, setWithRoles] = useState(true);
  const [reverting, setReverting] = useState(false);
  const [snaps, setSnaps] = useState<TenantSnapshot[]>([]);
  const refreshSnaps = () => { listTenantSnapshots(orgId).then((all) => setSnaps(all.filter((x) => (x.label || '').toLowerCase().includes('demo data')))).catch(() => {}); };
  useEffect(() => { refreshSnaps(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [orgId]);
  const revertTo = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Restore this point? It removes the demo data and anything added since. A safety snapshot is taken first.')) return;
    setReverting(true); setErr(''); setMsg('');
    try { await tenantSnapshot(orgId, 'Before restore — ' + new Date().toLocaleString()); await restoreTenantSnapshot(id); setMsg('Restored — demo data removed.'); setDone(null); refreshSnaps(); }
    catch (e: unknown) { setErr((e as Error).message || 'Restore failed'); } finally { setReverting(false); }
  };

  const setKey = (key: string, n: number) => { setDone(null); setSel((s) => ({ ...s, [key]: Math.max(0, Math.min(isNaN(n) ? 0 : n, maxOf(key))) })); };
  const toggleKey = (key: string, on: boolean) => setKey(key, on ? maxOf(key) : 0);
  const toggleGroup = (items: Leaf[], on: boolean) => { setDone(null); setSel((s) => { const n = { ...s }; items.forEach((it) => { n[it.key] = on ? maxOf(it.key) : 0; }); return n; }); };

  const totalRecords = GROUPS.reduce((sum, g) => sum + g.items.filter((it) => it.key !== '__tasks').reduce((a, it) => a + cur(it.key), 0), 0);

  const run = async () => {
    setBusy('seed'); setErr(''); setDone(null); setMsg('');
    try {
      try { await tenantSnapshot(orgId, 'Before demo data — ' + new Date().toLocaleString()); } catch { /* restore-point best-effort */ }
      const selection: Record<string, number> = {};
      GROUPS.forEach((g) => g.items.forEach((it) => { if (it.key !== '__tasks') selection[it.key] = cur(it.key); }));
      const payload = trimDemoPayload(full, selection, cur('__tasks'));
      const counts = await seedDemoCustom(orgId, payload);
      const crmExtra = await seedDemoCrmExtra(orgId, payload).catch(() => ({} as Record<string, number>));
      if (withSmart) { try { await seedDemoSmartColumns(orgId); } catch { /* non-fatal */ } }
      if (withAgents && agentsAvail && me?.id) { try { await seedStarterAgents(orgId, me.id); await seedBuiltinChatCommands(orgId); await seedAgentRoiDemo(orgId); } catch { /* non-fatal */ } }
      if (withRoles) { try { await seedDefaultRoles(orgId); } catch { /* non-fatal */ } }
      setDone({ ...counts, ...crmExtra });
      refreshSnaps();
    } catch (e: unknown) { setErr((e as Error).message || 'Seeding failed'); }
    finally { setBusy(''); }
  };
  const removeSmart = async () => {
    setBusy('rm'); setMsg(''); setErr('');
    try { const r = await unseedDemoSmartColumns(orgId); setMsg(`Removed ${r.removed ?? 0} sample columns.`); }
    catch (e: unknown) { setErr((e as Error).message || 'Failed'); } finally { setBusy(''); }
  };

  return (
    <div className="card p-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 shrink-0 rounded-xl grid place-items-center bg-accent/10 text-accentstrong ring-1 ring-inset ring-accent/15"><Icon name="ti-binary-tree" className="text-xl" /></span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content">Demo data</h3>
          <p className="text-2xs text-muted mt-0.5">Populate this workspace with realistic, industry-specific sample data &mdash; pick exactly which modules and how many records. Only modules your plan enables are seeded live. Companies &amp; portfolios are always included as the foundation other records link to.</p>
        </div>
      </div>

      <div className="mt-4 max-w-xs">
        <span className="block text-2xs uppercase tracking-wide text-muted mb-1 font-medium">Industry flavor</span>
        <Select search placeholder="Generic (any industry)" value={industry} options={withCurrent(INDUSTRIES, industry)} onChange={(v) => { setIndustry(v); setSel({}); setDone(null); }} />
      </div>

      <div className="mt-4 space-y-3">
        {GROUPS.map((g) => {
          const allOn = g.items.every((it) => cur(it.key) > 0);
          const someOn = g.items.some((it) => cur(it.key) > 0);
          const selectedCount = g.items.filter((it) => it.key !== '__tasks').reduce((a, it) => a + cur(it.key), 0);
          const expanded = open[g.group] ?? someOn;
          return (
            <div key={g.group} className="rounded-xl border border-line">
              <div className="flex items-center gap-2.5 p-3">
                <button type="button" onClick={() => setOpen((p) => ({ ...p, [g.group]: !(p[g.group] ?? someOn) }))} className="shrink-0 text-muted2" title={expanded ? 'Collapse' : 'Expand'}>
                  <Icon name="ti-chevron-down" className={`text-xs transition-transform ${expanded ? '' : '-rotate-90'}`} />
                </button>
                <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                  <input type="checkbox" className="accent-accent" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={(e) => toggleGroup(g.items, e.target.checked)} />
                  <Icon name={g.icon} className="text-base text-accentstrong shrink-0" />
                  <span className="text-sm font-medium text-content truncate">{g.group}</span>
                  <span className="text-2xs text-muted2 shrink-0">{g.items.length}</span>
                </label>
                {selectedCount > 0 && <span className="text-2xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accentstrong shrink-0">{selectedCount} selected</span>}
              </div>
              {expanded && (
                <div className="px-3 pb-3 pl-10 grid sm:grid-cols-2 gap-x-6 gap-y-2">
                  {g.items.map((it) => {
                    const max = maxOf(it.key); const on = cur(it.key) > 0;
                    return (
                      <div key={it.key} className="flex items-center gap-2">
                        <input type="checkbox" className="accent-accent" checked={on} onChange={(e) => toggleKey(it.key, e.target.checked)} />
                        <span className={`text-sm flex-1 ${on ? 'text-content' : 'text-muted2'}`}>{it.label}</span>
                        <input type="number" min={0} max={max} value={cur(it.key)} onChange={(e) => setKey(it.key, parseInt(e.target.value, 10))} className="input h-8 w-16 text-sm text-right" title={`Up to ${max}`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-content">
            <input type="checkbox" className="accent-accent" checked={withSmart} onChange={(e) => setWithSmart(e.target.checked)} />
            <Icon name="ti-table-options" className="text-base text-muted" />Also add sample smart columns on Clients (relationship / rollup / formula)
          </label>
          <button className="text-2xs text-muted2 hover:text-rose-600 shrink-0" disabled={!!busy} onClick={removeSmart}>{busy === 'rm' ? 'Removing…' : 'Remove'}</button>
        </div>
        {agentsAvail && (
          <label className="flex items-center gap-2.5 cursor-pointer text-sm text-content">
            <input type="checkbox" className="accent-accent" checked={withAgents} onChange={(e) => setWithAgents(e.target.checked)} />
            <Icon name="ti-robot" className="text-base text-muted" />Also set up a starter AI-agent team + chat commands
          </label>
        )}
        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-content">
          <input type="checkbox" className="accent-accent" checked={withRoles} onChange={(e) => setWithRoles(e.target.checked)} />
          <Icon name="ti-shield-lock" className="text-base text-muted" />Also seed a set of starter role templates
        </label>
      </div>

      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mt-3 inline-flex items-center gap-1"><Icon name="ti-check" />{msg}</p>}
      {done && (
        <p className="text-sm text-emerald-600 mt-3 inline-flex items-center gap-1 flex-wrap">
          <Icon name="ti-check" />Added {Object.entries(done).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${v} ${k}`).join(', ') || 'sample data'}.
        </p>
      )}

      {snaps.length > 0 && (
        <div className="mt-4 rounded-xl border border-line p-3">
          <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-1 inline-flex items-center gap-1"><Icon name="ti-rotate-2" className="text-sm" />Reverse demo data</p>
          <p className="text-2xs text-muted mb-2">Every Generate takes an automatic restore point first. Restore one to remove the demo data (and anything added since) &mdash; handy for performance testing.</p>
          <div className="space-y-1">
            {snaps.slice(0, 4).map((sn) => (
              <div key={sn.id} className="flex items-center justify-between gap-2">
                <span className="text-2xs text-muted truncate">{sn.label || new Date(sn.created_at).toLocaleString()} &middot; {sn.row_count} rows</span>
                <button className="btn btn-ghost h-7 py-0 border border-line shrink-0" disabled={reverting} onClick={() => revertTo(sn.id)}>{reverting ? 'Restoring…' : 'Restore'}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button className="btn btn-primary" disabled={!!busy || totalRecords === 0} onClick={run}>{busy === 'seed' ? 'Generating…' : (<><Icon name="ti-wand" />Generate {totalRecords} records</>)}</button>
        <span className="text-2xs text-muted">Adds data only. To clear everything (with an automatic restore point), use the <Link href="/settings?tab=danger" className="underline">Danger zone</Link>.</span>
      </div>
    </div>
  );
}
