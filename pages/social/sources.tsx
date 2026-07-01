import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { PageHeader, EmptyState, Icon, StatCard, HelpHint } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import AgentPanel from '@/components/AgentPanel';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { can } from '@/lib/authz';
import {
  listContentSources, createContentSource, updateContentSource, deleteContentSource,
  listSourceItems, fetchContentSources, draftPostFromItem,
  SocialContentSource, SocialSourceItem,
} from '@/lib/db';

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : '—');
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export default function ContentSources() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isAdmin = can.manageMembers(org);

  const [sources, setSources] = useState<SocialContentSource[] | null>(null);
  const [items, setItems] = useState<SocialSourceItem[]>([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', url: '' });
  const [drafting, setDrafting] = useState<string | null>(null);

  const load = () => {
    if (!org) return;
    listContentSources(org.id).then(setSources).catch((e) => { setErr(e.message); setSources([]); });
    listSourceItems(org.id, { undraftedOnly: true, limit: 100 }).then(setItems).catch(() => {});
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id]);

  if (org && !hasFeature(org, 'social')) {
    return <Layout flat title="Content Sources"><EmptyState icon="ti-rss" title="Social & Content not enabled" text="Ask an admin to enable Social on your plan." /></Layout>;
  }

  const add = async () => {
    if (!org || !me || !f.url.trim()) return;
    setBusy(true); setErr('');
    try {
      await createContentSource({ org_id: org.id, name: f.name.trim() || host(f.url.trim()), url: f.url.trim(), created_by: me.id });
      setOpen(false); setF({ name: '', url: '' }); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await deleteContentSource(id); load(); } catch (e: any) { setErr(e.message); } };
  const toggle = async (s: SocialContentSource) => { try { await updateContentSource(s.id, { active: !s.active }); load(); } catch (e: any) { setErr(e.message); } };

  const fetchNow = async (sourceId?: string) => {
    setFetching(true); setErr(''); setMsg('');
    try {
      const r = await fetchContentSources(sourceId);
      setMsg(`Fetched ${r.fetched} feed${r.fetched === 1 ? '' : 's'} · ${r.new_items} new item${r.new_items === 1 ? '' : 's'}.`);
      load();
    } catch (e: any) { setErr(e.message || 'Fetch failed'); } finally { setFetching(false); }
  };

  const draft = async (it: SocialSourceItem) => {
    if (!me) return;
    setDrafting(it.id); setErr('');
    try { await draftPostFromItem(it, me.id); setItems((xs) => xs.filter((x) => x.id !== it.id)); setMsg('Draft created — find it in Social & Content.'); }
    catch (e: any) { setErr(e.message); } finally { setDrafting(null); }
  };

  const sourceName = (id: string) => sources?.find((s) => s.id === id)?.name || 'feed';
  const activeCount = (sources || []).filter((s) => s.active).length;

  return (
    <Layout flat title="Content Sources">
      <PageHeader help="social" title="Content Sources" icon="ti-rss"
        subtitle="Turn blogs & RSS feeds into ready-to-edit social drafts"
        action={<div className="flex items-center gap-2">
          <button className="btn" disabled={fetching || !(sources || []).length} onClick={() => fetchNow()}><Icon name={fetching ? 'ti-loader-2' : 'ti-refresh'} className={fetching ? 'animate-spin' : ''} />Fetch now</button>
          {isAdmin && <button className="btn btn-primary" onClick={() => { setF({ name: '', url: '' }); setOpen(true); }}><Icon name="ti-plus" />Add source</button>}
        </div>}
      />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 mb-3">{msg}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard label="Sources" value={(sources || []).length} icon="ti-rss" />
        <StatCard label="Active" value={activeCount} icon="ti-plug-connected" />
        <StatCard label="New items" value={items.length} icon="ti-news" />
      </div>

      {/* Sources */}
      <div className="card p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-2"><h3 className="text-sm font-semibold">Feeds</h3><HelpHint anchor="social" /></div>
        {sources === null ? <p className="text-2xs text-muted2">Loading…</p> : sources.length === 0 ? (
          <p className="text-2xs text-muted2">No sources yet. Add an RSS/Atom feed URL (your blog, a news site, a newsletter) and we’ll pull new articles you can turn into posts.</p>
        ) : (
          <div className="space-y-1.5">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm border-b border-line last:border-0 py-1.5">
                <Icon name="ti-rss" className={s.active ? 'text-accent' : 'text-muted2'} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-content truncate">{s.name}</div>
                  <div className="text-2xs text-muted2 truncate">{host(s.url)} · {s.last_fetched_at ? `fetched ${fmt(s.last_fetched_at)}` : 'never fetched'}{s.last_status === 'error' && s.last_error ? ` · error: ${s.last_error}` : ''}</div>
                </div>
                <button className="btn btn-sm" disabled={fetching} onClick={() => fetchNow(s.id)} title="Fetch this feed"><Icon name="ti-refresh" /></button>
                {isAdmin && <label className="inline-flex items-center gap-1 text-2xs text-muted cursor-pointer select-none" title="Active feeds are fetched"><input type="checkbox" checked={s.active} onChange={() => toggle(s)} />Active</label>}
                {isAdmin && <button onClick={() => remove(s.id)} className="text-muted2 hover:text-rose-600" title="Remove"><Icon name="ti-trash" className="text-xs" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New items → draft */}
      <div className="card p-3 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">New items <span className="text-2xs text-muted2 font-normal">({items.length})</span></h3>
        </div>
        {items.length === 0 ? (
          <p className="text-2xs text-muted2">No un-drafted items. Hit “Fetch now” to pull the latest from your active feeds.</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.id} className="flex items-start gap-2 text-sm border-b border-line last:border-0 py-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-content">{it.title || '(untitled)'}</div>
                  {it.summary && <div className="text-2xs text-muted2 line-clamp-2">{it.summary}</div>}
                  <div className="text-2xs text-muted2 mt-0.5">{sourceName(it.source_id)}{it.published_at ? ` · ${new Date(it.published_at).toLocaleDateString()}` : ''}{it.url ? ` · ${host(it.url)}` : ''}</div>
                </div>
                <button className="btn btn-sm btn-primary shrink-0" disabled={drafting === it.id} onClick={() => draft(it)}><Icon name={drafting === it.id ? 'ti-loader-2' : 'ti-pencil-plus'} className={drafting === it.id ? 'animate-spin' : ''} />Draft</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AgentPanel domain="marketing" />

      {/* Add source */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add content source" icon="ti-rss"
        footer={<>
          <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !f.url.trim()} onClick={add}>{busy ? 'Adding…' : 'Add source'}</button>
        </>}>
        <div className="space-y-3">
          <Field label="Feed URL" hint="RSS or Atom feed (e.g. https://blog.example.com/feed)"><input className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…/feed.xml" /></Field>
          <Field label="Name" hint="Optional — defaults to the feed’s domain"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="My blog" /></Field>
          <p className="text-2xs text-muted2">We fetch feeds server-side with safety limits. Only public web feeds are allowed. New articles appear as items you (or an agent) can turn into drafts — approval policy still applies before anything is scheduled.</p>
        </div>
      </Modal>
    </Layout>
  );
}
