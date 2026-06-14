import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Tabs } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { listStickyNotes, createStickyNote, updateStickyNote, deleteStickyNote, archiveStickyNote, StickyNote } from '@/lib/db';

const COLORS: Record<string, string> = {
  yellow: 'bg-amber-100 border-amber-200', green: 'bg-emerald-100 border-emerald-200',
  blue: 'bg-sky-100 border-sky-200', pink: 'bg-pink-100 border-pink-200',
};
const STRIP: Record<string, string> = { yellow: 'bg-amber-400', green: 'bg-emerald-400', blue: 'bg-sky-400', pink: 'bg-pink-400' };

export default function NotesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [notes, setNotes] = useState<StickyNote[] | null>(null);
  const [edit, setEdit] = useState<StickyNote | null>(null);
  const [fabHidden, setFabHidden] = useState(false);

  const load = () => { if (me) listStickyNotes(me.id, 'all').then(setNotes).catch(() => setNotes([])); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [me?.id]);
  useEffect(() => { try { setFabHidden(localStorage.getItem('sn_fab_hidden') === '1'); } catch { /* ignore */ } }, []);

  const active = (notes || []).filter((n) => !n.archived_at);
  const archived = (notes || []).filter((n) => n.archived_at);
  const shown = tab === 'active' ? active : archived;

  const add = async () => {
    if (!org || !me) return;
    try { const n = await createStickyNote({ org_id: org.id, user_id: me.id, body: '', color: 'yellow', title: '', page_path: '/notes' }); setNotes((p) => [n, ...(p || [])]); setEdit(n); }
    catch { /* ignore */ }
  };
  const archive = async (n: StickyNote, val: boolean) => {
    setNotes((p) => (p || []).map((x) => x.id === n.id ? { ...x, archived_at: val ? new Date().toISOString() : null } : x));
    try { await archiveStickyNote(n.id, val); } catch { load(); }
  };
  const del = async (n: StickyNote) => {
    if (!confirm(`Delete note "${n.title?.trim() || 'Untitled'}"? This can't be undone.`)) return;
    setNotes((p) => (p || []).filter((x) => x.id !== n.id)); if (edit?.id === n.id) setEdit(null);
    try { await deleteStickyNote(n.id); } catch { load(); }
  };
  const showFab = () => { try { localStorage.removeItem('sn_fab_hidden'); } catch { /* ignore */ } window.dispatchEvent(new Event('sn-fab-show')); setFabHidden(false); };

  return (
    <Layout flat title="Notes">
      <PageHeader title="Notes" subtitle="Your personal sticky notes" icon="ti-notes"
        action={<div className="flex items-center gap-2">
          {fabHidden && <button className="btn btn-ghost border border-line" onClick={showFab}><Icon name="ti-pin" />Show floating button</button>}
          <button className="btn btn-primary" onClick={add}><Icon name="ti-plus" />New note</button>
        </div>} />

      <Tabs tabs={[{ key: 'active', label: 'Active', icon: 'ti-note', count: active.length }, { key: 'archived', label: 'Archived', icon: 'ti-archive', count: archived.length }]}
        active={tab} onChange={(k) => setTab(k as 'active' | 'archived')} />

      {notes === null ? <Spinner /> : shown.length === 0 ? (
        <EmptyState icon={tab === 'active' ? 'ti-notes' : 'ti-archive'} title={tab === 'active' ? 'No notes yet' : 'Nothing archived'}
          text={tab === 'active' ? 'Create a note to get started.' : 'Archived notes will appear here.'} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((n) => (
            <div key={n.id} className={`card overflow-hidden flex flex-col ${COLORS[n.color] || COLORS.yellow} border`}>
              <button onClick={() => setEdit(n)} className="text-left p-4 flex-1 min-h-[7rem]">
                <span className="flex items-center gap-2 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${STRIP[n.color] || STRIP.yellow}`} />
                  <span className="text-sm font-semibold text-neutral-800 truncate">{n.title?.trim() || 'Untitled'}</span>
                </span>
                <span className="block text-sm text-neutral-700 whitespace-pre-wrap line-clamp-4">{n.body?.trim() || <span className="text-neutral-400">Empty note</span>}</span>
              </button>
              <div className="flex items-center gap-1 px-3 py-2 border-t border-black/10 text-2xs text-neutral-500">
                <Icon name="ti-file-text" className="text-2xs" />
                <span className="truncate flex-1">{n.page_path || '—'}</span>
                {n.page_path && <button onClick={() => router.push(n.page_path!)} className="text-sky-700 hover:underline shrink-0">open</button>}
                <button onClick={() => archive(n, !n.archived_at)} title={n.archived_at ? 'Unarchive' : 'Archive'} className="ml-1 text-neutral-500 hover:text-neutral-800"><Icon name={n.archived_at ? 'ti-archive-off' : 'ti-archive'} className="text-sm" /></button>
                <button onClick={() => del(n)} title="Delete" className="text-neutral-500 hover:text-rose-600"><Icon name="ti-trash" className="text-sm" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && <NoteEditor key={edit.id} note={edit} onClose={() => setEdit(null)}
        onSaved={(p) => setNotes((arr) => (arr || []).map((x) => x.id === edit.id ? { ...x, ...p } : x))}
        onArchive={(v) => { archive(edit, v); setEdit(null); }} onDelete={() => del(edit)} />}
    </Layout>
  );
}

function NoteEditor({ note, onClose, onSaved, onArchive, onDelete }: {
  note: StickyNote; onClose: () => void; onSaved: (p: Partial<StickyNote>) => void; onArchive: (v: boolean) => void; onDelete: () => void;
}) {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [color, setColor] = useState(note.color || 'yellow');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try { await updateStickyNote(note.id, { title, body, color }); onSaved({ title, body, color }); onClose(); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} size="md" icon="ti-note" title="Edit note" subtitle={note.page_path ? `Created on ${note.page_path}` : undefined}
      footer={<>
        <button className="btn btn-ghost border border-line" onClick={() => onArchive(!note.archived_at)}>{note.archived_at ? 'Unarchive' : 'Archive'}</button>
        <button className="btn btn-danger" onClick={onDelete}>Delete</button>
        <button className="btn btn-primary ml-auto" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Note name" /></Field>
        <Field label="Note"><textarea className="input min-h-[10rem]" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your note…" /></Field>
        <Field label="Colour">
          <div className="flex items-center gap-2">
            {Object.keys(COLORS).map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border ${COLORS[c]} ${color === c ? 'ring-2 ring-accent' : ''}`} title={c} />)}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
