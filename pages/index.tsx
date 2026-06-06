import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
export default function Home() {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  useEffect(() => { if (hasHydrated) router.replace(user ? '/dashboard' : '/login'); }, [hasHydrated, user, router]);
  return null;
}
