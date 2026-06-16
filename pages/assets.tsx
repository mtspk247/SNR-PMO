import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import Select from '@/components/Select';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { listAssets, createAsset, updateAsset, deleteAsset, getOrgUsers, Asset } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const ASSET_TYPES = ['digital', 'physical', 'saas', 'domain', 'other'] as const;
const lbl = (t: string) => (t === 'saas' ? 'SaaS' : t.charAt(0).toUpperCase() + t.slice(1));
const STATUSES = ['active', 'retired', 'sold'] as const;
const STATUS_PILL: Record<string, string> = { active: 'pill-green', retired: 'pill-gray', sold: 'pill-blue' };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'PKR'];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Draft = Partial<Asset>;
const emptyDraft = (): Draft => ({
  name: '', asset_type: 'digital', category: '', owner_id: undefined,
  acquired_on: '', value: 0, revenue: 0, currency: 'USD', status: 'active', notes: '',
});

export default function AssetsPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'financial');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listAssets(org.id).then(setAssets).catch((e) => { setErr(e.message); setAssets([]); });
  };
  useEffect(() => {
    if (org?.id && enabled) {
      load();
      getOrgUsers(org.id).then(setUsers).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const nameOf = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || '—';

  const shown = useMemo(() =>
    (assets || []).filter((a) =>
      (typeF === 'all' || a.asset_type === typeF) &&
      (!q.trim() || `${a.name} ${a.category || ''}`.toLowerCase().includes(q.toLowerCase()))
    ), [assets, q, typeF]);

  const kpis = useMemo(() => {
    const all = assets || [];
    return {
      total: all.length,
      totalValue: all.reduce((t, a) => t + Number(a.value || 0), 0),
      totalRevenue: all.reduce((t, a) => t + Number(a.revenue || 0), 0),
      active: all.filter((a) => a.status === 'active').length,
    };
  }, [assets]);

  const setD = (patch: Draft) => setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.name?.trim() || busy) return;
    setBusy(true); setErr('');
    const d = editor.draft;
    const payload: Partial<Asset> = {
      name: d.name!.trim(),
      asset_type: d.asset_type || 'digital',
      category: d.category || null,
      owner_id: d.owner_id || null,
      acquired_on: d.acquired_on || null,
      value: Number(d.value) || 0,
      revenue: Number(d.revenue) || 0,
      currency: d.currency || 'USD',
      status: d.status || 'active',
      notes: d.notes || null,
    };
    try {
      if (editor.mode === 'edit' && d.id) {
        await updateAsset(d.id, payload);
      } else {
        await createAsset({ org_id: org.id, created_by: me.id, ...payload } as Asset & { org_id: string; name: string; created_by: string });
      }
      setEditor(null);
      load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const remove = async (a: Asset) => {
    if (!confirm(`Delete "${a.name}"?`)) return;
    setBusy(true);
    try { await deleteAsset(a.id); setEditor(null); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return (
    <Layout flat title="Assets">
      <EmptyState icon="ti-box-off" title="Assets not in your plan" text="Upgrade to track your digital, physical and SaaS assets." />
    </Layout>
  );

  return (
    <Layout flat title="Assets">
      <PageHeader
        title="Assets"
        subtitle="Track digital, physical, SaaS, domain and other assets"
        icon="ti-box"
        action={
          <button className="btn btn-primary" onClick={() => setEditor({ mode: 'add', draft: emptyDraft() })}>
            <Icon name="ti-plus" />Add asset
          </button>
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total assets" value={String(kpis.total)} icon="ti-box" />
        <StatCard label="Total value" value={fmtMoney(kpis.totalValue)} icon="ti-chart-bar" />
        <StatCard label="Total revenue" value={fmtMoney(kpis.totalRevenue)} icon="ti-trending-up" hintTone="up" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search assets…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-40"><Select value={typeF} onChange={setTypeF} options={[{ value: 'all', label: 'All types' }, ...ASSET_TYPES.map((t) => ({ value: t, label: lbl(t) }))]} /></div>
      </div>

      <div className="card overflow-hidden">
        {assets === null ? <div className="p-8"><Spinner /></div> : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-box" text="No assets yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                    onClick={() => setEditor({ mode: 'edit', draft: { ...a } })}
                  >
                    <td className="px-4 py-3 font-medium text-content">{a.name}</td>
                    <td className="px-4 py-3"><span className="pill pill-gray capitalize">{a.asset_type}</span></td>
                    <td className="px-4 py-3 text-muted">{a.category || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(a.value, a.currency)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(a.revenue) > 0
                        ? <span className="text-emerald-600 font-medium">{fmtMoney(a.revenue, a.currency)}</span>
                        : <span className="text-muted2">—</span>}
                    </td>
                    <td className="px-4 py-3 text-2xs text-muted">{nameOf(a.owner_id)}</td>
                    <td className="px-4 py-3"><span className={`pill capitalize ${STATUS_PILL[a.status] || 'pill-gray'}`}>{a.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-box"
          title={editor.mode === 'edit' ? 'Edit asset' : 'Add asset'}
          onSubmit={() => save()}
          footer={
            <>
              {editor.mode === 'edit' && editor.draft.id && (
                <button className="btn btn-danger mr-auto" disabled={busy} onClick={() => remove(editor.draft as Asset)}>
                  <Icon name="ti-trash" />Delete
                </button>
              )}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.name?.trim()}
                onClick={save}
              >{busy ? 'Saving…' : 'Save'}</button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.name || ''}
                onChange={(e) => setD({ name: e.target.value })}
                placeholder="e.g. MacBook Pro 16"
              />
            </Field>
            <Field label="Asset type">
              <Select value={editor.draft.asset_type || 'digital'} onChange={(v) => setD({ asset_type: v as Asset['asset_type'] })} options={ASSET_TYPES.map((t) => ({ value: t, label: lbl(t) }))} />
            </Field>
            <Field label="Category">
              <input
                className="input"
                value={editor.draft.category || ''}
                onChange={(e) => setD({ category: e.target.value })}
                placeholder="e.g. Equipment"
              />
            </Field>
            <Field label="Owner">
              <Select value={editor.draft.owner_id || ''} onChange={(v) => setD({ owner_id: v || undefined })} search placeholder="Unassigned" options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name }))]} />
            </Field>
            <Field label="Acquired on">
              <input
                className="input"
                type="date"
                value={editor.draft.acquired_on || ''}
                onChange={(e) => setD({ acquired_on: e.target.value })}
              />
            </Field>
            <Field label="Currency">
              <Select value={editor.draft.currency || 'USD'} onChange={(v) => setD({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
            <Field label="Value">
              <input
                className="input"
                type="number"
                value={editor.draft.value ?? 0}
                onChange={(e) => setD({ value: Number(e.target.value) })}
              />
            </Field>
            <Field label="Revenue">
              <input
                className="input"
                type="number"
                value={editor.draft.revenue ?? 0}
                onChange={(e) => setD({ revenue: Number(e.target.value) })}
              />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'active'} onChange={(v) => setD({ status: v as Asset['status'] })} options={STATUSES.map((st) => ({ value: st, label: lbl(st) }))} />
            </Field>
            <Field label="Notes">
              <input
                className="input"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Optional notes"
              />
            </Field>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
