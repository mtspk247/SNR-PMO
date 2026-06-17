import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import AuditLog from '@/components/AuditLog';

export default function AuditPage() {
  const org = useActiveOrg();
  if (!can.manageMembers(org)) {
    return <Layout flat title="Audit log"><div className="card p-10 text-center text-sm text-muted"><Icon name="ti-lock" className="text-2xl text-muted2 block mb-2" />You need admin access to view the audit log.</div></Layout>;
  }
  return (
    <Layout flat title="Audit log">
      <PageHeader title="Audit log" subtitle="Recent activity across the workspace" />
      <AuditLog />
    </Layout>
  );
}
