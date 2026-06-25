import { useMemo, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

// Dedicated anon client (schema snrpmo, no session) - the booking page is public.
const pub = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { db: { schema: 'snrpmo' }, auth: { persistSession: false, autoRefreshToken: false } },
);

type BPage = { slug: string; name: string; description: string | null; duration_min: number; buffer_min: number; availability: Record<string, [string, string][]>; timezone: string; booked: { starts_at: string; ends_at: string }[] };

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = String(ctx.params?.slug || '');
  try {
    const { data, error } = await pub.rpc('booking_public_get', { p_slug: slug });
    if (error || !data) return { notFound: true };
    return { props: { page: data as BPage } };
  } catch { return { notFound: true }; }
};

// minutes offset of tz at a given UTC instant (tz - UTC)
function tzOffset(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p: any = {}; dtf.formatToParts(at).forEach((x) => { p[x.type] = x.value; });
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - at.getTime()) / 60000;
}
function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number); const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(guess - tzOffset(tz, new Date(guess)) * 60000);
}
const pad = (n: number) => String(n).padStart(2, '0');
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m: number) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const isoDow = (dateStr: string) => { const d = new Date(dateStr + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
const inp: any = { padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '9px', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#0f172a' };

export default function PublicBooking({ page }: { page: BPage }) {
  const tz = page.timezone || 'UTC';
  const accent = '#3ECF8E';
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '', notes: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  const dates = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 28 && out.length < 14; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
      const ds = d.toISOString().slice(0, 10);
      if ((page.availability?.[String(isoDow(ds))] || []).length) {
        out.push({ value: ds, label: new Date(ds + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) });
      }
    }
    return out;
  }, [page]);

  const slots = useMemo(() => {
    if (!date) return [] as { iso: string; label: string }[];
    const windows = page.availability?.[String(isoDow(date))] || [];
    const step = page.duration_min + page.buffer_min;
    const booked = new Set((page.booked || []).map((b) => new Date(b.starts_at).getTime()));
    const out: { iso: string; label: string }[] = [];
    for (const w of windows) {
      let cur = toMin(w[0]); const end = toMin(w[1]) - page.duration_min;
      while (cur <= end) {
        const utc = zonedToUtc(date, fromMin(cur), tz);
        if (utc.getTime() > Date.now() + 60000 && !booked.has(utc.getTime())) {
          out.push({ iso: utc.toISOString(), label: utc.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }) });
        }
        cur += step;
      }
    }
    return out;
  }, [date, page, tz]);

  const book = async () => {
    if (!slot || !f.name.trim()) return;
    setState('sending'); setMsg('');
    try {
      const { data, error } = await pub.rpc('booking_create', { p_slug: page.slug, p_name: f.name, p_email: f.email || null, p_phone: f.phone || null, p_start: slot, p_notes: f.notes || null, p_source: typeof document !== 'undefined' ? document.referrer : null });
      if (error) throw new Error(error.message);
      setMsg((data as any)?.message || 'You are booked.'); setState('done');
    } catch (e: any) { setMsg(e.message || 'Could not complete the booking.'); setState('error'); }
  };

  const Btns = ({ items, sel, on }: { items: { value: string; label: string }[]; sel: string; on: (v: string) => void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((it) => (
        <button key={it.value} onClick={() => on(it.value)} style={{ border: '1px solid ' + (sel === it.value ? accent : '#cbd5e1'), background: sel === it.value ? accent + '18' : '#fff', color: '#0f172a', borderRadius: 9, padding: '7px 11px', fontSize: 13, cursor: 'pointer' }}>{it.label}</button>
      ))}
    </div>
  );

  return (
    <>
      <Head><title>{'Book - ' + page.name}</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f1f5f9' }}>
        <div style={{ width: '100%', maxWidth: '560px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 4px', color: '#0f172a' }}>{page.name}</h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>{page.duration_min} min{page.description ? ' - ' + page.description : ''} - all times {tz}</p>
          {state === 'done' ? (
            <div style={{ background: accent + '14', border: '1px solid ' + accent + '55', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#0f172a', fontSize: 15 }}>{msg}</div>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>1. Pick a day</p>
              {dates.length === 0 ? <p style={{ color: '#64748b', fontSize: 13, marginTop: 0 }}>No availability right now.</p>
                : <Btns items={dates} sel={date} on={(v) => { setDate(v); setSlot(''); }} />}
              {date && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: '0 0 8px' }}>2. Pick a time</p>
                  {slots.length === 0 ? <p style={{ color: '#64748b', fontSize: 13 }}>No open times that day.</p>
                    : <Btns items={slots.map((s) => ({ value: s.iso, label: s.label }))} sel={slot} on={setSlot} />}
                </div>
              )}
              {slot && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>3. Your details</p>
                  <input placeholder="Your name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={inp} />
                  <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} style={inp} />
                  <input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} style={inp} />
                  <textarea placeholder="Anything we should know? (optional)" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} style={inp} />
                  {state === 'error' && <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{msg}</p>}
                  <button onClick={book} disabled={state === 'sending' || !f.name.trim()} style={{ background: accent, color: '#04150c', border: 0, borderRadius: 10, padding: '11px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: state === 'sending' || !f.name.trim() ? 0.7 : 1 }}>{state === 'sending' ? 'Booking...' : 'Confirm booking'}</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
