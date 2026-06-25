import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { toast } from '@/lib/toast';
import { listSequences, createSequence, updateSequence, deleteSequence, listSteps, saveSteps, listEnrollments, enrollLead, listLeadsLite, Sequence, SequenceEnrollment, LeadLite } from '@/lib/db';

type StepDraft = { channel: 'email' | 'sms'; delayVal: number; delayUnit: 'minutes' | 'hours' | 'days'; subject: string; body: string };
const UNIT_MIN: Record<string, number> = { minutes: 1, hours: 60, days: 1440 };
const toMinutes = (v: number, u: string) => Math.max(0, Math.round(v)) * (UNIT_MIN[u] || 1);
const fromMinutes = (m: number): { delayVal: number; delayUnit: 'minutes' | 'hours' | 'days' } => {
  if (m >= 1440 && m % 1440 === 0) return { delayVal: m / 1440, delayUnit: 'days' };
  if (m >= 60 && m % 60 === 0) return { delayVal: m / 60, delayUnit: 'hours' };
  return { delayVal: m, delayUnit: 'minutes' };
};

export default function SequencesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'sequences');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const [seqs, setSeqs] = useState<Sequence[] | null>(null);
  const [enr, setEnr] = useState<SequenceEnrollment[]>([]);
  const [leads, setLeads] = useState<LeadLite[]>([]);
  const [editor, setEditor] = useState<{ seq: Sequence | null; name: string; status: string; steps: StepDraft[] } | null>(null);
  const [enrollLeadId, setEnrollLeadId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    listSequences(org.id).then(setSeqs).catch((e) => { setErr(e.message); setSeqs([]); });
    listEnrollments(org.id).then(setEnr).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) { load(); listLeadsLite(org.id).then(setLeads).catch(() => {}); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const activeCount = (seqId: string) => enr.filter((e) => e.sequence_id === seqId && e.status === 'active').length;

  const openNew = () => { setErr(''); setEnrollLeadId(''); setEditor({ seq: null, name: '', status: 'active', steps: [{ channel: 'email', delayVal: 0, delayUnit: 'minutes', subject: '', body: '' }] }); };
  const openEdit = async (s: Sequence) => {
    setErr(''); setEnrollLeadId('');
    let steps: StepDraft[] = [];
    try { const ss = await listSteps(s.id); steps = ss.map((x) => ({ channel: x.channel, ...fromMinutes(x.delay_minutes), subject: x.subject || '', body: x.body })); } catch { /* */ }
    if (!steps.length) steps = [{ channel: 'email', delayVal: 0, delayUnit: 'minutes', subject: '', body: '' }];
    setEditor({ seq: s, name: s.name, status: s.status, steps });
  };

  const setStep = (i: number, patch: Partial<StepDraft>) => setEditor((e) => e && { ...e, steps: e.steps.map((s, j) => j === i ? { ...s, ...patch } : s) });
  const addStep = () => setEditor((e) => e && { ...e, steps: [...e.steps, { channel: 'email', delayVal: 1, delayUnit: 'days', subject: '', body: '' }] });
  const rmStep = (i: number) => setEditor((e) => e && { ...e, steps: e.steps.filter((_, j) => j !== i) });
  const moveStep = (i: number, d: number) => setEditor((e) => { if (!e) return e; const j = i + d; if (j < 0 || j >= e.steps.length) return e; const a = e.steps.slice(); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; return { ...e, steps: a }; });

  const save = async () => {
    if (!org || !me || !editor || !editor.name.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      let seqId = editor.seq ? editor.seq.id : '';
      if (seqId) await updateSequence(seqId, { name: editor.name.trim(), status: editor.status as any });
      else { const created = await createSequence({ org_id: org.id, name: editor.name.trim(), created_by: me.id }); seqId = created.id; if (editor.status !== 'active') await updateSequence(seqId, { status: editor.status as any }); }
      await saveSteps(org.id, seqId, editor.steps.map((s) => ({ channel: s.channel, delay_minutes: toMinutes(s.delayVal, s.delayUnit), subject: s.channel === 'email' ? (s.subject || null) : null, body: s.body })));
      toast('Sequence saved', 'success'); setEditor(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const doEnroll = async () => {
    if (!org || !editor || !editor.seq || !enrollLeadId || busy) return; setBusy(true); setErr('');
    try { await enrollLead(org.id, editor.seq.id, enrollLeadId); setEnrollLeadId(''); toast('Lead enrolled', 'success'); listEnrollments(org.id).then(setEnr); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!enabled) return <Layout flat title="Sequences"><EmptyState icon="ti-mail-forward" title="Drip sequences not in your plan" text="Upgrade to nurture leads with multi-step email + SMS campaigns." /></Layout>;

  const kpis = { total: (seqs || []).length, active: (seqs || []).filter((s) => s.status === 'active').length, enrolled: enr.filter((e) => e.status === 'active').length };

  return (
    <Layout flat title="Sequences">
      <PageHeader title="Drip sequences" subtitle="Nurture leads with multi-step email + SMS on a schedule." icon="ti-mail-forward"
        action={<button className="btn btn-primary" onClick={openNew}><Icon name="ti-plus" />New sequence</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Sequences" value={String(kpis.total)} icon="ti-mail-forward" />
        <StatCard label="Active" value={String(kpis.active)} icon="ti-circle-check" />
        <StatCard label="Enrolled" value={String(kpis.enrolled)} icon="ti-users" />
      </div>

      {seqs === null ? <p className="text-2xs text-muted">Loading...</p> : seqs.length === 0 ? (
        <EmptyState icon="ti-mail-forward" title="No sequences yet" text="Create one to nurture leads automatically." />
      ) : (
        <div className="space-y-2">
          {seqs.map((s) => (
            <button key={s.id} onClick={() => openEdit(s)} className="w-full text-left card p-4 flex items-center gap-3 hover:bg-surface2">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-surface2 shrink-0"><Icon name="ti-mail-forward" className="text-accentstrong" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content truncate">{s.name}</p>
                <p className="text-2xs text-muted">{activeCount(s.id)} active enrollment{activeCount(s.id) === 1 ? '' : 's'}</p>
              </div>
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={s.status === 'active' ? { backgroundColor: '#16a34a1f', color: '#16a34a' } : { backgroundColor: '#6b72801f', color: '#6b7280' }}>{s.status}</span>
            </button>
          ))}
        </div>
      )}

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-mail-forward" title={editor.seq ? 'Edit sequence' : 'New sequence'} onSubmit={save}
          footer={<>
            {editor.seq && isAdmin && <button className="btn btn-danger mr-auto" disabled={busy} onClick={async () => { if (!editor.seq || !confirm('Delete this sequence?')) return; setBusy(true); try { await deleteSequence(editor.seq.id); setEditor(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>Delete</button>}
            <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !editor.name.trim()} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
          </>}>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Field label="Name" required><input className="input" autoFocus value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="New lead nurture" /></Field>
            <Field label="Status"><Select value={editor.status} onChange={(v) => setEditor({ ...editor, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'archived', label: 'Archived' }]} /></Field>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2"><Icon name="ti-list-numbers" className="text-muted2" />Steps</h3>
            <button className="btn btn-sm" onClick={addStep}><Icon name="ti-plus" className="text-sm" />Add step</button>
          </div>
          <div className="space-y-2.5">
            {editor.steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-2xs font-semibold text-muted2 w-12">Step {i + 1}</span>
                  <Select value={s.channel} onChange={(v) => setStep(i, { channel: v as any })} options={[{ value: 'email', label: 'Email' }, { value: 'sms', label: 'SMS' }]} />
                  <span className="text-2xs text-muted2">wait</span>
                  <input className="input h-8 py-0 w-16" type="number" min="0" value={s.delayVal} onChange={(e) => setStep(i, { delayVal: Number(e.target.value) })} />
                  <Select value={s.delayUnit} onChange={(v) => setStep(i, { delayUnit: v as any })} options={[{ value: 'minutes', label: 'min' }, { value: 'hours', label: 'hours' }, { value: 'days', label: 'days' }]} />
                  <div className="ml-auto flex items-center gap-1">
                    <button className="text-muted2 hover:text-content" onClick={() => moveStep(i, -1)} title="Move up"><Icon name="ti-arrow-up" className="text-sm" /></button>
                    <button className="text-muted2 hover:text-content" onClick={() => moveStep(i, 1)} title="Move down"><Icon name="ti-arrow-down" className="text-sm" /></button>
                    <button className="text-muted2 hover:text-rose-500" onClick={() => rmStep(i)} title="Remove"><Icon name="ti-trash" className="text-sm" /></button>
                  </div>
                </div>
                {s.channel === 'email' && <input className="input mb-1.5" placeholder="Subject" value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} />}
                <textarea className="input min-h-[56px] resize-y" placeholder={s.channel === 'sms' ? 'SMS text' : 'Email body'} value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} />
              </div>
            ))}
          </div>
          <p className="text-2xs text-muted2 mt-2">Step 1 fires when a lead is enrolled (after its wait); each later step waits the set time after the previous one. SMS steps need Messaging configured and respect opt-outs.</p>

          {editor.seq && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-sm font-semibold mb-2 inline-flex items-center gap-2"><Icon name="ti-user-plus" className="text-muted2" />Enroll a lead</h3>
              <div className="flex items-center gap-2 max-w-md">
                <Select value={enrollLeadId} onChange={setEnrollLeadId} options={[{ value: '', label: 'Pick a lead...' }, ...leads.map((l) => ({ value: l.id, label: l.name + (l.email ? ' - ' + l.email : '') }))]} />
                <button className="btn btn-sm" disabled={!enrollLeadId || busy} onClick={doEnroll}>Enroll</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </Layout>
  );
}
