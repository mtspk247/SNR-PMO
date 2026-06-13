import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, StatusBadge, Pill, Icon, Avatar } from '@/components/ui';
import { useOrgCompanies, useProjects } from '@/lib/queries';
import { listCompanyMembers } from '@/lib/db';
import { CompanyMember } from '@/lib/supabase';

export default function CompanyDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const { data: companies = [], isLoading } = useOrgCompanies();
  const { data: projects = [] } = useProjects();
  const company = companies.find((c) => c.id === id);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  useEffect(() => { if (id) listCompanyMembers(id).then(setMembers).catch(() => {}); }, [id]);
  const projs = projects.filter((p) => p.company_id === id);
  const active = projs.filter((p) => p.status === 'Active').length;

  if (isLoading) return <Layout title="Company"><Spinner /></Layout>;
  if (!company) return <Layout title="Company"><EmptyState icon="ti-building" text="Company not found." /></Layout>;

  return (
    <Layout title={company.name}>
      <PageHeader title={company.name} subtitle={company.description || 'Company workspace'} icon="ti-building"
        action={<Link href="/companies" className="btn"><Icon name="ti-arrow-left" className="text-sm" />All companies</Link>} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <StatCard label="Projects" value={projs.length} icon="ti-folder" />
        <StatCard label="Active" value={active} icon="ti-player-play" />
        <StatCard label="Members" value={members.length} icon="ti-users" />
      </div>
      <div className="bg-surface overflow-hidden">
        <div className="px-5 h-12 flex items-center border-b border-line"><span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-folder" className="text-base text-muted2" />Projects</span></div>
        {projs.length === 0 ? <EmptyState icon="ti-folder" text="No projects in this company yet." /> : (
          <div className="divide-y divide-line">
            {projs.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface2 hover:shadow-md transition relative">
                <Avatar name={p.name} size={28} />
                <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                <StatusBadge status={p.status} />
                <Pill label={p.priority} />
                <Icon name="ti-chevron-right" className="text-muted2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
