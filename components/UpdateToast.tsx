import { useEffect, useRef, useState } from 'react';
import { latestRelease, Release } from '@/lib/db';

// "New version available" — mobile-OS-style update prompt. Detection (unchanged from v1):
// compare our __NEXT_DATA__.buildId against freshly fetched page HTML every 10 minutes and
// on foreground. v2: when an update is detected we also fetch the latest PUBLISHED release
// note (RLS: published+all only) and show WHAT'S IN the update — with platform-aware copy
// (installed PWA vs browser tab). One small no-store GET per check; works everywhere.
const CHECK_MS = 10 * 60 * 1000;

export default function UpdateToast() {
  const [ready, setReady] = useState(false);
  const [rel, setRel] = useState<Release | null>(null);
  const [expanded, setExpanded] = useState(true);
  const checking = useRef(false);
  const fetched = useRef(false);
  const standalone = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any)?.standalone === true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = (window as any).__NEXT_DATA__?.buildId as string | undefined;
    if (!current) return;
    const check = async () => {
      if (checking.current || document.visibilityState !== 'visible') return;
      checking.current = true;
      try {
        const r = await fetch(`${window.location.pathname}?_v=${Date.now()}`, { cache: 'no-store', headers: { accept: 'text/html' } });
        if (r.ok) {
          const m = (await r.text()).match(/"buildId":"([^"]+)"/);
          if (m && m[1] && m[1] !== current) {
            setReady(true);
            if (!fetched.current) { fetched.current = true; latestRelease().then(setRel).catch(() => {}); }
          }
        }
      } catch { /* offline — try again later */ }
      checking.current = false;
    };
    const t = setInterval(check, CHECK_MS);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const warm = setTimeout(check, 60_000);
    return () => { clearInterval(t); clearTimeout(warm); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!ready) return null;
  const cta = standalone ? 'Update now' : 'Refresh now';
  const sub = standalone ? 'The app updates when it reloads — takes a second.' : 'Refreshing loads the new version instantly.';

  if (rel && expanded) return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] w-[min(30rem,calc(100vw-2rem))] print:hidden">
      <div className="card shadow-2xl border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted2 font-medium">Update available · v{rel.version}</p>
            <p className="text-sm font-semibold text-content mt-0.5">{rel.title}</p>
          </div>
          <button onClick={() => setExpanded(false)} className="text-muted2 hover:text-content text-sm shrink-0" aria-label="Collapse">—</button>
        </div>
        <div className="mt-2 space-y-1.5 max-h-40 overflow-auto">
          {(rel.highlights || []).slice(0, 4).map((h, i) => (
            <div key={i} className="flex gap-2 text-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <span className="text-muted"><span className="font-medium text-content">{h.title}.</span> {h.body}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <a href="/whats-new" className="text-2xs text-accentstrong hover:underline">Full release notes</a>
          <div className="flex items-center gap-2">
            <span className="text-2xs text-muted2 hidden sm:inline">{sub}</span>
            <button onClick={() => window.location.reload()} className="btn btn-primary h-8 py-0 text-xs">{cta}</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] print:hidden">
      <div className="flex items-center gap-3 rounded-full bg-content text-surface shadow-xl pl-4 pr-1.5 py-1.5 text-sm">
        <span>A new version is ready</span>
        {rel && <button onClick={() => setExpanded(true)} className="text-xs underline opacity-80 hover:opacity-100">what&rsquo;s new?</button>}
        <button onClick={() => window.location.reload()} className="rounded-full bg-accent text-white text-xs font-semibold px-3 py-1.5 hover:brightness-110 transition">
          {cta}
        </button>
      </div>
    </div>
  );
}
