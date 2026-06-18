import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, Icon, Spinner, EmptyState } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { sb } from '@/lib/supabase';

const TRIGGERS = [
  { v: 'task.created', l: 'Task created' },
  { v: 'deal.stage_changed', l: 'Deal stage changed' },
  { v: 'deal.won', l: 'Deal won' },
  { v: 'invoice.paid', l: 'Invoice paid' },
];
type Rule = { id: string; name: string; trigger_type: string; match: Record<string, string>; actions: any[]; active: boolean; fire_count: number; last_fired_at: string | null };

export default function AutomationsPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [name, setName] = useState('');
  const [trig, setTrig] = useState('deal.won');
  const [condField, setCondField] = useState('');
  const [condVal, setCondVal] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => { if (!org) return; sb.from('automation_rules').select('*').eq('org_id', org.id).order('created_at', { ascending: false }).then(({ data }) => setRules((data as Rule[]) || [])); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const create = async () => {
    if (!org || busy) return; setBusy(true); setErr('');
    try {
      const match: Record<string, string> = {};
      if (condField.trim() && condVal.trim()) match[condField.trim()] = condVal.trim();
      const { error } = await sb.from('automation_rules').insert({
        org_id: org.id, name: name.trim() || 'Automation', trigger_type: trig,
        match, actions: [{ type: 'notify', title: title.trim(), body: body.trim(), urgent }], active: true,
      } as any);
      if (error) throw error;
      setName(''); setCondField(''); setCondVal(''); setTitle(''); setBody(''); setUrgent(false); load();
    } catch (e: any) { setErr(e.message || 'Could not create automation'); } finally { setBusy(false); }
  };
  const toggle = async (r: Rule) => { await sb.from('automation_rules').update({ active: !r.active }).eq('id', r.id); load(); };
  const del = async (id: string) => { if (!confirm('Delete this automation?')) return; await sb.from('automation_rules').delete().eq('id', id); load(); };

  if (!org) return <Layout flat title="Automations"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="Automations"><EmptyState icon="ti-lock" title="Admins only" text="Automations are managed by workspace owners and admins." /></Layout>;
  const trigLabel = (v: string) => TRIGGERS.find((t) => t.v === v)?.l || v;

  return (
    <Layout flat title="Automations">
      <PageHeader title="Automations" subtitle="When something happens, automatically notify your team" icon="ti-bolt" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="card p-5 mb-5 max-w-3xl">
        <p className="text-sm font-semibold text-content mb-3">New automation</p>
        <div className="space-y-3">
          <div><label className="text-2xs text-muted2 block mb-1">Name</label><input className="input h-9 w-full" placeholder="e.g. Alert on won deals" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted">When</span>
            <select className="input h-9" value={trig} onChange={(e) => setTrig(e.target.value)}>{TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            <span className="text-sm text-muted">only if (optional)</span>
            <input className="input h-9 w-28" placeholder="field" value={condField} onChange={(e) => setCondField(e.target.value)} />
            <span className="text-sm text-muted">=</span>
            <input className="input h-9 w-28" placeholder="value" value={condVal} onChange={(e) => setCondVal(e.target.value)} />
          </div>
          <div className="border-t border-line pt-3">
            <span className="text-sm text-muted">then notify owners &amp; admins</span>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <input className="input h-9" placeholder="Notification title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="input h-9" placeholder="Message (optional)" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 mt-2 text-2xs text-muted"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />Mark as urgent</label>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={create}><Icon name="ti-plus" />Create automation</button>
        </div>
      </div>

      <div className="card p-0 max-w-3xl overflow-hidden">
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
                  <p className="text-2xs text-muted">When <b>{trigLabel(r.trigger_type)}</b>{r.match && Object.keys(r.match).length > 0 ? ' (if ' + Object.entries(r.match).map(([k, v]) => k + '=' + v).join(', ') + ')' : ''} &rarr; notify owners/admins &middot; fired {r.fire_count}&times;{r.last_fired_at ? ' · last ' + new Date(r.last_fired_at).toLocaleDateString() : ''}</p>
                </div>
                <button onClick={() => toggle(r)} className={'btn-ghost text-2xs ' + (r.active ? 'text-emerald-600' : 'text-muted2')}><Icon name={r.active ? 'ti-circle-check' : 'ti-circle'} />{r.active ? 'On' : 'Off'}</button>
                <button onClick={() => del(r.id)} className="btn-ghost text-2xs text-rose-600"><Icon name="ti-trash" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
