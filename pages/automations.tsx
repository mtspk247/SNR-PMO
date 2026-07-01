import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon, Spinner, EmptyState } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import { sb } from '@/lib/supabase';

const TRIGGERS = [
  { v: 'form.submitted', l: 'Form submitted' },
  { v: 'task.created', l: 'Task created' },
  { v: 'project.created', l: 'Project created' },
  { v: 'deal.created', l: 'Deal created' },
  { v: 'client.created', l: 'Client created' },
  { v: 'lead.became_hot', l: 'Lead became hot' },
];
const ACTION_TYPES = [
  { v: 'notify', l: 'Notify owners & admins' },
  { v: 'notify_owner', l: 'Notify the assigned owner' },
  { v: 'create_task', l: 'Create a task' },
  { v: 'set_status', l: 'Set the record’s status' },
  { v: 'assign', l: 'Assign the record' },
  { v: 'send_sms', l: 'Send an SMS to the lead' },
  { v: 'send_email', l: 'Send an email to the lead' },
  { v: 'enroll_sequence', l: 'Enroll the lead in a sequence' },
  { v: 'draft_social_post', l: 'Draft a social post' },
];
const PRIORITIES = ['High', 'Medium', 'Low'];
const FIELD_HINT: Record<string, string> = {
  'form.submitted': 'e.g. form_name',
  'task.created': 'e.g. priority',
  'deal.created': 'e.g. stage',
  'project.created': 'e.g. status',
  'client.created': 'e.g. status',
  'lead.became_hot': 'e.g. source',
};

type Member = { id: string; full_name: string | null; email: string | null };
type Cond = { field: string; value: string };
type Action = { type: string; title?: string; body?: string; subject?: string; urgent?: boolean; value?: string; user_id?: string; name?: string; priority?: string; sequence_id?: string };
type Rule = { id: string; name: string; trigger_type: string; match: Record<string, string>; actions: any[]; active: boolean; fire_count: number; last_fired_at: string | null };
type LogRow = { id: string; rule_name: string | null; event_type: string; detail: string | null; status: string; created_at: string };

