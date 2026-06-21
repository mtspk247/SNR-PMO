import '@/styles/globals.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sb, FEATURES } from '@/lib/supabase';
import { getCurrentUser, getMyOrgs, getOrgBranding, getOrgBrandingByHost, getOrgFeatures, getOrgPlanFeatures, isPlatformAdmin, ensurePersonalWorkspace, claimPendingInvite, touchLastLogin } from '@/lib/db';
import { useAuthStore } from '@/lib/store';
import { applyBranding } from '@/lib/branding';
import { ErrorBoundary } from '@/components/ui';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function App({ Component, pageProps }: AppProps) {
  const { setSession, clear } = useAuthStore();
  // One QueryClient for the app lifetime. RLS-scoped reads are cheap to keep
  // briefly fresh; we disable window-focus refetch to avoid surprising the user
  // (and re-running scoped queries) every time they tab back.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
  }));

  // Register service worker for PWA / offline support.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Capture uncaught client errors + promise rejections into the error log.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const log = (level: string, message: string, stack?: string | null) => {
      try { sb.rpc('log_error', { p_source: 'client', p_level: level, p_message: message, p_stack: stack || null, p_path: window.location.pathname, p_meta: {} }); } catch { /* ignore */ }
    };
    const onErr = (e: ErrorEvent) => log('error', e.message || 'Uncaught error', e.error?.stack);
    const onRej = (e: PromiseRejectionEvent) => { const r: any = e.reason; log('error', r?.message || String(r) || 'Unhandled rejection', r?.stack); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  // Apply per-tenant branding from the subdomain (anon RPC, runs before auth).
  useEffect(() => {
    const slug = readCookie('org-slug');
    if (slug) getOrgBranding(slug).then(applyBranding).catch(() => {});
    else if (typeof window !== 'undefined') getOrgBrandingByHost(window.location.hostname).then((o) => o && applyBranding(o)).catch(() => {});
  }, []);

  // Bootstrap + track the Supabase Auth session -> store (user + orgs).
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        if (!user) { clear(); return; }
        if (typeof window !== 'undefined' && !sessionStorage.getItem('ll_touched')) { sessionStorage.setItem('ll_touched', '1'); touchLastLogin(); }
        let orgs = await getMyOrgs(user.id);
        // A signed-in user with no workspace: FIRST claim any pending invite (e.g. a reseller
        // sub-tenant) so they land in the right workspace instead of a throwaway personal one.
        if (orgs.length === 0) {
          try { const claimed = await claimPendingInvite(); if (claimed) orgs = await getMyOrgs(user.id); } catch { /* ignore */ }
        }
        // Otherwise (open self-serve, e.g. Google sign-in) auto-provision a free personal workspace.
        if (orgs.length === 0) {
          try { const r = await ensurePersonalWorkspace(); if (r?.created) orgs = await getMyOrgs(user.id); } catch { /* ignore */ }
        }
        // 3.3: attach each org's plan entitlements + resolve platform-admin flag.
        const [withFeatures, platformAdmin] = await Promise.all([
          Promise.all(orgs.map(async (o) => {
            // Platform-home orgs get the full catalog — derive from the flag we
            // already loaded so the unlock never depends on a second (fragile) query.
            if ((o as any).is_platform_home) { const all = FEATURES.map((f) => f.key as string); return { ...o, features: all, planFeatures: all }; }
            return { ...o, features: await getOrgFeatures(o.id), planFeatures: await getOrgPlanFeatures(o.id) };
          })),
          isPlatformAdmin(),
        ]);
        if (active) setSession(user, withFeatures, platformAdmin);
      } catch { if (active) clear(); }
    };
    load();
    const { data: sub } = sb.auth.onAuthStateChange(() => load());
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [setSession, clear]);

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
