import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listSignRequests, createSignRequest, updateSignRequest, deleteSignRequest,
  listSignRecipients, addSignRecipient, removeSignRecipient,
  listSignFields, addSignField, removeSignField, signSend, listSignEvents, listSignableFiles,
  SignRequest, SignRecipient, SignField, SignEvent,
} from '@/lib/db';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import { ListView } from '@/components/ListView';

const STATUS_HEX: Record<string, string> = { draft: '#d97706', sent: '#0284c7', completed: '#16a34a', voided: '#6b7280', expired: '#e11d48' };
const STATUS_PILL: Record<string, string> = { draft: 'pill-amber', sent: 'pill-blue', completed: 'pill-green', voided: 'pill-gray', expired: 'pill-rose' };
const FIELD_TYPES = [
  { value: 'signature', label: 'Signature' },
  { value: 'initials', label: 'Initials' },
  { value: 'date', label: 'Date (auto)' },
  { value: 'text', label: 'Text' },
  { value: 'checkbox', label: 'Checkbox' },
];
const EVENT_LABEL: Record<string, string> = { sent: 'Sent', viewed: 'Viewed', consented: 'Consented to e-sign', signed: 'Signed', declined: 'Declined', completed: 'Completed' };

const COLS: ColDef[] = [
  { id: 'title', label: 'Request', locked: true },
  { id: 'status', label: 'Status' },
  { id: 'signers', label: 'Signers' },
  { id: 'created', label: 'Created' },
];

