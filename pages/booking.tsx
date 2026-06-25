import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Select from '@/components/Select';
import { PageHeader, EmptyState, Icon, StatCard } from '@/components/ui';
import { Modal, Field } from '@/components/Modal';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { useListPrefs, ColDef } from '@/components/ListToolbar';
import { useRowSelection } from '@/components/RowSelection';
import { ListView } from '@/components/ListView';
import { toast } from '@/lib/toast';
import { listBookingPages, createBookingPage, updateBookingPage, deleteBookingPage, listAppointments, setAppointmentStatus, getOrgUsers, BookingPage, Appointment } from '@/lib/db';
import { OrgUser } from '@/lib/supabase';

const DOW: [string, string][] = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['7', 'Sun']];
const COLS: ColDef[] = [
  { id: 'name', label: 'Booking page', locked: true },
  { id: 'duration', label: 'Length', width: 90 },
  { id: 'days', label: 'Days' },
  { id: 'status', label: 'Status', width: 100 },
  { id: 'link', label: 'Public link' },
];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
type Draft = { id?: string; name: string; slug: string; description: string; duration_min: number; buffer_min: number; timezone: string; assignee_id: string; days: Set<string>; start: string; end: string; published: boolean };
const emptyDraft = (): Draft => ({ name: '', slug: '', description: '', duration_min: 30, buffer_min: 0, timezone: browserTz(), assignee_id: '', days: new Set(['1', '2', '3', '4', '5']), start: '09:00', end: '17:00', published: true });

