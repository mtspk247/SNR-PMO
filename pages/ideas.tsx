import { useMemo, useState } from 'react';
import Select from '@/components/Select';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, StatCard, Icon, Avatar } from '@/components/ui';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { ViewControls, useViewPrefs, buildGroups } from '@/components/ViewControls';
import { Modal, Field } from '@/components/Modal';
import { useIdeas } from '@/lib/queries';
import { createIdea, updateIdea, deleteIdea, setIdeaVote, convertIdeaToProject, IDEA_STATUSES, avatarSrc } from '@/lib/db';
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

// Per-status colour for the inline status dropdown (colored pill + dots).
const STATUS_HEX: Record<IdeaStatus, string> = {
  idea: '#9ca3af', exploring: '#0ea5e9', approved: '#8b5cf6', building: '#f59e0b', shipped: '#10b981', parked: '#f43f5e',
};

type FormState = { title: string; pitch: string; status: IdeaStatus };
const emptyForm = (): FormState => ({ title: '', pitch: '', status: 'idea' });

const IDEA_COLS: ColDef[] = [{ id: 'votes', label: 'Votes', width: 104 }, { id: 'title', label: 'Title', locked: true, width: 380 }, { id: 'status', label: 'Status', width: 150 }, { id: 'project', label: 'Project', width: 200 }, { id: 'by', label: 'By', width: 190 }, { id: 'created', label: 'Created', width: 120 }];

const GROUPS: GroupMeta[] = IDEA_STATUSES.map((st) => ({
  value: st,
  label: STATUS_LABEL[st],
  pill: STATUS_PILL[st] || 'pill-gray',
}));


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

  const setVote = async (idea: Idea, value: 1 | -1) => {
    if (!user || votingId) return;
    setVotingId(idea.id);
    try {
      await setIdeaVote(idea.id, user.id, value);
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

  // RBAC: only managers (owner/admin) inline-edit status; others see read-only colored pills.
  const editable: Record<string, EditSpec> | undefined = isAdmin ? {
    status: { type: 'select', options: IDEA_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_HEX[s] })) },
  } : undefined;

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
    const myVote = idea.votes?.find((v) => v.user_id === user?.id)?.value ?? 0;
    const ups = idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0;
    const downs = idea.votes?.filter((v) => v.value === -1).length ?? 0;
    const isVoting = votingId === idea.id;
    const isConverting = convertingId === idea.id;
    switch (id) {
      case 'votes':
        return (
          <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setVote(idea, 1)} disabled={isVoting || !user}
              className={`inline-flex flex-col items-center gap-0.5 px-1.5 py-1 rounded transition-colors disabled:opacity-50 ${myVote === 1 ? 'text-emerald-600 bg-emerald-500/10' : 'text-muted hover:text-content hover:bg-surface2'}`}
              title={myVote === 1 ? 'Remove your upvote' : 'Thumbs up'}>
              <Icon name={myVote === 1 ? 'ti-thumb-up-filled' : 'ti-thumb-up'} className="text-base leading-none" />
              <span className="text-2xs tabular-nums font-medium leading-none">{ups}</span>
            </button>
            <button onClick={() => setVote(idea, -1)} disabled={isVoting || !user}
              className={`inline-flex flex-col items-center gap-0.5 px-1.5 py-1 rounded transition-colors disabled:opacity-50 ${myVote === -1 ? 'text-rose-600 bg-rose-500/10' : 'text-muted hover:text-content hover:bg-surface2'}`}
              title={myVote === -1 ? 'Remove your downvote' : 'Thumbs down'}>
              <Icon name={myVote === -1 ? 'ti-thumb-down-filled' : 'ti-thumb-down'} className="text-base leading-none" />
              <span className="text-2xs tabular-nums font-medium leading-none">{downs}</span>
            </button>
          </span>
        );
      case 'title':
        return (
          <div className="min-w-0 max-w-[34rem]">
            <p className="font-medium text-content truncate">{idea.title}</p>
            {idea.pitch && <p className="text-2xs text-muted truncate mt-0.5">{idea.pitch}</p>}
          </div>
        );
      case 'status':
        return <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>;
      case 'project':
        return idea.project?.name ? (idea.project_id ? <Link href={`/projects/${idea.project_id}`} onClick={(e) => e.stopPropagation()} className="text-content hover:text-accentstrong truncate inline-block max-w-full align-middle">{idea.project.name}</Link> : <span className="truncate inline-block max-w-full align-middle">{idea.project.name}</span>) : '—';
      case 'by':
        return idea.creator?.full_name ? <span className="inline-flex items-center gap-1.5 min-w-0"><Avatar name={idea.creator.full_name} size={20} src={avatarSrc(idea.creator.avatar_url)} /><span className="truncate">{idea.creator.full_name}</span></span> : '—';
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
        const myVote = idea.votes?.find((v) => v.user_id === user?.id)?.value ?? 0;
        const ups = idea.votes?.filter((v) => (v.value ?? 1) === 1).length ?? 0;
        const downs = idea.votes?.filter((v) => v.value === -1).length ?? 0;
        return (
          <div key={idea.id} onClick={() => router.push(`/ideas/${idea.id}`)} className="card card-interactive p-4 cursor-pointer">
            <div className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setVote(idea, 1)} disabled={!user || votingId === idea.id}
                  className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded ${myVote === 1 ? 'text-emerald-600 bg-emerald-500/10' : 'text-muted hover:text-content hover:bg-surface2'}`}>
                  <Icon name={myVote === 1 ? 'ti-thumb-up-filled' : 'ti-thumb-up'} className="text-base leading-none" /><span className="text-2xs tabular-nums font-medium leading-none">{ups}</span>
                </button>
                <button onClick={() => setVote(idea, -1)} disabled={!user || votingId === idea.id}
                  className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded ${myVote === -1 ? 'text-rose-600 bg-rose-500/10' : 'text-muted hover:text-content hover:bg-surface2'}`}>
                  <Icon name={myVote === -1 ? 'ti-thumb-down-filled' : 'ti-thumb-down'} className="text-base leading-none" /><span className="text-2xs tabular-nums font-medium leading-none">{downs}</span>
                </button>
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/ideas/${idea.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-content truncate hover:text-accentstrong block">{idea.title}</Link>
                {idea.pitch && <p className="text-2xs text-muted mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{idea.pitch}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <span className={`pill ${STATUS_PILL[idea.status]}`}>{STATUS_LABEL[idea.status]}</span>
              {idea.project?.name && <span className="text-2xs text-muted2 truncate max-w-[8rem]">{idea.project.name}</span>}
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
            nameCol="title"
            prefs={lp}
            cell={cell}
            onRowClick={(idea) => router.push(`/ideas/${idea.id}`)}
            onAddInGroup={(g) => { setEditing(null); setForm({ ...emptyForm(), status: g as IdeaStatus }); setPollAfter(false); setShowModal(true); }}
            selection={rs}
            groupBy={vp.groupBy}
            groupOf={gKey}
            groups={vp.groupBy === 'status' ? GROUPS : buildGroups(filtered, gKey, gLabel).map((g) => ({ value: g.key, label: g.label }))}
            editable={editable}
            rawValue={rawValue}
            onEdit={onInlineEdit}
          />
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        dirty={editing
          ? (form.title !== editing.title || form.pitch !== (editing.pitch || '') || form.status !== editing.status)
          : (!!form.title.trim() || !!form.pitch.trim() || form.status !== 'idea')}
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
