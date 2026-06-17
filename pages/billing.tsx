import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import BillingPanel from '@/components/BillingPanel';

export default function BillingPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const isOwner = org?.member_role === 'owner';
  if (!org) return <Layout flat title="Billing"><div /></Layout>;
  if (!admin) return <Layout flat title="Billing"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />Billing is restricted to workspace admins.</div></Layout>;
  return (
    <Layout flat title="Billing">
      <PageHeader title="Billing" subtitle="Your plan, seats, included features and payment" icon="ti-credit-card" />
      <BillingPanel org={org} canBill={isOwner} />
    </Layout>
  );
}
