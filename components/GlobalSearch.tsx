import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { sb } from '@/lib/supabase';
import { Icon, Avatar } from '@/components/ui';

// Global header search (spotlight palette). Opens on click, "/" or Cmd/Ctrl-K.
// Searches the org-scoped (RLS) surfaces and navigates to the picked record.
type Hit = { id: string; type: string; title: string; subtitle?: string; href: string; icon: string; avatar?: boolean };

const TYPE_LABEL: Record<string, string> = {
  task: 'Tasks', project: 'Projects', deal: 'Deals', company: 'Companies', employee: 'People',
};

async function runSearch(raw: string): Promise<Hit[]> {
  const q = raw.trim();
  const like = `%${q}%`;
  // PostgREST .or() uses * as wildcard; strip chars that break its filter grammar.
  const safe = q.replace(/[,()*%]/g, ' ').trim();
  const grab = (p: any) => p.then((r: any) => r.data || []).then((d: any) => d, () => []);
  const [tasks, projects, deals, companies, people] = await Promise.all([
    grab(sb.from('tasks').select('id, name, projects(name)').ilike('name', like).limit(6)),
    grab(sb.from('projects').select('id, name, status').ilike('name', like).limit(6)),
    grab(sb.from('crm_deals').select('id, title, stage').ilike('title', like).limit(6)),
    grab(sb.from('companies').select('id, name').ilike('name', like).limit(6)),
    grab(sb.from('users').select('id, full_name, email').or(`full_name.ilike.*${safe}*,email.ilike.*${safe}*`).limit(6)),
  ]);
  const hits: Hit[] = [];
  for (const t of tasks as any[]) hits.push({ id: t.id, type: 'task', title: t.name, subtitle: t.projects?.name, href: `/tasks?task=${t.id}`, icon: 'ti-checkbox' });
  for (const p of projects as any[]) hits.push({ id: p.id, type: 'project', title: p.name, subtitle: p.status, href: `/projects/${p.id}`, icon: 'ti-folder' });
  for (const d of deals as any[]) hits.push({ id: d.id, type: 'deal', title: d.title, subtitle: d.stage, href: `/crm/deal/${d.id}`, icon: 'ti-target-arrow' });
  for (const c of companies as any[]) hits.push({ id: c.id, type: 'company', title: c.name, href: `/companies/${c.id}`, icon: 'ti-building' });
  for (const u of people as any[]) hits.push({ id: u.id, type: 'employee', title: u.full_name || u.email, subtitle: u.full_name ? u.email : undefined, href: `/employees/${u.id}`, icon: 'ti-id-badge', avatar: true });
  return hits;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // Global hotkeys: "/" to open (unless typing), Cmd/Ctrl-K to toggle, Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((v) => !v); return; }
      if (e.key === '/' && !typing && !open) { e.preventDefault(); setOpen(true); return; }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset + focus on open; clear on close.
  useEffect(() => {
    if (open) { setQ(''); setHits([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  // Debounced query.
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try { const r = await runSearch(q); if (id === reqId.current) { setHits(r); setActive(0); } }
      finally { if (id === reqId.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (h?: Hit) => { if (!h) return; setOpen(false); router.push(h.href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
  };

  let lastType = '';
  return (
    <>
      <button onClick={() => setOpen(true)} title="Search (press /)"
        className="hidden sm:flex items-center gap-2 h-9 pl-3 pr-2 rounded-lg border border-line text-sm text-muted2 hover:border-borderstrong hover:text-content transition">
        <Icon name="ti-search" /><span>Search</span><span className="kbd ml-1.5">/</span>
      </button>
      <button onClick={() => setOpen(true)} aria-label="Search"
        className="sm:hidden h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
        <Icon name="ti-search" className="text-base" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 sm:pt-24" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
          <div className="modal-card relative w-full max-w-xl bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line">
              <Icon name="ti-search" className="text-muted2 text-base shrink-0" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey}
                placeholder="Search tasks, projects, deals, companies, people…"
                className="flex-1 bg-transparent outline-none text-sm text-content placeholder:text-muted2" />
              {loading && <Icon name="ti-loader-2" className="text-muted2 animate-spin text-base" />}
              <button onClick={() => setOpen(false)} className="kbd shrink-0">esc</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {q.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted2">Type at least 2 characters to search.</p>
              ) : !loading && hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted2">No matches for “{q.trim()}”.</p>
              ) : hits.map((h, i) => {
                const head = h.type !== lastType ? (lastType = h.type) : null;
                return (
                  <div key={h.type + h.id}>
                    {head && <p className="px-4 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted2">{TYPE_LABEL[h.type]}</p>}
                    <button onClick={() => go(h)} onMouseEnter={() => setActive(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition ${i === active ? 'bg-surface2' : 'hover:bg-surface2'}`}>
                      {h.avatar ? <Avatar name={h.title} size={24} />
                        : <span className="w-6 h-6 rounded-md grid place-items-center bg-surface2 text-muted2 shrink-0"><Icon name={h.icon} className="text-sm" /></span>}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-content truncate">{h.title}</span>
                        {h.subtitle && <span className="block text-2xs text-muted2 truncate">{h.subtitle}</span>}
                      </span>
                      {i === active && <Icon name="ti-corner-down-left" className="text-muted2 text-sm shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
