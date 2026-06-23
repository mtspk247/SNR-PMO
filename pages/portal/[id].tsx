import { useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Spinner, Icon } from '@/components/ui';
import { useProjects, useTasks } from '@/lib/queries';
import { Task } from '@/lib/supabase';

// Branded, read-only project view for clients — opened from the portal project list.
// Guests are RLS-fenced: useProjects/useTasks only return what they can access, so an
// out-of-scope id simply shows "not available".
const DONE = ['completed', 'cancelled', 'done', 'archived'];
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

function TaskRow({ t }: { t: Task }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0">
      <span className="text-sm text-content flex-1 truncate">{t.name}</span>
      {t.due_date && <span className="text-2xs text-muted2 shrink-0">{fmt(t.due_date)}</span>}
      <span className="pill pill-gray shrink-0">{titleCase(t.status || '—')}</span>
    </div>
  );
}

export default function PortalProject() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const { data: projects = [], isLoading: pl } = useProjects();
  const { data: tasks = [], isLoading: tl } = useTasks();
  const project = projects.find((p) => p.id === id);
  const projTasks = useMemo(() => tasks.filter((t) => t.project_id === id), [tasks, id]);
  const open = projTasks.filter((t) => !DONE.includes((t.status || '').toLowerCase()));
  const done = projTasks.filter((t) => DONE.includes((t.status || '').toLowerCase()));

  if (pl) return <Layout flat title="Project"><div className="p-8"><Spinner /></div></Layout>;
  if (!project) return (
    <Layout flat title="Project">
      <Link href="/portal" className="text-2xs text-muted hover:text-content inline-flex items-center gap-1 mb-3"><Icon name="ti-arrow-left" className="text-xs" />Back to portal</Link>
      <EmptyState icon="ti-folder-off" title="Project not available" text="This project isn't shared with you." />
    </Layout>
  );

  return (
    <Layout flat title={project.name}>
      <Link href="/portal" className="text-2xs text-muted hover:text-content inline-flex items-center gap-1 mb-2"><Icon name="ti-arrow-left" className="text-xs" />Back to portal</Link>
      <PageHeader title={project.name} subtitle={project.description || undefined} icon="ti-folder"
        badge={<span className="pill pill-gray">{titleCase(project.status || '—')}</span>} />
      <div className="flex flex-wrap gap-4 text-2xs text-muted mb-5">
        <span>Start: <span className="text-content">{fmt(project.start_date)}</span></span>
        <span>Due: <span className="text-content">{fmt(project.end_date)}</span></span>
        <span>Open tasks: <span className="text-content">{open.length}</span></span>
        <span>Completed: <span className="text-content">{done.length}</span></span>
      </div>
      <div className="card overflow-hidden max-w-3xl">
        <div className="px-4 py-2.5 border-b border-line text-xs font-semibold text-muted uppercase tracking-wide">Tasks</div>
        {tl ? <div className="p-6"><Spinner /></div> : projTasks.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-checklist" text="No tasks to show yet." /></div>
        ) : (
          <div>{open.map((t) => <TaskRow key={t.id} t={t} />)}{done.map((t) => <TaskRow key={t.id} t={t} />)}</div>
        )}
      </div>
    </Layout>
  );
}
