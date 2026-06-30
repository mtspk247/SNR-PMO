import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, HelpHint } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import { ListView } from '@/components/ListView';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import {
  listSocialPosts, createSocialPost, deleteSocialPost,
  listSocialChannels, createSocialChannel, deleteSocialChannel,
  SocialPost, SocialChannel, SocialPlatform,
} from '@/lib/db';

const PLATFORMS: { value: SocialPlatform; label: string; icon: string }[] = [
  { value: 'facebook', label: 'Facebook', icon: 'ti-brand-facebook' },
  { value: 'instagram', label: 'Instagram', icon: 'ti-brand-instagram' },
  { value: 'linkedin', label: 'LinkedIn', icon: 'ti-brand-linkedin' },
  { value: 'x', label: 'X (Twitter)', icon: 'ti-brand-x' },
  { value: 'youtube', label: 'YouTube', icon: 'ti-brand-youtube' },
  { value: 'tiktok', label: 'TikTok', icon: 'ti-brand-tiktok' },
  { value: 'threads', label: 'Threads', icon: 'ti-brand-threads' },
  { value: 'pinterest', label: 'Pinterest', icon: 'ti-brand-pinterest' },
  { value: 'google_business', label: 'Google Business', icon: 'ti-brand-google' },
];
const platMeta = (p: string) => PLATFORMS.find((x) => x.value === p) || { label: p, icon: 'ti-world' };

const STATUS_PILL: Record<string, string> = {
  draft: 'pill-gray', scheduled: 'pill-amber', published: 'pill-green', failed: 'pill-rose', cancelled: 'pill-gray',
};
const GROUPS: GroupMeta[] = [
  { value: 'draft', label: 'Draft', pill: 'pill-gray' },
  { value: 'scheduled', label: 'Scheduled', pill: 'pill-amber' },
  { value: 'published', label: 'Published', pill: 'pill-green' },
  { value: 'failed', label: 'Failed', pill: 'pill-rose' },
  { value: 'cancelled', label: 'Cancelled', pill: 'pill-gray' },
];
const COLS: ColDef[] = [
  { id: 'content', label: 'Content', locked: true },
  { id: 'status', label: 'Status' },
  { id: 'channels', label: 'Channels' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'source', label: 'Source' },
  { id: 'created', label: 'Created' },
];
const FILTERS: FilterDef[] = [
  { id: 'status', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, ...GROUPS.map((g) => ({ value: g.value, label: g.label }))] },
];
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');

