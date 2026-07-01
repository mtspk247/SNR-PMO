import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, HelpHint } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Select from '@/components/Select';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import { ListView } from '@/components/ListView';
import AgentPanel from '@/components/AgentPanel';
import { useListPrefs, ColDef, FilterDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { GroupMeta } from '@/components/DataList';
import {
  listSocialPosts, createSocialPost, deleteSocialPost,
  listSocialChannels, createSocialChannel, deleteSocialChannel,
  SocialPost, SocialChannel, SocialPlatform,
  getBrandVoice, setBrandVoice, getApprovalPolicy, setApprovalPolicy, approveSocialPost, updateSocialPost,
  listMediaAssets, SocialMediaAsset,
  socialChannelConnStatus, socialChannelDisconnect, SocialChannelConn, socialOauthBegin,
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
  { id: 'approval', label: 'Approval' },
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
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Composer
  const [composeOpen, setComposeOpen] = useState(false);
  const [body, setBody] = useState('');
  const [pickedChannels, setPickedChannels] = useState<string[]>([]);
  const [mediaAssets, setMediaAssets] = useState<SocialMediaAsset[]>([]);
  const [pickedMedia, setPickedMedia] = useState<string[]>([]);
  const [conns, setConns] = useState<Record<string, SocialChannelConn>>({});
  const [scheduleAt, setScheduleAt] = useState('');

  // Channel connect
  const [chanOpen, setChanOpen] = useState(false);
  const [chPlatform, setChPlatform] = useState<SocialPlatform>('linkedin');
  const [chHandle, setChHandle] = useState('');
  const [chBusy, setChBusy] = useState(false);

  // Brand voice
  const [bvOpen, setBvOpen] = useState(false);
  const [bv, setBv] = useState<{ tone: string; audience: string; guidelines: string; cta: string; hashtags: string }>({ tone: '', audience: '', guidelines: '', cta: '', hashtags: '' });
  const [bvBusy, setBvBusy] = useState(false);
  const [reqApproval, setReqApproval] = useState(false);

  // Bulk schedule
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedStart, setSchedStart] = useState('');
  const [schedEvery, setSchedEvery] = useState<'daily' | 'weekdays' | 'every2' | 'weekly'>('daily');

  const router = useRouter();
  const load = () => {
    if (!org) return;
    listSocialPosts(org.id).then(setPosts).catch((e) => { setErr(e.message); setPosts([]); });
    listSocialChannels(org.id).then(async (chs) => {
      setChannels(chs);
      const rs = await Promise.all(chs.map((c) => socialChannelConnStatus(c.id).catch(() => null)));
      const m: Record<string, SocialChannelConn> = {}; chs.forEach((c, i) => { if (rs[i]) m[c.id] = rs[i]!; }); setConns(m);
    }).catch(() => {});
    getApprovalPolicy(org.id).then(setReqApproval).catch(() => {});
    listMediaAssets(org.id, { limit: 60 }).then(setMediaAssets).catch(() => {});
    getBrandVoice(org.id).then((v) => { if (v) setBv({ tone: v.tone || '', audience: v.audience || '', guidelines: v.guidelines || '', cta: v.cta || '', hashtags: (v.hashtags || []).join(' ') }); }).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);
  useEffect(() => {
    if (!router.isReady) return;
    const c = router.query.connected as string | undefined;
    const e = router.query.connect_error as string | undefined;
    if (c) { setMsg(`${c} account connected.`); router.replace('/social', undefined, { shallow: true }); load(); }
    else if (e) { setErr(`Couldn\u2019t connect: ${e.replace(/_/g, ' ')}`); router.replace('/social', undefined, { shallow: true }); }
    /* eslint-disable-next-line */
  }, [router.isReady]);

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

  const resetComposer = () => { setBody(''); setPickedChannels([]); setScheduleAt(''); setPickedMedia([]); };

  const submitPost = async (mode: 'draft' | 'schedule') => {
    if (!org || !me || !body.trim()) return;
    if (mode === 'schedule' && !scheduleAt) { setErr('Pick a date/time to schedule.'); return; }
    setBusy(true); setErr('');
    try {
      const media = mediaAssets.filter((a) => pickedMedia.includes(a.id)).map((a) => ({ asset_id: a.id, url: a.url, kind: a.kind, thumb_url: a.thumb_url, title: a.title }));
      await createSocialPost({
        org_id: org.id, created_by: me.id, body: body.trim(),
        status: mode === 'schedule' ? 'scheduled' : 'draft',
        scheduled_at: mode === 'schedule' ? new Date(scheduleAt).toISOString() : null,
        channel_ids: pickedChannels, media,
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

  const saveBrandVoice = async () => {
    if (!org || !me) return;
    setBvBusy(true); setErr('');
    try {
      await setBrandVoice(org.id, me.id, { tone: bv.tone || null, audience: bv.audience || null, guidelines: bv.guidelines || null, cta: bv.cta || null, hashtags: bv.hashtags.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean) });
      setBvOpen(false);
    } catch (e: any) { setErr(e.message || 'Failed'); } finally { setBvBusy(false); }
  };

  const toggleApproval = async () => {
    if (!org || !me) return;
    const next = !reqApproval; setReqApproval(next);
    try { await setApprovalPolicy(org.id, me.id, next); } catch (e: any) { setErr(e.message); setReqApproval(!next); }
  };
  const disconnectChannel = async (id: string) => {
    try { await socialChannelDisconnect(id); load(); } catch (e: any) { setErr(e.message); }
  };
  const connectChannel = async (id: string, provider: string) => {
    setErr('');
    try { const url = await socialOauthBegin(id, provider); window.location.href = url; }
    catch (e: any) { setErr(e.message); }
  };
  const bulkApprove = async () => {
    if (!rs.count) return; setBusy(true); setErr('');
    try { for (const p of rs.selected) if (!p.approved_at) await approveSocialPost(p.id); rs.clear(); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const slotAt = (base: Date, i: number, every: string) => {
    const d = new Date(base);
    if (every === 'weekly') d.setDate(d.getDate() + i * 7);
    else if (every === 'every2') d.setDate(d.getDate() + i * 2);
    else if (every === 'weekdays') { let added = 0; while (added < i) { d.setDate(d.getDate() + 1); const g = d.getDay(); if (g !== 0 && g !== 6) added++; } }
    else d.setDate(d.getDate() + i);
    return d;
  };
  const schedTargets = rs.selected.filter((p) => p.status === 'draft' || p.status === 'scheduled');
  const bulkSchedule = async () => {
    if (!schedTargets.length || !schedStart) return; setBusy(true); setErr('');
    const base = new Date(schedStart);
    try {
      let i = 0;
      for (const p of schedTargets) { await updateSocialPost(p.id, { status: 'scheduled', scheduled_at: slotAt(base, i, schedEvery).toISOString() }); i++; }
      setSchedOpen(false); rs.clear(); load();
    } catch (e: any) {
      const m = e.message || '';
      setErr(m.includes('approval') || m.includes('42501') ? 'Some selected posts need approval before they can be scheduled. Approve them first, then bulk-schedule.' : m);
    } finally { setBusy(false); }
  };

  const cell = (id: string, row: SocialPost) => {
    switch (id) {
      case 'content': return <span className="font-medium text-content">{row.body ? row.body.slice(0, 80) : '(empty)'}{row.body.length > 80 ? '…' : ''}</span>;
      case 'status': return <span className={`pill ${STATUS_PILL[row.status] || 'pill-gray'} capitalize`}>{row.status}</span>;
      case 'approval': return row.approved_at ? <span className="pill pill-green">Approved</span> : reqApproval ? <span className="pill pill-amber">Needs approval</span> : <span className="text-muted2 text-2xs">\u2014</span>;
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
      case 'approval': return row.approved_at ? 'approved' : (reqApproval ? 'needs approval' : '');
      case 'source': return row.source;
      case 'created': return row.created_at;
      default: return '';
    }
  };


  return (
    <Layout flat title="Social & Content">
      <PageHeader help="social" title="Social & Content" icon="ti-speakerphone"
        subtitle="Plan, schedule and publish posts across your channels"
        action={<div className="flex items-center gap-2">{isAdmin && <button className="btn" onClick={() => setBvOpen(true)}><Icon name="ti-message-star" />Brand voice</button>}<button className="btn btn-primary" onClick={() => { resetComposer(); setComposeOpen(true); }}><Icon name="ti-pencil-plus" />Compose</button></div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}

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
          <div className="flex items-center gap-2">{isAdmin && <label className="inline-flex items-center gap-1.5 text-2xs text-muted cursor-pointer select-none" title="Require owner/admin approval before a post can be scheduled or published"><input type="checkbox" checked={reqApproval} onChange={toggleApproval} />Require approval</label>}{isAdmin && <button className="btn btn-sm" onClick={() => setChanOpen(true)}><Icon name="ti-plus" />Add channel</button>}</div>
        </div>
        {channels.length === 0 ? (
          <p className="text-2xs text-muted2">No channels yet. Add the social accounts you post to. Live publishing connects via each platform once provider sign-in is enabled.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => {
              const m = platMeta(c.platform);
              const conn = conns[c.id];
              const expired = conn?.expires_at ? new Date(conn.expires_at).getTime() < Date.now() : false;
              const label = conn?.connected && !expired ? 'connected' : expired ? 'expired' : 'not connected';
              const tone = conn?.connected && !expired ? 'text-emerald-600' : expired ? 'text-amber-600' : 'text-muted2';
              return (
                <span key={c.id} className="pill pill-gray inline-flex items-center gap-1.5">
                  <Icon name={m.icon} />{c.handle || m.label}
                  <span className={`text-2xs ${tone}`}>{label}</span>
                  {isAdmin && !(conn?.connected && !expired) && <button onClick={() => connectChannel(c.id, c.platform)} className="text-2xs text-accent hover:text-accentstrong font-medium" title="Sign in and authorize this account">{expired ? 'Reconnect' : 'Connect'}</button>}
                  {isAdmin && conn?.connected && <button onClick={() => disconnectChannel(c.id)} className="text-2xs text-muted2 hover:text-rose-600" title="Disconnect account">Disconnect</button>}
                  {isAdmin && <button onClick={() => removeChannel(c.id)} className="text-muted2 hover:text-rose-600" title="Remove channel"><Icon name="ti-x" className="text-xs" /></button>}
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
        bulkActions={isAdmin ? () => <><button className="btn h-8 text-xs" disabled={busy} onClick={() => { setSchedStart(''); setSchedOpen(true); }}><Icon name="ti-calendar-plus" className="text-xs" />Schedule</button><button className="btn h-8 text-xs" disabled={busy} onClick={bulkApprove}><Icon name="ti-circle-check" className="text-xs" />Approve</button></> : undefined}
        busy={busy}
      />

      <div className="mt-6"><AgentPanel domain="marketing" /></div>

      {/* Bulk schedule */}
      <Modal open={schedOpen} onClose={() => setSchedOpen(false)} title="Bulk schedule" icon="ti-calendar-plus"
        footer={<>
          <button className="btn" onClick={() => setSchedOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !schedStart || !schedTargets.length} onClick={bulkSchedule}><Icon name="ti-clock" />{busy ? 'Scheduling\u2026' : `Schedule ${schedTargets.length} post${schedTargets.length === 1 ? '' : 's'}`}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-2xs text-muted2">Spreads the {schedTargets.length} eligible selected post{schedTargets.length === 1 ? '' : 's'} across a cadence from the first slot, same time each slot. Only drafts/scheduled posts are moved. Your approval policy still applies.</p>
          <Field label="First slot"><input type="datetime-local" className="input" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} /></Field>
          <Field label="Cadence"><Select value={schedEvery} onChange={(v) => setSchedEvery(v as any)} options={[{ value: 'daily', label: 'Every day' }, { value: 'weekdays', label: 'Weekdays only' }, { value: 'every2', label: 'Every 2 days' }, { value: 'weekly', label: 'Weekly' }]} /></Field>
        </div>
      </Modal>

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
          <div>
            <label className="text-2xs text-muted block mb-1">Media <span className="text-muted2">(from your library)</span></label>
            {mediaAssets.length === 0 ? (
              <p className="text-2xs text-muted2">No media yet — add reusable creatives in <a className="text-accent underline" href="/social/media">Media Library</a>.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaAssets.map((a) => {
                  const on = pickedMedia.includes(a.id);
                  const preview = a.thumb_url || (a.kind === 'image' ? a.url : '');
                  return (
                    <button key={a.id} type="button" title={a.title} onClick={() => setPickedMedia((s) => on ? s.filter((x) => x !== a.id) : [...s, a.id])}
                      className={`relative shrink-0 w-14 h-14 rounded overflow-hidden border-2 ${on ? 'border-accent' : 'border-transparent'} bg-surface2 flex items-center justify-center`}>
                      {preview ? <img src={preview} alt={a.title} className="w-full h-full object-cover" loading="lazy" /> : <Icon name={a.kind === 'video' ? 'ti-video' : 'ti-photo'} className="text-lg text-muted2" />}
                      {on && <span className="absolute top-0.5 right-0.5 bg-accent text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"><Icon name="ti-check" className="text-2xs" /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Field label="Schedule (optional)"><input type="datetime-local" className="input" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} /></Field>
          <p className="text-2xs text-muted2">Live publishing to connected platforms activates once provider sign-in is enabled. Until then, scheduled posts queue here.</p>
        </div>
      </Modal>

      {/* Brand voice */}
      <Modal open={bvOpen} onClose={() => setBvOpen(false)} title="Brand voice" icon="ti-message-star" size="md"
        footer={<><button className="btn" onClick={() => setBvOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={bvBusy} onClick={saveBrandVoice}>{bvBusy ? 'Saving\u2026' : 'Save'}</button></>}>
        <div className="space-y-3">
          <p className="text-2xs text-muted">Your agents draft on-brand using this. Applies to AI-generated posts and replies.</p>
          <Field label="Tone"><input className="input" value={bv.tone} onChange={(e) => setBv({ ...bv, tone: e.target.value })} placeholder="Confident, helpful, no hype" /></Field>
          <Field label="Audience"><input className="input" value={bv.audience} onChange={(e) => setBv({ ...bv, audience: e.target.value })} placeholder="Agency owners & ops leads" /></Field>
          <Field label="Guidelines"><textarea className="input min-h-[70px]" value={bv.guidelines} onChange={(e) => setBv({ ...bv, guidelines: e.target.value })} placeholder="Lead with a hook; one CTA; no jargon; short sentences." /></Field>
          <Field label="Preferred CTA"><input className="input" value={bv.cta} onChange={(e) => setBv({ ...bv, cta: e.target.value })} placeholder="Book a demo" /></Field>
          <Field label="Default hashtags"><input className="input" value={bv.hashtags} onChange={(e) => setBv({ ...bv, hashtags: e.target.value })} placeholder="#ops #agencylife" /></Field>
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
