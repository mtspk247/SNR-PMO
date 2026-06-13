import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Pill, Spinner, EmptyState, StatCard, Icon, Tabs, Avatar } from '@/components/ui';
import { useSetCrumbs } from '@/components/Breadcrumbs';
import EntityLink from '@/components/EntityLink';
import CustomFields from '@/components/CustomFields';
import { useActiveOrg } from '@/lib/store';
import { useDeals, useContacts } from '@/lib/queries';

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function ContactDetail() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const org = useActiveOrg();
  const canManage = org?.member_role === 'owner' || org?.member_role === 'admin';

  const { data: contacts = [], isLoading } = useContacts();
  const { data: deals = [] } = useDeals();
  const contact = contacts.find((c) => c.id === id) || null;
  const [tab, setTab] = useState('overview');

  useSetCrumbs(contact ? [{ label: 'CRM', href: '/crm' }, { label: contact.full_name }] : null);

  if (isLoading) return <Layout flat title="Contact"><Spinner /></Layout>;
  if (!contact) {
    return (
      <Layout flat title="Contact">
        <EmptyState icon="ti-user-off" text="Contact not found, or you don’t have access." />
        <div className="mt-4"><Link href="/crm" className="btn"><Icon name="ti-arrow-left" />Back to CRM</Link></div>
      </Layout>
    );
  }

  const myDeals = deals.filter((d) => d.contact_id === id);
  const openValue = myDeals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost').reduce((a, d) => a + (d.value || 0), 0);

  const meta = [
    { label: 'Title', value: contact.title || '—', icon: 'ti-badge' },
    { label: 'Email', value: contact.email || '—', icon: 'ti-mail' },
    { label: 'Phone', value: contact.phone || '—', icon: 'ti-phone' },
    { label: 'Status', value: contact.status || '—', icon: 'ti-activity' },
  ];

  return (
    <Layout flat title={contact.full_name}>
      <PageHeader title={contact.full_name}
        subtitle={[contact.title, contact.crm_companies?.name].filter(Boolean).join(' · ') || undefined}
        action={
          <div className="flex items-center gap-2">
            {contact.company_id && (
              <EntityLink label={contact.crm_companies?.name || 'Company'} icon="ti-building"
                href={`/crm/company/${contact.company_id}`} />
            )}
            {contact.status && <Pill label={contact.status} />}
          </div>
        } />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="Open pipeline" value={money(openValue)} icon="ti-target" hint={`${myDeals.filter((d) => d.stage !== 'Won' && d.stage !== 'Lost').length} active deals`} />
        <StatCard label="Deals" value={`${myDeals.length}`} icon="ti-briefcase" />
        <StatCard label="Company" value={contact.crm_companies?.name || '—'} icon="ti-building" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
        { key: 'deals', label: 'Deals', icon: 'ti-briefcase', count: myDeals.length },
        { key: 'fields', label: 'Custom fields', icon: 'ti-adjustments' },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 card p-5">
            <div className="flex items-center gap-3 mb-5">
              <Avatar name={contact.full_name} size={44} />
              <div className="min-w-0">
                <p className="text-base font-semibold truncate">{contact.full_name}</p>
                {contact.email && <p className="text-2xs text-sky-600 truncate">{contact.email}</p>}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {meta.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-md bg-surface2 grid place-items-center text-muted shrink-0"><Icon name={m.icon} /></span>
                  <div className="min-w-0">
                    <p className="text-2xs text-muted2">{m.label}</p>
                    <p className="text-sm truncate">{m.label === 'Status' && contact.status ? <Pill label={contact.status} /> : m.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-1 card p-5">
            <p className="text-sm font-semibold">Fields</p>
            <CustomFields orgId={org?.id || ''} entityType="crm_contact" entityId={contact.id} canManage={canManage} title="Custom fields" />
          </div>
        </div>
      )}

      {tab === 'deals' && (
        <div className="card overflow-hidden">
          {myDeals.length === 0 ? <div className="p-5"><EmptyState icon="ti-briefcase" text="No deals for this contact." /></div> : (
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

      {tab === 'fields' && (
        <div className="card p-5 max-w-xl">
          <p className="text-sm font-semibold">Custom fields</p>
          <CustomFields orgId={org?.id || ''} entityType="crm_contact" entityId={contact.id} canManage={canManage} title="Fields on this contact" />
        </div>
      )}
    </Layout>
  );
}
