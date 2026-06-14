import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon, Avatar } from '@/components/ui';
import { SEARCH_SPECS, pageModuleFor, SearchHit } from '@/lib/nav';

// Inline header search with a scope picker (All / a module / This page) + live
// results dropdown. No modal. "/" or Cmd/Ctrl-K focuses the input.
// Searchable modules come from the central nav manifest (lib/nav.ts): add a
// `search` spec to a nav item there and it shows up here automatically.
type Scope = 'all' | 'page' | string;   // a module key, or 'all' / 'page'
type Hit = SearchHit;

const MODS = SEARCH_SPECS.map((s) => ({ key: s.key, label: s.label, icon: s.icon }));
const MOD_LABEL: Record<string, string> = Object.fromEntries(SEARCH_SPECS.map((s) => [s.key, s.label]));
const SPEC = new Map(SEARCH_SPECS.map((s) => [s.key, s]));

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
  const [scope, setScope] = useState<Scope>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mInputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  // If we're not on a module page, fall back any lingering 'page' scope to All.
  useEffect(() => { if (scope === 'page' && !pageMod) setScope('all'); }, [pageMod, scope]);

  const effectiveMods = useMemo<string[]>(() => {
    if (scope === 'all') return MODS.map((m) => m.key);
    if (scope === 'page') return pageMod ? [pageMod] : MODS.map((m) => m.key);
    return [scope];
  }, [scope, pageMod]);

  const scopeLabel = scope === 'all' ? 'All' : scope === 'page' ? 'This page' : MOD_LABEL[scope];

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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const focusSearch = () => {
    if (window.matchMedia('(min-width: 640px)').matches) { setResultsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }
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

  const go = (h?: Hit) => { if (!h) return; setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); setQ(''); router.push(h.href); };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
    else if (e.key === 'Escape') { setResultsOpen(false); setScopeOpen(false); setMobileOpen(false); }
  };

  const scopeMenu = (
    <div className="absolute left-0 top-[2.6rem] z-[70] w-44 bg-surface border border-line rounded-lg shadow-lg py-1">
      {(['all', ...MODS.map((m) => m.key), ...(pageMod ? ['page'] : [])] as Scope[]).map((s) => (
        <button key={s} onMouseDown={(e) => { e.preventDefault(); setScope(s); setScopeOpen(false); }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-surface2 ${scope === s ? 'text-accentstrong font-medium' : 'text-content'}`}>
          <Icon name={s === 'all' ? 'ti-world-search' : s === 'page' ? 'ti-file-search' : MODS.find((m) => m.key === s)!.icon} className="text-sm text-muted2" />
          {s === 'all' ? 'Everything' : s === 'page' ? `This page${pageMod ? ` (${MOD_LABEL[pageMod]})` : ''}` : MOD_LABEL[s as string]}
        </button>
      ))}
    </div>
  );

  const results = (
    <div className="absolute left-0 right-0 top-[2.6rem] z-[65] bg-surface border border-line rounded-lg shadow-xl overflow-hidden">
      <div className="max-h-[60vh] overflow-y-auto py-1">
        {q.trim().length < 2 ? (
          <p className="px-4 py-5 text-center text-sm text-muted2">Type at least 2 characters{scope !== 'all' ? ` · scope: ${scopeLabel}` : ''}.</p>
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
        placeholder={`Search ${scope === 'all' ? 'everything' : scopeLabel.toLowerCase()}…`}
        className="flex-1 min-w-0 bg-transparent outline-none text-sm px-2 text-content placeholder:text-muted2" />
      {loading && <Icon name="ti-loader-2" className="text-muted2 animate-spin text-sm mr-1 shrink-0" />}
      {q && !loading && <button onMouseDown={(e) => { e.preventDefault(); setQ(''); (mobile ? mInputRef : inputRef).current?.focus(); }} className="mr-1.5 text-muted2 hover:text-content shrink-0"><Icon name="ti-x" className="text-sm" /></button>}
      <span className="kbd mr-1.5 hidden lg:inline-flex shrink-0">/</span>
    </div>
  );

  return (
    <div ref={wrapRef} className="contents">
      {/* Desktop inline search */}
      <div className="relative hidden sm:block w-64 lg:w-80">
        {bar(false)}
        {scopeOpen && scopeMenu}
        {resultsOpen && results}
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
