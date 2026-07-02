import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg } from '@/lib/store';
import { listReleases, createRelease, updateRelease, deleteRelease, isPlatformAdmin, Release, ReleaseHighlight } from '@/lib/db';

// What's new — the user-facing release feed (mobile-OS-style update notes) + the platform
// owner's authoring surface. RLS: everyone sees PUBLISHED 'all' releases; platform admins
// see drafts/internal and can author. The UpdateToast deep-links here.
const SEEN_KEY = 'snr_seen_release';

type Draft = { id?: string; version: string; title: string; body: string; audience: 'all' | 'internal'; status: 'draft' | 'published' | 'archived'; build_sha: string; migrations: string; rollback_notes: string; highlights: ReleaseHighlight[] };
const emptyDraft = (): Draft => ({
  version: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), title: '', body: '', audience: 'all', status: 'draft',
  build_sha: '', migrations: '', rollback_notes: '', highlights: [{ title: '', body: '' }],
});

export default function WhatsNewPage() {
  const org = useActiveOrg();
  const [rows, setRows] = useState<Release[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => listReleases(30).then((r) => {
    setRows(r);
    const latest = r.find((x) => x.status === 'published');
    if (latest) { try { localStorage.setItem(SEEN_KEY, latest.version); } catch { /* */ } }
  }).catch((e) => { setErr(e.message); setRows([]); });
  useEffect(() => { load(); isPlatformAdmin().then(setAdmin).catch(() => setAdmin(false)); }, [org?.id]);

  const openEditor = (r?: Release) => setEditor(r ? {
    id: r.id, version: r.version, title: r.title, body: r.body || '', audience: r.audience, status: r.status,
    build_sha: r.build_sha || '', migrations: (r.migrations || []).join(', '), rollback_notes: r.rollback_notes || '',
    highlights: (r.highlights || []).length ? r.highlights : [{ title: '', body: '' }],
  } : emptyDraft());

  const save = async () => {
    if (!editor || busy || !editor.version.trim() || !editor.title.trim()) return;
    setBusy(true); setErr('');
    const p = {
      version: editor.version.trim(), title: editor.title.trim(), body: editor.body.trim() || null,
      audience: editor.audience, status: editor.status, build_sha: editor.build_sha.trim() || null,
      migrations: editor.migrations.split(',').map((s) => s.trim()).filter(Boolean),
      rollback_notes: editor.rollback_notes.trim() || null,
      highlights: editor.highlights.filter((h) => h.title.trim() || h.body.trim()),
    };
    try {
      if (editor.id) await updateRelease(editor.id, p as any); else await createRelease(p as any);
      setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (r: Release) => {
    if (!confirm(`Delete release ${r.version}?`)) return;
    try { await deleteRelease(r.id); load(); } catch (e: any) { setErr(e.message); }
  };

  const setH = (i: number, patch: Partial<ReleaseHighlight>) => setEditor((e) => e && ({ ...e, highlights: e.highlights.map((h, hi) => (hi === i ? { ...h, ...patch } : h)) }));
  const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '');

  return (
    <Layout flat title="What's new">
      <PageHeader title="What&rsquo;s new" subtitle="Every release — what changed, why it matters, and how it&rsquo;s kept safe" icon="ti-sparkles" help="releases"
        action={admin ? <button className="btn btn-primary" onClick={() => openEditor()}><Icon name="ti-plus" />New release</button> : undefined} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      {rows === null ? <p className="text-sm text-muted">Loading…</p> : rows.length === 0 ? (
        <EmptyState icon="ti-sparkles" text="No release notes yet." />
      ) : (
        <div className="space-y-4 max-w-3xl">
          {rows.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-accent/10 text-accentstrong px-2 py-0.5 text-2xs font-semibold tabular-nums">v{r.version}</span>
                {r.status !== 'published' && <span className="inline-flex items-center rounded-md bg-amber-500/15 text-amber-600 px-2 py-0.5 text-2xs font-medium capitalize">{r.status}</span>}
                {r.audience === 'internal' && <span className="inline-flex items-center rounded-md bg-violet-500/15 text-violet-600 px-2 py-0.5 text-2xs font-medium">internal</span>}
                <span className="text-2xs text-muted2">{fmtDate(r.published_at)}</span>
                <span className="flex-1" />
                {admin && (<>
                  <button className="text-2xs text-muted2 hover:text-content" onClick={() => openEditor(r)}>Edit</button>
                  <button className="text-2xs text-muted2 hover:text-rose-500" onClick={() => remove(r)}>Delete</button>
                </>)}
              </div>
              <h2 className="text-base font-semibold text-content mt-2">{r.title}</h2>
              <div className="mt-3 space-y-2.5">
                {(r.highlights || []).map((h, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                    <p className="text-sm text-muted"><span className="font-medium text-content">{h.title}.</span> {h.body}</p>
                  </div>
                ))}
              </div>
              {r.body && <p className="text-sm text-muted mt-3">{r.body}</p>}
              {admin && (r.build_sha || (r.migrations || []).length > 0 || r.rollback_notes) && (
                <div className="mt-4 rounded-lg bg-surface2 p-3 text-2xs text-muted space-y-1">
                  <p className="uppercase tracking-wide text-muted2 font-medium">Release safety (platform admins only)</p>
                  {r.build_sha && <p>Build: <span className="font-mono">{r.build_sha}</span> — rollback = promote the previous production deployment in Vercel.</p>}
                  {(r.migrations || []).length > 0 && <p>DB migrations: {(r.migrations || []).join(', ')}</p>}
                  {r.rollback_notes && <p>Rollback: {r.rollback_notes}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <Modal open onClose={() => setEditor(null)} dirty size="lg" icon="ti-sparkles" title={editor.id ? `Edit release ${editor.version}` : 'New release'} onSubmit={save}
          footer={<><button className="btn" onClick={() => setEditor(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !editor.version.trim() || !editor.title.trim()} onClick={save}>{busy ? 'Saving…' : 'Save release'}</button></>}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Version" required><input className="input" value={editor.version} onChange={(e) => setEditor({ ...editor, version: e.target.value })} placeholder="2026.07.02" /></Field>
              <Field label="Status"><Select value={editor.status} onChange={(v) => setEditor({ ...editor, status: v as Draft['status'] })} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} /></Field>
              <Field label="Audience"><Select value={editor.audience} onChange={(v) => setEditor({ ...editor, audience: v as Draft['audience'] })} options={[{ value: 'all', label: 'All users' }, { value: 'internal', label: 'Internal only' }]} /></Field>
              <Field label="Headline" className="sm:col-span-3" required><input className="input" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Surveys, a smarter dashboard, and more" /></Field>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted2">Highlights — what users see in the update popup</span>
                <button className="btn h-7 py-0 text-xs" onClick={() => setEditor({ ...editor, highlights: [...editor.highlights, { title: '', body: '' }] })}><Icon name="ti-plus" className="text-sm" />Add</button>
              </div>
              <div className="space-y-2">
                {editor.highlights.map((h, i) => (
                  <div key={i} className="rounded-lg border border-line p-2 flex flex-wrap items-center gap-2">
                    <input className="input h-8 py-0 w-52" value={h.title} onChange={(e) => setH(i, { title: e.target.value })} placeholder="Feature name" />
                    <input className="input h-8 py-0 flex-1 min-w-[10rem]" value={h.body} onChange={(e) => setH(i, { body: e.target.value })} placeholder="One sentence on why it matters" />
                    <button className="text-muted2 hover:text-rose-500" onClick={() => setEditor({ ...editor, highlights: editor.highlights.filter((_, hi) => hi !== i) })}><Icon name="ti-trash" className="text-sm" /></button>
                  </div>
                ))}
              </div>
            </div>
            <Field label="Longer notes (optional)"><textarea className="input min-h-[70px]" value={editor.body} onChange={(e) => setEditor({ ...editor, body: e.target.value })} /></Field>
            <div className="rounded-lg border border-line p-3 space-y-3">
              <span className="text-2xs uppercase tracking-wide text-muted2">Release safety — rollback record (admin-only view)</span>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Build sha"><input className="input" value={editor.build_sha} onChange={(e) => setEditor({ ...editor, build_sha: e.target.value })} placeholder="e8ecb76" /></Field>
                <Field label="DB migrations (comma-separated)"><input className="input" value={editor.migrations} onChange={(e) => setEditor({ ...editor, migrations: e.target.value })} placeholder="surveys_foundation, sign_foundation" /></Field>
                <Field label="Rollback notes" className="sm:col-span-2"><textarea className="input min-h-[54px]" value={editor.rollback_notes} onChange={(e) => setEditor({ ...editor, rollback_notes: e.target.value })} placeholder="Code: promote previous Vercel deployment. Data: expand-only — no destructive changes." /></Field>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
