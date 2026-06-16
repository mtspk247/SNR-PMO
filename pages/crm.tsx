import { useEffect, useMemo, useState } from 'react';
import Select from '@/components/Select';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Modal, Field, useModalTabs } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import { Pill, Spinner, EmptyState, PageHeader, Avatar, Icon, StatusBadge } from '@/components/ui';
import { createDeal, createContact, createCrmCompany, advanceDealStage, updateDeal, deleteDeal, deleteContact, getDealActivities, createActivity, deleteActivity, ensureTaskStatuses, TaskStatus } from '@/lib/db';
import StatusManager from '@/components/StatusManager';
import { Deal, Contact, Company, CrmActivity } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useDeals, useContacts, useCrmCompanies } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { usePagination, Pagination } from '@/components/Pagination';
import { ListToolbar, useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const CONTACT_COLS: ColDef[] = [{ id: 'name', label: 'Name', locked: true }, { id: 'title', label: 'Title' }, { id: 'company', label: 'Company' }, { id: 'status', label: 'Status' }, { id: 'email', label: 'Email' }];
const STAGE_RANK: Record<string, number> = { Lead: 1, Qualified: 2, Proposal: 3, Negotiation: 4, Won: 5, Lost: 0 };
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const ACT_KINDS = [
  { id: 'note', label: 'Note', icon: 'ti-note' },
  { id: 'call', label: 'Call', icon: 'ti-phone' },
  { id: 'email', label: 'Email', icon: 'ti-mail' },
  { id: 'meeting', label: 'Meeting', icon: 'ti-calendar' },
];
const actMeta = (k: string) => ACT_KINDS.find((x) => x.id === k) || { id: k, label: k, icon: 'ti-point' };
const actWhen = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function CRM() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<'pipeline' | 'contacts'>('pipeline');
  const { data: deals = [], isLoading: dealsLoading } = useDeals();
  const { data: contacts = [], isLoading: contactsLoading } = useContacts();
  const { data: companies = [], isLoading: companiesLoading } = useCrmCompanies();
  const loading = dealsLoading || contactsLoading || companiesLoading;

  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [newDealStage, setNewDealStage] = useState('');
  const [pipeView, setPipeView] = useState<'list' | 'board'>('list');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [sort, setSort] = useState<'value' | 'stage' | 'close'>('value');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [showDeal, setShowDeal] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);

  // activity log for the selected deal
  const [acts, setActs] = useState<CrmActivity[]>([]);
  const [actsLoading, setActsLoading] = useState(false);
  const [actKind, setActKind] = useState('note');
  const [actBody, setActBody] = useState('');
  const [actBusy, setActBusy] = useState(false);
  // Custom, editable deal stages (scope='crm_deal') — like Tasks/Projects statuses.
  const [dstatuses, setDstatuses] = useState<TaskStatus[]>([]);
  const [statusMgr, setStatusMgr] = useState(false);
  useEffect(() => { if (org?.id) ensureTaskStatuses(org.id, 'crm_deal').then(setDstatuses).catch(() => {}); }, [org?.id]);
  const reloadStages = () => { if (org?.id) ensureTaskStatuses(org.id, 'crm_deal').then(setDstatuses).catch(() => {}); };
  const sColor = (n: string) => dstatuses.find((x) => x.name === n)?.color;
  const stageNames = dstatuses.length ? dstatuses.map((x) => x.name) : STAGES;

  // Patch RQ caches in place with the authoritative rows db.ts returns —
  // same data flow as the old local setState, no extra refetch round-trip.
  const setDealsCache = (fn: (prev: Deal[]) => Deal[]) =>
    qc.setQueryData<Deal[]>(qk.deals(org?.id), (prev) => fn(prev ?? []));
  const setContactsCache = (fn: (prev: Contact[]) => Contact[]) =>
    qc.setQueryData<Contact[]>(qk.contacts(org?.id), (prev) => fn(prev ?? []));
  const setCompaniesCache = (fn: (prev: Company[]) => Company[]) =>
    qc.setQueryData<Company[]>(qk.crmCompanies(org?.id), (prev) => fn(prev ?? []));

  // Create a CRM company on the fly (used by the deal/contact pickers).
  const addCompany = async (name: string): Promise<Company | null> => {
    if (!org) return null;
    const c = await createCrmCompany({ name, org_id: org.id, owner_id: me?.id });
    setCompaniesCache((p) => [...p, c].sort((a, b) => a.name.localeCompare(b.name)));
    return c;
  };

  const advance = async (d: Deal) => {
    if (d.stage === 'Won' || d.stage === 'Lost') return;
    setBusy(true);
    try { const r = await advanceDealStage(d.id, d.stage); setDealsCache((p) => p.map((x) => (x.id === r.id ? r : x))); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const removeContact = async (c: Contact) => {
    if (!confirm(`Delete contact "${c.full_name}"?`)) return;
    setBusy(true);
    try { await deleteContact(c.id); setContactsCache((p) => p.filter((x) => x.id !== c.id)); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!selectedId) { setActs([]); return; }
    setActsLoading(true);
    getDealActivities(selectedId).then(setActs).catch(() => setActs([])).finally(() => setActsLoading(false));
  }, [selectedId]);

  const logActivity = async () => {
    if (!org || !selectedId || !actBody.trim()) return;
    setActBusy(true);
    try {
      const a = await createActivity({ org_id: org.id, deal_id: selectedId, kind: actKind, body: actBody.trim(), created_by: me?.id });
      setActs((p) => [a, ...p]); setActBody('');
    } catch (e: any) { alert(e.message); } finally { setActBusy(false); }
  };
  const removeActivity = async (id: string) => {
    try { await deleteActivity(id); setActs((p) => p.filter((x) => x.id !== id)); }
    catch (e: any) { alert(e.message); }
  };

  const openDeals = deals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost');
  const pipelineValue = openDeals.reduce((a, d) => a + (d.value || 0), 0);
  const wonValue = deals.filter((d) => d.stage === 'Won').reduce((a, d) => a + (d.value || 0), 0);

  const toggleStage = (s: string) => setStageFilter((prev) => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });

  const filtered = useMemo(() => {
    let r = deals.filter((d) =>
      (!query || d.title.toLowerCase().includes(query.toLowerCase()) || (d.crm_companies?.name || '').toLowerCase().includes(query.toLowerCase())) &&
      (stageFilter.size === 0 || stageFilter.has(d.stage)));
    r = [...r].sort((a, b) =>
      sort === 'close' ? (a.expected_close || '9999').localeCompare(b.expected_close || '9999') :
      sort === 'stage' ? (STAGE_RANK[b.stage] || 0) - (STAGE_RANK[a.stage] || 0) :
      (b.value || 0) - (a.value || 0));
    return r;
  }, [deals, query, stageFilter, sort]);

  useEffect(() => { if (!selectedId && filtered.length) setSelectedId(filtered[0].id); }, [filtered, selectedId]);
  const selected = filtered.find((d) => d.id === selectedId) || null;
  const maxValue = Math.max(1, ...deals.map((d) => d.value || 0));
  const selectDeal = (id: string) => { setSelectedId(id); setShowDetail(true); };

  // Contacts: search + status filter + customizable columns (deals are a pipeline board).
  const clp = useListPrefs(`snr-crm-contacts-view-${me?.id || 'anon'}`, CONTACT_COLS);
  const CONTACT_FILTERS: FilterDef[] = useMemo(() => {
    const sts = Array.from(new Set(contacts.map((c) => c.status).filter(Boolean))) as string[];
    return [{ id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...sts.map((x) => ({ value: x, label: x }))] }];
  }, [contacts]);
  const contactsFiltered = useMemo(() => {
    const term = clp.query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (term && !(`${c.full_name || ''} ${c.email || ''} ${c.title || ''} ${c.crm_companies?.name || ''}`.toLowerCase().includes(term))) return false;
      if (clp.filters.status && clp.filters.status !== 'all' && c.status !== clp.filters.status) return false;
      return true;
    });
  }, [contacts, clp.query, clp.filters]);
  const cpg = usePagination(contactsFiltered, 25);

  // ----- shared detail panel: sidebar on xl+, overlay drawer below -----
  const moveDealStage = (id: string, stage: string) => {
    setDealsCache((p) => p.map((x) => (x.id === id ? { ...x, stage } : x)));
    updateDeal(id, { stage }).then((r) => setDealsCache((p) => p.map((x) => (x.id === r.id ? r : x)))).catch((e: any) => alert(e.message));
  };

  const BoardView = () => (
    <div className="flex-1 min-w-0 overflow-x-auto pb-2">
      <div className="flex gap-3 h-full">
        {stageNames.map((stage) => {
          const items = filtered.filter((d) => d.stage === stage);
          return (
            <div key={stage} onDragOver={(e) => { e.preventDefault(); setDragOverCol(stage); }} onDragLeave={() => setDragOverCol((c) => (c === stage ? null : c))}
              onDrop={() => { if (dragId) { const d = deals.find((x) => x.id === dragId); if (d && d.stage !== stage) moveDealStage(dragId, stage); } setDragId(null); setDragOverCol(null); }}
              className={`w-72 shrink-0 flex flex-col min-h-0 rounded p-1 transition ${dragOverCol === stage ? 'ring-2 ring-inset ring-accent/50 bg-accent/5' : ''}`}>
              <div className="flex items-center gap-2 px-2 py-2">
                <StatusBadge status={stage} color={sColor(stage)} />
                <span className="text-2xs text-muted2">{items.length}</span>
                <span className="ml-auto text-2xs font-medium tabular-nums text-content">{money(items.reduce((a, d) => a + (d.value || 0), 0))}</span>
                <button onClick={() => { setNewDealStage(stage); setShowDeal(true); }} className="btn-ghost p-1 rounded text-muted2 hover:text-accentstrong" title="Add deal"><Icon name="ti-plus" className="text-sm" /></button>
              </div>
              <div className="space-y-2 overflow-y-auto px-1 pb-2">
                {items.map((d) => (
                  <div key={d.id} draggable onDragStart={() => setDragId(d.id)} onDragEnd={() => { setDragId(null); setDragOverCol(null); }} onClick={() => selectDeal(d.id)}
                    className={`card card-interactive w-full text-left p-3 cursor-grab active:cursor-grabbing ${selectedId === d.id ? 'border-accent' : ''} ${dragId === d.id ? 'opacity-95 shadow-lg ring-2 ring-accent/50 scale-[1.03] rotate-1' : ''}`}>
                    <p className="text-sm font-medium text-content truncate">{d.title}</p>
                    <p className="text-2xs text-muted truncate">{d.crm_companies?.name || '—'}</p>
                    <p className="text-sm font-semibold mt-1.5 tabular-nums">{money(d.value || 0)}</p>
                  </div>
                ))}
                {items.length === 0 && <p className="text-2xs text-muted2 px-2 py-3 text-center">No deals</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const DetailPanel = () => !selected ? (
    <div className="p-5 text-sm text-muted2">Select a deal</div>
  ) : (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <StatusBadge status={selected.stage} color={sColor(selected.stage)} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => router.push(`/crm/deal/${selected.id}`)} className="btn-ghost p-1.5 rounded text-muted hover:text-accentstrong" title="Open full page"><Icon name="ti-arrow-up-right" /></button>
          <button onClick={() => setEditDeal(selected)} className="btn-ghost p-1.5 rounded text-muted hover:text-content" title="Edit deal"><Icon name="ti-pencil" /></button>
          <ConfirmDelete entityType="deal" id={selected.id} name={selected.title} iconOnly className="btn-ghost p-1.5 rounded text-muted hover:text-rose-500" onDeleted={() => { setDealsCache((p) => p.filter((x) => x.id !== selected.id)); setSelectedId(null); setShowDetail(false); }} />
          <button onClick={() => setShowDetail(false)} className="btn-ghost p-1.5 rounded text-muted hover:text-content" title="Close"><Icon name="ti-x" /></button>
        </div>
      </div>
      <h3 className="text-base font-semibold leading-snug">{selected.title}</h3>
      <p className="text-2xl font-semibold mt-1">{money(selected.value || 0)}</p>
      <div className="flex gap-2 mt-4">
        <button onClick={() => advance(selected)} disabled={busy || selected.stage === 'Won' || selected.stage === 'Lost'}
          className="btn btn-primary flex-1 text-xs">
          {selected.stage === 'Won' ? 'Won' : selected.stage === 'Lost' ? 'Closed lost' : 'Advance stage'}
        </button>
      </div>
      <dl className="mt-5 space-y-3">
        {[
          ['Stage', <StatusBadge key="s" status={selected.stage} />],
          ['Company', selected.crm_companies?.name || '—'],
          ['Contact', selected.crm_contacts?.full_name || '—'],
          ['Expected close', selected.expected_close || '—'],
        ].map(([k, v], i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <dt className="text-muted">{k as string}</dt><dd className="font-medium">{v as any}</dd>
          </div>
        ))}
      </dl>
      {selected.crm_contacts?.email && (
        <div className="mt-5 pt-4 border-t border-line">
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Primary contact</p>
          <div className="flex items-center gap-2">
            <Avatar name={selected.crm_contacts.full_name} size={28} />
            <div className="min-w-0">
              <p className="text-sm truncate">{selected.crm_contacts.full_name}</p>
              <p className="text-2xs text-sky-600 truncate">{selected.crm_contacts.email}</p>
            </div>
          </div>
        </div>
      )}
      {selected.notes && (
        <div className="mt-5 pt-4 border-t border-line">
          <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Notes</p>
          <p className="text-sm text-contentsoft leading-relaxed">{selected.notes}</p>
        </div>
      )}
      <div className="mt-5 pt-4 border-t border-line">
        <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Activity</p>
        <div className="flex gap-2 mb-3">
          <div className="w-24"><Select value={actKind} onChange={(v) => setActKind(v)} options={[...ACT_KINDS.map((k) => ({ value: k.id, label: k.label }))]} /></div>
          <input value={actBody} onChange={(e) => setActBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && logActivity()}
            placeholder="Log an activity…" className="input flex-1 py-1 text-xs" />
          <button onClick={logActivity} disabled={actBusy || !actBody.trim()} className="btn btn-sm" title="Log">
            <Icon name="ti-plus" />
          </button>
        </div>
        {actsLoading ? <p className="text-2xs text-muted2">Loading…</p>
          : acts.length === 0 ? <p className="text-2xs text-muted2">No activity yet.</p> : (
          <ul className="space-y-3 max-h-72 overflow-y-auto">
            {acts.map((a) => (
              <li key={a.id} className="flex gap-2.5 group">
                <span className="w-6 h-6 rounded-full bg-surface2 grid place-items-center text-muted shrink-0 mt-0.5"><Icon name={actMeta(a.kind).icon} className="text-xs" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-content leading-snug break-words">{a.body}</p>
                  <p className="text-2xs text-muted2">{actMeta(a.kind).label} · {actWhen(a.created_at)}</p>
                </div>
                <button onClick={() => removeActivity(a.id)} className="text-muted2 hover:text-rose-500 opacity-0 group-hover:opacity-100 shrink-0" title="Delete"><Icon name="ti-trash" className="text-xs" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const Tab = ({ id, label }: { id: 'pipeline' | 'contacts'; label: string }) => (
    <button onClick={() => setView(id)}
      className={`px-3 h-8 rounded-md text-sm font-medium transition ${view === id ? 'bg-surface border border-line text-content' : 'text-muted hover:text-content'}`}>{label}</button>
  );

  const Summary = ({ icon, tone, label, value, sub }:
    { icon: string; tone: string; label: string; value: string; sub: string }) => (
    <div className="stat flex-1">
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-md grid place-items-center ${tone}`}><Icon name={icon} className="text-sm" /></span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold mt-2">{value}</p>
      <p className="text-2xs text-muted2 mt-0.5">{sub}</p>
    </div>
  );

  return (
    <Layout flat title="CRM">
      <PageHeader title="CRM" subtitle={`${deals.length} deals · ${contacts.length} contacts`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-surface2 border border-line rounded-lg p-1"><Tab id="pipeline" label="Pipeline" /><Tab id="contacts" label="Contacts" /></div>
            {view === 'pipeline'
              ? <><button onClick={() => setStatusMgr(true)} className="btn"><Icon name="ti-flag-3" className="text-sm" />Stages</button><button onClick={() => { setNewDealStage(''); setShowDeal(true); }} className="btn btn-primary"><Icon name="ti-plus" />New deal</button></>
              : <button onClick={() => setShowContact(true)} className="btn btn-primary"><Icon name="ti-plus" />New contact</button>}
          </div>
        } />

      {loading ? <Spinner /> : view === 'pipeline' ? (
        <div className="flex flex-col h-full">
          <div className="flex gap-3 mb-4">
            <Summary icon="ti-target" tone="bg-sky-500/10 text-sky-600" label="Open pipeline" value={money(pipelineValue)} sub={`${openDeals.length} active deals`} />
            <Summary icon="ti-trophy" tone="bg-emerald-500/10 text-emerald-600" label="Won" value={money(wonValue)} sub={`${deals.filter(d => d.stage === 'Won').length} closed won`} />
            <Summary icon="ti-chart-pie" tone="bg-violet-500/10 text-violet-600" label="Avg deal" value={money(deals.length ? Math.round(deals.reduce((a, d) => a + (d.value || 0), 0) / deals.length) : 0)} sub="across all stages" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-surface flex-1 max-w-xs">
              <Icon name="ti-search" className="text-muted2" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals or companies"
                className="bg-transparent outline-none text-sm w-full text-content placeholder:text-muted2" />
            </div>
            <span className="text-2xs text-muted2 ml-2">Sort</span>
            {(['value', 'stage', 'close'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={`h-8 px-2.5 rounded-md text-xs capitalize ${sort === s ? 'bg-surface border border-line text-content' : 'text-muted'}`}>{s}</button>
            ))}
            <div className="flex items-center rounded-md border border-line overflow-hidden h-8 shrink-0 ml-auto">
              {(['list', 'board'] as const).map((v) => (
                <button key={v} onClick={() => setPipeView(v)} className={`h-full px-3 text-xs capitalize inline-flex items-center gap-1.5 transition ${pipeView === v ? 'bg-surface2 text-content font-medium' : 'text-muted hover:text-content'}`}><Icon name={v === 'list' ? 'ti-list' : 'ti-layout-board'} className="text-sm" />{v}</button>
              ))}
            </div>
          </div>

          {pipeView === 'board' ? <BoardView /> : (
            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No deals match" icon="ti-target" /> : stageNames.map((stage) => {
                const items = filtered.filter((d) => d.stage === stage);
                if (items.length === 0) return null;
                const collapsed = collapsedStages.has(stage);
                const total = items.reduce((a, d) => a + (d.value || 0), 0);
                return (
                  <div key={stage} className="mt-2 first:mt-0">
                    <div className="sticky top-0 z-10 px-4 py-2.5 bg-surface2 border-y border-line flex items-center gap-2.5">
                      <button onClick={() => setCollapsedStages((pr) => { const n = new Set(pr); n.has(stage) ? n.delete(stage) : n.add(stage); return n; })} className="text-muted2 hover:text-content"><Icon name={collapsed ? 'ti-chevron-right' : 'ti-chevron-down'} className="text-sm" /></button>
                      <StatusBadge status={stage} color={sColor(stage)} />
                      <span className="text-2xs text-muted2">{items.length}</span>
                      <span className="ml-auto text-xs font-semibold tabular-nums text-content">{money(total)}</span>
                      <button onClick={() => { setNewDealStage(stage); setShowDeal(true); }} className="btn-ghost p-1 rounded text-muted2 hover:text-accentstrong" title={`Add deal to ${stage}`}><Icon name="ti-plus" /></button>
                    </div>
                    {!collapsed && items.map((d) => (
                      <div key={d.id} onClick={() => selectDeal(d.id)}
                        className={`group w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line cursor-pointer transition ${selectedId === d.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2/60 border-l-2 border-l-transparent'}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-content truncate">{d.title}</p>
                          <p className="text-2xs text-muted truncate">{d.crm_companies?.name || '—'}</p>
                          <div className="h-1 rounded-full bg-surface2 mt-1.5 max-w-[160px] overflow-hidden"><div className="h-full rounded-full bg-accent" style={{ width: `${((d.value || 0) / maxValue) * 100}%` }} /></div>
                        </div>
                        <span className="text-sm font-medium w-20 text-right">{money(d.value || 0)}</span>
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/crm/deal/${d.id}`); }} className="btn-ghost p-1 rounded text-muted2 hover:text-accentstrong opacity-0 group-hover:opacity-100 shrink-0" title="Open deal"><Icon name="ti-arrow-up-right" /></button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        contacts.length === 0 ? <EmptyState text="No contacts yet" icon="ti-user" /> : (
          <>
            <ListToolbar prefs={clp} cols={CONTACT_COLS} filters={CONTACT_FILTERS} placeholder="Search contacts…" />
            {contactsFiltered.length === 0 ? <EmptyState text="No contacts match" icon="ti-user" /> : (
            <div className="bg-surface overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr>
                  {clp.ordered.map((id) => <th key={id} className="th">{CONTACT_COLS.find((c) => c.id === id)?.label}</th>)}
                  <th className="th w-10"></th>
                </tr></thead>
                <tbody>
                  {cpg.pageItems.map((c) => {
                    const cell = (id: string) => {
                      switch (id) {
                        case 'name': return <button onClick={() => router.push(`/crm/contact/${c.id}`)} className="flex items-center gap-2.5 text-left hover:text-accentstrong"><Avatar name={c.full_name} size={28} /><span className="font-medium">{c.full_name}</span></button>;
                        case 'title': return <span className="text-2xs text-muted">{c.title || '—'}</span>;
                        case 'company': return <span className="text-sm">{c.crm_companies?.name || '—'}</span>;
                        case 'status': return c.status ? <Pill label={c.status} /> : null;
                        case 'email': return <span className="text-2xs text-sky-600">{c.email || '—'}</span>;
                        default: return null;
                      }
                    };
                    return (
                      <tr key={c.id} className="row group">
                        {clp.ordered.map((id) => <td key={id} className="td">{cell(id)}</td>)}
                        <td className="td text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => router.push(`/crm/contact/${c.id}`)} className="text-muted2 hover:text-accentstrong" title="Open contact"><Icon name="ti-arrow-up-right" /></button>
                            <button onClick={() => removeContact(c)} disabled={busy} className="text-muted2 hover:text-rose-500" title="Delete contact"><Icon name="ti-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <Pagination page={cpg.page} pageCount={cpg.pageCount} total={cpg.total} start={cpg.start} end={cpg.end} onPage={cpg.setPage} />
            </div>
            )}
          </>
        )
      )}

      {showDetail && selected && view === 'pipeline' && (
        <div className="modal-backdrop fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 sm:p-6 overflow-y-auto" onClick={() => setShowDetail(false)}>
          <div className="modal-card w-full max-w-2xl my-2 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {DetailPanel()}
          </div>
        </div>
      )}

      {org && <StatusManager open={statusMgr} onClose={() => setStatusMgr(false)} orgId={org.id} scope="crm_deal" statuses={dstatuses} onChanged={reloadStages} />}

      {showDeal && org && (
        <DealModal open={showDeal} companies={companies} contacts={contacts} busy={busy} stages={stageNames} initial={newDealStage ? { stage: newDealStage } : undefined} onAddCompany={addCompany}
          onClose={() => { setShowDeal(false); setNewDealStage(''); }}
          onSubmit={async (p) => {
            setBusy(true);
            try {
              const d = await createDeal({ ...p, org_id: org.id, owner_id: me?.id });
              setDealsCache((prev) => [d, ...prev]); setSelectedId(d.id); setShowDeal(false); setView('pipeline');
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}

      {showContact && org && (
        <ContactModal open={showContact} companies={companies} busy={busy} onAddCompany={addCompany}
          onClose={() => setShowContact(false)}
          onSubmit={async (p) => {
            setBusy(true);
            try {
              const c = await createContact({ ...p, org_id: org.id, owner_id: me?.id });
              setContactsCache((prev) => [...prev, c].sort((a, b) => a.full_name.localeCompare(b.full_name)));
              setShowContact(false); setView('contacts');
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}

      {editDeal && org && (
        <DealModal key={editDeal.id} open={!!editDeal} companies={companies} contacts={contacts} busy={busy} stages={stageNames} onAddCompany={addCompany}
          heading="Edit deal" submitLabel="Save changes"
          initial={{ title: editDeal.title, value: editDeal.value ?? 0, stage: editDeal.stage, company_id: editDeal.company_id, contact_id: editDeal.contact_id, expected_close: editDeal.expected_close, notes: editDeal.notes ?? null }}
          onClose={() => setEditDeal(null)}
          onSubmit={async (p) => {
            setBusy(true);
            try {
              const d = await updateDeal(editDeal.id, p);
              setDealsCache((prev) => prev.map((x) => (x.id === d.id ? d : x))); setSelectedId(d.id); setEditDeal(null);
            } catch (e: any) { alert(e.message); } finally { setBusy(false); }
          }} />
      )}
    </Layout>
  );
}

// Company picker with inline "add new" — shared by deal + contact modals.
function CompanyField({ companies, value, onChange, onAddCompany }:
  { companies: Company[]; value: string; onChange: (id: string) => void; onAddCompany: (name: string) => Promise<Company | null> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return; setBusy(true);
    try { const c = await onAddCompany(name.trim()); if (c) { onChange(c.id); setAdding(false); setName(''); } }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <Field label="Company">
      {adding ? (
        <div className="flex gap-2">
          <input autoFocus value={name} disabled={busy} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="New company name" className="input flex-1" />
          <button onClick={save} disabled={busy || !name.trim()} className="btn btn-sm">Save</button>
          <button onClick={() => { setAdding(false); setName(''); }} className="btn btn-sm">✕</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Select value={value} onChange={(v) => v === '__new' ? setAdding(true) : onChange(v)} options={[{ value: '', label: 'No company' }, ...companies.map((c) => ({ value: c.id, label: c.name })), { value: '__new', label: '+ New company…' }]} />
        </div>
      )}
    </Field>
  );
}

type DealForm = { title: string; value: number; stage: string; company_id: string | null; contact_id: string | null; expected_close: string | null; notes: string | null };

function DealModal({ open, companies, contacts, busy, stages, onAddCompany, onClose, onSubmit, initial, heading, submitLabel }:
  { open: boolean; companies: Company[]; contacts: Contact[]; busy: boolean; stages: string[]; onAddCompany: (n: string) => Promise<Company | null>; onClose: () => void; onSubmit: (p: DealForm) => void; initial?: Partial<DealForm>; heading?: string; submitLabel?: string }) {
  const tabs = useModalTabs('details');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [value, setValue] = useState(initial?.value != null ? String(initial.value) : '');
  const [stage, setStage] = useState(initial?.stage ?? 'Lead');
  const [companyId, setCompanyId] = useState(initial?.company_id ?? '');
  const [contactId, setContactId] = useState(initial?.contact_id ?? '');
  const [close, setClose] = useState(initial?.expected_close ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const pickable = companyId ? contacts.filter((c) => !c.company_id || c.company_id === companyId) : contacts;
  const isEdit = !!heading;
  const submit = () => {
    if (!title.trim()) { tabs.setTab('details'); return; }
    onSubmit({ title: title.trim(), value: parseFloat(value) || 0, stage, company_id: companyId || null, contact_id: contactId || null, expected_close: close || null, notes: notes.trim() || null });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading ?? 'New deal'}
      subtitle={isEdit ? 'Update deal details, stage and assignment.' : 'Add a deal to your pipeline.'}
      icon={isEdit ? 'ti-edit' : 'ti-target'}
      tabs={[
        { key: 'details', label: 'Details', icon: 'ti-target' },
        { key: 'relations', label: 'Relations', icon: 'ti-link' },
      ]}
      {...tabs.bind}
      onSubmit={() => { if (!busy) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !title.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : (submitLabel ?? 'Create deal')}</button>
        </>
      }
    >
      {tabs.tab === 'details' && (
        <div className="space-y-3.5">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal name"
            className="w-full text-lg font-semibold bg-transparent outline-none text-content placeholder:text-muted2 px-0 pb-1" />
          <div className="flex gap-3">
            <Field label="Value (USD)" className="flex-1">
              <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" placeholder="0" className="input" />
            </Field>
            <Field label="Stage" className="flex-1">
              <Select value={stage} onChange={(v) => setStage(v)} options={[...stages.map((s) => ({ value: s, label: s }))]} />
            </Field>
          </div>
          <Field label="Expected close">
            <input value={close} onChange={(e) => setClose(e.target.value)} type="date" className="input" />
          </Field>
          <Field label="Notes" hint="Optional — any extra context.">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="textarea h-20" placeholder="Optional" />
          </Field>
        </div>
      )}
      {tabs.tab === 'relations' && (
        <div className="space-y-3.5">
          <CompanyField companies={companies} value={companyId} onChange={setCompanyId} onAddCompany={onAddCompany} />
          <Field label="Primary contact">
            <Select value={contactId} onChange={(v) => setContactId(v)} options={[{ value: '', label: 'None' }, ...pickable.map((c) => ({ value: c.id, label: `${c.full_name}${c.title ? ` · ${c.title}` : ''}` }))]} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

type ContactForm = { full_name: string; email: string | null; phone: string | null; title: string | null; company_id: string | null; status: string };

function ContactModal({ open, companies, busy, onAddCompany, onClose, onSubmit }:
  { open: boolean; companies: Company[]; busy: boolean; onAddCompany: (n: string) => Promise<Company | null>; onClose: () => void; onSubmit: (p: ContactForm) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [status, setStatus] = useState('Lead');
  const submit = () => fullName.trim() && onSubmit({ full_name: fullName.trim(), email: email.trim() || null, phone: phone.trim() || null, title: title.trim() || null, company_id: companyId || null, status });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New contact"
      subtitle="Add a person and link them to a company."
      icon="ti-user-plus"
      onSubmit={() => { if (!busy && fullName.trim()) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !fullName.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : 'Create contact'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Full name" required hint="e.g. Jane Doe">
          <input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" className="input" />
        </Field>
        <div className="flex gap-3">
          <Field label="Email" className="flex-1">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="jane@acme.com" className="input" />
          </Field>
          <Field label="Phone" className="flex-1">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" className="input" />
          </Field>
        </div>
        <div className="flex gap-3">
          <Field label="Title" className="flex-1">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. VP Sales" className="input" />
          </Field>
          <Field label="Status" className="flex-1">
            <Select value={status} onChange={(v) => setStatus(v)} options={[...['Lead', 'Active', 'Customer', 'Inactive'].map((s) => ({ value: s, label: s }))]} />
          </Field>
        </div>
        <CompanyField companies={companies} value={companyId} onChange={setCompanyId} onAddCompany={onAddCompany} />
      </div>
    </Modal>
  );
}
