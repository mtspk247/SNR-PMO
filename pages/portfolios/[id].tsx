import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, StatusBadge, Pill, Icon, Avatar } from '@/components/ui';
import { usePortfolios, useProjects } from '@/lib/queries';
import { listPortfolioMembers } from '@/lib/db';
import { PortfolioMember } from '@/lib/supabase';

export default function PortfolioDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const { data: portfolios = [], isLoading } = usePortfolios();
  const { data: projects = [] } = useProjects();
  const portfolio = portfolios.find((p) => p.id === id);
  const [members, setMembers] = useState<PortfolioMember[]>([]);
  useEffect(() => { if (id) listPortfolioMembers(id).then(setMembers).catch(() => {}); }, [id]);
  const projs = projects.filter((p) => p.portfolio_id === id);
  const active = projs.filter((p) => p.status === 'Active').length;
  const avgProgress = projs.length ? Math.round(projs.reduce((s, p) => s + (p.progress || 0), 0) / projs.length) : 0;

  if (isLoading) return <Layout title="Portfolio"><Spinner /></Layout>;
  if (!portfolio) return <Layout title="Portfolio"><EmptyState icon="ti-stack-2" text="Portfolio not found." /></Layout>;

  return (
    <Layout title={portfolio.name}>
      <PageHeader title={portfolio.name} subtitle={portfolio.description || 'Project portfolio'} icon="ti-stack-2"
        action={<Link href="/portfolios" className="btn"><Icon name="ti-arrow-left" className="text-sm" />All portfolios</Link>} />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
        <StatCard label="Projects" value={projs.length} icon="ti-folder" />
        <StatCard label="Active" value={active} icon="ti-player-play" />
        <StatCard label="Avg progress" value={`${avgProgress}%`} icon="ti-progress" />
        <StatCard label="Members" value={members.length} icon="ti-users" />
      </div>
      <div className="bg-surface overflow-hidden">
        <div className="px-5 h-12 flex items-center border-b border-line"><span className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-folder" className="text-base text-muted2" />Projects</span></div>
        {projs.length === 0 ? <EmptyState icon="ti-folder" text="No projects in this portfolio yet." /> : (
          <div className="divide-y divide-line">
            {projs.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface2 hover:shadow-md transition relative">
                <Avatar name={p.name} size={28} />
                <span className="text-sm font-medium flex-1 truncate">{p.name}</span>
                <div className="hidden sm:flex items-center gap-2 w-28">
                  <div className="flex-1 h-1.5 rounded-full bg-surface2 overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${p.progress || 0}%` }} /></div>
                  <span className="text-2xs text-muted2 tabular-nums w-8 text-right">{p.progress || 0}%</span>
                </div>
                <StatusBadge status={p.status} />
                <Icon name="ti-chevron-right" className="text-muted2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
