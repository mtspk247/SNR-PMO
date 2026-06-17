import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import NotifPolicyPanel from '@/components/NotifPolicyPanel';

export default function NotificationPolicyPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  if (!org) return <Layout flat title="Notifications"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="Notifications"><EmptyState icon="ti-lock" title="Admins only" text="Notification policy is managed by organization owners and admins." /></Layout>;
  return (
    <Layout flat title="Notifications">
      <PageHeader title="Notification policy" subtitle="Decide which notifications are required and which your members can manage themselves" icon="ti-bell-cog" />
      <NotifPolicyPanel orgId={org.id} />
    </Layout>
  );
}
