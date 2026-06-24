import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

// Dedicated anon client (schema snrpmo, no session) — the hosted form is public and
// must work for logged-out visitors and inside a third-party iframe.
const pub = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { db: { schema: 'snrpmo' }, auth: { persistSession: false, autoRefreshToken: false } },
);

type PField = { key: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string };
type PForm = { id: string; name: string; fields: PField[]; settings: Record<string, any> };

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = String(ctx.params?.slug || '');
  try {
    const { data, error } = await pub.rpc('form_public_get', { p_slug: slug });
    if (error || !data) return { notFound: true };
    return { props: { form: data as PForm, slug } };
  } catch { return { notFound: true }; }
};

const inp: any = { padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '9px', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#0f172a' };

export default function PublicForm({ form, slug }: { form: PForm; slug: string }) {
  const [v, setV] = useState<Record<string, any>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const accent = (form.settings && form.settings.accent) || '#3ECF8E';
  const submitLabel = (form.settings && form.settings.submit_label) || 'Submit';
  const set = (k: string, val: any) => setV((s) => ({ ...s, [k]: val }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setState('sending'); setMsg('');
    try {
      const { data, error } = await pub.rpc('form_submit', { p_slug: slug, p_data: v, p_source: typeof document !== 'undefined' ? document.referrer : null });
      if (error) throw new Error(error.message);
      const res: any = data || {};
      if (res.redirect) { window.location.href = res.redirect; return; }
      setMsg(res.message || 'Thanks — your response has been received.'); setState('done');
    } catch (err: any) { setMsg(err.message || 'Something went wrong. Please try again.'); setState('error'); }
  };

  return (
    <>
      <Head><title>{form.name}</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f1f5f9' }}>
        <div style={{ width: '100%', maxWidth: '520px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>{form.name}</h1>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: accent + '22', color: accent, display: 'grid', placeItems: 'center', margin: '0 auto 12px', fontSize: 24, fontWeight: 700 }}>✓</div>
              <p style={{ color: '#334155', fontSize: '15px', margin: 0 }}>{msg}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {(form.fields || []).map((f) => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#334155' }}>
                  <span>{f.label}{f.required && <span style={{ color: '#ef4444' }}> *</span>}</span>
                  {f.type === 'textarea' ? (
                    <textarea required={f.required} value={v[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder || ''} rows={4} style={inp} />
                  ) : f.type === 'select' ? (
                    <select required={f.required} value={v[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} style={inp}>
                      <option value="">Select…</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'checkbox' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={v[f.key] === 'Yes'} onChange={(e) => set(f.key, e.target.checked ? 'Yes' : '')} /> <span style={{ color: '#64748b' }}>{f.placeholder || 'Yes'}</span></span>
                  ) : (
                    <input type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'} required={f.required} value={v[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder || ''} style={inp} />
                  )}
                </label>
              ))}
              {state === 'error' && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{msg}</p>}
              <button type="submit" disabled={state === 'sending'} style={{ marginTop: '4px', background: accent, color: '#04150c', border: 0, borderRadius: '10px', padding: '11px 16px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}>{state === 'sending' ? 'Sending…' : submitLabel}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
