import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { Pill, Spinner, EmptyState, PageHeader, Avatar, Icon } from '@/components/ui';
import { getDeals, getContacts } from '@/lib/db';
import { Deal, Contact } from '@/lib/supabase';

const STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const STAGE_RANK: Record<string, number> = { Lead: 1, Qualified: 2, Proposal: 3, Negotiation: 4, Won: 5, Lost: 0 };
const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function CRM() {
  const [view, setView] = useState<'pipeline' | 'contacts'>('pipeline');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<'value' | 'stage' | 'close'>('value');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getDeals(), getContacts()])
      .then(([d, c]) => { setDeals(d); setContacts(c); })
      .finally(() => setLoading(false));
  }, []);

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

  const Tab = ({ id, label }: { id: 'pipeline' | 'contacts'; label: string }) => (
    <button onClick={() => setView(id)}
      className={`px-3 h-8 rounded-md text-sm font-medium transition ${view === id ? 'bg-white border border-line text-ink' : 'text-neutral-500 hover:text-ink'}`}>{label}</button>
  );

  const Summary = ({ icon, tone, label, value, sub }:
    { icon: string; tone: string; label: string; value: string; sub: string }) => (
    <div className="stat flex-1">
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-md grid place-items-center ${tone}`}><Icon name={icon} className="text-sm" /></span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-lg font-semibold mt-2">{value}</p>
      <p className="text-2xs text-neutral-400 mt-0.5">{sub}</p>
    </div>
  );

  return (
    <Layout title="CRM">
      <PageHeader title="CRM" subtitle={`${deals.length} deals · ${contacts.length} contacts`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-paper border border-line rounded-lg p-1"><Tab id="pipeline" label="Pipeline" /><Tab id="contacts" label="Contacts" /></div>
            <button className="btn btn-primary"><Icon name="ti-plus" />New deal</button>
          </div>
        } />

      {loading ? <Spinner /> : view === 'pipeline' ? (
        <div className="flex flex-col h-full">
          <div className="flex gap-3 mb-4">
            <Summary icon="ti-target" tone="bg-sky-50 text-sky-600" label="Open pipeline" value={money(pipelineValue)} sub={`${openDeals.length} active deals`} />
            <Summary icon="ti-trophy" tone="bg-emerald-50 text-emerald-600" label="Won" value={money(wonValue)} sub={`${deals.filter(d => d.stage === 'Won').length} closed won`} />
            <Summary icon="ti-chart-pie" tone="bg-violet-50 text-violet-600" label="Avg deal" value={money(deals.length ? Math.round(deals.reduce((a, d) => a + (d.value || 0), 0) / deals.length) : 0)} sub="across all stages" />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line bg-white flex-1 max-w-xs">
              <Icon name="ti-search" className="text-neutral-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search deals or companies"
                className="bg-transparent outline-none text-sm w-full" />
            </div>
            <span className="text-2xs text-neutral-400 ml-2">Sort</span>
            {(['value', 'stage', 'close'] as const).map((s) => (
              <button key={s} onClick={() => setSort(s)}
                className={`h-8 px-2.5 rounded-md text-xs capitalize ${sort === s ? 'bg-white border border-line text-ink' : 'text-neutral-500'}`}>{s}</button>
            ))}
          </div>

          <div className="flex gap-4 flex-1 min-h-0">
            <aside className="w-48 shrink-0 hidden lg:block">
              <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Stage</p>
              <div className="space-y-1">
                {STAGES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer">
                    <input type="checkbox" checked={stageFilter.has(s)} onChange={() => toggleStage(s)} className="accent-ink" />
                    {s}<span className="ml-auto text-2xs text-neutral-400">{deals.filter(d => d.stage === s).length}</span>
                  </label>
                ))}
              </div>
            </aside>

            <div className="card flex-1 min-w-0 overflow-y-auto">
              {filtered.length === 0 ? <EmptyState text="No deals match" icon="ti-target" /> : filtered.map((d) => (
                <button key={d.id} onClick={() => setSelectedId(d.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-line transition ${selectedId === d.id ? 'bg-sky-50/60 border-l-2 border-l-sky-500' : 'hover:bg-paper/70 border-l-2 border-l-transparent'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{d.title}</p>
                    <p className="text-2xs text-neutral-500 truncate">{d.crm_companies?.name || '—'}</p>
                    <div className="h-1 rounded-full bg-neutral-100 mt-1.5 max-w-[160px] overflow-hidden">
                      <div className="h-full rounded-full bg-ink/70" style={{ width: `${((d.value || 0) / maxValue) * 100}%` }} />
                    </div>
                  </div>
                  <Pill label={d.stage} />
                  <span className="text-sm font-medium w-20 text-right">{money(d.value || 0)}</span>
                </button>
              ))}
            </div>

            <aside className="w-80 shrink-0 hidden xl:block">
              {selected ? (
                <div className="card p-5 sticky top-0">
                  <div className="flex items-center gap-2 mb-3">
                    <Pill label={selected.stage} />
                    <button className="btn-ghost ml-auto p-1.5 rounded text-neutral-400"><Icon name="ti-dots" /></button>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{selected.title}</h3>
                  <p className="text-2xl font-semibold mt-1">{money(selected.value || 0)}</p>
                  <div className="flex gap-2 mt-4">
                    <button className="btn flex-1 text-xs">Advance stage</button>
                    <button className="btn flex-1 text-xs">Log activity</button>
                  </div>
                  <dl className="mt-5 space-y-3">
                    {[
                      ['Stage', <Pill key="s" label={selected.stage} />],
                      ['Company', selected.crm_companies?.name || '—'],
                      ['Contact', selected.crm_contacts?.full_name || '—'],
                      ['Expected close', selected.expected_close || '—'],
                    ].map(([k, v], i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <dt className="text-neutral-500">{k as string}</dt><dd className="font-medium">{v as any}</dd>
                      </div>
                    ))}
                  </dl>
                  {selected.crm_contacts?.email && (
                    <div className="mt-5 pt-4 border-t border-line">
                      <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Primary contact</p>
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
                      <p className="text-2xs uppercase tracking-wide text-neutral-400 mb-2">Notes</p>
                      <p className="text-sm text-neutral-600 leading-relaxed">{selected.notes}</p>
                    </div>
                  )}
                </div>
              ) : <div className="card p-5 text-sm text-neutral-400">Select a deal</div>}
            </aside>
          </div>
        </div>
      ) : (
        contacts.length === 0 ? <EmptyState text="No contacts yet" icon="ti-user" /> : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead><tr>
                <th className="th">Name</th><th className="th">Title</th><th className="th">Company</th>
                <th className="th">Status</th><th className="th">Email</th>
              </tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="row">
                    <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.full_name} size={28} /><span className="font-medium">{c.full_name}</span></div></td>
                    <td className="td text-2xs text-neutral-500">{c.title || '—'}</td>
                    <td className="td text-sm">{c.crm_companies?.name || '—'}</td>
                    <td className="td">{c.status && <Pill label={c.status} />}</td>
                    <td className="td text-2xs text-sky-600">{c.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </Layout>
  );
}
