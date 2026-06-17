import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import Select from '@/components/Select';
import RichText from '@/components/RichText';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { can } from '@/lib/authz';
import { listDocTemplates, createDocTemplate, updateDocTemplate, deleteDocTemplate, getOrgProfile, avatarSrc, DocTemplate } from '@/lib/db';
import { OrgProfile } from '@/lib/supabase';

const TYPES = [
  { value: 'proposal', label: 'Proposal', icon: 'ti-file-description' },
  { value: 'contract', label: 'Contract', icon: 'ti-file-certificate' },
  { value: 'agreement', label: 'Agreement', icon: 'ti-writing-sign' },
  { value: 'offer', label: 'Offer letter', icon: 'ti-mail-check' },
  { value: 'email', label: 'Email', icon: 'ti-mail' },
  { value: 'generic', label: 'General', icon: 'ti-file-text' },
];
const typeMeta = (t: string) => TYPES.find((x) => x.value === t) || TYPES[5];

const MERGE = [
  { label: 'Client name', token: '{{client_name}}' },
  { label: 'Company name', token: '{{company_name}}' },
  { label: 'Contact person', token: '{{contact_name}}' },
  { label: 'Amount', token: '{{amount}}' },
  { label: 'Currency', token: '{{currency}}' },
  { label: 'Today’s date', token: '{{date}}' },
  { label: 'Your workspace', token: '{{workspace_name}}' },
  { label: 'Your name', token: '{{user_name}}' },
  { label: 'Your email', token: '{{user_email}}' },
  { label: 'Your tax / VAT ID', token: '{{tax_id}}' },
];

type Draft = { id?: string; name: string; doc_type: string; body: string };

