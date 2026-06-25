import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { sb } from '@/lib/supabase';
import { SupabaseProvider, b64ToU8, u8ToB64, PresenceUser } from '@/lib/yProvider';
import { loadDocState, saveDocState } from '@/lib/db';
import { Icon } from '@/components/ui';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const colorFor = (id: string) => COLORS[Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % COLORS.length];
const initials = (n: string) => (n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// Live collaborative document — Yjs CRDT over Supabase Realtime, presence avatars,
// live cursors, debounced autosave (editors only). Mount with key={fileId}.
export default function CollabDocEditor({ fileId, meId, meName, canEdit }: {
  fileId: string; meId: string; meName: string; canEdit: boolean;
}) {
  const me: PresenceUser = useMemo(() => ({ id: meId, name: meName || 'Someone', color: colorFor(meId) }), [meId, meName]);
  const [ydoc] = useState(() => new Y.Doc());
  const [provider] = useState(() => new SupabaseProvider(sb, `drive_doc:${fileId}`, ydoc, me));
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState<PresenceUser[]>([]);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dirty = useRef(false);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    editable: canEdit,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({ provider: provider as any, user: { name: me.name, color: me.color } }),
      Table.configure({ resizable: true }),
      TableRow, TableHeader, TableCell,
    ],
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none px-4 py-4 min-h-[440px]' } },
  });

  const flush = useCallback(async () => {
    if (!dirty.current || !editor || !canEdit) return;
    dirty.current = false; setSaving('saving');
    try {
      await saveDocState(fileId, { doc_state: u8ToB64(Y.encodeStateAsUpdate(ydoc)), content: editor.getHTML() });
      setSaving('saved');
    } catch { setSaving('idle'); }
  }, [editor, canEdit, fileId, ydoc]);

  // Seed once from DB: CRDT snapshot, or legacy HTML if the doc is still empty.
  useEffect(() => {
    if (!editor || loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const st = await loadDocState(fileId);
        if (st.doc_state) Y.applyUpdate(ydoc, b64ToU8(st.doc_state));
        else if (st.content && ydoc.getXmlFragment('default').length === 0) editor.commands.setContent(st.content, false);
      } catch { /* ignore */ }
      setReady(true);
    })();
  }, [editor, fileId, ydoc]);

  // Debounced autosave (editors only); remote-origin changes are saved by their author.
  useEffect(() => {
    if (!canEdit) return;
    const onUpdate = (_u: Uint8Array, origin: unknown) => {
      if (origin === provider) return;
      dirty.current = true; setSaving('idle');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(flush, 1500);
    };
    ydoc.on('update', onUpdate);
    return () => { ydoc.off('update', onUpdate); if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [canEdit, ydoc, provider, flush]);

  // Presence avatars.
  useEffect(() => {
    const update = () => setPeers(provider.onlineUsers());
    provider.awareness.on('change', update); update();
    return () => provider.awareness.off('change', update);
  }, [provider]);

  // Teardown: final save + close channel.
  useEffect(() => () => { flush(); provider.destroy(); ydoc.destroy(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tools = editor ? [
    { icon: 'ti-bold', title: 'Bold', run: () => editor.chain().focus().toggleBold().run(), active: () => editor.isActive('bold') },
    { icon: 'ti-italic', title: 'Italic', run: () => editor.chain().focus().toggleItalic().run(), active: () => editor.isActive('italic') },
    { icon: 'ti-strikethrough', title: 'Strike', run: () => editor.chain().focus().toggleStrike().run(), active: () => editor.isActive('strike') },
    { icon: 'ti-h-1', title: 'Heading', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.isActive('heading', { level: 2 }) },
    { icon: 'ti-h-2', title: 'Subheading', run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor.isActive('heading', { level: 3 }) },
    { icon: 'ti-list', title: 'Bullet list', run: () => editor.chain().focus().toggleBulletList().run(), active: () => editor.isActive('bulletList') },
    { icon: 'ti-list-numbers', title: 'Numbered list', run: () => editor.chain().focus().toggleOrderedList().run(), active: () => editor.isActive('orderedList') },
    { icon: 'ti-quote', title: 'Quote', run: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
    { icon: 'ti-code', title: 'Code block', run: () => editor.chain().focus().toggleCodeBlock().run(), active: () => editor.isActive('codeBlock') },
    { icon: 'ti-table', title: 'Insert table', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: () => editor.isActive('table') },
  ] : [];

  return (
    <div className="rounded-lg border border-line overflow-hidden bg-surface flex flex-col">
      <div className="flex items-center gap-1 flex-wrap px-1.5 py-1 border-b border-line bg-surface2/50">
        {canEdit ? tools.map((t) => (
          <button key={t.icon} type="button" title={t.title} onMouseDown={(e) => { e.preventDefault(); t.run(); }}
            className={`w-8 h-8 grid place-items-center rounded hover:bg-surface2 ${t.active() ? 'text-accentstrong bg-accent/10' : 'text-muted hover:text-content'}`}>
            <Icon name={t.icon} className="text-base" />
          </button>
        )) : <span className="text-2xs text-muted2 px-2 py-1.5 inline-flex items-center"><Icon name="ti-eye" className="mr-1" />Read-only</span>}
        <div className="ml-auto flex items-center gap-2 pr-1">
          {canEdit && <span className="text-2xs text-muted2 w-12 text-right">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : ''}</span>}
          <div className="flex items-center -space-x-1.5">
            {peers.slice(0, 8).map((p) => (
              <span key={p.id} title={p.name} className="w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold text-white ring-2 ring-surface" style={{ background: p.color }}>{initials(p.name)}</span>
            ))}
            {peers.length > 8 && <span className="w-6 h-6 rounded-full grid place-items-center text-[10px] bg-surface2 text-muted ring-2 ring-surface">+{peers.length - 8}</span>}
          </div>
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        {!ready && <div className="px-4 py-3 text-2xs text-muted2">Connecting…</div>}
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .collaboration-cursor__caret { border-left: 1px solid; border-right: 1px solid; margin-left: -1px; margin-right: -1px; position: relative; word-break: normal; pointer-events: none; }
        .collaboration-cursor__label { border-radius: 3px 3px 3px 0; color: #fff; font-size: 11px; font-weight: 600; left: -1px; line-height: normal; padding: 1px 4px; position: absolute; top: -1.4em; user-select: none; white-space: nowrap; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 10px 0; table-layout: fixed; overflow: hidden; }
        .ProseMirror td, .ProseMirror th { border: 1px solid rgba(128,128,128,0.35); padding: 5px 8px; min-width: 4em; vertical-align: top; position: relative; }
        .ProseMirror th { background: rgba(128,128,128,0.08); font-weight: 600; text-align: left; }
        .ProseMirror .selectedCell:after { content: ''; position: absolute; inset: 0; background: rgba(62,207,142,0.15); pointer-events: none; }
        .ProseMirror .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: rgba(62,207,142,0.5); cursor: col-resize; }
      `}</style>
    </div>
  );
}
