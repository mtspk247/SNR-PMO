import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { Modal, Field } from '@/components/Modal';
import { Pill, Spinner, EmptyState, PageHeader, Avatar, Icon } from '@/components/ui';
import { createDeal, createContact, createCrmCompany, advanceDealStage, updateDeal, deleteDeal, deleteContact, getDealActivities, createActivity, deleteActivity } from '@/lib/db';
import { Deal, Contact, Company, CrmActivity } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useDeals, useContacts, useCrmCompanies } from '@/lib/queries';
import { qk } from '@/lib/queryKeys';
import { usePagination, Pagination } from '@/components/Pagination';

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
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

  const removeDeal = async (d: Deal) => {
    if (!confirm(`Delete deal "${d.title}"? This can't be undone.`)) return;
    setBusy(true);
    try { await deleteDeal(d.id); setDealsCache((p) => p.filter((x) => x.id !== d.id)); setSelectedId(null); setShowDetail(false); }
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

  // Contacts table pagination (deals are a pipeline board — pagination N/A).
  const cpg = usePagination(contacts, 25);

  // ----- shared detail panel: sidebar on xl+, overlay drawer below -----
  const DetailPanel = () => !selected ? (
    <div className="card p-5 text-sm text-muted2">Select a deal</div>
  ) : (
    <div className="card p-5 sticky top-0">
      <div className="flex items-center gap-2 mb-3">
        <Pill label={selected.stage} />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => router.push(`/crm/deal/${selected.id}`)} className="btn-ghost p-1.5 rounded text-muted hover:text-accentstrong" title="Open full page"><Icon name="ti-arrow-up-right" /></button>
          <button onClick={() => setEditDeal(selected)} className="btn-ghost p-1.5 rounded text-muted hover:text-content" title="Edit deal"><Icon name="ti-pencil" /></button>
          <button onClick={() => removeDeal(selected)} disabled={busy} className="btn-ghost p-1.5 rounded text-muted hover:text-rose-500" title="Delete deal"><Icon name="ti-trash" /></button>
          <button onClick={() => setShowDetail(false)} className="btn-ghost p-1.5 rounded text-muted hover:text-content xl:hidden" title="Close"><Icon name="ti-x" /></button>
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
          ['Stage', <Pill key="s" label={selected.stage} />],
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
          <select value={actKind} onChange={(e) => setActKind(e.target.value)} className="input w-24 py-1 text-xs">
            {ACT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
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
    <Layout title="CRM">
      <PageHeader title="CRM" subtitle={`${deals.length} deals · ${contacts.length} contacts`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-surface2 border border-line rounded-lg p-1"><Tab id="pipeline" label="Pipeline" /><Tab id="contacts" label="Contacts" /></div>
            {view === 'pipeline'
              ? <button onClick={() => setShowDeal(true)} className="btn btn-primary"><Icon name="ti-plus" />New deal</button>
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
          </div>

          <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-2 mb-1">
            {STAGES.map((s) => (
              <button key={s} onClick={() => toggleStage(s)}
                className={`shrink-0 h-7 px-2.5 rounded-full text-xs border transition ${stageFilter.has(s) ? 'bg-accent text-accentfg border-accent' : 'bg-surface text-muted border-line'}`}>
                {s}<span className="ml-1 text-2xs opacity-70">{deals.filter(d => d.stage === s).length}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <aside className="w-48 shrink-0 hidden lg:block">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Stage</p>
              <div className="space-y-1">
                {STAGES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                    <input type="checkbox" checked={stageFilter.has(s)} onChange={() => toggleStage(s)} className="accent-accentstrong" />
                    {s}<span className="ml-auto text-2xs text-muted2">{deals.filter(d => d.stage === s).length}</span>
                  </label>
                ))}
              </div>
            </aside>

            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No deals match" icon="ti-target" /> : filtered.map((d) => (
                <div key={d.id} onClick={() => selectDeal(d.id)}
                  className={`group w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line cursor-pointer transition ${selectedId === d.id ? 'bg-accent/5 border-l-2 border-l-accent' : 'hover:bg-surface2/60 border-l-2 border-l-transparent'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content truncate">{d.title}</p>
                    <p className="text-2xs text-muted truncate">{d.crm_companies?.name || '—'}</p>
                    <div className="h-1 rounded-full bg-surface2 mt-1.5 max-w-[160px] overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${((d.value || 0) / maxValue) * 100}%` }} />
                    </div>
                  </div>
                  <Pill label={d.stage} />
                  <span className="text-sm font-medium w-20 text-right">{money(d.value || 0)}</span>
                  <button onClick={(e) => { e.stopPropagation(); router.push(`/crm/deal/${d.id}`); }}
                    className="btn-ghost p-1 rounded text-muted2 hover:text-accentstrong opacity-0 group-hover:opacity-100 shrink-0" title="Open deal">
                    <Icon name="ti-arrow-up-right" />
                  </button>
                </div>
              ))}
            </div>

            <aside className="w-80 shrink-0 hidden xl:block overflow-y-auto">
              <DetailPanel />
            </aside>
          </div>
        </div>
      ) : (
        contacts.length === 0 ? <EmptyState text="No contacts yet" icon="ti-user" /> : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="th">Name</th><th className="th">Title</th><th className="th">Company</th>
                <th className="th">Status</th><th className="th">Email</th><th className="th w-10"></th>
              </tr></thead>
              <tbody>
                {cpg.pageItems.map((c) => (
                  <tr key={c.id} className="row group">
                    <td className="td">
                      <button onClick={() => router.push(`/crm/contact/${c.id}`)} className="flex items-center gap-2.5 text-left hover:text-accentstrong">
                        <Avatar name={c.full_name} size={28} /><span className="font-medium">{c.full_name}</span>
                      </button>
                    </td>
                    <td className="td text-2xs text-muted">{c.title || '—'}</td>
                    <td className="td text-sm">{c.crm_companies?.name || '—'}</td>
                    <td className="td">{c.status && <Pill label={c.status} />}</td>
                    <td className="td text-2xs text-sky-600">{c.email || '—'}</td>
                    <td className="td text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => router.push(`/crm/contact/${c.id}`)} className="text-muted2 hover:text-accentstrong" title="Open contact"><Icon name="ti-arrow-up-right" /></button>
                        <button onClick={() => removeContact(c)} disabled={busy} className="text-muted2 hover:text-rose-500" title="Delete contact"><Icon name="ti-trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <Pagination page={cpg.page} pageCount={cpg.pageCount} total={cpg.total} start={cpg.start} end={cpg.end} onPage={cpg.setPage} />
          </div>
        )
      )}

      {showDetail && selected && view === 'pipeline' && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-stretch justify-end xl:hidden" onClick={() => setShowDetail(false)}>
          <div className="bg-surface w-full max-w-sm h-full overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <DetailPanel />
          </div>
        </div>
      )}

      {showDeal && org && (
        <DealModal open={showDeal} companies={companies} contacts={contacts} busy={busy} onAddCompany={addCompany}
          onClose={() => setShowDeal(false)}
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
        <DealModal key={editDeal.id} open={!!editDeal} companies={companies} contacts={contacts} busy={busy} onAddCompany={addCompany}
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
          <select value={value} onChange={(e) => e.target.value === '__new' ? setAdding(true) : onChange(e.target.value)} className="input flex-1">
            <option value="">No company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new">+ New company…</option>
          </select>
        </div>
      )}
    </Field>
  );
}

