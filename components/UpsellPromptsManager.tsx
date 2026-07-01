import { useEffect, useMemo, useState } from 'react';
import { Icon, EmptyState } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { toast } from '@/lib/toast';
import { listUpsellPrompts, saveUpsellPrompt, setUpsellPromptStatus, UpsellPrompt } from '@/lib/db';
import { FEATURES } from '@/lib/supabase';

const TRIGGERS = [
  { value: 'manual', label: 'Always show (promo/announcement)' },
  { value: 'usage_threshold', label: 'Usage threshold (e.g. storage %)' },
  { value: 'feature_locked', label: 'Feature locked (not on plan)' },
  { value: 'seat_limit', label: 'Seat limit reached' },
  { value: 'trial_ending', label: 'Trial ending' },
];
const PLACEMENTS = [{ value: 'banner', label: 'Banner' }, { value: 'lock_screen', label: 'Lock screen' }, { value: 'modal', label: 'Modal' }, { value: 'inline', label: 'Inline' }];
const AUDIENCES = [{ value: 'admins', label: 'Admins only' }, { value: 'all', label: 'Everyone' }];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
type Draft = Partial<UpsellPrompt> & { id?: string | null };
const empty: Draft = { slug: '', trigger_type: 'manual', placement: 'banner', title: '', body: '', cta_label: 'Upgrade', cta_href: '/billing', audience: 'admins', priority: 100, feature_key: '', metric: 'storage', threshold_pct: 80 };

