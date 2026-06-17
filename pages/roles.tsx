import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { Spinner } from '@/components/ui';

// Roles management now lives in Users → Roles tab (and per-user on the user detail page).
export default function RolesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/users'); }, [router]);
  return <Layout flat title="Roles"><Spinner /></Layout>;
}
