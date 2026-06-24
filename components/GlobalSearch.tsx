import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Avatar } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { SEARCH_SPECS, pageModuleFor, SearchHit, ALL_ITEMS, isPageHidden } from '@/lib/nav';

// Inline header search with a scope picker (All / a module / This page) + live
// results dropdown. No modal. "/" or Cmd/Ctrl-K focuses the input.
// Searchable modules come from the central nav manifest (lib/nav.ts): add a
// `search` spec to a nav item there and it shows up here automatically.
type Scope = 'all' | 'page' | string;   // a module key, or 'all' / 'page'
type Hit = SearchHit;

const MODS = SEARCH_SPECS.map((s) => ({ key: s.key, label: s.label, icon: s.icon }));
const MOD_LABEL: Record<string, string> = Object.fromEntries(SEARCH_SPECS.map((s) => [s.key, s.label]));
const SPEC = new Map(SEARCH_SPECS.map((s) => [s.key, s]));
// #10 map a search-module key to its nav href, so hidden pages drop out of search.
const SPEC_HREF: Record<string, string> = Object.fromEntries(ALL_ITEMS.filter((i) => i.search).map((i) => [i.search!.key, i.href]));

async function runSearch(raw: string, mods: string[]): Promise<Hit[]> {
  const q = raw.trim();
  const like = `%${q}%`;
  const safe = q.replace(/[,()*%]/g, ' ').trim();
  const groups = await Promise.all(mods.map((k) => SPEC.get(k)!.run(like, safe)));
  // Keep canonical MODS (nav) order regardless of resolution order.
  const order = new Map(MODS.map((m, i) => [m.key, i]));
  return groups.flat().sort((a, b) => (order.get(a.key)! - order.get(b.key)!));
}

export default function GlobalSearch() {
  const router = useRouter();
  const pageMod = pageModuleFor(router.pathname);
  const activeOrg = useActiveOrg();
  const availMods = useMemo(() => MODS.filter((m) => !isPageHidden(activeOrg?.hidden_pages, SPEC_HREF[m.key])), [activeOrg?.hidden_pages]);
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

  const scopeLabel = selMods.length === 0 ? 'All' : selMods.length === 1 ? MOD_LABEL[selMods[0]] : `${selMods.length} selected`;

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
      try { const r = await runSearch(q, effectiveMods); if (id === reqId.current) { setHits(r); setActive(0); } }
      finally { if (id === reqId.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, effectiveMods]);

  const go = (h?: Hit) => { if (!h) return; setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); setDesktopOpen(false); setQ(''); router.push(h.href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
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
          <p className="px-4 py-5 text-center text-sm text-muted2">Type at least 2 characters{selMods.length > 0 ? ` · scope: ${scopeLabel}` : ''}.</p>
        ) : !loading && hits.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-muted2">No matches for “{q.trim()}”.</p>
        ) : (() => { let last = ''; return hits.map((h, i) => {
          const head = h.key !== last ? (last = h.key) : null;
          return (
            <div key={h.key + h.id}>
              {head && <p className="px-4 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted2">{MOD_LABEL[h.key]}</p>}
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
