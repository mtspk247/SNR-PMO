import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Pill, Spinner, EmptyState, StatCard, Icon, Tabs, Avatar } from '@/components/ui';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import CustomFields from '@/components/CustomFields';
import { useActiveOrg } from '@/lib/store';
import { useDeals, useContacts, useCrmCompanies } from '@/lib/queries';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function CompanyDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const canManage = org?.member_role === 'owner' || org?.member_role === 'admin';

  const { data: companies = [], isLoading } = useCrmCompanies();
  const { data: deals = [] } = useDeals();
  const { data: contacts = [] } = useContacts();
  const company = companies.find((c) => c.id === id) || null;
  const [tab, setTab] = useState('overview');

  useSetCrumbs(company ? [{ label: 'CRM', href: '/crm' }, { label: company.name }] : null);

  if (isLoading) return <Layout flat title="Company"><Spinner /></Layout>;
  if (!company) {
    return (
      <Layout flat title="Company">
        <EmptyState icon="ti-building-off" text="Company not found, or you don’t have access." />
        <div className="mt-4"><Link href="/crm" className="btn"><Icon name="ti-arrow-left" />Back to CRM</Link></div>
      </Layout>
    );
  }

  const myDeals = deals.filter((d) => d.company_id === id);
  const myContacts = contacts.filter((c) => c.company_id === id);
  const openValue = myDeals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost').reduce((a, d) => a + (d.value || 0), 0);
  const wonValue = myDeals.filter((d) => d.stage === 'Won').reduce((a, d) => a + (d.value || 0), 0);

  const meta = [
    { label: 'Industry', value: company.industry || '—', icon: 'ti-category' },
    { label: 'Website', value: company.website || '—', icon: 'ti-world' },
    { label: 'Phone', value: company.phone || '—', icon: 'ti-phone' },
  ];

  return (
    <Layout flat title={company.name}>
      <PageHeader title={company.name} subtitle={company.industry || undefined}
        action={<span className="w-10 h-10 rounded-lg bg-accent/10 text-accentstrong grid place-items-center"><Icon name="ti-building" className="text-xl" /></span>} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Open pipeline" value={money(openValue)} icon="ti-target" hint={`${myDeals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost').length} active`} />
        <StatCard label="Won" value={money(wonValue)} icon="ti-trophy" hintTone="up" hint={`${myDeals.filter((d) => d.stage === 'Won').length} closed won`} />
        <StatCard label="Deals" value={`${myDeals.length}`} icon="ti-briefcase" />
        <StatCard label="Contacts" value={`${myContacts.length}`} icon="ti-users" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'deals', label: 'Deals', icon: 'ti-briefcase', count: myDeals.length },
        { key: 'contacts', label: 'Contacts', icon: 'ti-users', count: myContacts.length },
        { key: 'fields', label: 'Custom fields', icon: 'ti-adjustments' },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card p-5">
            <p className="text-2xs uppercase tracking-wide text-muted2 mb-3">Company details</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {meta.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-md bg-surface2 grid place-items-center text-muted shrink-0"><Icon name={m.icon} /></span>
                  <div className="min-w-0">
                    <p className="text-2xs text-muted2">{m.label}</p>
                    <p className="text-sm truncate">{m.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-1 card p-5">
            <p className="text-sm font-semibold">Fields</p>
            <CustomFields orgId={org?.id || ''} entityType="crm_company" entityId={company.id} canManage={canManage} title="Custom fields" />
          </div>
        </div>
      )}

      {tab === 'deals' && (
        <div className="card overflow-hidden">
          {myDeals.length === 0 ? <div className="p-5"><EmptyState icon="ti-briefcase" text="No deals for this company." /></div> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Deal</th><th className="th">Stage</th><th className="th text-right">Value</th><th className="th">Close</th></tr></thead>
              <tbody>
                {myDeals.map((d) => (
                  <tr key={d.id} className="row cursor-pointer" onClick={() => router.push(`/crm/deal/${d.id}`)}>
                    <td className="td font-medium text-accentstrong">{d.title}</td>
                    <td className="td"><Pill label={d.stage} /></td>
                    <td className="td text-right">{money(d.value || 0)}</td>
                    <td className="td text-2xs text-muted">{d.expected_close || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card overflow-hidden">
          {myContacts.length === 0 ? <div className="p-5"><EmptyState icon="ti-users" text="No contacts at this company." /></div> : (
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">Name</th><th className="th">Title</th><th className="th">Status</th><th className="th">Email</th></tr></thead>
              <tbody>
                {myContacts.map((c) => (
                  <tr key={c.id} className="row cursor-pointer" onClick={() => router.push(`/crm/contact/${c.id}`)}>
                    <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.full_name} size={28} /><span className="font-medium">{c.full_name}</span></div></td>
                    <td className="td text-2xs text-muted">{c.title || '—'}</td>
                    <td className="td">{c.status && <Pill label={c.status} />}</td>
                    <td className="td text-2xs text-sky-600">{c.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'fields' && (
        <div className="card p-5 max-w-xl">
          <p className="text-sm font-semibold">Custom fields</p>
          <CustomFields orgId={org?.id || ''} entityType="crm_company" entityId={company.id} canManage={canManage} title="Fields on this company" />
        </div>
      )}
    </Layout>
  );
}
