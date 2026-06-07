import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { sb } from '@/lib/supabase';
import { getCurrentUser, getMyOrgs, getOrgBranding } from '@/lib/db';
import { useAuthStore } from '@/lib/store';
import { applyBranding } from '@/lib/branding';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export default function App({ Component, pageProps }: AppProps) {
  const { setSession, clear } = useAuthStore();

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
        if (active) setSession(user, orgs);
      } catch { if (active) clear(); }
    };
    load();
    const { data: sub } = sb.auth.onAuthStateChange(() => load());
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [setSession, clear]);

  return <Component {...pageProps} />;
}
