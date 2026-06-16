import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, Pill, Spinner, EmptyState, StatCard, Icon, Tabs, Avatar } from '@/components/ui';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import EntityLink from '@/components/EntityLink';
import CustomFields from '@/components/CustomFields';
import { DetailMeta } from '@/components/Detail';
import EntityTags from '@/components/EntityTags';
import { getDealActivities, createActivity, deleteActivity, dealToInvoice } from '@/lib/db';
import { hasFeature } from '@/lib/entitlements';
import { CrmActivity } from '@/lib/supabase';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useDeals } from '@/lib/queries';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const ACT_KINDS = [
  { id: 'note', label: 'Note', icon: 'ti-note' },
  { id: 'call', label: 'Call', icon: 'ti-phone' },
  { id: 'email', label: 'Email', icon: 'ti-mail' },
  { id: 'meeting', label: 'Meeting', icon: 'ti-calendar' },
];
const actMeta = (k: string) => ACT_KINDS.find((x) => x.id === k) || { id: k, label: k, icon: 'ti-point' };
const actWhen = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

export default function DealDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const canManage = org?.member_role === 'owner' || org?.member_role === 'admin';

  const { data: deals = [], isLoading } = useDeals();
  const deal = deals.find((d) => d.id === id) || null;
  const [tab, setTab] = useState('overview');

  const [acts, setActs] = useState<CrmActivity[]>([]);
  const [actsLoading, setActsLoading] = useState(false);
  const [actKind, setActKind] = useState('note');
  const [actBody, setActBody] = useState('');
  const [actBusy, setActBusy] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const createInvoice = async () => {
    if (!org || !deal || invBusy) return; setInvBusy(true);
    try { await dealToInvoice(org.id, deal.id); router.push('/invoicing'); }
    catch (e: any) { alert(e.message || 'Could not create invoice'); setInvBusy(false); }
  };

  useSetCrumbs(deal ? [{ label: 'CRM', href: '/crm' }, { label: deal.title }] : null);

  useEffect(() => {
    if (!id) { setActs([]); return; }
    setActsLoading(true);
    getDealActivities(id).then(setActs).catch(() => setActs([])).finally(() => setActsLoading(false));
  }, [id]);

  const logActivity = async () => {
    if (!org || !id || !actBody.trim()) return;
    setActBusy(true);
    try {
      const a = await createActivity({ org_id: org.id, deal_id: id, kind: actKind, body: actBody.trim(), created_by: me?.id });
      setActs((p) => [a, ...p]); setActBody('');
    } catch (e: any) { alert(e.message); } finally { setActBusy(false); }
  };
  const removeActivity = async (aid: string) => {
    try { await deleteActivity(aid); setActs((p) => p.filter((x) => x.id !== aid)); }
    catch (e: any) { alert(e.message); }
  };

  if (isLoading) return <Layout flat title="Deal"><Spinner /></Layout>;
  if (!deal) {
    return (
      <Layout flat title="Deal">
        <EmptyState icon="ti-target-off" text="Deal not found, or you don’t have access." />
        <div className="mt-4"><Link href="/crm" className="btn"><Icon name="ti-arrow-left" />Back to CRM</Link></div>
      </Layout>
    );
  }

  const ageDays = deal.created_at ? Math.max(0, Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)) : null;
  const closed = deal.stage === 'Won' || deal.stage === 'Lost';

  const meta = [
    { label: 'Company', value: deal.crm_companies?.name || '—', icon: 'ti-building' },
    { label: 'Primary contact', value: deal.crm_contacts?.full_name || '—', icon: 'ti-user' },
    { label: 'Expected close', value: deal.expected_close || '—', icon: 'ti-calendar-event' },
    { label: 'Created', value: deal.created_at ? new Date(deal.created_at).toLocaleDateString() : '—', icon: 'ti-calendar' },
  ];

  return (
    <Layout flat title={deal.title}>
      <PageHeader title={deal.title}
        subtitle={deal.crm_companies?.name || undefined}
        action={
          <div className="flex items-center gap-2">
            {deal.company_id && (
              <EntityLink label={deal.crm_companies?.name || 'Company'} icon="ti-building"
                href={`/crm/company/${deal.company_id}`} />
            )}
            {canManage && hasFeature(org, 'financial') && Number(deal.value) > 0 && (
              <button onClick={createInvoice} disabled={invBusy} className={`btn ${deal.stage === 'Won' ? 'btn-primary' : ''}`} title="Generate an invoice from this deal (posts revenue when issued)"><Icon name="ti-file-invoice" />{invBusy ? 'Creating…' : 'Create invoice'}</button>
            )}
            <Pill label={deal.stage} />
          </div>
        } />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Deal value" value={money(deal.value || 0)} icon="ti-cash" />
        <StatCard label="Stage" value={deal.stage} icon="ti-flag" hint={closed ? 'Closed' : 'In pipeline'} hintTone={deal.stage === 'Won' ? 'up' : deal.stage === 'Lost' ? 'down' : 'muted'} />
        <StatCard label="Age" value={ageDays === null ? '—' : `${ageDays}d`} icon="ti-clock" hint={deal.expected_close ? `Closes ${deal.expected_close}` : 'No close date'} />
        <StatCard label="Activity" value={`${acts.length}`} icon="ti-timeline" hint="logged" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'activity', label: 'Activity', icon: 'ti-timeline', count: acts.length },
        { key: 'fields', label: 'Custom fields', icon: 'ti-adjustments' },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="card p-5">
              <p className="text-2xs uppercase tracking-wide text-muted2 mb-2">Notes</p>
              {deal.notes ? <p className="text-sm text-content whitespace-pre-line leading-relaxed">{deal.notes}</p>
                : <p className="text-sm text-muted2">No notes.</p>}
              <div className="mt-5 pt-4 border-t border-line">
                <DetailMeta items={meta.map((m) => ({ icon: m.icon, label: m.label, value: m.value }))} />
              </div>
            </div>
          </div>
          <div className="lg:col-span-1 space-y-4">
            {deal.crm_contacts && (
              <div className="card p-5">
                <p className="text-sm font-semibold mb-3">Primary contact</p>
                <div className="flex items-center gap-2.5">
                  <Avatar name={deal.crm_contacts.full_name} size={36} />
                  <div className="min-w-0">
                    {deal.contact_id ? (
                      <EntityLink label={deal.crm_contacts.full_name} icon="ti-user" href={`/crm/contact/${deal.contact_id}`} />
                    ) : <p className="text-sm font-medium truncate">{deal.crm_contacts.full_name}</p>}
                    {deal.crm_contacts.email && <p className="text-2xs text-sky-600 truncate mt-0.5">{deal.crm_contacts.email}</p>}
                  </div>
                </div>
              </div>
            )}
            <div className="card p-5">
              <p className="text-sm font-semibold mb-2">Tags</p>
              <EntityTags entityType="crm_deal" entityId={deal.id} orgId={org?.id} bare />
            </div>
            <div className="card p-5">
              <p className="text-sm font-semibold">Fields</p>
              <CustomFields orgId={org?.id || ''} entityType="crm_deal" entityId={deal.id} canManage={canManage} title="Custom fields" />
            </div>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card p-5 max-w-2xl">
          <div className="flex gap-2 mb-4">
            <div className="w-32"><Select value={actKind} onChange={setActKind} options={ACT_KINDS.map((k) => ({ value: k.id, label: k.label }))} /></div>
            <input value={actBody} onChange={(e) => setActBody(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && logActivity()}
              placeholder="Log an activity…" className="input flex-1 py-1.5 text-sm" />
            <button onClick={logActivity} disabled={actBusy || !actBody.trim()} className="btn btn-primary"><Icon name="ti-plus" />Log</button>
          </div>
          {actsLoading ? <p className="text-2xs text-muted2">Loading…</p>
            : acts.length === 0 ? <EmptyState icon="ti-timeline" text="No activity yet." /> : (
            <ul className="space-y-3.5">
              {acts.map((a) => (
                <li key={a.id} className="flex gap-3 group">
                  <span className="w-7 h-7 rounded-full bg-surface2 grid place-items-center text-muted shrink-0 mt-0.5"><Icon name={actMeta(a.kind).icon} className="text-sm" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-content leading-snug break-words">{a.body}</p>
                    <p className="text-2xs text-muted2 mt-0.5">{actMeta(a.kind).label} · {actWhen(a.created_at)}</p>
                  </div>
                  <button onClick={() => removeActivity(a.id)} className="text-muted2 hover:text-rose-500 opacity-0 group-hover:opacity-100 shrink-0" title="Delete"><Icon name="ti-trash" className="text-sm" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'fields' && (
        <div className="card p-5 max-w-xl">
          <p className="text-sm font-semibold">Custom fields</p>
          <CustomFields orgId={org?.id || ''} entityType="crm_deal" entityId={deal.id} canManage={canManage} title="Fields on this deal" />
        </div>
      )}
    </Layout>
  );
}
