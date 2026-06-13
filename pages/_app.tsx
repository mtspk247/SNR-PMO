import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sb } from '@/lib/supabase';
import { getCurrentUser, getMyOrgs, getOrgBranding, getOrgFeatures, isPlatformAdmin } from '@/lib/db';
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

  // Apply per-tenant branding from the subdomain (anon RPC, runs before auth).
  useEffect(() => {
    const slug = readCookie('org-slug');
    if (slug) getOrgBranding(slug).then(applyBranding).catch(() => {});
  }, []);

  // Bootstrap + track the Supabase Auth session -> store (user + orgs).
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const user = await getCurrentUser();
        if (!active) return;
        if (!user) { clear(); return; }
        const orgs = await getMyOrgs(user.id);
        // 3.3: attach each org's plan entitlements + resolve platform-admin flag.
        const [withFeatures, platformAdmin] = await Promise.all([
          Promise.all(orgs.map(async (o) => ({ ...o, features: await getOrgFeatures(o.id) }))),
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
