import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon, Avatar } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import Attachments from '@/components/Attachments';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { useTeams } from '@/lib/queries';
import { listMyNotices, noticeCreate, noticeMarkRead, getOrgUsers, Notice } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const AUD_TYPES = [
  { v: 'org', label: 'Everyone' }, { v: 'team', label: 'Specific team(s)' },
  { v: 'user', label: 'Specific people' }, { v: 'department', label: 'A department' }, { v: 'guests', label: 'Guests' },
];

export default function NoticesPage() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const isStaff = (org?.member_role || '') !== 'guest';
  const { data: teams = [] } = useTeams();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [rows, setRows] = useState<Notice[] | null>(null);
  const [detail, setDetail] = useState<Notice | null>(null);
  const [compose, setCompose] = useState<{ title: string; body: string; audience_type: string; ids: Record<string, boolean>; department: string } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  const load = () => { if (org) listMyNotices(org.id).then(setRows).catch((e) => { setErr(e.message); setRows([]); }); };
  useEffect(() => { if (org?.id) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); } /* eslint-disable-next-line */ }, [org?.id]);

  const name = (uid?: string | null) => users.find((u) => u.id === uid)?.full_name || 'Someone';
  const departments = useMemo(() => Array.from(new Set(users.map((u: any) => u.department).filter(Boolean))) as string[], [users]);
  const isUnread = (n: Notice) => n.mine && n.mine.length > 0 && !n.mine[0].read_at;
  const audienceLabel = (n: Notice) => n.audience_type === 'org' ? 'Everyone' : n.audience_type === 'guests' ? 'Guests' : n.audience_type === 'department' ? (n.department || 'Department') : n.audience_type === 'team' ? `${n.audience_ids.length} team(s)` : `${n.audience_ids.length} people`;

  const open = (n: Notice) => { setDetail(n); if (isUnread(n)) noticeMarkRead(n.id).then(() => setRows((p) => (p || []).map((x) => (x.id === n.id ? { ...x, mine: [{ read_at: new Date().toISOString() }] } : x)))).catch(() => {}); };
  const router = useRouter();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const id = router.query.notice as string | undefined;
    if (id && rows && opened.current !== id) { const n = rows.find((x) => x.id === id); if (n) { opened.current = id; open(n); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.notice, rows]);

  const submit = async () => {
    if (!org || !compose || !compose.title.trim() || busy) return;
    setBusy(true); setErr('');
    const ids = Object.keys(compose.ids).filter((k) => compose.ids[k]);
    if ((compose.audience_type === 'team' || compose.audience_type === 'user') && ids.length === 0) { setErr('Pick at least one recipient.'); setBusy(false); return; }
    if (compose.audience_type === 'department' && !compose.department) { setErr('Pick a department.'); setBusy(false); return; }
    try {
      const id = await noticeCreate({ org_id: org.id, title: compose.title.trim(), body: compose.body.trim() || undefined, audience_type: compose.audience_type, audience_ids: ids, department: compose.department || undefined });
      setCompose(null); load();
      const fresh = await listMyNotices(org.id); const created = fresh.find((x) => x.id === id); if (created) setDetail(created);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Layout flat title="Notice board">
      <PageHeader title="Notice board" subtitle="Announcements to your teams, people, departments and guests" icon="ti-speakerphone"
        action={isStaff ? <button className="btn btn-primary" onClick={() => setCompose({ title: '', body: '', audience_type: 'org', ids: {}, department: '' })}><Icon name="ti-plus" />Post notice</button> : undefined} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      {rows === null ? <Spinner /> : rows.length === 0 ? (
        <div className="card p-8"><EmptyState icon="ti-speakerphone" text="No notices yet." /></div>
      ) : (
        <div className="space-y-2.5 max-w-3xl">
          {rows.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={`card p-4 w-full text-left transition hover:bg-surface2/50 ${isUnread(n) ? 'border-l-2 border-l-accent' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                {n.pinned && <Icon name="ti-pin" className="text-amber-500 text-sm" />}
                <span className="text-sm font-medium text-content">{n.title}</span>
                {isUnread(n) && <span className="w-2 h-2 rounded-full bg-accent" />}
                <span className="ml-auto text-2xs text-muted2">{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
              {n.body && <p className="text-2xs text-muted truncate">{n.body}</p>}
              <p className="text-2xs text-muted2 mt-1 inline-flex items-center gap-1.5"><Avatar name={name(n.created_by)} size={16} />{name(n.created_by)} · <span className="chip">{audienceLabel(n)}</span></p>
            </button>
          ))}
        </div>
      )}

      {compose && (
        <Modal open onClose={() => setCompose(null)} size="md" icon="ti-speakerphone" title="Post a notice" onSubmit={() => submit()}
          footer={<><button className="btn" onClick={() => setCompose(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !compose.title.trim()} onClick={submit}>{busy ? 'Posting…' : 'Post notice'}</button></>}>
          <Field label="Title" required><input className="input" autoFocus value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} /></Field>
          <Field label="Message"><textarea className="input min-h-[90px] py-2" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder="Write your announcement… (you can attach a document after posting)" /></Field>
          <Field label="Send to"><select className="input" value={compose.audience_type} onChange={(e) => setCompose({ ...compose, audience_type: e.target.value, ids: {}, department: '' })}>{AUD_TYPES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></Field>
          {compose.audience_type === 'team' && (
            <div className="max-h-40 overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {teams.length === 0 ? <p className="text-2xs text-muted2 p-3">No teams.</p> : teams.map((t: any) => (
                <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface2"><input type="checkbox" className="accent-accent w-4 h-4" checked={!!compose.ids[t.id]} onChange={(e) => setCompose({ ...compose, ids: { ...compose.ids, [t.id]: e.target.checked } })} />{t.name}</label>
              ))}
            </div>
          )}
          {compose.audience_type === 'user' && (
            <div className="max-h-40 overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {users.map((u) => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-surface2"><input type="checkbox" className="accent-accent w-4 h-4" checked={!!compose.ids[u.id]} onChange={(e) => setCompose({ ...compose, ids: { ...compose.ids, [u.id]: e.target.checked } })} /><Avatar name={u.full_name || 'U'} size={20} />{u.full_name}</label>
              ))}
            </div>
          )}
          {compose.audience_type === 'department' && (
            <Field label="Department"><select className="input" value={compose.department} onChange={(e) => setCompose({ ...compose, department: e.target.value })}><option value="">Select…</option>{departments.map((d) => <option key={d} value={d}>{d}</option>)}</select></Field>
          )}
        </Modal>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} size="md" icon="ti-speakerphone" title={detail.title}
          subtitle={`${name(detail.created_by)} · ${new Date(detail.created_at).toLocaleString()}`}
          footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}>
          <div className="flex items-center gap-2 mb-2"><span className="chip">{audienceLabel(detail)}</span>{detail.pinned && <span className="pill pill-amber">Pinned</span>}</div>
          {detail.body && <p className="text-sm text-content whitespace-pre-wrap">{detail.body}</p>}
          <div className="mt-4 pt-3 border-t border-line">
            <Attachments entityType="notice" entityId={detail.id} orgId={org?.id} currentUserId={me?.id} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}
