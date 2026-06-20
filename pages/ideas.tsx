import { useMemo, useState } from 'react';
import Select from '@/components/Select';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { ViewControls, useViewPrefs, buildGroups } from '@/components/ViewControls';
import { Modal, Field } from '@/components/Modal';
import { useIdeas } from '@/lib/queries';
import { createIdea, updateIdea, deleteIdea, toggleIdeaVote, convertIdeaToProject, IDEA_STATUSES } from '@/lib/db';
import { qk } from '@/lib/queryKeys';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { Idea, IdeaStatus } from '@/lib/supabase';
import { DataList, GroupMeta, EditSpec } from '@/components/DataList';
import { useRowSelection, BulkBar } from '@/components/RowSelection';

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

const GROUPS: GroupMeta[] = IDEA_STATUSES.map((st) => ({
  value: st,
  label: STATUS_LABEL[st],
  pill: STATUS_PILL[st] || 'pill-gray',
}));

type GroupBy = 'status' | 'none';

export default function IdeasPage() {
  const org = useActiveOrg();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const { data: ideas = [], isLoading } = useIdeas();

  const router = useRouter();
  const lp = useListPrefs(`snr-ideas-view-${user?.id || 'anon'}`, IDEA_COLS);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const vp = useViewPrefs(`snr-ideas-vp-${user?.id || 'anon'}`, { view: 'list', groupBy: 'none' });
  const groupOptions = [
    { value: 'none', label: 'No grouping' },
    { value: 'status', label: 'Group by status' },
    { value: 'project', label: 'Group by project' },
    { value: 'by', label: 'Group by author' },
  ];
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [pollAfter, setPollAfter] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('status');

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
  const gKey = (i: Idea) => vp.groupBy === 'status' ? i.status : vp.groupBy === 'project' ? (i.project?.name || 'No project') : vp.groupBy === 'by' ? (i.creator?.full_name || 'Unknown') : 'all';
  const gLabel = (k: string) => vp.groupBy === 'status' ? (STATUS_LABEL[k as IdeaStatus] || k) : k;
  const groups = vp.groupBy === 'none' ? [{ key: 'all', label: '', items: pg.pageItems }] : buildGroups(filtered, gKey, gLabel, vp.groupBy === 'status' ? [...IDEA_STATUSES] : undefined);

  const rs = useRowSelection(filtered);

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

  const editable: Record<string, EditSpec> = {
    title: { type: 'text' },
    status: { type: 'select', options: IDEA_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
  };

  const rawValue = (id: string, idea: Idea) =>
    id === 'title' ? idea.title : id === 'status' ? idea.status : '';

  const onInlineEdit = async (idea: Idea, id: string, value: string) => {
    try {
      const updated = await updateIdea(idea.id, { [id]: value || null } as any);
      qc.setQueryData<Idea[]>(qk.ideas(org?.id), (prev = []) =>
        prev.map((i) => (i.id === updated.id ? updated : i))
      );
    } catch (err: any) { alert(err.message); }
  };

  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} idea${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true);
    try {
      for (const idea of rs.selected) {
        await deleteIdea(idea.id);
        qc.setQueryData<Idea[]>(qk.ideas(org?.id), (prev = []) => prev.filter((i) => i.id !== idea.id));
      }
      rs.clear();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const exportSelected = () => {
    const esc = (v: any) => { const x = v == null ? '' : String(v); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const heads = ['Title', 'Status', 'Project', 'By', 'Created', 'Votes'];
    const rows = rs.selected.map((idea) => [
      idea.title,
      STATUS_LABEL[idea.status],
      idea.project?.name || '',
      idea.creator?.full_name || '',
      idea.created_at ? idea.created_at.slice(0, 10) : '',
      String(idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0),
    ]);
    const csv = heads.join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'ideas-selected.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const cell = (id: string, idea: Idea) => {
    const hasVoted = idea.votes?.some((v) => v.user_id === user?.id && (v.value ?? 1) === 1) ?? false;
    const voteCount = idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0;
    const isVoting = votingId === idea.id;
    const isConverting = convertingId === idea.id;
    switch (id) {
      case 'votes':
        return (
          <button
            className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors ${hasVoted ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-muted hover:text-content hover:bg-surface2'} disabled:opacity-50`}
            onClick={(e) => { e.stopPropagation(); vote(idea); }}
            disabled={isVoting || !user}
            title={hasVoted ? 'Remove vote' : 'Vote'}
          >
            <Icon name="ti-arrow-big-up" className="text-base leading-none" />
            <span className="text-2xs tabular-nums font-medium leading-none">{voteCount}</span>
          </button>
        );
      case 'title':
        return (
          <>
            <p className="font-medium text-content truncate">{idea.title}</p>
            {idea.pitch && <p className="text-2xs text-muted truncate mt-0.5">{idea.pitch}</p>}
          </>
        );
      case 'status':
        return <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>;
      case 'project':
        return idea.project?.name ? <span className="pill pill-gray">{idea.project.name}</span> : '—';
      case 'by':
        return idea.creator?.full_name || '—';
      case 'created':
        return idea.created_at ? idea.created_at.slice(0, 10) : '—';
      case '__actions':
        return (
          <div className="flex items-center justify-end gap-1">
            <button className="btn-ghost p-1.5" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(idea); }}><Icon name="ti-pencil" /></button>
            {!idea.project_id && (
              <button className="btn-ghost p-1.5 text-accent" title="Convert to project" onClick={(e) => { e.stopPropagation(); convert(idea); }} disabled={isConverting}><Icon name="ti-rocket" /></button>
            )}
            <button className="btn-ghost p-1.5 text-rose-500" title="Delete" onClick={(e) => { e.stopPropagation(); remove(idea); }}><Icon name="ti-trash" /></button>
          </div>
        );
      default:
        return '—';
    }
  };

  const IdeaCards = ({ items }: { items: Idea[] }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
      {items.map((idea) => {
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
  );

  return (
    <Layout title="Ideas">
      <PageHeader help="work"
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

      {/* Toolbar + Group-by control */}
      <div className="flex items-end gap-2 flex-wrap mb-4">
        <div className="flex-1 min-w-0">
          <ListToolbar prefs={lp} cols={IDEA_COLS} filters={FILTERS} placeholder="Search ideas…">
            <ViewControls prefs={vp} views={[{ id: 'list', icon: 'ti-list', label: 'List' }, { id: 'card', icon: 'ti-layout-grid', label: 'Cards' }]} groupOptions={groupOptions} />
          </ListToolbar>
        </div>
        {vp.view === 'list' && (
          <div className="flex items-center gap-1.5 mb-[1px] pb-0.5">
            <span className="text-2xs text-muted2 uppercase tracking-wide mr-0.5">Group by</span>
            <button
              onClick={() => setGroupBy('status')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'status' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
            >
              Status
            </button>
            <button
              onClick={() => setGroupBy('none')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${groupBy === 'none' ? 'bg-accent/15 text-accentstrong' : 'text-muted hover:text-content hover:bg-surface2'}`}
            >
              None
            </button>
          </div>
        )}
      </div>

      <BulkBar count={rs.count} onClear={rs.clear}>
        <button onClick={exportSelected} className="btn h-8 text-xs"><Icon name="ti-download" className="text-xs" />Export</button>
        {isAdmin && <button onClick={bulkDelete} disabled={busy} className="btn h-8 text-xs text-rose-600"><Icon name="ti-trash" className="text-xs" />Delete</button>}
      </BulkBar>

      <div className="bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8"><Spinner /></div>
        ) : filtered.length === 0 ? (
          <div className="p-5"><EmptyState icon="ti-bulb" text={lp.query || lp.activeCount ? 'No ideas match your filters.' : 'No ideas yet — add the first one.'} /></div>
        ) : vp.view === 'card' ? (
          <>
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && <div className="flex items-center gap-2 px-4 pt-4"><h3 className="text-sm font-semibold text-content">{g.label}</h3><span className="text-2xs text-muted2 bg-surface2 rounded-full px-2 py-0.5">{g.items.length}</span></div>}
                <IdeaCards items={g.items} />
              </div>
            ))}
            {vp.groupBy === 'none' && <Pagination page={pg.page} pageCount={pg.pageCount} total={pg.total} start={pg.start} end={pg.end} onPage={pg.setPage} />}
          </>
        ) : (
          <DataList
            rows={filtered}
            rowKey={(idea) => idea.id}
            cols={IDEA_COLS}
            prefs={lp}
            cell={cell}
            onRowClick={(idea) => router.push(`/ideas/${idea.id}`)}
            onAddInGroup={(g) => { setEditing(null); setForm({ ...emptyForm(), status: g as IdeaStatus }); setPollAfter(false); setShowModal(true); }}
            selection={rs}
            groupBy={groupBy}
            groupOf={(idea) => idea.status}
            groups={GROUPS}
            editable={editable}
            rawValue={rawValue}
            onEdit={onInlineEdit}
          />
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
