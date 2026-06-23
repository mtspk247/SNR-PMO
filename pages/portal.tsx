import { useMemo } from 'react';
import { titleCase } from '@/lib/format';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, StatCard } from '@/components/ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useProjects, useTasks } from '@/lib/queries';
import { Project } from '@/lib/supabase';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

// Branded, read-only client portal landing. Guests are fenced to their own
// projects by RLS; this page only renders what the server returns. Slice 1 =
// projects + at-a-glance counts. Invoices/files/approvals are later slices.
const COLS: ColDef[] = [
  { id: 'name', label: 'Project', locked: true },
  { id: 'status', label: 'Status' },
  { id: 'priority', label: 'Priority' },
  { id: 'start', label: 'Start' },
  { id: 'due', label: 'Due' },
];
const STATUS_PILL: Record<string, string> = { active: 'pill-green', planning: 'pill-amber', 'on hold': 'pill-gray', completed: 'pill-gray', cancelled: 'pill-rose' };
const PROJECT_FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'Active', label: 'Active' }, { value: 'Planning', label: 'Planning' }, { value: 'On Hold', label: 'On Hold' }, { value: 'Completed', label: 'Completed' }] },
];
const DONE = ['completed', 'cancelled', 'done', 'archived'];
const statusPill = (s: string) => STATUS_PILL[(s || '').toLowerCase()] || 'pill-gray';

export default function Portal() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const { data: projects = [], isLoading } = useProjects();
  const { data: tasks = [] } = useTasks();

  const prefs = useListPrefs('snrpmo.portal.cols', COLS, { entity: 'portal', orgId: org?.id });
  const q = prefs.query;
  const statusF = prefs.filters.status || 'all';

  const shown = useMemo(() =>
    projects.filter((p) =>
      (statusF === 'all' || p.status === statusF) &&
      (!q.trim() || p.name.toLowerCase().includes(q.toLowerCase()))
    ), [projects, q, statusF]);

  const rs = useRowSelection(shown);

  const GROUPS: GroupMeta[] = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status).filter(Boolean))).map((s) => ({ value: s, label: titleCase(s), pill: statusPill(s) })),
    [projects]
  );

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
  const cell = (id: string, p: Project) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{p.name}</span>;
      case 'status': return <span className={'pill ' + statusPill(p.status)}>{titleCase(p.status || '—')}</span>;
      case 'priority': return p.priority ? titleCase(p.priority) : '—';
      case 'start': return fmt(p.start_date);
      case 'due': return fmt(p.end_date);
      default: return '—';
    }
  };
  const exportValue = (id: string, p: Project) =>
    id === 'name' ? p.name : id === 'status' ? (p.status || '') : id === 'priority' ? (p.priority || '')
    : id === 'start' ? (p.start_date || '') : id === 'due' ? (p.end_date || '') : '';

  const kpis = useMemo(() => ({
    projects: projects.length,
    open: tasks.filter((t) => !DONE.includes((t.status || '').toLowerCase())).length,
    completed: projects.filter((p) => DONE.includes((p.status || '').toLowerCase())).length,
  }), [projects, tasks]);

  const firstName = me?.full_name ? me.full_name.split(' ')[0] : '';

  return (
    <Layout flat title="Portal">
      <PageHeader
        help="client-portal"
        title={firstName ? `Welcome, ${firstName}` : 'Welcome'}
        subtitle={`Your projects with ${org?.name || 'us'}`}
        icon="ti-layout-dashboard"
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <StatCard label="Projects" value={String(kpis.projects)} icon="ti-folder" />
        <StatCard label="Open tasks" value={String(kpis.open)} icon="ti-list-check" />
        <StatCard label="Completed projects" value={String(kpis.completed)} icon="ti-circle-check" />
      </div>
      {!isLoading && projects.length === 0 ? (
        <EmptyState icon="ti-folder" title="No projects yet" text="Projects shared with you will appear here." />
      ) : (
        <ListView
          rows={isLoading ? null : shown}
          rowKey={(p) => p.id}
          cols={COLS}
          prefs={prefs}
          cell={cell}
          selection={rs}
          filters={PROJECT_FILTERS}
          searchPlaceholder="Search projects…"
          groupField={{ value: 'status', label: 'Status' }}
          groupOf={(p) => p.status}
          groups={GROUPS}
          exportName="my-projects"
          exportValue={exportValue}
          emptyIcon="ti-folder"
          emptyText="No projects match your filters."
        />
      )}
    </Layout>
  );
}