export default function AutomationsPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [seqs, setSeqs] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState('');
  const [trig, setTrig] = useState('form.submitted');
  const [conds, setConds] = useState<Cond[]>([]);
  const [actions, setActions] = useState<Action[]>([{ type: 'notify', title: '', body: '', urgent: false }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    if (!org) return;
    sb.from('automation_rules').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRules((data as Rule[]) || []));
    sb.from('automation_logs').select('id, rule_name, event_type, detail, status, created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(25).then(({ data }) => setLogs((data as LogRow[]) || []));
  };
  useEffect(() => {
    load();
    if (org) sb.from('users').select('id, full_name, email').order('full_name').then(({ data }) => setMembers((data as Member[]) || []));
    if (org) sb.from('email_sequences').select('id, name').eq('org_id', org.id).eq('status', 'active').order('name').then(({ data }) => setSeqs((data as { id: string; name: string }[]) || []));
    /* eslint-disable-next-line */
  }, [org?.id]);

  const memberName = (id?: string) => { const m = members.find((x) => x.id === id); return m ? (m.full_name || m.email || 'a teammate') : 'a teammate'; };
  const trigLabel = (v: string) => TRIGGERS.find((t) => t.v === v)?.l || v;

  const addCond = () => setConds((c) => [...c, { field: '', value: '' }]);
  const updCond = (i: number, p: Partial<Cond>) => setConds((c) => c.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const rmCond = (i: number) => setConds((c) => c.filter((_, idx) => idx !== i));
  const addAction = () => setActions((a) => [...a, { type: 'notify', title: '', body: '', urgent: false }]);
  const updAction = (i: number, p: Partial<Action>) => setActions((a) => a.map((x, idx) => (idx === i ? { ...x, ...p } : x)));
  const rmAction = (i: number) => setActions((a) => a.filter((_, idx) => idx !== i));

  const reset = () => { setName(''); setConds([]); setActions([{ type: 'notify', title: '', body: '', urgent: false }]); setTrig('form.submitted'); };

  const create = async () => {
    if (!org || busy) return;
    if (!actions.length) { setErr('Add at least one action.'); return; }
    setBusy(true); setErr('');
    try {
      const match: Record<string, string> = {};
      conds.forEach((c) => { if (c.field.trim() && c.value.trim()) match[c.field.trim()] = c.value.trim(); });
      const cleanActions = actions.map((a) => {
        if (a.type === 'notify') return { type: 'notify', title: (a.title || '').trim(), body: (a.body || '').trim(), urgent: !!a.urgent };
        if (a.type === 'notify_owner') return { type: 'notify_owner', title: (a.title || '').trim(), body: (a.body || '').trim(), urgent: !!a.urgent };
        if (a.type === 'set_status') return { type: 'set_status', value: (a.value || '').trim() };
        if (a.type === 'assign') return { type: 'assign', user_id: a.user_id || '' };
        if (a.type === 'send_sms') return { type: 'send_sms', body: (a.body || '').trim() };
        if (a.type === 'send_email') return { type: 'send_email', subject: (a.subject || '').trim(), body: (a.body || '').trim() };
        if (a.type === 'enroll_sequence') return { type: 'enroll_sequence', sequence_id: a.sequence_id || '' };
        if (a.type === 'draft_social_post') return { type: 'draft_social_post', body: (a.body || '').trim() };
        return { type: 'create_task', name: (a.name || '').trim() || 'Automation task', priority: a.priority || 'Medium' };
      });
      for (const a of cleanActions) {
        if (a.type === 'set_status' && !a.value) throw new Error('A “set status” action needs a status value.');
        if (a.type === 'assign' && !a.user_id) throw new Error('An “assign” action needs a teammate.');
        if (a.type === 'enroll_sequence' && !a.sequence_id) throw new Error('An “enroll in a sequence” action needs a sequence.');
      }
      const { error } = await sb.from('automation_rules').insert({ org_id: org.id, name: name.trim() || 'Automation', trigger_type: trig, match, actions: cleanActions, active: true } as any);
      if (error) throw error;
      reset(); load();
    } catch (e: any) { setErr(e.message || 'Could not create automation'); } finally { setBusy(false); }
  };
  const toggle = async (r: Rule) => { await sb.from('automation_rules').update({ active: !r.active }).eq('id', r.id); load(); };
  const del = async (id: string) => { if (!confirm('Delete this automation?')) return; await sb.from('automation_rules').delete().eq('id', id); load(); };

  if (!org) return <Layout flat title="Automations"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="Automations"><EmptyState icon="ti-lock" title="Admins only" text="Automations are managed by workspace owners and admins." /></Layout>;

  const describeAction = (a: any) => {
    if (!a) return 'do nothing';
    if (a.type === 'set_status') return `set status → ${a.value || '?'}`;
    if (a.type === 'assign') return `assign → ${memberName(a.user_id)}`;
    if (a.type === 'send_sms') return 'text the lead';
    if (a.type === 'send_email') return 'email the lead';
    if (a.type === 'enroll_sequence') return 'enroll lead in ' + (seqs.find((s) => s.id === a.sequence_id)?.name || 'a sequence');
    if (a.type === 'create_task') return `create task “${a.name || 'Automation task'}”`;
    if (a.type === 'draft_social_post') return 'draft a social post';
    if (a.type === 'notify_owner') return 'notify the assigned owner';
    return 'notify owners/admins';
  };
  const describeRule = (r: Rule) => (r.actions || []).map(describeAction).join(', ') || 'no actions';

  return (
    <Layout flat title="Automations">
      <PageHeader help="automations" title="Automations" subtitle="When something happens, automatically act on it — no code" icon="ti-bolt" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid lg:grid-cols-[1fr_20rem] gap-5 items-start">
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-sm font-semibold text-content mb-3">New automation</p>
            <div className="space-y-3">
              <div><label className="text-2xs text-muted2 block mb-1">Name</label><input className="input h-9 w-full" placeholder="e.g. New form lead → notify sales" value={name} onChange={(e) => setName(e.target.value)} /></div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted">When</span>
                <select className="input h-9" value={trig} onChange={(e) => setTrig(e.target.value)}>{TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
              </div>

              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between mb-1.5"><span className="text-2xs uppercase tracking-wide text-muted2">Only if (all match)</span><button className="btn h-7 py-0 text-xs" onClick={addCond}><Icon name="ti-plus" className="text-sm" />Condition</button></div>
                {conds.length === 0 ? <p className="text-2xs text-muted2">Always runs. Add a condition to narrow it.</p> : (
                  <div className="space-y-2">
                    {conds.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input className="input h-8 py-0 flex-1" placeholder={FIELD_HINT[trig] || 'field'} value={c.field} onChange={(e) => updCond(i, { field: e.target.value })} />
                        <span className="text-sm text-muted2">=</span>
                        <input className="input h-8 py-0 flex-1" placeholder="value" value={c.value} onChange={(e) => updCond(i, { value: e.target.value })} />
                        <button className="text-muted2 hover:text-rose-500" onClick={() => rmCond(i)} title="Remove"><Icon name="ti-x" className="text-sm" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-line pt-3">
                <div className="flex items-center justify-between mb-1.5"><span className="text-2xs uppercase tracking-wide text-muted2">Then do</span><button className="btn h-7 py-0 text-xs" onClick={addAction}><Icon name="ti-plus" className="text-sm" />Action</button></div>
                <div className="space-y-2">
                  {actions.map((a, i) => (
                    <div key={i} className="rounded-lg border border-line p-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <select className="input h-8 py-0" value={a.type} onChange={(e) => updAction(i, { type: e.target.value })}>{ACTION_TYPES.filter((t) => t.v !== 'draft_social_post' || hasFeature(org, 'social')).map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
                        {actions.length > 1 && <button className="ml-auto text-muted2 hover:text-rose-500" onClick={() => rmAction(i)} title="Remove action"><Icon name="ti-trash" className="text-sm" /></button>}
                      </div>
                      {(a.type === 'notify' || a.type === 'notify_owner') && (
                        <div className="space-y-2">
                          <div className="grid sm:grid-cols-2 gap-2">
                            <input className="input h-8 py-0" placeholder="Notification title" value={a.title || ''} onChange={(e) => updAction(i, { title: e.target.value })} />
                            <input className="input h-8 py-0" placeholder="Message (optional)" value={a.body || ''} onChange={(e) => updAction(i, { body: e.target.value })} />
                          </div>
                          <label className="flex items-center gap-2 text-2xs text-muted"><input type="checkbox" checked={!!a.urgent} onChange={(e) => updAction(i, { urgent: e.target.checked })} />Mark as urgent</label>
                        </div>
                      )}
                      {a.type === 'set_status' && <input className="input h-8 py-0 w-full" placeholder="Status to set (e.g. Done)" value={a.value || ''} onChange={(e) => updAction(i, { value: e.target.value })} />}
                      {a.type === 'send_sms' && <textarea className="input w-full min-h-[56px] resize-y" placeholder="SMS message to the lead" value={a.body || ''} onChange={(e) => updAction(i, { body: e.target.value })} />}
                      {a.type === 'send_email' && (<div className="space-y-1.5"><input className="input h-8 py-0 w-full" placeholder="Subject" value={a.subject || ''} onChange={(e) => updAction(i, { subject: e.target.value })} /><textarea className="input w-full min-h-[56px] resize-y" placeholder="Email body to the lead" value={a.body || ''} onChange={(e) => updAction(i, { body: e.target.value })} /></div>)}
                      {a.type === 'enroll_sequence' && (seqs.length ? (
                        <select className="input h-8 py-0 w-full" value={a.sequence_id || ''} onChange={(e) => updAction(i, { sequence_id: e.target.value })}>
                          <option value="">Select a sequence…</option>
                          {seqs.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
                        </select>
                      ) : (
                        <p className="text-2xs text-amber-600">No active sequences yet — create one in Sequences first.</p>
                      ))}
                      {a.type === 'draft_social_post' && <textarea className="input w-full min-h-[56px] resize-y" placeholder="Post text (a draft is created for you to review, schedule and publish)" value={a.body || ''} onChange={(e) => updAction(i, { body: e.target.value })} />}
                      {a.type === 'assign' && (
                        <select className="input h-8 py-0 w-full" value={a.user_id || ''} onChange={(e) => updAction(i, { user_id: e.target.value })}>
                          <option value="">Select a teammate…</option>
                          {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
                        </select>
                      )}
                      {a.type === 'create_task' && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <input className="input h-8 py-0 flex-1 min-w-[10rem]" placeholder="New task name" value={a.name || ''} onChange={(e) => updAction(i, { name: e.target.value })} />
                          <select className="input h-8 py-0" value={a.priority || 'Medium'} onChange={(e) => updAction(i, { priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                        </div>
                      )}
                      {(a.type === 'set_status' || a.type === 'assign') && <p className="text-2xs text-muted2">Applies to the record that fired the trigger (task, deal or project).</p>}
                      {(a.type === 'send_sms' || a.type === 'send_email') && <p className="text-2xs text-muted2">Sends to the lead/contact from the trigger (SMS needs Messaging configured). Opt-outs respected.</p>}
                      {a.type === 'enroll_sequence' && <p className="text-2xs text-muted2">Adds the lead from the trigger into a drip sequence — best paired with the Form submitted trigger. Will not double-enroll.</p>}
                      {a.type === 'draft_social_post' && <p className="text-2xs text-muted2">Creates a draft in Social &amp; Content for review — never auto-publishes, so your approval policy stays in control.</p>}
                    </div>
                  ))}
                </div>
              </div>

              <button className="btn btn-primary" disabled={busy} onClick={create}><Icon name="ti-plus" />Create automation</button>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-line"><p className="text-sm font-semibold text-content">Your automations</p></div>
            {rules === null ? <div className="p-8"><Spinner /></div> : rules.length === 0 ? (
              <div className="p-8"><EmptyState icon="ti-bolt" text="No automations yet. Create one above." /></div>
            ) : (
              <div className="divide-y divide-line">
                {rules.map((r) => (
                  <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                    <Icon name="ti-bolt" className={r.active ? 'text-amber-500' : 'text-muted2'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-content">{r.name}</p>
                      <p className="text-2xs text-muted">When <b>{trigLabel(r.trigger_type)}</b>{r.match && Object.keys(r.match).length > 0 ? ' (if ' + Object.entries(r.match).map(([k, v]) => k + '=' + v).join(', ') + ')' : ''} → {describeRule(r)} · fired {r.fire_count}×{r.last_fired_at ? ' · last ' + new Date(r.last_fired_at).toLocaleDateString() : ''}</p>
                    </div>
                    <button onClick={() => toggle(r)} className={'btn-ghost text-2xs ' + (r.active ? 'text-emerald-600' : 'text-muted2')}><Icon name={r.active ? 'ti-circle-check' : 'ti-circle'} />{r.active ? 'On' : 'Off'}</button>
                    <button onClick={() => del(r.id)} className="btn-ghost text-2xs text-rose-600"><Icon name="ti-trash" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center gap-2"><Icon name="ti-history" className="text-muted" /><p className="text-sm font-semibold text-content">Recent activity</p></div>
          {logs.length === 0 ? <div className="p-6"><EmptyState icon="ti-history" text="No automation runs yet." /></div> : (
            <div className="divide-y divide-line max-h-[34rem] overflow-auto">
              {logs.map((l) => (
                <div key={l.id} className="px-4 py-2.5">
                  <p className="text-2xs font-medium text-content truncate">{l.rule_name || 'Automation'}</p>
                  <p className="text-2xs text-muted2">{trigLabel(l.event_type)} · {l.detail || l.status} · {new Date(l.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
