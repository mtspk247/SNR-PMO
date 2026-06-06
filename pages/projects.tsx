import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, PageHeader, Icon } from '@/components/ui';
import { getProjects } from '@/lib/db';
import { Project } from '@/lib/supabase';

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { getProjects().then(setProjects).finally(() => setLoading(false)); }, []);

  return (
    <Layout title="Projects">
      <PageHeader title="Projects" subtitle={`${projects.length} projects`}
        action={<button className="btn btn-primary"><Icon name="ti-plus" />New project</button>} />
      {loading ? <Spinner /> : projects.length === 0 ? <EmptyState text="No projects yet" /> : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr>
              <th className="th">Name</th><th className="th">Status</th><th className="th">Priority</th>
              <th className="th">Timeline</th><th className="th w-44">Progress</th>
            </tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="row">
                  <td className="td">
                    <p className="font-medium">{p.name}</p>
                    {p.description && <p className="text-2xs text-neutral-500 truncate max-w-xs">{p.description}</p>}
                  </td>
                  <td className="td"><Pill label={p.status} /></td>
                  <td className="td"><Pill label={p.priority} /></td>
                  <td className="td text-2xs text-neutral-500">{p.start_date || '—'} → {p.end_date || '—'}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded bg-neutral-100"><div className="h-1.5 rounded bg-ink" style={{ width: `${p.progress || 0}%` }} /></div>
                      <span className="text-2xs text-neutral-500 w-8 text-right">{p.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