type DealForm = { title: string; value: number; stage: string; company_id: string | null; contact_id: string | null; expected_close: string | null; notes: string | null };

function DealModal({ open, companies, contacts, busy, onAddCompany, onClose, onSubmit, initial, heading, submitLabel }:
  { open: boolean; companies: Company[]; contacts: Contact[]; busy: boolean; onAddCompany: (n: string) => Promise<Company | null>; onClose: () => void; onSubmit: (p: DealForm) => void; initial?: Partial<DealForm>; heading?: string; submitLabel?: string }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [value, setValue] = useState(initial?.value != null ? String(initial.value) : '');
  const [stage, setStage] = useState(initial?.stage ?? 'Lead');
  const [companyId, setCompanyId] = useState(initial?.company_id ?? '');
  const [contactId, setContactId] = useState(initial?.contact_id ?? '');
  const [close, setClose] = useState(initial?.expected_close ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const pickable = companyId ? contacts.filter((c) => !c.company_id || c.company_id === companyId) : contacts;
  const isEdit = !!heading;
  const submit = () => title.trim() && onSubmit({ title: title.trim(), value: parseFloat(value) || 0, stage, company_id: companyId || null, contact_id: contactId || null, expected_close: close || null, notes: notes.trim() || null });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={heading ?? 'New deal'}
      subtitle={isEdit ? 'Update deal details, stage and assignment.' : 'Add a deal to your pipeline.'}
      icon={isEdit ? 'ti-edit' : 'ti-target'}
      onSubmit={() => { if (!busy && title.trim()) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !title.trim()} className="btn btn-primary min-w-[7.5rem]">{busy ? 'Saving…' : (submitLabel ?? 'Create deal')}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Title" required hint="A short, recognizable name for this deal.">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Acme — annual license" className="input" />
        </Field>
        <div className="flex gap-3">
          <Field label="Value (USD)" className="flex-1">
            <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min="0" placeholder="0" className="input" />
          </Field>
          <Field label="Stage" className="flex-1">
            <select value={stage} onChange={(e) => setStage(e.target.value)} className="input">
              {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <CompanyField companies={companies} value={companyId} onChange={setCompanyId} onAddCompany={onAddCompany} />
        <Field label="Primary contact">
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="input">
            <option value="">None</option>
            {pickable.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.title ? ` · ${c.title}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Expected close">
          <input value={close} onChange={(e) => setClose(e.target.value)} type="date" className="input" />
        </Field>
        <Field label="Notes" hint="Optional — any extra context.">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="textarea h-20" placeholder="Optional" />
        </Field>
      </div>
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
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
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
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
              {['Lead', 'Active', 'Customer', 'Inactive'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <CompanyField companies={companies} value={companyId} onChange={setCompanyId} onAddCompany={onAddCompany} />
      </div>
    </Modal>
  );
}
