import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import LandingPage from './landing';

export default function Home() {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  // Logged-in users go straight to the app; everyone else (incl. crawlers) sees
  // the public marketing landing rendered at the root URL.
  useEffect(() => { if (hasHydrated && user) router.replace('/dashboard'); }, [hasHydrated, user, router]);
  if (hasHydrated && user) return null;
  return <LandingPage />;
}
