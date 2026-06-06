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
          <