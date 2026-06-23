import { useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon } from '@/components/ui';
import { sb } from '@/lib/supabase';
import { useActiveOrg } from '@/lib/store';

type Col = { header: string; get: (r: any) => any };
type ExpEntity = { key: string; table: string; label: string; icon: string; desc: string; select: string; order?: string; cols: Col[] };

const ENTITIES: ExpEntity[] = [
  { key: 'projects', table: 'projects', label: 'Projects', icon: 'ti-folder', desc: 'All projects with status & dates.', select: 'name,status,priority,start_date,end_date,progress,created_at', order: 'created_at',
    cols: [ { header: 'Name', get: (r) => r.name }, { header: 'Status', get: (r) => r.status }, { header: 'Priority', get: (r) => r.priority }, { header: 'Start date', get: (r) => r.start_date }, { header: 'Due date', get: (r) => r.end_date }, { header: 'Progress', get: (r) => r.progress }, { header: 'Created', get: (r) => r.created_at?.slice(0, 10) } ] },
  { key: 'tasks', table: 'tasks', label: 'Tasks', icon: 'ti-checkbox', desc: 'All tasks across projects.', select: 'name,status,priority,due_date,created_at,projects(name)', order: 'created_at',
    cols: [ { header: 'Name', get: (r) => r.name }, { header: 'Project', get: (r) => r.projects?.name }, { header: 'Status', get: (r) => r.status }, { header: 'Priority', get: (r) => r.priority }, { header: 'Due date', get: (r) => r.due_date }, { header: 'Created', get: (r) => r.created_at?.slice(0, 10) } ] },
  { key: 'clients', table: 'clients', label: 'Clients', icon: 'ti-friends', desc: 'Client list with contacts.', select: 'name,contact_name,email,phone,status,since,created_at', order: 'name',
    cols: [ { header: 'Name', get: (r) => r.name }, { header: 'Contact', get: (r) => r.contact_name }, { header: 'Email', get: (r) => r.email }, { header: 'Phone', get: (r) => r.phone }, { header: 'Status', get: (r) => r.status }, { header: 'Since', get: (r) => r.since } ] },
  { key: 'deals', table: 'crm_deals', label: 'Deals', icon: 'ti-target-arrow', desc: 'CRM pipeline with values.', select: 'title,value,stage,expected_close,notes,created_at,crm_companies(name),crm_contacts(full_name)', order: 'created_at',
    cols: [ { header: 'Title', get: (r) => r.title }, { header: 'Value', get: (r) => r.value }, { header: 'Stage', get: (r) => r.stage }, { header: 'Company', get: (r) => r.crm_companies?.name }, { header: 'Contact', get: (r) => r.crm_contacts?.full_name }, { header: 'Expected close', get: (r) => r.expected_close }, { header: 'Notes', get: (r) => r.notes } ] },
  { key: 'contacts', table: 'crm_contacts', label: 'Contacts', icon: 'ti-id-badge', desc: 'CRM contacts.', select: 'full_name,email,phone,title,status,notes,created_at,crm_companies(name)', order: 'full_name',
    cols: [ { header: 'Name', get: (r) => r.full_name }, { header: 'Email', get: (r) => r.email }, { header: 'Phone', get: (r) => r.phone }, { header: 'Title', get: (r) => r.title }, { header: 'Company', get: (r) => r.crm_companies?.name }, { header: 'Status', get: (r) => r.status } ] },
  { key: 'companies', table: 'companies', label: 'Companies', icon: 'ti-building', desc: 'Company records.', select: 'name,description,created_at', order: 'name',
    cols: [ { header: 'Name', get: (r) => r.name }, { header: 'Description', get: (r) => r.description }, { header: 'Created', get: (r) => r.created_at?.slice(0, 10) } ] },
  { key: 'invoices', table: 'invoices', label: 'Invoices', icon: 'ti-file-invoice', desc: 'Invoices with totals & status.', select: 'invoice_number,client_name,client_email,issue_date,due_date,currency,total,amount_paid,status', order: 'created_at',
    cols: [ { header: 'Invoice #', get: (r) => r.invoice_number }, { header: 'Client', get: (r) => r.client_name }, { header: 'Email', get: (r) => r.client_email }, { header: 'Issue date', get: (r) => r.issue_date }, { header: 'Due date', get: (r) => r.due_date }, { header: 'Currency', get: (r) => r.currency }, { header: 'Total', get: (r) => r.total }, { header: 'Paid', get: (r) => r.amount_paid }, { header: 'Status', get: (r) => r.status } ] },
];

function toCSV(headers: string[], rows: string[][]): string {
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return headers.map(esc).join(',') + '\n' + rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export default function ExportPage() {
  const org = useActiveOrg();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ key: string; n: number } | null>(null);

  const exportEntity = async (e: ExpEntity) => {
    if (!org?.id) return;
    setBusy(e.key); setErr(''); setDone(null);
    try {
      const { data, error } = await sb.from(e.table).select(e.select).eq('org_id', org.id).order(e.order || 'created_at', { ascending: true }).limit(20000);
      if (error) throw error;
      const list = (data as any[]) || [];
      const headers = e.cols.map((c) => c.header);
      const rows = list.map((row) => e.cols.map((c) => { const v = c.get(row); return v == null ? '' : String(v); }));
      const csv = toCSV(headers, rows);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `${e.key}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
      setDone({ key: e.key, n: list.length });
    } catch (ex: any) { setErr(ex.message || 'Export failed.'); } finally { setBusy(''); }
  };

  return (
    <Layout flat title="Export data">
      <PageHeader title="Export data" subtitle="Export any module to CSV — no lock-in." />

      <div className="flex items-start gap-3 rounded-lg bg-accent/10 border border-accent/20 px-4 py-3 mb-5 max-w-3xl">
        <Icon name="ti-lock-open" className="text-base text-accentstrong mt-0.5 shrink-0" />
        <p className="text-sm text-content leading-relaxed">No lock-in. Every export is a standard CSV you can open in Excel, Google Sheets, or import anywhere — including back into this workspace.</p>
      </div>

      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-5xl">
        {ENTITIES.map((e) => (
          <div key={e.key} className="card p-4 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-surface2 text-muted"><Icon name={e.icon} className="text-lg" /></span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm font-semibold text-content leading-tight">{e.label}</p>
                <p className="text-2xs text-muted mt-0.5 leading-snug">{e.desc}</p>
              </div>
            </div>
            {done?.key === e.key ? (
              <div className="text-2xs text-accentstrong inline-flex items-center gap-1"><Icon name="ti-circle-check" className="text-sm" />Exported {done.n} {done.n === 1 ? 'record' : 'records'}.</div>
            ) : (
              <button onClick={() => exportEntity(e)} disabled={busy === e.key} className="btn btn-primary w-full justify-center text-xs">
                {busy === e.key ? <><Icon name="ti-loader-2" className="animate-spin" />Exporting…</> : <><Icon name="ti-download" className="text-xs" />Export CSV</>}
              </button>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
