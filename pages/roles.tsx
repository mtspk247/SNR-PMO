import Layout from '@/components/Layout';
import { PageHeader } from '@/components/ui';
import RolesManager from '@/components/RolesManager';

export default function RolesPage() {
  return (
    <Layout flat title="Roles">
      <PageHeader title="Roles & permissions" subtitle="Reusable permission templates and module access for your team" icon="ti-shield-lock" />
      <RolesManager />
    </Layout>
  );
}