export default function TemplatesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<DocTemplate[] | null>(null);
  const [sel, setSel] = useState<Draft | null>(null);
  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [using, setUsing] = useState<DocTemplate | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});

  const load = () => { if (org) listDocTemplates(org.id).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { load(); if (org) getOrgProfile(org.id).then(setProfile).catch(() => {}); /* eslint-disable-next-line */ }, [org?.id]);

  if (!can.manageOrg(org)) return <Layout flat title="Templates"><EmptyState icon="ti-lock" title="Admins only" text="Document templates are managed by workspace owners and admins." /></Layout>;

  const openNew = () => { setErr(''); setSel({ name: '', doc_type: 'proposal', body: '' }); };
  const openEdit = (t: DocTemplate) => { setErr(''); setSel({ id: t.id, name: t.name, doc_type: t.doc_type, body: t.body || '' }); };
  const save = async () => {
    if (!sel || !org || !sel.name.trim()) return; setBusy(true); setErr('');
    try {
      if (sel.id) await updateDocTemplate(sel.id, { name: sel.name.trim(), doc_type: sel.doc_type, body: sel.body });
      else await createDocTemplate({ org_id: org.id, name: sel.name.trim(), doc_type: sel.doc_type, body: sel.body });
      load(); setSel(null);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (t: DocTemplate) => { if (!confirm(`Delete template “${t.name}”?`)) return; try { await deleteDocTemplate(t.id); setRows((p) => (p || []).filter((x) => x.id !== t.id)); } catch (e: any) { alert(e.message); } };

  // Branded-letterhead live preview with sample merge values.
  const sample: Record<string, string> = {
    '{{client_name}}': 'Acme Corporation', '{{company_name}}': 'Acme Corporation', '{{contact_name}}': 'Jane Doe',
    '{{amount}}': '12,000', '{{currency}}': 'USD', '{{date}}': new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    '{{workspace_name}}': org?.name || 'Your workspace', '{{user_name}}': me?.full_name || 'You', '{{user_email}}': me?.email || '', '{{tax_id}}': profile?.tax_id || '—',
  };
  const render = (html: string) => Object.entries(sample).reduce((acc, [k, v]) => acc.split(k).join(v), html || '');
  const logo = org?.branding?.logo_url;
  const addr = [profile?.address_line1, profile?.city, profile?.country].filter(Boolean).join(', ');

  if (sel) {
    return (
      <Layout flat title="Template">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setSel(null)} className="btn btn-ghost border border-line"><Icon name="ti-arrow-left" />Back</button>
          <h1 className="text-base font-semibold truncate">{sel.id ? sel.name || 'Template' : 'New template'}</h1>
          <div className="ml-auto flex items-center gap-2">
            {sel.id && <button onClick={() => { const t = (rows || []).find((x) => x.id === sel.id); if (t) remove(t); }} className="btn text-rose-600 border border-rose-300"><Icon name="ti-trash" />Delete</button>}
            <button onClick={save} disabled={busy || !sel.name.trim()} className="btn btn-primary min-w-[6.5rem]">{busy ? 'Saving…' : 'Save template'}</button>
          </div>
        </div>
        {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="card p-4 grid sm:grid-cols-2 gap-3">
              <div><label className="label">Template name</label><input className="input" value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} placeholder="e.g. Standard proposal" /></div>
              <div><label className="label">Type</label><Select value={sel.doc_type} onChange={(v) => setSel({ ...sel, doc_type: v })} options={TYPES.map((t) => ({ value: t.value, label: t.label }))} /></div>
            </div>
            <RichText value={sel.body} onChange={(html) => setSel((d) => d && ({ ...d, body: html }))} mergeFields={MERGE} minHeight={420} />
            <p className="text-2xs text-muted">Use <strong>Insert field</strong> to drop merge tags like <code>{'{{client_name}}'}</code> — they fill in automatically when you generate a document.</p>
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wide text-muted font-medium mb-2">Live preview (with sample values)</p>
            <div className="card p-0 overflow-hidden">
              <div className="bg-white text-[#111] p-8" style={{ minHeight: 480 }}>
                <div className="flex items-start justify-between gap-4 border-b pb-4 mb-6" style={{ borderColor: '#e5e7eb' }}>
                  <div className="flex items-center gap-3">
                    {logo && logo.startsWith('preset:') ? <span className="w-12 h-12 rounded-lg grid place-items-center text-2xl" style={{ background: '#eef2ff' }}>{logo.slice(7)}</span>
                      : logo ? <img src={avatarSrc(logo)} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <span className="w-12 h-12 rounded-lg grid place-items-center font-bold text-white" style={{ background: 'var(--brand-primary,#3ECF8E)' }}>{(org?.name || 'S').charAt(0)}</span>}
                    <div>
                      <p className="font-semibold text-base">{org?.name}</p>
                      {addr && <p className="text-xs" style={{ color: '#6b7280' }}>{addr}</p>}
                      {(profile?.contact_email || profile?.contact_phone) && <p className="text-xs" style={{ color: '#6b7280' }}>{[profile?.contact_email, profile?.contact_phone].filter(Boolean).join(' · ')}</p>}
                    </div>
                  </div>
                  <div className="text-right text-xs" style={{ color: '#6b7280' }}><p className="uppercase tracking-wide">{typeMeta(sel.doc_type).label}</p><p>{sample['{{date}}']}</p></div>
                </div>
                <div className="prose-doc text-sm" dangerouslySetInnerHTML={{ __html: render(sel.body) || '<p style="color:#9ca3af">Start typing on the left — your document preview appears here.</p>' }} />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const FILLABLE = [
    { token: '{{client_name}}', label: 'Client name' },
    { token: '{{company_name}}', label: 'Company name' },
    { token: '{{contact_name}}', label: 'Contact person' },
    { token: '{{amount}}', label: 'Amount' },
    { token: '{{currency}}', label: 'Currency' },
  ];
  if (using) {
    const merged: Record<string, string> = { ...sample, ...vals };
    const html = Object.entries(merged).reduce((acc, [k, v]) => acc.split(k).join(v || ''), using.body || '');
    return (
      <Layout flat title="Generate document">
        <div className="flex items-center gap-3 mb-4 no-print">
          <button onClick={() => setUsing(null)} className="btn btn-ghost border border-line"><Icon name="ti-arrow-left" />Back</button>
          <h1 className="text-base font-semibold truncate">Generate: {using.name}</h1>
          <div className="ml-auto"><button onClick={() => window.print()} className="btn btn-primary"><Icon name="ti-printer" />Print / Save as PDF</button></div>
        </div>
        <div className="grid lg:grid-cols-[20rem_1fr] gap-5">
          <div className="card p-4 space-y-3 h-fit no-print">
            <p className="text-2xs uppercase tracking-wide text-muted font-medium">Fill in</p>
            {FILLABLE.map((m) => (
              <div key={m.token}><label className="label">{m.label}</label><input className="input" value={vals[m.token] || ''} onChange={(e) => setVals((p) => ({ ...p, [m.token]: e.target.value }))} placeholder={sample[m.token] || ''} /></div>
            ))}
            <p className="text-2xs text-muted">Date, your workspace, your name and tax ID fill in automatically. Use Print to save a PDF.</p>
          </div>
          <div className="card p-0 overflow-hidden">
            <div className="print-area bg-white text-[#111] p-10" style={{ minHeight: 600 }}>
              <div className="flex items-start justify-between gap-4 border-b pb-4 mb-6" style={{ borderColor: '#e5e7eb' }}>
                <div className="flex items-center gap-3">
                  {logo && logo.startsWith('preset:') ? <span className="w-12 h-12 rounded-lg grid place-items-center text-2xl" style={{ background: '#eef2ff' }}>{logo.slice(7)}</span>
                    : logo ? <img src={avatarSrc(logo)} alt="" className="w-12 h-12 rounded-lg object-cover" /> : <span className="w-12 h-12 rounded-lg grid place-items-center font-bold text-white" style={{ background: 'var(--brand-primary,#3ECF8E)' }}>{(org?.name || 'S').charAt(0)}</span>}
                  <div><p className="font-semibold text-base">{org?.name}</p>{addr && <p className="text-xs" style={{ color: '#6b7280' }}>{addr}</p>}{(profile?.contact_email || profile?.contact_phone) && <p className="text-xs" style={{ color: '#6b7280' }}>{[profile?.contact_email, profile?.contact_phone].filter(Boolean).join(' · ')}</p>}</div>
                </div>
                <div className="text-right text-xs" style={{ color: '#6b7280' }}><p className="uppercase tracking-wide">{typeMeta(using.doc_type).label}</p><p>{sample['{{date}}']}</p></div>
              </div>
              <div className="prose-doc text-sm" dangerouslySetInnerHTML={{ __html: html || '<p style="color:#9ca3af">This template is empty.</p>' }} />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout flat title="Templates">
      <PageHeader title="Document templates" subtitle="Branded, reusable templates for proposals, contracts, offer letters and more — write once, use many" icon="ti-files"
        action={<button onClick={openNew} className="btn btn-primary"><Icon name="ti-plus" />New template</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="ti-files" title="No templates yet" text="Create your first branded proposal, contract or offer-letter template." />
      ) : (
        <div className="space-y-6">
          {TYPES.filter((t) => rows.some((r) => r.doc_type === t.value)).map((t) => (
            <div key={t.value}>
              <h3 className="text-sm font-semibold text-content mb-3 inline-flex items-center gap-2"><Icon name={t.icon} className="text-muted2" />{t.label}s</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.filter((r) => r.doc_type === t.value).map((r) => (
                  <div key={r.id} className="card p-5 flex flex-col">
                    <span className="font-semibold inline-flex items-center gap-2"><Icon name={t.icon} className="text-muted" />{r.name}</span>
                    <span className="text-2xs text-muted mt-2 line-clamp-2 flex-1" dangerouslySetInnerHTML={{ __html: (r.body || '').replace(/<[^>]+>/g, ' ').slice(0, 140) || '—' }} />
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setUsing(r); setVals({}); }} className="btn btn-primary flex-1 text-xs"><Icon name="ti-file-export" />Use</button>
                      <button onClick={() => openEdit(r)} className="btn text-xs"><Icon name="ti-pencil" />Edit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
