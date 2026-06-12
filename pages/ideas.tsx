import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { Modal, Field } from '@/components/Modal';
import { useIdeas } from '@/lib/queries';
import { createIdea, updateIdea, deleteIdea, toggleIdeaVote, convertIdeaToProject, IDEA_STATUSES } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { Idea, IdeaStatus } from '@/lib/supabase';

const STATUS_PILL: Record<IdeaStatus, string> = {
  idea: 'pill-gray',
  exploring: 'pill-blue',
  approved: 'pill-violet',
  building: 'pill-amber',
  shipped: 'pill-green',
  parked: 'pill-red',
};

const STATUS_LABEL: Record<IdeaStatus, string> = {
  idea: 'Idea',
  exploring: 'Exploring',
  approved: 'Approved',
  building: 'Building',
  shipped: 'Shipped',
  parked: 'Parked',
};

type FormState = { title: string; pitch: string; status: IdeaStatus };
const emptyForm = (): FormState => ({ title: '', pitch: '', status: 'idea' });

export default function IdeasPage() {
  const org = useActiveOrg();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: ideas = [], isLoading } = useIdeas();

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IdeaStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Stats (over all ideas, not filtered)
  const totalVotes = ideas.reduce((s, i) => s + (i.votes?.length ?? 0), 0);
  const inProgress = ideas.filter((i) => ['exploring', 'approved', 'building'].includes(i.status)).length;
  const shipped = ideas.filter((i) => i.status === 'shipped').length;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return ideas.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (!term) return true;
      return (
        i.title.toLowerCase().includes(term) ||
        (i.pitch || '').toLowerCase().includes(term)
      );
    });
  }, [ideas, q, statusFilter]);

  const pg = usePagination(filtered, 25);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (idea: Idea) => {
    setEditing(idea);
    setForm({ title: idea.title, pitch: idea.pitch || '', status: idea.status });
    setShowModal(true);
  };

  const save = async () => {
    if (!org) return;
    if (!form.title.trim()) { alert('Title is required.'); return; }
    setBusy(true);
    try {
      if (editing) {
        const updated = await updateIdea(editing.id, {
          title: form.title.trim(),
          pitch: form.pitch.trim() || null,
          status: form.status,
        });
        qc.setQueryData<Idea[]>(qk.ideas(org.id), (prev = []) =>
          prev.map((i) => (i.id === updated.id ? updated : i))
        );
      } else {
        const created = await createIdea({
          org_id: org.id,
          title: form.title.trim(),
          pitch: form.pitch.trim() || null,
          created_by: user?.id || null,
        });
        qc.setQueryData<Idea[]>(qk.ideas(org.id), (prev = []) => [created, ...prev]);
      }
      setShowModal(false);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const remove = async (idea: Idea) => {
    if (!org || !confirm(`Delete idea "${idea.title}"? This cannot be undone.`)) return;
    try {
      await deleteIdea(idea.id);
      qc.setQueryData<Idea[]>(qk.ideas(org.id), (prev = []) => prev.filter((i) => i.id !== idea.id));
    } catch (err: any) { alert(err.message); }
  };

  const vote = async (idea: Idea) => {
    if (!user || votingId) return;
    setVotingId(idea.id);
    try {
      await toggleIdeaVote(idea, user.id);
      qc.invalidateQueries({ queryKey: qk.ideas(org?.id) });
    } catch (err: any) { alert(err.message); } finally { setVotingId(null); }
  };

  const convert = async (idea: Idea) => {
    if (!org || convertingId) return;
    if (!confirm(`Convert "${idea.title}" into a project? This will set its status to Building and link it to a new project.`)) return;
    setConvertingId(idea.id);
    try {
      const res = await convertIdeaToProject(idea, user?.id);
      qc.setQueryData(qk.projects(org.id), res.projects);
      qc.setQueryData<Idea[]>(qk.ideas(org.id), (prev = []) =>
        prev.map((i) => (i.id === res.idea.id ? res.idea : i))
      );
    } catch (err: any) { alert(err.message); } finally { setConvertingId(null); }
  };

  return (
    <Layout title="Ideas">
      <PageHeader
        title="Ideas"
        subtitle="Idea backlog — capture, vote, and convert your best ideas into projects."
        action={
          <button className="btn btn-primary" onClick={openNew}>
            <Icon name="ti-plus" /> New idea
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total ideas" value={String(ideas.length)} hint="All time" icon="ti-bulb" />
        <StatCard label="In progress" value={String(inProgress)} hint="Exploring · Approved · Building" icon="ti-loader" />
        <StatCard label="Shipped" value={String(shipped)} hint="Completed ideas" hintTone="up" icon="ti-rocket" />
        <StatCard label="Total votes" value={String(totalVotes)} hint="Across all ideas" icon="ti-arrow-big-up" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-b border-line">
          <div className="relative flex-1 max-w-xs">
            <Icon name="ti-search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted2" />
            <input
              className="input pl-8 w-full"
              placeholder="Search ideas…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="input w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All statuses</option>
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="ti-bulb" text={q || statusFilter !== 'all' ? 'No ideas match your filters.' : 'No ideas yet — add the first one.'} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-16 text-center">Votes</th>
                    <th className="th">Title</th>
                    <th className="th">Status</th>
                    <th className="th">Project</th>
                    <th className="th">By</th>
                    <th className="th">Created</th>
                    <th className="th w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageItems.map((idea) => {
                    const hasVoted = idea.votes?.some((v) => v.user_id === user?.id) ?? false;
                    const voteCount = idea.votes?.length ?? 0;
                    const isVoting = votingId === idea.id;
                    const isConverting = convertingId === idea.id;
                    return (
                      <tr key={idea.id} className="row">
                        <td className="td text-center">
                          <button
                            className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors ${hasVoted ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-muted hover:text-content hover:bg-surface2'} disabled:opacity-50`}
                            onClick={() => vote(idea)}
                            disabled={isVoting || !user}
                            title={hasVoted ? 'Remove vote' : 'Vote'}
                          >
                            <Icon name="ti-arrow-big-up" className="text-base leading-none" />
                            <span className="text-2xs tabular-nums font-medium leading-none">{voteCount}</span>
                          </button>
                        </td>
                        <td className="td max-w-xs">
                          <p className="font-medium text-content truncate">{idea.title}</p>
                          {idea.pitch && (
                            <p className="text-2xs text-muted truncate mt-0.5">{idea.pitch}</p>
                          )}
                        </td>
                        <td className="td">
                          <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
                        </td>
                        <td className="td text-2xs text-muted">
                          {idea.project?.name ? (
                            <span className="pill pill-gray">{idea.project.name}</span>
                          ) : '—'}
                        </td>
                        <td className="td text-2xs text-muted">
                          {idea.creator?.full_name || '—'}
                        </td>
                        <td className="td text-2xs text-muted tabular-nums">
                          {idea.created_at ? idea.created_at.slice(0, 10) : '—'}
                        </td>
                        <td className="td">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              className="btn-ghost p-1.5"
                              title="Edit"
                              onClick={() => openEdit(idea)}
                            >
                              <Icon name="ti-pencil" />
                            </button>
                            {!idea.project_id && (
                              <button
                                className="btn-ghost p-1.5 text-accent"
                                title="Convert to project"
                                onClick={() => convert(idea)}
                                disabled={isConverting}
                              >
                                <Icon name="ti-rocket" />
                              </button>
                            )}
                            <button
                              className="btn-ghost p-1.5 text-rose-500"
                              title="Delete"
                              onClick={() => remove(idea)}
                            >
                              <Icon name="ti-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pg.page}
              pageCount={pg.pageCount}
              total={pg.total}
              start={pg.start}
              end={pg.end}
              onPage={pg.setPage}
            />
          </>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={save}
        title={editing ? 'Edit idea' : 'New idea'}
        subtitle={editing ? editing.title : 'Capture a new idea for the backlog'}
        icon="ti-bulb"
        size="md"
        footer={
          <>
            <button className="btn" onClick={() => setShowModal(false)} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add idea'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" required>
            <input
              className="input w-full"
              placeholder="What's the idea?"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="Pitch" hint="A short description or rationale (optional)">
            <textarea
              className="input w-full"
              rows={3}
              placeholder="Why is this worth exploring?"
              value={form.pitch}
              onChange={(e) => set({ pitch: e.target.value })}
            />
          </Field>
          {editing && (
            <Field label="Status" required>
              <select
                className="input w-full"
                value={form.status}
                onChange={(e) => set({ status: e.target.value as IdeaStatus })}
              >
                {IDEA_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
