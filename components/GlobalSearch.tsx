import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Avatar } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { pageModuleFor, SearchHit, SearchSpec, ALL_ITEMS, isPageHidden } from '@/lib/nav';
import { SECTIONS as DOC_SECTIONS } from '@/lib/docs';
import { navVisible, pageReadable } from '@/lib/entitlements';
import { can } from '@/lib/authz';

// Inline header search with a scope picker (All / a module / This page) + live
// results dropdown. No modal. "/" or Cmd/Ctrl-K focuses the input.
// Searchable modules come from the central nav manifest (lib/nav.ts): add a
// `search` spec to a nav item there and it shows up here automatically.
type Scope = 'all' | 'page' | string;   // a module key, or 'all' / 'page'
type Hit = SearchHit;

// Docs & help is searchable for any signed-in member (client-side over the live docs SECTIONS).
const DOCS_SPEC: SearchSpec = {
  key: 'docs', label: 'Docs & help', icon: 'ti-book-2',
  run: async (_like, safe) => {
    const q = safe.trim().toLowerCase(); if (q.length < 2) return [];
    const out: SearchHit[] = [];
    for (const s of DOC_SECTIONS) {
      if (out.length >= 8) break;
      const hay = (s.title + ' ' + JSON.stringify(s.blocks)).toLowerCase();
      if (hay.includes(q)) out.push({ id: 'docs:' + s.id, key: 'docs', title: s.title, subtitle: 'Docs & help', href: '/docs#' + s.id, icon: 'ti-book-2' });
    }
    return out;
  },
};

// Quick-create actions for the command palette (navigate to the create-capable page).
const ACTIONS: { label: string; icon: string; href: string; kw: string }[] = [
  { label: 'New project', icon: 'ti-plus', href: '/projects', kw: 'create add' },
  { label: 'New task', icon: 'ti-plus', href: '/tasks', kw: 'create add todo' },
  { label: 'New deal', icon: 'ti-plus', href: '/crm', kw: 'create add opportunity pipeline' },
  { label: 'New contact', icon: 'ti-plus', href: '/crm', kw: 'create add person' },
  { label: 'New client', icon: 'ti-plus', href: '/clients', kw: 'create add customer' },
  { label: 'New lead', icon: 'ti-plus', href: '/leads', kw: 'create add' },
  { label: 'New invoice', icon: 'ti-plus', href: '/invoicing', kw: 'create add bill' },
  { label: 'New expense claim', icon: 'ti-plus', href: '/expense-claims', kw: 'create add reimburse' },
  { label: 'New ticket', icon: 'ti-plus', href: '/support', kw: 'create add support issue' },
  { label: 'New employee', icon: 'ti-plus', href: '/employees', kw: 'create add hire staff' },
  { label: 'New form', icon: 'ti-plus', href: '/forms', kw: 'create add' },
  { label: 'New booking page', icon: 'ti-plus', href: '/booking', kw: 'create add appointment schedule' },
  { label: 'New note', icon: 'ti-plus', href: '/notes', kw: 'create add' },
];

async function runSearch(raw: string, mods: string[], specByKey: Map<string, SearchSpec>): Promise<Hit[]> {
  const q = raw.trim();
  const like = `%${q}%`;
  const safe = q.replace(/[,()*%]/g, ' ').trim();
  const keys = mods.filter((k) => specByKey.has(k));
  const groups = await Promise.all(keys.map((k) => specByKey.get(k)!.run(like, safe)));
  const order = new Map(keys.map((k, i) => [k, i]));
  return groups.flat().sort((a, b) => ((order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)));
}

