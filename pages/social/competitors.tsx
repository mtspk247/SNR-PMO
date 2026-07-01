import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, Spinner } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import AgentPanel from '@/components/AgentPanel';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import {
  listCompetitors, createCompetitor, deleteCompetitor,
  listCompetitorInsights, deleteCompetitorInsight, setCompetitorInsightStatus,
  SocialCompetitor, SocialCompetitorInsight,
} from '@/lib/db';

const PLAT_ICON: Record<string, string> = {
  facebook: 'ti-brand-facebook', instagram: 'ti-brand-instagram', linkedin: 'ti-brand-linkedin', x: 'ti-brand-x',
  youtube: 'ti-brand-youtube', tiktok: 'ti-brand-tiktok', threads: 'ti-brand-threads', pinterest: 'ti-brand-pinterest', google_business: 'ti-brand-google',
};
const KIND: Record<string, { label: string; cls: string; icon: string }> = {
  trend: { label: 'Trend', cls: 'pill-blue', icon: 'ti-trending-up' },
  gap: { label: 'Gap', cls: 'pill-amber', icon: 'ti-arrows-diff' },
  threat: { label: 'Threat', cls: 'pill-violet', icon: 'ti-alert-triangle' },
  opportunity: { label: 'Opportunity', cls: 'pill-green', icon: 'ti-bulb' },
  insight: { label: 'Insight', cls: 'pill-gray', icon: 'ti-eye' },
};
const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'threads', 'pinterest', 'google_business'];

export default function Competitors() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);
  const [comps, setComps] = useState<SocialCompetitor[] | null>(null);
  const [insights, setInsights] = useState<SocialCompetitorInsight[]>([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', platform: 'linkedin', handle: '', url: '' });

  const load = () => {
    if (!org) return;
    listCompetitors(org.id).then(setComps).catch((e) => { setErr(e.message); setComps([]); });
    listCompetitorInsights(org.id).then(setInsights).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Competitor Watch"><EmptyState icon="ti-binoculars" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const add = async () => {
    if (!org || !me || !f.name.trim()) return;
    setBusy(true); setErr('');
    try { await createCompetitor({ org_id: org.id, name: f.name.trim(), platform: f.platform, handle: f.handle.trim() || undefined, url: f.url.trim() || undefined, created_by: me.id }); setOpen(false); setF({ name: '', platform: 'linkedin', handle: '', url: '' }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const removeComp = async (id: string) => { try { await deleteCompetitor(id); load(); } catch (e: any) { setErr(e.message); } };
  const act = async (id: string, status: SocialCompetitorInsight['status']) => { try { await setCompetitorInsightStatus(id, status); load(); } catch (e: any) { setErr(e.message); } };
  const removeIns = async (id: string) => { try { await deleteCompetitorInsight(id); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <Layout flat title="Competitor Watch">
      <PageHeader help="social" title="Competitor Watch" icon="ti-binoculars"
        subtitle="Track competitors and let your agent surface what to do to stay ahead"
        action={isAdmin ? <button className="btn btn-primary" onClick={() => setOpen(true)}><Icon name="ti-plus" />Add competitor</button> : undefined}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Tracked competitors */}
        <div className="lg:col-span-1 space-y-4">
          <div className="card p-3">
            <h3 className="text-sm font-semibold mb-2">Tracked competitors</h3>
            {comps === null ? <Spinner /> : comps.length === 0 ? (
              <p className="text-2xs text-muted2">None yet. Add the competitors you want to watch — the agent drafts insights comparing them to you.</p>
            ) : (
              <ul className="space-y-1.5">
                {comps.map((c) => {
                  const icon = PLAT_ICON[c.platform || ''] || 'ti-world';
                  return (
                    <li key={c.id} className="flex items-center gap-2 text-sm rounded-md border border-line px-2.5 py-1.5">
                      <Icon name={icon} className="text-muted shrink-0" />
                      <span className="flex-1 min-w-0 truncate"><span className="font-medium text-content">{c.name}</span>{c.handle ? <span className="text-2xs text-muted2"> · {c.handle}</span> : null}</span>
                      {isAdmin && <button onClick={() => removeComp(c.id)} className="text-muted2 hover:text-rose-600" title="Remove"><Icon name="ti-x" className="text-xs" /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <AgentPanel domain="marketing" />
        </div>

        {/* Insights feed */}
        <div className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div><h3 className="text-sm font-semibold">Competitive insights</h3><p className="text-2xs text-muted">Drafted by your Competitor Watcher agent — review and action</p></div>
              <span className="text-2xs text-muted2">{insights.filter((i) => i.status === 'new').length} new</span>
            </div>
            {insights.length === 0 ? (
              <div className="p-6"><EmptyState icon="ti-bulb" title="No insights yet" text="Add competitors, then run the Competitor Watcher agent (panel on the left) to draft competitive insights and recommendations." /></div>
            ) : (
              <div className="divide-y divide-line">
                {insights.map((ins) => {
                  const k = KIND[ins.kind] || KIND.insight;
                  return (
                    <div key={ins.id} className={`px-4 py-3 ${ins.status === 'dismissed' ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className={`pill ${k.cls} inline-flex items-center gap-1 shrink-0`}><Icon name={k.icon} className="text-2xs" />{k.label}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-content">{ins.summary}</p>
                          {ins.recommendation && <p className="text-2xs text-muted mt-1"><Icon name="ti-arrow-right" className="text-2xs" /> {ins.recommendation}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-2xs px-1.5 py-0.5 rounded ${ins.status === 'actioned' ? 'text-emerald-600' : ins.status === 'new' ? 'text-amber-600' : 'text-muted2'}`}>{ins.status}</span>
                            {ins.status !== 'actioned' && <button onClick={() => act(ins.id, 'actioned')} className="text-2xs text-muted2 hover:text-emerald-600">Mark actioned</button>}
                            {ins.status === 'new' && <button onClick={() => act(ins.id, 'reviewed')} className="text-2xs text-muted2 hover:text-content">Reviewed</button>}
                            {ins.status !== 'dismissed' && <button onClick={() => act(ins.id, 'dismissed')} className="text-2xs text-muted2 hover:text-content">Dismiss</button>}
                            {isAdmin && <button onClick={() => removeIns(ins.id)} className="text-2xs text-muted2 hover:text-rose-600 ml-auto">Delete</button>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add competitor" icon="ti-binoculars" size="sm"
        footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={add}>{busy ? 'Adding…' : 'Add'}</button></>}>
        <div className="space-y-3">
          <Field label="Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rival Agency" /></Field>
          <Field label="Platform"><Select value={f.platform} onChange={(v) => setF({ ...f, platform: v })} options={PLATFORMS.map((p) => ({ value: p, label: p }))} /></Field>
          <Field label="Handle"><input className="input" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@rival" /></Field>
          <Field label="Profile URL"><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://linkedin.com/company/rival" /></Field>
        </div>
      </Modal>
    </Layout>
  );
}