// Reusable upsell-prompt manager. ownerOrg=null → platform defaults; ownerOrg=<id> → a reseller's overrides.
export default function UpsellPromptsManager({ ownerOrg, scopeLabel }: { ownerOrg: string | null; scopeLabel?: string }) {
  const [rows, setRows] = useState<UpsellPrompt[] | null>(null);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { listUpsellPrompts(ownerOrg).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [ownerOrg]);

  const featureOpts = useMemo(() => [{ value: '', label: '— any / none —' }, ...FEATURES.map((f) => ({ value: f.key, label: f.label }))], []);

  const save = async () => {
    if (!editor || busy) return;
    const slug = (editor.slug || slugify(editor.title || '')).trim();
    if (!slug) { setErr('A slug (or title) is required'); return; }
    setBusy(true); setErr('');
    try {
      await saveUpsellPrompt({
        id: editor.id || null, owner_org: ownerOrg, slug,
        trigger_type: editor.trigger_type || 'manual', feature_key: editor.feature_key || null,
        metric: editor.trigger_type === 'usage_threshold' ? (editor.metric || 'storage') : null,
        threshold_pct: editor.trigger_type === 'usage_threshold' ? (Number(editor.threshold_pct) || 80) : null,
        placement: editor.placement || 'banner', title: editor.title || '', body: editor.body || '',
        cta_label: editor.cta_label || 'Upgrade', cta_href: editor.cta_href || '/billing',
        audience: editor.audience || 'admins', priority: Number(editor.priority) || 100, style: {},
      });
      toast('Prompt saved', 'success'); setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const setStatus = async (r: UpsellPrompt, status: 'active' | 'paused' | 'archived') => {
    if (status === 'archived' && !confirm('Remove this prompt?')) return;
    try { await setUpsellPromptStatus(r.id, status); load(); } catch (e: any) { setErr(e.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-2xs text-muted">{scopeLabel || (ownerOrg ? 'Your prompts override the platform defaults for your sub-tenants.' : 'Platform defaults — inherited by every tenant unless a reseller overrides them.')}</p>
        <button className="btn btn-sm btn-primary" onClick={() => { setErr(''); setEditor({ ...empty }); }}><Icon name="ti-plus" />New prompt</button>
      </div>
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {rows === null ? <p className="text-2xs text-muted2">Loading…</p> : rows.length === 0 ? (
        <EmptyState icon="ti-speakerphone" title="No prompts yet" text="Create an upgrade prompt to nudge users toward a higher plan." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="card p-3 flex items-center gap-3">
              <span className="w-8 h-8 rounded-md grid place-items-center bg-surface2 shrink-0"><Icon name={(r.style && r.style.icon) || 'ti-rocket'} className="text-muted2" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content truncate">{r.title || r.slug}</p>
                <p className="text-2xs text-muted2 truncate">{r.trigger_type}{r.feature_key ? ` · ${r.feature_key}` : ''}{r.trigger_type === 'usage_threshold' ? ` · ≥${r.threshold_pct}%` : ''} · {r.placement} · {r.audience}</p>
              </div>
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={r.status === 'active' ? { backgroundColor: '#16a34a1f', color: '#16a34a' } : { backgroundColor: '#f59e0b1f', color: '#b45309' }}>{r.status}</span>
              <button className="btn btn-sm" onClick={() => { setErr(''); setEditor({ ...r }); }}>Edit</button>
              {r.status === 'active'
                ? <button className="btn btn-sm" title="Pause" onClick={() => setStatus(r, 'paused')}><Icon name="ti-player-pause" className="text-sm" /></button>
                : <button className="btn btn-sm" title="Resume" onClick={() => setStatus(r, 'active')}><Icon name="ti-player-play" className="text-sm" /></button>}
              <button className="btn btn-sm btn-danger" title="Remove" onClick={() => setStatus(r, 'archived')}><Icon name="ti-trash" className="text-sm" /></button>
            </div>
          ))}
        </div>
      )}

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-speakerphone" title={editor.id ? 'Edit prompt' : 'New upgrade prompt'} onSubmit={save}
          footer={<><button className="btn" onClick={() => setEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Title"><input className="input" autoFocus value={editor.title || ''} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Storage almost full" /></Field>
            <Field label="Slug" hint="Stable key; auto from title"><input className="input" value={editor.slug || ''} onChange={(e) => setEditor({ ...editor, slug: e.target.value })} placeholder="storage-limit" /></Field>
          </div>
          <Field label="Message"><textarea className="input min-h-[60px]" value={editor.body || ''} onChange={(e) => setEditor({ ...editor, body: e.target.value })} placeholder="Upgrade for more room for files, recordings and media." /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Trigger"><Select value={editor.trigger_type || 'manual'} onChange={(v) => setEditor({ ...editor, trigger_type: v })} options={TRIGGERS} /></Field>
            <Field label="Placement"><Select value={editor.placement || 'banner'} onChange={(v) => setEditor({ ...editor, placement: v })} options={PLACEMENTS} /></Field>
          </div>
          {editor.trigger_type === 'feature_locked' && (
            <Field label="Feature"><Select value={editor.feature_key || ''} onChange={(v) => setEditor({ ...editor, feature_key: v })} options={featureOpts} /></Field>
          )}
          {editor.trigger_type === 'usage_threshold' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Metric"><Select value={editor.metric || 'storage'} onChange={(v) => setEditor({ ...editor, metric: v })} options={[{ value: 'storage', label: 'Storage' }]} /></Field>
              <Field label="Threshold %"><input className="input" type="number" min="1" max="100" value={editor.threshold_pct ?? 80} onChange={(e) => setEditor({ ...editor, threshold_pct: Number(e.target.value) })} /></Field>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Button label"><input className="input" value={editor.cta_label || ''} onChange={(e) => setEditor({ ...editor, cta_label: e.target.value })} placeholder="Upgrade" /></Field>
            <Field label="Button link"><input className="input" value={editor.cta_href || ''} onChange={(e) => setEditor({ ...editor, cta_href: e.target.value })} placeholder="/billing" /></Field>
            <Field label="Audience"><Select value={editor.audience || 'admins'} onChange={(v) => setEditor({ ...editor, audience: v })} options={AUDIENCES} /></Field>
          </div>
          <Field label="Priority" hint="Lower shows first"><input className="input w-28" type="number" value={editor.priority ?? 100} onChange={(e) => setEditor({ ...editor, priority: Number(e.target.value) })} /></Field>
        </Modal>
      )}
    </div>
  );
}