export default function SocialPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);

  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Composer
  const [composeOpen, setComposeOpen] = useState(false);
  const [body, setBody] = useState('');
  const [pickedChannels, setPickedChannels] = useState<string[]>([]);
  const [scheduleAt, setScheduleAt] = useState('');

  // Channel connect
  const [chanOpen, setChanOpen] = useState(false);
  const [chPlatform, setChPlatform] = useState<SocialPlatform>('linkedin');
  const [chHandle, setChHandle] = useState('');
  const [chBusy, setChBusy] = useState(false);

  const load = () => {
    if (!org) return;
    listSocialPosts(org.id).then(setPosts).catch((e) => { setErr(e.message); setPosts([]); });
    listSocialChannels(org.id).then(setChannels).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  const prefs = useListPrefs('snrpmo.social_posts.cols', COLS, { entity: 'social_posts', orgId: org?.id, canManage: isAdmin });
  const q = (prefs.query || '').toLowerCase();
  const statusF = prefs.filters.status || 'all';
  const shown = useMemo(() =>
    (posts || []).filter((p) =>
      (statusF === 'all' || p.status === statusF) &&
      (!q || p.body.toLowerCase().includes(q))
    ), [posts, statusF, q]);
  const rs = useRowSelection(shown);
  const counts = useMemo(() => {
    const r = posts || [];
    return { total: r.length, scheduled: r.filter((x) => x.status === 'scheduled').length, published: r.filter((x) => x.status === 'published').length, channels: channels.length };
  }, [posts, channels]);

  if (org && !hasFeature(org, 'social')) {
    return (
      <Layout flat title="Social & Content">
        <EmptyState icon="ti-speakerphone" title="Social & Content not enabled"
          text="Plan, schedule and publish across your social channels. Ask an admin to enable Social on your plan (Settings ▸ Modules)." />
      </Layout>
    );
  }

  const resetComposer = () => { setBody(''); setPickedChannels([]); setScheduleAt(''); };

  const submitPost = async (mode: 'draft' | 'schedule') => {
    if (!org || !me || !body.trim()) return;
    if (mode === 'schedule' && !scheduleAt) { setErr('Pick a date/time to schedule.'); return; }
    setBusy(true); setErr('');
    try {
      await createSocialPost({
        org_id: org.id, created_by: me.id, body: body.trim(),
        status: mode === 'schedule' ? 'scheduled' : 'draft',
        scheduled_at: mode === 'schedule' ? new Date(scheduleAt).toISOString() : null,
        channel_ids: pickedChannels,
      });
      setComposeOpen(false); resetComposer(); load();
    } catch (e: any) { setErr(e.message || 'Failed to save'); } finally { setBusy(false); }
  };

  const addChannel = async () => {
    if (!org || !me) return;
    setChBusy(true); setErr('');
    try {
      await createSocialChannel({ org_id: org.id, platform: chPlatform, handle: chHandle.trim() || undefined, display_name: chHandle.trim() || undefined, created_by: me.id });
      setChanOpen(false); setChHandle(''); load();
    } catch (e: any) { setErr(e.message || 'Failed'); } finally { setChBusy(false); }
  };
  const removeChannel = async (id: string) => {
    try { await deleteSocialChannel(id); load(); } catch (e: any) { setErr(e.message); }
  };
  const bulkDelete = async () => {
    if (!rs.count || !confirm(`Delete ${rs.count} post${rs.count > 1 ? 's' : ''}? This can't be undone.`)) return;
    setBusy(true); setErr('');
    try { for (const p of rs.selected) await deleteSocialPost(p.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const cell = (id: string, row: SocialPost) => {
    switch (id) {
      case 'content': return <span className="font-medium text-content">{row.body ? row.body.slice(0, 80) : '(empty)'}{row.body.length > 80 ? '…' : ''}</span>;
      case 'status': return <span className={`pill ${STATUS_PILL[row.status] || 'pill-gray'} capitalize`}>{row.status}</span>;
      case 'channels': {
        const cs = row.channels || [];
        if (!cs.length) return <span className="text-muted2 text-2xs">—</span>;
        return <span className="inline-flex items-center gap-1">{cs.slice(0, 5).map((c) => {
          const ch = channels.find((x) => x.id === c.channel_id);
          const m = platMeta(ch?.platform || '');
          return <Icon key={c.id} name={m.icon} className="text-base text-muted" title={m.label} />;
        })}{cs.length > 5 ? <span className="text-2xs text-muted2">+{cs.length - 5}</span> : null}</span>;
      }
      case 'scheduled': return <span className="text-2xs text-muted tabular-nums">{row.status === 'scheduled' ? fmt(row.scheduled_at) : '—'}</span>;
      case 'source': return <span className="text-2xs text-muted capitalize">{row.source}</span>;
      case 'created': return <span className="text-2xs text-muted2 tabular-nums">{fmt(row.created_at)}</span>;
      default: return null;
    }
  };
  const exportValue = (id: string, row: SocialPost) => {
    switch (id) {
      case 'content': return row.body;
      case 'status': return row.status;
      case 'channels': return String((row.channels || []).length);
      case 'scheduled': return row.scheduled_at || '';
      case 'source': return row.source;
      case 'created': return row.created_at;
      default: return '';
    }
  };


  return (
    <Layout flat title="Social & Content">
      <PageHeader help="social" title="Social & Content" icon="ti-speakerphone"
        subtitle="Plan, schedule and publish posts across your channels"
        action={<button className="btn btn-primary" onClick={() => { resetComposer(); setComposeOpen(true); }}><Icon name="ti-pencil-plus" />Compose</button>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard label="Posts" value={counts.total} icon="ti-news" />
        <StatCard label="Scheduled" value={counts.scheduled} icon="ti-clock" />
        <StatCard label="Published" value={counts.published} icon="ti-circle-check" />
        <StatCard label="Channels" value={counts.channels} icon="ti-plug-connected" />
      </div>

      {/* Channels strip */}
      <div className="card p-3 mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5"><h3 className="text-sm font-semibold">Channels</h3><HelpHint anchor="social" /></div>
          {isAdmin && <button className="btn btn-sm" onClick={() => setChanOpen(true)}><Icon name="ti-plus" />Add channel</button>}
        </div>
        {channels.length === 0 ? (
          <p className="text-2xs text-muted2">No channels yet. Add the social accounts you post to. Live publishing connects via each platform once provider sign-in is enabled.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => {
              const m = platMeta(c.platform);
              return (
                <span key={c.id} className="pill pill-gray inline-flex items-center gap-1.5">
                  <Icon name={m.icon} />{c.handle || m.label}
                  <span className={`text-2xs ${c.status === 'connected' ? 'text-emerald-600' : 'text-muted2'}`}>{c.status}</span>
                  {isAdmin && <button onClick={() => removeChannel(c.id)} className="text-muted2 hover:text-rose-600" title="Remove"><Icon name="ti-x" className="text-xs" /></button>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <ListView
        rows={posts === null ? null : shown}
        rowKey={(p) => p.id}
        orderKey="snrpmo.social_posts.roworder"
        cols={COLS}
        prefs={prefs}
        cell={cell}
        selection={rs}
        filters={FILTERS}
        searchPlaceholder="Search posts…"
        groupField={{ value: 'status', label: 'Status' }}
        groupOf={(p) => p.status}
        groups={GROUPS}
        onRowClick={(p) => { setBody(p.body); setComposeOpen(true); }}
        exportName="social-posts"
        exportValue={exportValue}
        onDelete={isAdmin ? bulkDelete : undefined}
        canDelete={isAdmin}
        busy={busy}
      />

      {/* Composer */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Compose post" icon="ti-pencil-plus" size="lg"
        footer={<>
          <button className="btn" onClick={() => setComposeOpen(false)}>Cancel</button>
          <button className="btn" disabled={busy || !body.trim()} onClick={() => submitPost('draft')}>{busy ? 'Saving…' : 'Save draft'}</button>
          <button className="btn btn-primary" disabled={busy || !body.trim() || !scheduleAt} onClick={() => submitPost('schedule')}><Icon name="ti-clock" />Schedule</button>
        </>}>
        <div className="space-y-3">
          <Field label="Post"><textarea className="input min-h-[120px]" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What do you want to share?" /></Field>
          <div>
            <label className="text-2xs text-muted block mb-1">Channels</label>
            {channels.length === 0 ? <p className="text-2xs text-muted2">Add a channel first to target it.</p> : (
              <div className="flex flex-wrap gap-2">
                {channels.map((c) => {
                  const m = platMeta(c.platform); const on = pickedChannels.includes(c.id);
                  return <button key={c.id} type="button" onClick={() => setPickedChannels((s) => on ? s.filter((x) => x !== c.id) : [...s, c.id])}
                    className={`pill inline-flex items-center gap-1.5 ${on ? 'pill-green' : 'pill-gray'}`}><Icon name={m.icon} />{c.handle || m.label}</button>;
                })}
              </div>
            )}
          </div>
          <Field label="Schedule (optional)"><input type="datetime-local" className="input" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} /></Field>
          <p className="text-2xs text-muted2">Live publishing to connected platforms activates once provider sign-in is enabled. Until then, scheduled posts queue here.</p>
        </div>
      </Modal>

      {/* Add channel */}
      <Modal open={chanOpen} onClose={() => setChanOpen(false)} title="Add channel" icon="ti-plug" size="sm"
        footer={<><button className="btn" onClick={() => setChanOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={chBusy} onClick={addChannel}>{chBusy ? 'Adding…' : 'Add'}</button></>}>
        <div className="space-y-3">
          <Field label="Platform"><Select value={chPlatform} onChange={(v) => setChPlatform(v as SocialPlatform)} options={PLATFORMS.map((p) => ({ value: p.value, label: p.label }))} /></Field>
          <Field label="Handle / page name"><input className="input" value={chHandle} onChange={(e) => setChHandle(e.target.value)} placeholder="@youragency" /></Field>
          <p className="text-2xs text-muted2">This registers the channel. Connecting it for live posting (OAuth) is enabled in a later step.</p>
        </div>
      </Modal>
    </Layout>
  );
}