export default function GlobalSearch() {
  const router = useRouter();
  const pageMod = pageModuleFor(router.pathname);
  const activeOrg = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const platformAdmin = useAuthStore((s) => s.platformAdmin);
  // RBAC: only expose modules the user can actually reach (feature on, not hidden,
  // page-readable, admin/platform-gated) — mirrors the sidebar nav gate. RLS is still
  // the wall; this stops users even scoping/seeing modules they can't access.
  const gatedItems = useMemo(() => ALL_ITEMS.filter((i) => i.search
    && navVisible(activeOrg, i.feature)
    && !isPageHidden(activeOrg?.hidden_pages, i.href)
    && pageReadable(me, i.href)
    && (!i.adminOnly || can.manageMembers(activeOrg))
    && (!i.platformOnly || platformAdmin)
  ), [activeOrg, me, platformAdmin]);
  const docsOk = useMemo(() => !isPageHidden(activeOrg?.hidden_pages, '/docs') && pageReadable(me, '/docs'), [activeOrg?.hidden_pages, me]);
  const availMods = useMemo(() => {
    const a = gatedItems.map((i) => ({ key: i.search!.key, label: i.search!.label, icon: i.search!.icon }));
    if (docsOk) a.push({ key: 'docs', label: 'Docs & help', icon: 'ti-book-2' });
    return a;
  }, [gatedItems, docsOk]);
  const specByKey = useMemo(() => {
    const m = new Map<string, SearchSpec>(gatedItems.map((i) => [i.search!.key, i.search!]));
    if (docsOk) m.set('docs', DOCS_SPEC);
    return m;
  }, [gatedItems, docsOk]);
  const modLabel = useMemo<Record<string, string>>(() => Object.fromEntries(availMods.map((m) => [m.key, m.label])), [availMods]);
  const [selMods, setSelMods] = useState<string[]>([]);   // empty = search everything
  const [scopeFilter, setScopeFilter] = useState('');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const allKeys = useMemo(() => availMods.map((m) => m.key), [availMods]);
  const effectiveMods = useMemo<string[]>(() => (selMods.length ? selMods : allKeys), [selMods, allKeys]);
  const toggleMod = (k: string) => setSelMods((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const scopeLabel = selMods.length === 0 ? 'All' : selMods.length === 1 ? modLabel[selMods[0]] : `${selMods.length} selected`;

  // Command-palette: type a page name to jump there (nav manifest), shown above record hits.
  const q2 = q.trim().toLowerCase();
  const navHits = useMemo<Hit[]>(() => {
    if (q2.length < 2) return [];
    const seen = new Set<string>(); const out: Hit[] = [];
    for (const it of ALL_ITEMS) {
      if (out.length >= 6) break;
      if (seen.has(it.href)) continue;
      if (isPageHidden(activeOrg?.hidden_pages, it.href)) continue;
      if (!navVisible(activeOrg, it.feature) || !pageReadable(me, it.href) || (it.adminOnly && !can.manageMembers(activeOrg)) || (it.platformOnly && !platformAdmin)) continue;
      if (!it.label.toLowerCase().includes(q2)) continue;
      seen.add(it.href); out.push({ id: it.href, key: '__page', title: it.label, subtitle: 'Page', href: it.href, icon: it.icon });
    }
    return out;
  }, [q2, activeOrg, me, platformAdmin]);
  const actionHits = useMemo<Hit[]>(() => {
    if (q2.length < 2) return [];
    const toks = q2.split(/\s+/).filter(Boolean);
    return ACTIONS.filter((a) => !isPageHidden(activeOrg?.hidden_pages, a.href) && pageReadable(me, a.href) && toks.every((t) => (a.label + ' ' + a.kw).toLowerCase().includes(t)))
      .slice(0, 8)
      .map((a) => ({ id: 'act:' + a.label, key: '__action', title: a.label, subtitle: 'Action', href: a.href, icon: a.icon }));
  }, [q2, activeOrg?.hidden_pages, me]);
  const combined = useMemo<Hit[]>(() => [...actionHits, ...navHits, ...hits], [actionHits, navHits, hits]);

  // Global hotkeys: "/" or Cmd/Ctrl-K focus the search (no modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); focusSearch(); return; }
      if (e.key === '/' && !typing) { e.preventDefault(); focusSearch(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Outside-click closes menus + results.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); if (!inputRef.current?.value?.trim()) setDesktopOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const focusSearch = () => {
    if (window.matchMedia('(min-width: 640px)').matches) { setDesktopOpen(true); setResultsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }
    else { setMobileOpen(true); setResultsOpen(true); setTimeout(() => mInputRef.current?.focus(), 0); }
  };

  // Debounced, scope-aware query.
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try { const r = await runSearch(q, effectiveMods, specByKey); if (id === reqId.current) { setHits(r); setActive(0); } }
      finally { if (id === reqId.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, effectiveMods, specByKey]);

  const go = (h?: Hit) => { if (!h) return; setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); setDesktopOpen(false); setQ(''); router.push(h.href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, combined.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(combined[active]); }
    else if (e.key === 'Escape') { setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); if (!q.trim()) setDesktopOpen(false); }
  };

  const scopeMenu = (
    <div className="absolute left-0 top-[2.6rem] z-[70] w-56 bg-surface border border-line rounded-lg shadow-lg flex flex-col max-h-80">
      <div className="p-2 border-b border-line">
        <input value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} placeholder="Filter modules…"
          className="w-full h-8 px-2 rounded-md border border-line bg-surface text-sm text-content outline-none focus:border-accent placeholder:text-muted2" />
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line">
        <button onMouseDown={(e) => { e.preventDefault(); setSelMods([]); }}
          className={`flex items-center gap-2 text-sm ${selMods.length === 0 ? 'text-accentstrong font-medium' : 'text-content'}`}>
          <Icon name="ti-world-search" className="text-sm text-muted2" />Everything
        </button>
        {pageMod && <button onMouseDown={(e) => { e.preventDefault(); setSelMods([pageMod]); }} className="text-2xs text-muted hover:text-content">This page</button>}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {availMods.filter((m) => m.label.toLowerCase().includes(scopeFilter.toLowerCase())).map((m) => {
          const on = selMods.includes(m.key);
          return (
            <button key={m.key} onMouseDown={(e) => { e.preventDefault(); toggleMod(m.key); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface2 ${on ? 'text-accentstrong' : 'text-content'}`}>
              <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${on ? 'bg-accent border-accent text-[#fff]' : 'border-line'}`}>{on && <Icon name="ti-check" className="text-[0.6rem]" />}</span>
              <Icon name={m.icon} className="text-sm text-muted2 shrink-0" />
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </div>
      {selMods.length > 0 && (
        <button onMouseDown={(e) => { e.preventDefault(); setSelMods([]); }} className="text-2xs text-muted hover:text-content border-t border-line py-2">Clear selection ({selMods.length})</button>
      )}
    </div>
  );

  const results = (
    <div className="absolute left-0 right-0 top-[2.6rem] z-[65] bg-surface border border-line rounded-lg shadow-xl overflow-hidden">
      <div className="max-h-[60vh] overflow-y-auto py-1">
        {q.trim().length < 2 ? (
          <p className="px-4 py-5 text-center text-sm text-muted2">Type 2+ characters to jump to a page or search records{selMods.length > 0 ? ` · scope: ${scopeLabel}` : ''}.</p>
        ) : !loading && combined.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted2">No matches for “{q.trim()}”.</p>
        ) : (() => { let last = ''; return combined.map((h, i) => {
          const head = h.key !== last ? (last = h.key) : null;
          return (
            <div key={h.key + h.id}>
              {head && <p className="px-4 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted2">{h.key === '__action' ? 'Actions' : h.key === '__page' ? 'Jump to' : MOD_LABEL[h.key]}</p>}
              <button onMouseDown={(e) => { e.preventDefault(); go(h); }} onMouseEnter={() => setActive(i)}
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
        }); })()}
      </div>
    </div>
  );

  const bar = (mobile: boolean) => (
    <div className="flex items-center h-9 rounded-lg border border-line bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 transition">
      <button type="button" onClick={() => setScopeOpen((v) => !v)}
        className="flex items-center gap-1 h-full pl-2.5 pr-2 text-2xs font-medium text-muted2 hover:text-content border-r border-line shrink-0">
        {scopeLabel}<Icon name="ti-chevron-down" className="text-[0.7rem]" />
      </button>
      <Icon name="ti-search" className="ml-2 text-muted2 shrink-0" />
      <input ref={mobile ? mInputRef : inputRef} value={q}
        onChange={(e) => { setQ(e.target.value); setResultsOpen(true); }}
        onFocus={() => setResultsOpen(true)} onKeyDown={onInputKey}
        placeholder={`Search ${selMods.length === 0 ? 'everything' : scopeLabel.toLowerCase()}…`}
        className="flex-1 min-w-0 bg-transparent outline-none text-sm px-2 text-content placeholder:text-muted2" />
      {loading && <Icon name="ti-loader-2" className="text-muted2 animate-spin text-sm mr-1 shrink-0" />}
      {q && !loading && <button onMouseDown={(e) => { e.preventDefault(); setQ(''); (mobile ? mInputRef : inputRef).current?.focus(); }} className="mr-1.5 text-muted2 hover:text-content shrink-0"><Icon name="ti-x" className="text-sm" /></button>}
      <span className="kbd mr-1.5 hidden lg:inline-flex shrink-0">/</span>
    </div>
  );

  return (
    <div ref={wrapRef} className="contents">
      {/* Desktop: collapses to a search icon; click / "/" / Cmd-K expands the bar in place. */}
      <div className="relative hidden sm:block">
        {desktopOpen ? (
          <div className="w-64 lg:w-80" style={{ animation: 'modalFade .12s ease-out' }}>
            {bar(false)}
            {scopeOpen && scopeMenu}
            {resultsOpen && results}
          </div>
        ) : (
          <button onClick={() => { setDesktopOpen(true); setResultsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} aria-label="Search" title="Search ( / )"
            className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
            <Icon name="ti-search" className="text-base" />
          </button>
        )}
      </div>

      {/* Mobile: icon → inline drop-down bar under the header (not a modal) */}
      <button onClick={focusSearch} aria-label="Search"
        className="sm:hidden h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition">
        <Icon name="ti-search" className="text-base" />
      </button>
      {mobileOpen && (
        <div className="sm:hidden fixed left-0 right-0 top-14 z-[65] px-4 pb-3 pt-2 bg-surface/95 backdrop-blur border-b border-line">
          <div className="relative">
            {bar(true)}
            {scopeOpen && scopeMenu}
            {resultsOpen && results}
          </div>
        </div>
      )}
    </div>
  );
}
