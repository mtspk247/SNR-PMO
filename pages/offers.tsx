import { useEffect, useMemo, useState } from 'react';
import { titleCase } from '@/lib/format';
import Select from '@/components/Select';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import ConfirmDelete from '@/components/ConfirmDelete';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import {
  listOfferLetters, createOfferLetter, updateOfferLetter, deleteOfferLetter, listApplications,
  OfferLetter, Application,
} from '@/lib/db';

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray',
  sent: 'pill-blue',
  accepted: 'pill-green',
  declined: 'pill-red',
  expired: 'pill-amber',
};
const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'expired'] as const;
type OfferStatus = typeof STATUSES[number];

const fmtMoney = (n: number, c = 'USD') =>
  `${c === 'USD' ? '$' : c + ' '}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
const isPast = (d: string | null) => !!d && new Date(d).getTime() < Date.now();

type Draft = Partial<OfferLetter>;
const emptyDraft = (): Draft => ({
  candidate_name: '',
  job_title: '',
  salary: 0,
  currency: 'USD',
  start_date: null,
  expires_on: null,
  status: 'draft',
  application_id: null,
  notes: '',
});

export default function OffersPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'hr');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');

  const [offers, setOffers] = useState<OfferLetter[] | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [editor, setEditor] = useState<{ draft: Draft } | null>(null);
  const [detail, setDetail] = useState<OfferLetter | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listOfferLetters(org.id)
      .then(setOffers)
      .catch((e: any) => { setErr(e.message); setOffers([]); });
  };

  useEffect(() => {
    if (org?.id && enabled) {
      load();
      listApplications(org.id).then(setApplications).catch(() => {});
    }
    // eslint-disable-next-line
  }, [org?.id, enabled]);

  const appName = (id: string | null) =>
    applications.find((a) => a.id === id)?.candidate_name || null;

  const shown = useMemo(
    () =>
      (offers || []).filter(
        (o) =>
          (statusF === 'all' || o.status === statusF) &&
          (!q.trim() ||
            `${o.candidate_name} ${o.job_title || ''}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [offers, q, statusF],
  );

  const kpis = useMemo(() => {
    const all = offers || [];
    const sent = all.filter((o) => o.status === 'sent');
    const accepted = all.filter((o) => o.status === 'accepted');
    const salaryTotal = all
      .filter((o) => o.status === 'sent' || o.status === 'accepted')
      .reduce((t, o) => t + Number(o.salary || 0), 0);
    return { total: all.length, sent: sent.length, accepted: accepted.length, salaryTotal };
  }, [offers]);

  const setD = (patch: Draft) =>
    setEditor((e) => e && { ...e, draft: { ...e.draft, ...patch } });

  const save = async () => {
    if (!org || !me || !editor || !editor.draft.candidate_name?.trim() || busy) return;
    setBusy(true);
    setErr('');
    const d = editor.draft;
    const payload = {
      org_id: org.id,
      created_by: me.id,
      candidate_name: d.candidate_name!.trim(),
      job_title: d.job_title || null,
      salary: Number(d.salary) || 0,
      currency: d.currency || 'USD',
      start_date: d.start_date || null,
      expires_on: d.expires_on || null,
      status: (d.status || 'draft') as OfferStatus,
      application_id: d.application_id || null,
      notes: d.notes || null,
    };
    try {
      await createOfferLetter(payload);
      setEditor(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveDetail = async (patch: Draft) => {
    if (!detail || busy) return;
    setBusy(true);
    setErr('');
    try {
      const updated = await updateOfferLetter(detail.id, patch);
      setDetail(updated ?? { ...detail, ...patch });
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };


  if (!enabled)
    return (
      <Layout flat title="Offer letters">
        <EmptyState icon="ti-mail-off" title="HR not in your plan" text="Upgrade to manage offer letters." />
      </Layout>
    );

  return (
    <Layout flat title="Offer letters">
      <PageHeader
        title="Offer letters"
        subtitle="Manage and track offer letters for candidates"
        icon="ti-mail"
        action={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setEditor({ draft: emptyDraft() })}>
              <Icon name="ti-plus" />New offer
            </button>
          )
        }
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={String(kpis.total)} icon="ti-mail" />
        <StatCard label="Sent" value={String(kpis.sent)} icon="ti-send" />
        <StatCard label="Accepted" value={String(kpis.accepted)} icon="ti-circle-check" hintTone={kpis.accepted ? 'up' : 'muted'} />
        <StatCard label="Total salary (sent/accepted)" value={fmtMoney(kpis.salaryTotal)} icon="ti-cash" />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input h-9 w-56"
          placeholder="Search candidate or title…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-40"><Select value={statusF} onChange={(v) => setStatusF(v)} options={[{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} /></div>
      </div>

      <div className="card overflow-hidden">
        {offers === null ? (
          <div className="p-8"><Spinner /></div>
        ) : shown.length === 0 ? (
          <div className="p-8"><EmptyState icon="ti-mail" text="No offer letters yet." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm list-card">
              <thead className="bg-surface2 text-muted text-left text-2xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Candidate</th>
                  <th className="px-4 py-3">Job title</th>
                  <th className="px-4 py-3 text-right">Salary</th>
                  <th className="px-4 py-3">Start date</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => {
                  const expired = isPast(o.expires_on) && o.status === 'sent';
                  return (
                    <tr
                      key={o.id}
                      className="border-t border-line hover:bg-surface2/50 cursor-pointer"
                      onClick={() => setDetail(o)}
                    >
                      <td className="px-4 py-3 font-medium text-content">{o.candidate_name}</td>
                      <td className="px-4 py-3 text-muted">{o.job_title || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(o.salary, o.currency)}</td>
                      <td className="px-4 py-3 text-2xs text-muted">{fmtDate(o.start_date)}</td>
                      <td className="px-4 py-3 text-2xs">
                        {o.expires_on ? (
                          <span className={expired ? 'text-rose-600 font-medium' : 'text-muted'}>
                            {fmtDate(o.expires_on)}{expired ? ' · overdue' : ''}
                          </span>
                        ) : (
                          <span className="text-muted2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`pill ${STATUS_PILL[o.status] || 'pill-gray'}`}>{o.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New offer editor modal */}
      {editor && (
        <Modal
          open
          onClose={() => setEditor(null)}
          size="lg"
          icon="ti-mail"
          title="New offer letter"
          onSubmit={() => save()}
          footer={
            <>
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={busy || !editor.draft.candidate_name?.trim()}
                onClick={save}
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Candidate name" required>
              <input
                className="input"
                autoFocus
                value={editor.draft.candidate_name || ''}
                onChange={(e) => setD({ candidate_name: e.target.value })}
                placeholder="Jane Smith"
              />
            </Field>
            <Field label="Job title">
              <input
                className="input"
                value={editor.draft.job_title || ''}
                onChange={(e) => setD({ job_title: e.target.value })}
                placeholder="Software Engineer"
              />
            </Field>
            <Field label="Salary">
              <input
                className="input"
                type="number"
                value={editor.draft.salary ?? 0}
                onChange={(e) => setD({ salary: Number(e.target.value) })}
              />
            </Field>
            <Field label="Currency">
              <input
                className="input"
                value={editor.draft.currency || 'USD'}
                onChange={(e) => setD({ currency: e.target.value })}
              />
            </Field>
            <Field label="Start date">
              <input
                className="input"
                type="date"
                value={editor.draft.start_date || ''}
                onChange={(e) => setD({ start_date: e.target.value || null })}
              />
            </Field>
            <Field label="Expires on">
              <input
                className="input"
                type="date"
                value={editor.draft.expires_on || ''}
                onChange={(e) => setD({ expires_on: e.target.value || null })}
              />
            </Field>
            <Field label="Status">
              <Select value={editor.draft.status || 'draft'} onChange={(v) => setD({ status: v as OfferStatus })} options={[...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
            </Field>
            <Field label="Application">
              <Select value={editor.draft.application_id || ''} onChange={(v) => setD({ application_id: v || null })} options={[{ value: '', label: 'None' }, ...applications.map((a) => ({ value: a.id, label: a.candidate_name }))]} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea
                className="input min-h-[80px]"
                value={editor.draft.notes || ''}
                onChange={(e) => setD({ notes: e.target.value })}
                placeholder="Additional notes…"
              />
            </Field>
          </div>
        </Modal>
      )}

      {detail && (
        <DetailModal
          offer={detail}
          applications={applications}
          canEdit={isAdmin}
          orgId={org?.id}
          currentUserId={me?.id}
          onClose={() => setDetail(null)}
          onSave={saveDetail}
          onDelete={() => { setDetail(null); load(); }}
          busy={busy}
        />
      )}
    </Layout>
  );
}

function DetailModal({
  offer, applications, canEdit, orgId, currentUserId, onClose, onSave, onDelete, busy,
}: {
  offer: OfferLetter;
  applications: Application[];
  canEdit: boolean;
  orgId?: string;
  currentUserId?: string;
  onClose: () => void;
  onSave: (patch: Draft) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Draft>({ ...offer });
  const setF = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));
  const isDirty = JSON.stringify(draft) !== JSON.stringify(offer);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon="ti-mail"
      title={offer.candidate_name}
      subtitle={offer.job_title || undefined}
      footer={
        <>
          {canEdit && (
            <ConfirmDelete entityType="offer" id={offer.id} name={offer.candidate_name}
              className="btn btn-danger mr-auto" onDeleted={onDelete} />
          )}
          <a className="btn" href={`/templates?type=offer&client_name=${encodeURIComponent(offer.candidate_name || '')}&amount=${offer.salary || 0}&currency=${encodeURIComponent(offer.currency || 'USD')}`} title="Draft a branded offer letter from a template"><Icon name="ti-file-export" />Generate document</a>
          <button className="btn" onClick={onClose}>Close</button>
          {canEdit && (
            <button
              className="btn btn-primary"
              disabled={busy || !isDirty}
              onClick={() => onSave(draft)}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Candidate name" required>
          <input
            className="input"
            value={draft.candidate_name || ''}
            onChange={(e) => setF({ candidate_name: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Job title">
          <input
            className="input"
            value={draft.job_title || ''}
            onChange={(e) => setF({ job_title: e.target.value })}
            disabled={!canEdit}
            placeholder="—"
          />
        </Field>
        <Field label="Salary">
          <input
            className="input"
            type="number"
            value={draft.salary ?? 0}
            onChange={(e) => setF({ salary: Number(e.target.value) })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Currency">
          <input
            className="input"
            value={draft.currency || 'USD'}
            onChange={(e) => setF({ currency: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Start date">
          <input
            className="input"
            type="date"
            value={draft.start_date || ''}
            onChange={(e) => setF({ start_date: e.target.value || null })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Expires on">
          <input
            className="input"
            type="date"
            value={draft.expires_on || ''}
            onChange={(e) => setF({ expires_on: e.target.value || null })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Status">
          <Select value={draft.status || 'draft'} onChange={(v) => setF({ status: v as OfferStatus })} disabled={!canEdit} options={[...STATUSES.map((s) => ({ value: s, label: titleCase(s) }))]} />
        </Field>
        <Field label="Application">
          <Select value={draft.application_id || ''} onChange={(v) => setF({ application_id: v || null })} disabled={!canEdit} options={[{ value: '', label: 'None' }, ...applications.map((a) => ({ value: a.id, label: a.candidate_name }))]} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea
            className="input min-h-[80px]"
            value={draft.notes || ''}
            onChange={(e) => setF({ notes: e.target.value })}
            disabled={!canEdit}
            placeholder="—"
          />
        </Field>
      </div>

      <div className="mt-4 pt-3 border-t border-line">
        <Attachments
          entityType="offer_letter"
          entityId={offer.id}
          orgId={orgId}
          currentUserId={currentUserId}
        />
      </div>
    </Modal>
  );
}
