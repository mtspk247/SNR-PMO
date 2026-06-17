import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { Spinner } from '@/components/ui';

// Lists & options now live under Settings → Lists & options.
export default function ListsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/settings?tab=lists'); }, [router]);
  return <Layout flat title="Lists & options"><Spinner /></Layout>;
}
