import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import LandingPage from './landing';
import ResellerLanding from '@/components/ResellerLanding';
import { resellerPublicSite, ResellerSite } from '@/lib/db';

export default function Home() {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const [site, setSite] = useState<ResellerSite | null>(null);
  useEffect(() => { if (typeof window !== 'undefined') resellerPublicSite(window.location.hostname).then((s) => { if (s?.enabled) setSite(s); }).catch(() => {}); }, []);
  // Logged-in users go straight to the app; everyone else (incl. crawlers) sees
  // the public marketing landing rendered at the root URL.
  useEffect(() => { if (hasHydrated && user) router.replace('/dashboard'); }, [hasHydrated, user, router]);
  if (hasHydrated && user) return null;
  if (site) return <ResellerLanding site={site} />;
  return <LandingPage />;
}