export default function BookingAdmin() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const enabled = hasFeature(org, 'booking');
  const [pages, setPages] = useState<BookingPage[] | null>(null);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [editor, setEditor] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prefs = useListPrefs('snrpmo.booking.cols', COLS);

  const load = () => {
    if (!org) return;
    listBookingPages(org.id).then(setPages).catch((e) => { setErr(e.message); setPages([]); });
    listAppointments(org.id).then(setAppts).catch(() => {});
  };
  useEffect(() => { if (org?.id && enabled) { load(); getOrgUsers(org.id).then(setUsers).catch(() => {}); } /* eslint-disable-next-line */ }, [org?.id, enabled]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shown = useMemo(() => { const q = prefs.query.trim().toLowerCase(); return (pages || []).filter((p) => !q || p.name.toLowerCase().includes(q)); }, [pages, prefs.query]);
  const rs = useRowSelection(shown);

  const daysLabel = (a: BookingPage['availability']) => DOW.filter(([k]) => (a?.[k] || []).length).map(([, l]) => l).join(', ') || '-';
  const cell = (id: string, p: BookingPage) => {
    switch (id) {
      case 'name': return <span className="font-medium text-content">{p.name}</span>;
      case 'duration': return <span>{p.duration_min} min</span>;
      case 'days': return <span className="text-xs text-muted">{daysLabel(p.availability)}</span>;
      case 'status': return <span className="inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium" style={p.status === 'published' ? { backgroundColor: '#16a34a1f', color: '#16a34a' } : { backgroundColor: '#6b72801f', color: '#6b7280' }}>{p.status}</span>;
      case 'link': return p.status === 'published'
        ? <button className="text-2xs text-accentstrong inline-flex items-center gap-1" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(origin + '/book/' + p.slug); toast('Public link copied', 'success'); }}><Icon name="ti-link" className="text-xs" />/book/{p.slug}</button>
        : <span className="text-2xs text-muted2">publish to share</span>;
      default: return '-';
    }
  };

  const openEdit = (p: BookingPage) => {
    const ks = DOW.map(([k]) => k).filter((k) => (p.availability?.[k] || []).length);
    const win = ks.length ? p.availability[ks[0]][0] : ['09:00', '17:00'];
    setErr('');
    setEditor({ id: p.id, name: p.name, slug: p.slug, description: p.description || '', duration_min: p.duration_min, buffer_min: p.buffer_min, timezone: p.timezone, assignee_id: p.assignee_id || '', days: new Set(ks), start: win[0], end: win[1], published: p.status === 'published' });
  };
  const setD = (patch: Partial<Draft>) => setEditor((e) => e && { ...e, ...patch });

  const save = async () => {
    if (!org || !me || !editor || !editor.name.trim() || busy) return;
    if (editor.start >= editor.end) { setErr('End time must be after start time.'); return; }
    if (editor.days.size === 0) { setErr('Pick at least one available day.'); return; }
    setBusy(true); setErr('');
    const availability: Record<string, [string, string][]> = {};
    editor.days.forEach((k) => { availability[k] = [[editor.start, editor.end]]; });
    const slug = (editor.slug || slugify(editor.name)) || ('book-' + Date.now());
    const common = { name: editor.name.trim(), slug, description: editor.description || null, duration_min: editor.duration_min, buffer_min: editor.buffer_min, timezone: editor.timezone || 'UTC', assignee_id: editor.assignee_id || null, availability, status: (editor.published ? 'published' : 'draft') as string };
    try {
      if (editor.id) await updateBookingPage(editor.id, common as any);
      else await createBookingPage({ org_id: org.id, created_by: me.id, ...common });
      setEditor(null); load();
    } catch (e: any) { setErr(/duplicate|unique/i.test(e.message || '') ? 'That link (slug) is already taken - pick another.' : e.message); } finally { setBusy(false); }
  };

  const upcoming = useMemo(() => appts.filter((a) => a.status === 'confirmed' && a.starts_at > new Date().toISOString()).slice(0, 12), [appts]);

  if (!enabled) return <Layout flat title="Booking"><EmptyState icon="ti-calendar-plus" title="Booking not in your plan" text="Upgrade to publish branded booking pages that capture leads automatically." /></Layout>;

  const kpis = { total: (pages || []).length, published: (pages || []).filter((p) => p.status === 'published').length, upcoming: upcoming.length };

  return (
    <Layout flat title="Booking">
      <PageHeader title="Booking" subtitle="Branded booking pages - visitors pick a slot, you get a lead." icon="ti-calendar-plus"
        action={<button className="btn btn-primary" onClick={() => { setErr(''); setEditor(emptyDraft()); }}><Icon name="ti-plus" />New booking page</button>} />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}

      <div className="grid grid-cols-3 gap-4 mb-5">
        <StatCard label="Booking pages" value={String(kpis.total)} icon="ti-calendar-plus" />
        <StatCard label="Published" value={String(kpis.published)} icon="ti-circle-check" />
        <StatCard label="Upcoming" value={String(kpis.upcoming)} icon="ti-clock" />
      </div>

      <ListView rows={pages === null ? null : shown} rowKey={(p) => p.id} cols={COLS} prefs={prefs} cell={cell} selection={rs}
        searchPlaceholder="Search booking pages" onRowClick={openEdit} busy={busy} emptyIcon="ti-calendar-plus" emptyText="No booking pages yet. Create one to start taking appointments."
        exportName="booking-pages" exportValue={(id, p) => id === 'name' ? p.name : id === 'duration' ? String(p.duration_min) : id === 'status' ? p.status : id === 'link' ? '/book/' + p.slug : ''} />

      <div className="card p-5 mt-5">
        <h3 className="text-sm font-semibold mb-3 inline-flex items-center gap-2"><Icon name="ti-clock" className="text-muted2" />Upcoming appointments</h3>
        {upcoming.length === 0 ? <p className="text-2xs text-muted">No upcoming appointments yet.</p> : (
          <div className="space-y-1.5">
            {upcoming.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                <span className="text-sm text-content font-medium truncate">{a.name}</span>
                <span className="text-2xs text-muted2 hidden sm:inline">{new Date(a.starts_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {a.email && <span className="text-2xs text-muted truncate hidden md:inline">{a.email}</span>}
                <div className="ml-auto shrink-0">
                  <Select value={a.status} onChange={async (v) => { try { await setAppointmentStatus(a.id, v as any); load(); } catch (e: any) { setErr(e.message); } }}
                    options={[{ value: 'confirmed', label: 'Confirmed' }, { value: 'completed', label: 'Completed' }, { value: 'no_show', label: 'No-show' }, { value: 'cancelled', label: 'Cancelled' }]} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editor && (
        <Modal open onClose={() => setEditor(null)} size="lg" icon="ti-calendar-plus" title={editor.id ? 'Edit booking page' : 'New booking page'} onSubmit={save}
          footer={<>
            {editor.id && <button className="btn btn-danger mr-auto" disabled={busy} onClick={async () => { if (!editor.id || !confirm('Delete this booking page?')) return; setBusy(true); try { await deleteBookingPage(editor.id); setEditor(null); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}>Delete</button>}
            <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !editor.name.trim()} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
          </>}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" required><input className="input" autoFocus value={editor.name} onChange={(e) => setD({ name: e.target.value, slug: editor.id ? editor.slug : slugify(e.target.value) })} placeholder="Intro call" /></Field>
            <Field label="Public link (slug)"><div className="flex items-center"><span className="text-muted2 text-xs mr-1">/book/</span><input className="input" value={editor.slug} onChange={(e) => setD({ slug: slugify(e.target.value) })} placeholder="intro-call" /></div></Field>
            <Field label="Meeting length"><Select value={String(editor.duration_min)} onChange={(v) => setD({ duration_min: Number(v) })} options={[15, 30, 45, 60, 90].map((m) => ({ value: String(m), label: m + ' min' }))} /></Field>
            <Field label="Buffer between"><Select value={String(editor.buffer_min)} onChange={(v) => setD({ buffer_min: Number(v) })} options={[0, 5, 10, 15, 30].map((m) => ({ value: String(m), label: m + ' min' }))} /></Field>
            <Field label="Timezone"><input className="input" value={editor.timezone} onChange={(e) => setD({ timezone: e.target.value })} placeholder="UTC" /></Field>
            <Field label="Meeting with"><Select value={editor.assignee_id} onChange={(v) => setD({ assignee_id: v })} options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: u.id, label: u.full_name || u.email }))]} /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea className="input min-h-[60px] resize-y" value={editor.description} onChange={(e) => setD({ description: e.target.value })} placeholder="What this meeting is for" /></Field>
            <div className="sm:col-span-2">
              <label className="label">Available days</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DOW.map(([k, l]) => { const on = editor.days.has(k); return (
                  <button key={k} type="button" onClick={() => setD({ days: (() => { const n = new Set(editor.days); on ? n.delete(k) : n.add(k); return n; })() })}
                    className={'rounded-md border px-2.5 py-1 text-xs ' + (on ? 'border-accent bg-accent/10 text-accentstrong' : 'border-line text-muted')}>{l}</button>
                ); })}
              </div>
            </div>
            <Field label="From"><input type="time" className="input" value={editor.start} onChange={(e) => setD({ start: e.target.value })} /></Field>
            <Field label="To"><input type="time" className="input" value={editor.end} onChange={(e) => setD({ end: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={editor.published} onChange={(e) => setD({ published: e.target.checked })} />Published (live and accepting bookings)</label>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
