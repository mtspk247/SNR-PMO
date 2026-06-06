import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { sb, Organization } from '@/lib/supabase';
import { getCurrentUser, getMyOrgs, getOrgBranding } from '@/lib/db';
import { useAuthStore } from '@/lib/store';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function applyBranding(org: Organization | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const b = org?.branding || {};
  if (b.primary_color) root.style.setProperty('--brand-primary', b.primary_color);
  if (b.accent_color) root.style.setProperty('--brand-accent', b.accent_color);
  if (org?.name) root.dataset.orgName = org.name;
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
        const orgs = await getMyOrgs();
        if (active) setSession(user, orgs);
      } catch { if (active) clear(); }
    };
    load();
    const { data: sub } = sb.auth.onAuthStateChange(() => load());
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [setSession, clear]);

  return <Component {...pageProps} />;
}
