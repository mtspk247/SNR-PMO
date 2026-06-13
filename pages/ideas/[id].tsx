import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import CommentsThread from '@/components/Comments';
import { useIdeas } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
import { toggleIdeaVote, getOrgUsers } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const SL: Record<string, string> = { idea: 'Idea', exploring: 'Exploring', approved: 'Approved', building: 'Building', shipped: 'Shipped', parked: 'Parked' };
const SP: Record<string, string> = { idea: 'pill-gray', exploring: 'pill-blue', approved: 'pill-violet', building: 'pill-amber', shipped: 'pill-green', parked: 'pill-gray' };

export default function IdeaDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const { data: ideas = [], isLoading } = useIdeas();
  const qc = useQueryClient();
  const idea = ideas.find((i) => i.id === id) || null;
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (org?.id) getOrgUsers(org.id).then(setUsers).catch(() => {}); }, [org?.id]);

  const hasVoted = idea?.votes?.some((v) => v.user_id === me?.id) ?? false;
  const voteCount = idea?.votes?.length ?? 0;
  const vote = async () => {
    if (!idea || !me) return; setBusy(true);
    try { await toggleIdeaVote(idea, me.id); qc.invalidateQueries({ queryKey: qk.ideas(org?.id) }); }
    catch { /* ignore */ } finally { setBusy(false); }
  };

  if (isLoading) return <Layout title="Idea"><Spinner /></Layout>;
  if (!idea) return <Layout title="Idea"><EmptyState icon="ti-bulb" text="Idea not found." /></Layout>;

  return (
    <Layout title={idea.title}>
      <PageHeader title={idea.title} subtitle="Idea" icon="ti-bulb"
        action={<Link href="/ideas" className="btn"><Icon name="ti-arrow-left" className="text-sm" />All ideas</Link>} />
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={vote} disabled={busy || !me}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${hasVoted ? 'border-accent text-accentstrong bg-accent/10' : 'border-line text-muted hover:text-content hover:bg-surface2'}`}>
                <Icon name="ti-arrow-big-up" className="text-base" /><span className="text-sm font-medium tabular-nums">{voteCount}</span>
              </button>
              <span className={`pill ${SP[idea.status] || 'pill-gray'}`}>{SL[idea.status] || idea.status}</span>
              {idea.project?.name && <Link href="/projects" className="pill pill-gray inline-flex items-center gap-1"><Icon name="ti-folder" />{idea.project.name}</Link>}
              <span className="ml-auto text-2xs text-muted2 inline-flex items-center gap-1.5"><Avatar name={idea.creator?.full_name || 'U'} size={20} />{idea.creator?.full_name || '—'}</span>
            </div>
            <div className="mt-4 pt-4 border-t border-line">
              <p className="section-label mb-2">Pitch</p>
              <p className="text-sm text-contentsoft whitespace-pre-wrap">{idea.pitch || 'No description provided.'}</p>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <p className="section-label mb-3 flex items-center gap-2"><Icon name="ti-message-circle" className="text-base text-muted2" />Discussion</p>
          <CommentsThread entityType="idea" entityId={idea.id} orgId={org?.id} users={users} currentUserId={me?.id} />
        </div>
      </div>
    </Layout>
  );
}
