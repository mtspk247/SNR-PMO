import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import CommentsThread from '@/components/Comments';
import { useIdeas } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/queryKeys';
import { setIdeaVote, removeIdeaVote, getOrgUsers, getIdeaPoll, createIdeaPoll, voteIdeaPoll, closeIdeaPoll, IdeaPoll } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';

const SL: Record<string, string> = { idea: 'Idea', exploring: 'Exploring', approved: 'Approved', building: 'Building', shipped: 'Shipped', parked: 'Parked' };
const SP: Record<string, string> = { idea: 'pill-gray', exploring: 'pill-blue', approved: 'pill-violet', building: 'pill-amber', shipped: 'pill-green', parked: 'pill-gray' };
const CHOICE_META: Record<string, { label: string; cls: string }> = {
  yes: { label: 'Yes', cls: 'pill-green' }, no: { label: 'No', cls: 'pill-red' }, abstain: { label: 'Abstain', cls: 'pill-gray' },
};

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
  const [reason, setReason] = useState('');

  const [poll, setPoll] = useState<IdeaPoll | null | undefined>(undefined);
  const [showPoll, setShowPoll] = useState(false);
  const [question, setQuestion] = useState('Should we pursue this idea?');
  const [picks, setPicks] = useState<Record<string, boolean>>({});

  useEffect(() => { if (org?.id) getOrgUsers(org.id).then(setUsers).catch(() => {}); }, [org?.id]);
  const loadPoll = () => { if (id) getIdeaPoll(id).then(setPoll).catch(() => setPoll(null)); };
  useEffect(() => { loadPoll(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { if (router.query.poll === '1') setShowPoll(true); }, [router.query.poll]);

  const isOrgAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canStartPoll = !!me && (idea?.created_by === me.id || isOrgAdmin);

  const votes = idea?.votes || [];
  const up = votes.filter((v) => (v.value ?? 1) === 1);
  const down = votes.filter((v) => v.value === -1);
  const myVote = votes.find((v) => v.user_id === me?.id) || null;

  const castVote = async (value: 1 | -1) => {
    if (!idea || !me || busy) return; setBusy(true);
    try { await setIdeaVote(idea.id, me.id, value, reason.trim() || null); setReason(''); qc.invalidateQueries({ queryKey: qk.ideas(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const clearVote = async () => {
    if (!idea || !me || busy) return; setBusy(true);
    try { await removeIdeaVote(idea.id, me.id); qc.invalidateQueries({ queryKey: qk.ideas(org?.id) }); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const submitPoll = async () => {
    if (!idea || busy) return;
    const ids = Object.keys(picks).filter((k) => picks[k]);
    if (ids.length === 0) { alert('Pick at least one stakeholder to vote.'); return; }
    setBusy(true);
    try { await createIdeaPoll(idea.id, question, ids); setShowPoll(false); setPicks({}); loadPoll(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const castPoll = async (choice: 'yes' | 'no' | 'abstain') => {
    if (!poll || busy) return; setBusy(true);
    try { await voteIdeaPoll(poll.id, choice); loadPoll(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const closePoll = async () => {
    if (!poll || busy || !confirm('Close this poll? No more votes can be cast.')) return; setBusy(true);
    try { await closeIdeaPoll(poll.id); loadPoll(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  if (isLoading) return <Layout title="Idea"><Spinner /></Layout>;
  if (!idea) return <Layout title="Idea"><EmptyState icon="ti-bulb" text="Idea not found." /></Layout>;

  const totalCast = poll ? poll.counts.yes + poll.counts.no + poll.counts.abstain : 0;
  const totalAll = poll ? totalCast + poll.counts.pending : 0;
  const pct = (n: number) => (totalAll ? Math.round((n / totalAll) * 100) : 0);

  return (
    <Layout title={idea.title}>
      <PageHeader title={idea.title} subtitle="Idea" icon="ti-bulb"
        action={<Link href="/ideas" className="btn"><Icon name="ti-arrow-left" className="text-sm" />All ideas</Link>} />
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => castVote(1)} disabled={busy || !me} title="Thumbs up"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${myVote?.value === 1 ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10' : 'border-line text-muted hover:text-content hover:bg-surface2'}`}>
                <Icon name="ti-thumb-up" className="text-base" /><span className="text-sm font-medium tabular-nums">{up.length}</span>
              </button>
              <button onClick={() => castVote(-1)} disabled={busy || !me} title="Thumbs down"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${myVote?.value === -1 ? 'border-rose-500 text-rose-600 bg-rose-500/10' : 'border-line text-muted hover:text-content hover:bg-surface2'}`}>
                <Icon name="ti-thumb-down" className="text-base" /><span className="text-sm font-medium tabular-nums">{down.length}</span>
              </button>
              {myVote && <button onClick={clearVote} disabled={busy} className="btn-ghost h-8 px-2 text-2xs text-muted">Remove</button>}
              <span className={`pill ${SP[idea.status] || 'pill-gray'} ml-1`}>{SL[idea.status] || idea.status}</span>
              {idea.project?.name && <Link href={idea.project_id ? `/projects/${idea.project_id}` : '/projects'} className="inline-flex items-center gap-1 text-sm text-content hover:text-accentstrong hover:underline"><Icon name="ti-folder" className="text-muted2" />{idea.project.name}</Link>}
              <span className="ml-auto text-2xs text-muted2 inline-flex items-center gap-1.5"><Avatar name={idea.creator?.full_name || 'U'} size={20} />{idea.creator?.full_name || '—'}</span>
            </div>

            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add a reason for your vote (optional)"
              className="input h-8 text-xs mt-3 w-full max-w-md" />

            {(up.length + down.length) > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-2xs uppercase tracking-wide text-muted2">Votes</p>
                {[...up, ...down].map((v) => (
                  <div key={v.user_id} className="flex items-start gap-2 text-sm">
                    <Icon name={(v.value ?? 1) === 1 ? 'ti-thumb-up' : 'ti-thumb-down'} className={`text-sm mt-0.5 ${(v.value ?? 1) === 1 ? 'text-emerald-600' : 'text-rose-600'}`} />
                    <Avatar name={v.voter?.full_name || 'U'} size={18} />
                    <span className="min-w-0">
                      <span className="text-content">{v.voter?.full_name || 'Someone'}</span>
                      {v.reason && <span className="text-2xs text-muted"> — {v.reason}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-line">
              <p className="section-label mb-2">Pitch</p>
              <p className="text-sm text-contentsoft whitespace-pre-wrap">{idea.pitch || 'No description provided.'}</p>
            </div>
          </div>

          {/* Poll */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="ti-chart-bar" className="text-base text-muted2" />
              <p className="section-label">Stakeholder poll</p>
              {poll && <span className={`pill ${poll.status === 'open' ? 'pill-amber' : 'pill-gray'} ml-1`}>{poll.status}</span>}
              {poll && poll.am_creator && poll.status === 'open' && (
                <button onClick={closePoll} disabled={busy} className="btn-ghost h-7 px-2 text-2xs ml-auto"><Icon name="ti-lock" />Close poll</button>
              )}
              {!poll && canStartPoll && (
                <button onClick={() => setShowPoll(true)} className="btn btn-primary h-7 px-2.5 text-2xs ml-auto"><Icon name="ti-plus" />Start a poll</button>
              )}
            </div>

            {poll === undefined ? <Spinner /> : !poll ? (
              <p className="text-sm text-muted2">{canStartPoll ? 'No poll yet — start one to get a decision from your stakeholders.' : 'No poll has been started for this idea.'}</p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm font-medium text-content">{poll.question}</p>
                <div>
                  <div className="flex h-2 rounded-full overflow-hidden bg-surface2">
                    <div className="bg-emerald-500" style={{ width: `${pct(poll.counts.yes)}%` }} />
                    <div className="bg-rose-500" style={{ width: `${pct(poll.counts.no)}%` }} />
                    <div className="bg-neutral-400" style={{ width: `${pct(poll.counts.abstain)}%` }} />
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-2xs text-muted flex-wrap">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Yes {poll.counts.yes}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />No {poll.counts.no}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neutral-400" />Abstain {poll.counts.abstain}</span>
                    <span className="ml-auto">{poll.counts.pending} pending</span>
                  </div>
                </div>
                {poll.can_vote && (
                  <div className="flex items-center gap-2">
                    <span className="text-2xs text-muted2 mr-1">Your vote:</span>
                    {(['yes', 'no', 'abstain'] as const).map((c) => (
                      <button key={c} onClick={() => castPoll(c)} disabled={busy}
                        className={`btn h-8 px-3 text-xs capitalize ${poll.my_choice === c ? 'btn-primary' : ''}`}>{CHOICE_META[c].label}</button>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-2xs uppercase tracking-wide text-muted2">Stakeholders</p>
                  {poll.stakeholders.length === 0 ? <p className="text-2xs text-muted2">No stakeholders.</p> : poll.stakeholders.map((s) => (
                    <div key={s.user_id} className="flex items-center gap-2 text-sm">
                      <Avatar name={s.name || 'U'} size={20} />
                      <span className="text-content truncate">{s.name || 'Someone'}</span>
                      <span className="ml-auto">{s.choice ? <span className={`pill ${CHOICE_META[s.choice].cls}`}>{CHOICE_META[s.choice].label}</span> : <span className="text-2xs text-muted2">pending</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card p-5">
          <p className="section-label mb-3 flex items-center gap-2"><Icon name="ti-message-circle" className="text-base text-muted2" />Suggestions &amp; discussion</p>
          <CommentsThread entityType="idea" entityId={idea.id} orgId={org?.id} users={users} currentUserId={me?.id} />
        </div>
      </div>

      {showPoll && (
        <Modal open onClose={() => setShowPoll(false)} title="Start a stakeholder poll" icon="ti-chart-bar" size="sm"
          onSubmit={() => submitPoll()}
          footer={<><button className="btn" onClick={() => setShowPoll(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submitPoll}>{busy ? 'Starting…' : 'Start poll'}</button></>}>
          <Field label="Question" required><input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
          <Field label="Stakeholders" hint="They’ll be notified and asked to vote yes / no / abstain">
            <div className="max-h-56 overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {users.length === 0 ? <p className="text-2xs text-muted2 p-3">No people found.</p> : users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface2">
                  <input type="checkbox" className="accent-accent w-4 h-4" checked={!!picks[u.id]} onChange={(e) => setPicks((p) => ({ ...p, [u.id]: e.target.checked }))} />
                  <Avatar name={u.full_name || 'U'} size={20} /><span className="truncate">{u.full_name || u.id}</span>
                </label>
              ))}
            </div>
          </Field>
        </Modal>
      )}
    </Layout>
  );
}