export default function SigningPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'signing');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [rows, setRows] = useState<SignRequest[] | null>(null);
  const prefs = useListPrefs('snrpmo.signing.cols', COLS, { entity: 'signing', orgId: org?.id, canManage: isAdmin });
  const q = prefs.query;
  const [detail, setDetail] = useState<{ req: SignRequest; recips: SignRecipient[] | null; fields: SignField[] | null; events: SignEvent[] | null } | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string; mime_type: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // new-request wizard state
  const [wiz, setWiz] = useState<{ title: string; message: string; file_id: string; expires: string; recips: { email: string; name: string; role: 'signer' | 'cc' }[]; fields: { type: SignField['type']; label: string; required: boolean; recipEmail: string }[] } | null>(null);

  const load = () => { if (!org) return; listSignRequests(org.id).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (org?.id && enabled) { load(); listSignableFiles(org.id).then(setFiles).catch(() => setFiles([])); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const shown = useMemo(() => (rows || []).filter((r) => !q.trim() || r.title.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const rs = useRowSelection(shown);
  const [recipCounts, setRecipCounts] = useState<Record<string, { total: number; signed: number }>>({});
  useEffect(() => {
    // one query per visible page is avoided: counts fetched lazily per open detail; list shows created date only when unknown
    setRecipCounts({});
  }, [org?.id]);

  const openDetail = (req: SignRequest) => {
    setDetail({ req, recips: null, fields: null, events: null });
    listSignRecipients(req.id).then((recips) => setDetail((d) => (d && d.req.id === req.id ? { ...d, recips } : d))).catch(() => {});
    listSignFields(req.id).then((fields) => setDetail((d) => (d && d.req.id === req.id ? { ...d, fields } : d))).catch(() => {});
    listSignEvents(req.id).then((events) => setDetail((d) => (d && d.req.id === req.id ? { ...d, events } : d))).catch(() => {});
  };

  const cell = (id: string, r: SignRequest) => {
    switch (id) {
      case 'title': return <span className="font-medium text-content">{r.title}</span>;
      case 'status': return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium capitalize" style={{ backgroundColor: STATUS_HEX[r.status] + '1f', color: STATUS_HEX[r.status], boxShadow: `inset 0 0 0 1px ${STATUS_HEX[r.status]}33` }}>{r.status}</span>;
      case 'signers': { const c = recipCounts[r.id]; return <span className="text-2xs text-muted tabular-nums">{c ? `${c.signed}/${c.total} signed` : '—'}</span>; }
      case 'created': return <span className="text-2xs text-muted2">{new Date(r.created_at).toLocaleDateString()}</span>;
      default: return '—';
    }
  };

  const newWiz = () => setWiz({
    title: '', message: '', file_id: '', expires: '',
    recips: [{ email: '', name: '', role: 'signer' }],
    fields: [{ type: 'signature', label: 'Signature', required: true, recipEmail: '' }, { type: 'date', label: 'Date signed', required: true, recipEmail: '' }],
  });

  const saveDraft = async (send: boolean) => {
    if (!org || !me || !wiz || busy) return;
    if (!wiz.title.trim()) { setErr('Give the request a title.'); return; }
    const signers = wiz.recips.filter((x) => x.email.trim() && x.role === 'signer');
    if (send && signers.length === 0) { setErr('Add at least one signer.'); return; }
    setBusy(true); setErr('');
    try {
      const req = await createSignRequest({
        org_id: org.id, title: wiz.title.trim(), message: wiz.message.trim() || null,
        file_id: wiz.file_id || null, expires_at: wiz.expires ? new Date(wiz.expires + 'T23:59:59').toISOString() : null, created_by: me.id,
      });
      const byEmail: Record<string, string> = {};
      for (const rc of wiz.recips.filter((x) => x.email.trim())) {
        const row = await addSignRecipient({ request_id: req.id, org_id: org.id, email: rc.email, name: rc.name || null, role: rc.role });
        byEmail[row.email] = row.id;
      }
      const firstSigner = signers[0] ? signers[0].email.trim().toLowerCase() : '';
      for (const f of wiz.fields) {
        const target = (f.recipEmail || firstSigner).trim().toLowerCase();
        const rid = byEmail[target];
        if (!rid) continue;
        await addSignField({ request_id: req.id, org_id: org.id, recipient_id: rid, type: f.type, label: f.label || null, required: f.required });
      }
      if (send) await signSend(req.id);
      setWiz(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const sendExisting = async (req: SignRequest) => {
    if (busy || !confirm(`Send "${req.title}" to its recipients now?`)) return;
    setBusy(true); setErr('');
    try { await signSend(req.id); setDetail(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const voidReq = async (req: SignRequest) => {
    if (busy || !confirm(`Void "${req.title}"? Signer links stop working immediately.`)) return;
    setBusy(true); setErr('');
    try { await updateSignRequest(req.id, { status: 'voided' }); setDetail(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} request${rs.count > 1 ? 's' : ''}? Their audit trail is deleted too.`)) return;
    setBusy(true); setErr('');
    try { for (const r of rs.selected) await deleteSignRequest(r.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const exportValue = (id: string, r: SignRequest) =>
    id === 'title' ? r.title : id === 'status' ? r.status : id === 'created' ? r.created_at : '';

  if (!enabled) return (
    <Layout flat title="Signatures"><EmptyState icon="ti-signature" title="Document Signing not in your plan" text="Upgrade to send documents for e-signature with a full audit trail." /></Layout>
  );

  const GROUPS: GroupMeta[] = ['draft', 'sent', 'completed', 'voided', 'expired'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1), pill: STATUS_PILL[s] || 'pill-gray' }));
  const kpis = { total: (rows || []).length, out: (rows || []).filter((r) => r.status === 'sent').length, done: (rows || []).filter((r) => r.status === 'completed').length };
  const d = detail;

  return (
    <Layout flat title="Signatures">
      <PageHeader title="Signatures" subtitle="Send documents for e-signature — consent, intent and a tamper-evident audit trail included" icon="ti-signature" help="signing"
        action={<button className="btn btn-primary" onClick={newWiz}><Icon name="ti-plus" />New request</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Requests" value={String(kpis.total)} icon="ti-signature" />
        <StatCard label="Out for signature" value={String(kpis.out)} icon="ti-send" />
        <StatCard label="Completed" value={String(kpis.done)} icon="ti-circle-check" />
      </div>

      <ListView
        rows={rows === null ? null : shown}
        rowKey={(r) => r.id}
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        searchPlaceholder="Search requests…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(r) => r.status}
        groups={GROUPS}
        onRowClick={(r) => openDetail(r)}
        exportName="signatures"
        exportValue={exportValue}
        onDelete={() => bulkDelete()}
        canDelete={isAdmin}
        busy={busy}
        emptyIcon="ti-signature"
        emptyText="No signature requests yet — send your first document."
      />

      {wiz && (
        <Modal open onClose={() => setWiz(null)} dirty size="lg" icon="ti-signature" title="New signature request" onSubmit={() => saveDraft(false)}
          footer={<>
            <button className="btn" onClick={() => setWiz(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={() => saveDraft(false)}>Save draft</button>
            <button className="btn btn-primary" disabled={busy || !wiz.title.trim()} onClick={() => saveDraft(true)}>{busy ? 'Working…' : 'Save & send'}</button>
          </>}>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Title" required><input className="input" autoFocus value={wiz.title} onChange={(e) => setWiz({ ...wiz, title: e.target.value })} placeholder="NDA — Acme Corp" /></Field>
              <Field label="Expires (optional)"><input type="date" className="input" value={wiz.expires} onChange={(e) => setWiz({ ...wiz, expires: e.target.value })} /></Field>
              <Field label="Document (from Drive)" className="sm:col-span-2">
                <Select value={wiz.file_id} onChange={(v) => setWiz({ ...wiz, file_id: v })}
                  options={[{ value: '', label: '— No attachment (title only) —' }, ...files.map((f) => ({ value: f.id, label: f.name }))]} />
              </Field>
              <Field label="Message to recipients" className="sm:col-span-2"><input className="input" value={wiz.message} onChange={(e) => setWiz({ ...wiz, message: e.target.value })} placeholder="Please review and sign." /></Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted2">Recipients</span>
                <button className="btn h-7 py-0 text-xs" onClick={() => setWiz({ ...wiz, recips: [...wiz.recips, { email: '', name: '', role: 'signer' }] })}><Icon name="ti-plus" className="text-sm" />Add recipient</button>
              </div>
              <div className="space-y-2">
                {wiz.recips.map((rc, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                    <input className="input h-8 py-0 flex-1 min-w-[10rem]" type="email" value={rc.email} onChange={(e) => setWiz({ ...wiz, recips: wiz.recips.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x) })} placeholder="signer@company.com" />
                    <input className="input h-8 py-0 w-36" value={rc.name} onChange={(e) => setWiz({ ...wiz, recips: wiz.recips.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x) })} placeholder="Name" />
                    <Select width={110} value={rc.role} onChange={(v) => setWiz({ ...wiz, recips: wiz.recips.map((x, xi) => xi === i ? { ...x, role: v as 'signer' | 'cc' } : x) })} options={[{ value: 'signer', label: 'Signer' }, { value: 'cc', label: 'CC (view)' }]} />
                    <button className="text-muted2 hover:text-rose-500" onClick={() => setWiz({ ...wiz, recips: wiz.recips.filter((_, xi) => xi !== i) })}><Icon name="ti-trash" className="text-sm" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-2xs uppercase tracking-wide text-muted2">Fields the signer completes</span>
                <button className="btn h-7 py-0 text-xs" onClick={() => setWiz({ ...wiz, fields: [...wiz.fields, { type: 'text', label: '', required: false, recipEmail: '' }] })}><Icon name="ti-plus" className="text-sm" />Add field</button>
              </div>
              <div className="space-y-2">
                {wiz.fields.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                    <Select width={130} value={f.type} onChange={(v) => setWiz({ ...wiz, fields: wiz.fields.map((x, xi) => xi === i ? { ...x, type: v as SignField['type'] } : x) })} options={FIELD_TYPES} />
                    <input className="input h-8 py-0 flex-1 min-w-[8rem]" value={f.label} onChange={(e) => setWiz({ ...wiz, fields: wiz.fields.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x) })} placeholder="Label" />
                    <Select width={170} value={f.recipEmail} onChange={(v) => setWiz({ ...wiz, fields: wiz.fields.map((x, xi) => xi === i ? { ...x, recipEmail: v } : x) })}
                      options={[{ value: '', label: 'First signer' }, ...wiz.recips.filter((x) => x.email.trim() && x.role === 'signer').map((x) => ({ value: x.email.trim().toLowerCase(), label: x.email.trim() }))]} />
                    <label className="inline-flex items-center gap-1 text-2xs text-muted"><input type="checkbox" checked={f.required} onChange={(e) => setWiz({ ...wiz, fields: wiz.fields.map((x, xi) => xi === i ? { ...x, required: e.target.checked } : x) })} />Required</label>
                    <button className="text-muted2 hover:text-rose-500" onClick={() => setWiz({ ...wiz, fields: wiz.fields.filter((_, xi) => xi !== i) })}><Icon name="ti-trash" className="text-sm" /></button>
                  </div>
                ))}
              </div>
              <p className="text-2xs text-muted2 mt-1.5">Signers get a secure one-time link by email. Date fields fill automatically at signing.</p>
            </div>
          </div>
        </Modal>
      )}

      {d && (
        <Modal open onClose={() => setDetail(null)} size="lg" icon="ti-signature" title={d.req.title}
          footer={<>
            {d.req.status === 'draft' && <button className="btn btn-primary" disabled={busy} onClick={() => sendExisting(d.req)}><Icon name="ti-send" />Send now</button>}
            {d.req.status === 'sent' && <button className="btn" disabled={busy} onClick={() => voidReq(d.req)}><Icon name="ti-ban" />Void request</button>}
            <button className="btn" onClick={() => setDetail(null)}>Close</button>
          </>}>
          <div className="space-y-4 max-h-[62vh] overflow-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
              <span className="inline-flex items-center rounded-md px-2 py-0.5 font-medium capitalize" style={{ backgroundColor: STATUS_HEX[d.req.status] + '1f', color: STATUS_HEX[d.req.status] }}>{d.req.status}</span>
              {d.req.expires_at && <span>expires {new Date(d.req.expires_at).toLocaleDateString()}</span>}
              {d.req.completed_at && <span>completed {new Date(d.req.completed_at).toLocaleString()}</span>}
            </div>
            <div>
              <span className="text-2xs uppercase tracking-wide text-muted2">Recipients</span>
              <div className="space-y-1.5 mt-1.5">
                {(d.recips || []).map((rc) => (
                  <div key={rc.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{rc.name || rc.email}<span className="text-2xs text-muted2 ml-1.5">{rc.email}</span></span>
                    <span className="text-2xs text-muted2 capitalize">{rc.role}</span>
                    <span className={`text-2xs font-medium capitalize ${rc.status === 'signed' ? 'text-emerald-600' : rc.status === 'declined' ? 'text-rose-600' : 'text-muted'}`}>{rc.status}</span>
                  </div>
                ))}
                {d.recips !== null && d.recips.length === 0 && <p className="text-2xs text-muted2">No recipients yet.</p>}
              </div>
            </div>
            {(d.fields || []).length > 0 && (
              <div>
                <span className="text-2xs uppercase tracking-wide text-muted2">Fields</span>
                <div className="space-y-1 mt-1.5">
                  {(d.fields || []).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 text-2xs text-muted">
                      <Icon name={f.type === 'signature' ? 'ti-signature' : f.type === 'date' ? 'ti-calendar' : 'ti-forms'} className="text-sm text-muted2" />
                      <span className="flex-1">{f.label || f.type}{f.required && <span className="text-rose-500"> *</span>}</span>
                      {f.value && <span className="text-content font-medium truncate max-w-[14rem]" style={f.type === 'signature' ? { fontFamily: 'cursive' } : undefined}>{f.value}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <span className="text-2xs uppercase tracking-wide text-muted2">Audit trail (hash-chained)</span>
              <div className="space-y-1 mt-1.5">
                {(d.events || []).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-2 text-2xs">
                    <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    <span className="flex-1 text-muted">{EVENT_LABEL[ev.type] || ev.type}{ev.detail?.email ? ` — ${ev.detail.email}` : ''}{ev.detail?.reason ? ` — "${ev.detail.reason}"` : ''}</span>
                    <span className="text-muted2 tabular-nums">{new Date(ev.at).toLocaleString()}</span>
                    <span className="text-muted2 font-mono" title={`hash ${ev.hash}`}>{ev.hash.slice(0, 8)}</span>
                  </div>
                ))}
                {d.events !== null && d.events.length === 0 && <p className="text-2xs text-muted2">No events yet.</p>}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
