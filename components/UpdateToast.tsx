import { useEffect, useRef, useState } from 'react';

// "New version available" prompt — fixes the long-running-PWA/tab problem where the
// loaded JS bundle stays old until a full reload (the SW is network-first for HTML,
// but an open SPA window never re-navigates on its own). Detection: compare our
// __NEXT_DATA__.buildId against the buildId in freshly fetched page HTML — checked
// every 10 minutes and whenever the app returns to the foreground. One small no-store
// GET per check; no server changes, works for browser tabs and installed PWAs alike.
const CHECK_MS = 10 * 60 * 1000;

export default function UpdateToast() {
  const [ready, setReady] = useState(false);
  const checking = useRef(false);

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
          if (m && m[1] && m[1] !== current) setReady(true);
        }
      } catch { /* offline — try again later */ }
      checking.current = false;
    };
    const t = setInterval(check, CHECK_MS);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    const warm = setTimeout(check, 60_000); // first check a minute in
    return () => { clearInterval(t); clearTimeout(warm); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  if (!ready) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] print:hidden">
      <div className="flex items-center gap-3 rounded-full bg-content text-surface shadow-xl pl-4 pr-1.5 py-1.5 text-sm">
        <span>A new version is ready</span>
        <button onClick={() => window.location.reload()} className="rounded-full bg-accent text-white text-xs font-semibold px-3 py-1.5 hover:brightness-110 transition">
          Refresh
        </button>
      </div>
    </div>
  );
}
