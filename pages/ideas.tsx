import { useMemo, useState } from 'react';
import Select from '@/components/Select';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
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

const IDEA_COLS: ColDef[] = [{ id: 'votes', label: 'Votes' }, { id: 'title', label: 'Title', locked: true }, { id: 'status', label: 'Status' }, { id: 'project', label: 'Project' }, { id: 'by', label: 'By' }, { id: 'created', label: 'Created' }];

export default function IdeasPage() {
  const org = useActiveOrg();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { data: ideas = [], isLoading } = useIdeas();

  const router = useRouter();
  const lp = useListPrefs(`snr-ideas-view-${user?.id || 'anon'}`, IDEA_COLS);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [view, setView] = useState<'list' | 'card'>('list');
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [pollAfter, setPollAfter] = useState(false);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Stats (over all ideas, not filtered)
  const totalVotes = ideas.reduce((s, i) => s + (i.votes?.length ?? 0), 0);
  const inProgress = ideas.filter((i) => ['exploring', 'approved', 'building'].includes(i.status)).length;
  const shipped = ideas.filter((i) => i.status === 'shipped').length;

  const FILTERS: FilterDef[] = [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...IDEA_STATUSES.map((x) => ({ value: x, label: STATUS_LABEL[x] }))] }];
  const filtered = useMemo(() => {
    const term = lp.query.trim().toLowerCase();
    const sf = lp.filters.status;
    return ideas.filter((i) => {
      if (sf && sf !== 'all' && i.status !== sf) return false;
      if (!term) return true;
      return (i.title.toLowerCase().includes(term) || (i.pitch || '').toLowerCase().includes(term));
    });
  }, [ideas, lp.query, lp.filters]);

  const pg = usePagination(filtered, 25);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setPollAfter(false); setShowModal(true); };
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
        if (pollAfter) { setShowModal(false); router.push(`/ideas/${created.id}?poll=1`); return; }
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

      <ListToolbar prefs={lp} cols={IDEA_COLS} filters={FILTERS} placeholder="Search ideas…">
        <div className="flex items-center rounded-lg border border-line overflow-hidden h-9">
          {(['list', 'card'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`h-full px-3 text-xs capitalize inline-flex items-center gap-1.5 transition ${view === v ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}><Icon name={v === 'list' ? 'ti-list' : 'ti-layout-grid'} className="text-sm" />{v}</button>
          ))}
        </div>
      </ListToolbar>
      <div className="bg-surface overflow-hidden">

        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="ti-bulb" text={lp.query || lp.activeCount ? 'No ideas match your filters.' : 'No ideas yet — add the first one.'} />
          </div>
        ) : (
          <>
            {view === 'card' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {pg.pageItems.map((idea) => {
                  const hasVoted = idea.votes?.some((v) => v.user_id === user?.id && (v.value ?? 1) === 1) ?? false;
                  const voteCount = idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0;
                  return (
                    <div key={idea.id} onClick={() => router.push(`/ideas/${idea.id}`)} className="card card-interactive p-4 cursor-pointer">
                      <div className="flex items-start gap-3">
                        <button onClick={(e) => { e.stopPropagation(); vote(idea); }} disabled={!user || votingId === idea.id}
                          className={`shrink-0 inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded ${hasVoted ? 'text-accent bg-accent/10' : 'text-muted hover:text-content hover:bg-surface2'}`}>
                          <Icon name="ti-arrow-big-up" className="text-base leading-none" /><span className="text-2xs tabular-nums font-medium leading-none">{voteCount}</span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <Link href={`/ideas/${idea.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-content truncate hover:text-accentstrong block">{idea.title}</Link>
                          {idea.pitch && <p className="text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{idea.pitch}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
                        {idea.project?.name && <span className="pill pill-gray truncate max-w-[8rem]">{idea.project.name}</span>}
                        <span className="ml-auto text-2xs text-muted2 truncate">{idea.creator?.full_name || ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {lp.ordered.map((id) => <th key={id} className={`th ${id === 'votes' ? 'w-16 text-center' : ''}`}>{IDEA_COLS.find((c) => c.id === id)?.label}</th>)}
                    <th className="th w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.pageItems.map((idea) => {
                    const hasVoted = idea.votes?.some((v) => v.user_id === user?.id && (v.value ?? 1) === 1) ?? false;
                    const voteCount = idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0;
                    const isVoting = votingId === idea.id;
                    const isConverting = convertingId === idea.id;
                    const cell = (id: string) => {
                      switch (id) {
                        case 'votes': return (<button className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors ${hasVoted ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-muted hover:text-content hover:bg-surface2'} disabled:opacity-50`} onClick={(e) => { e.stopPropagation(); vote(idea); }} disabled={isVoting || !user} title={hasVoted ? 'Remove vote' : 'Vote'}><Icon name="ti-arrow-big-up" className="text-base leading-none" /><span className="text-2xs tabular-nums font-medium leading-none">{voteCount}</span></button>);
                        case 'title': return (<><p className="font-medium text-content truncate">{idea.title}</p>{idea.pitch && <p className="text-2xs text-muted truncate mt-0.5">{idea.pitch}</p>}</>);
                        case 'status': return <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>;
                        case 'project': return idea.project?.name ? <span className="pill pill-gray">{idea.project.name}</span> : '—';
                        case 'by': return idea.creator?.full_name || '—';
                        case 'created': return idea.created_at ? idea.created_at.slice(0, 10) : '—';
                        default: return null;
                      }
                    };
                    return (
                      <tr key={idea.id} className="row cursor-pointer" onClick={() => router.push(`/ideas/${idea.id}`)}>
                        {lp.ordered.map((id) => <td key={id} className={`td ${id === 'votes' ? 'text-center' : ''} ${id === 'title' ? 'max-w-xs' : ''} ${['project', 'by', 'created'].includes(id) ? 'text-2xs text-muted' : ''} ${id === 'created' ? 'tabular-nums' : ''}`}>{cell(id)}</td>)}
                        <td className="td" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button className="btn-ghost p-1.5" title="Edit" onClick={() => openEdit(idea)}><Icon name="ti-pencil" /></button>
                            {!idea.project_id && (<button className="btn-ghost p-1.5 text-accent" title="Convert to project" onClick={() => convert(idea)} disabled={isConverting}><Icon name="ti-rocket" /></button>)}
                            <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={() => remove(idea)}><Icon name="ti-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
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
          {!editing && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-accent w-4 h-4" checked={pollAfter} onChange={(e) => setPollAfter(e.target.checked)} />
              <span className="text-content">Start a stakeholder poll after creating</span>
            </label>
          )}
          {editing && (
            <Field label="Status" required>
              <div className="w-full"><Select value={form.status} onChange={(v) => set({ status: v as IdeaStatus })} options={[...IDEA_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} /></div>
            </Field>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
