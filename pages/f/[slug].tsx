import { useMemo, useState } from 'react';
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

type PJump = { op?: string; value?: string; to?: string };
type PField = { key: string; label: string; type: string; required?: boolean; options?: string[]; placeholder?: string; jumps?: PJump[]; next?: string };
type PForm = { id: string; name: string; kind?: string; fields: PField[]; settings: Record<string, any>; survey_meta?: Record<string, any> };

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = String(ctx.params?.slug || '');
  try {
    const { data, error } = await pub.rpc('form_public_get', { p_slug: slug });
    if (error || !data) return { notFound: true };
    return { props: { form: data as PForm, slug } };
  } catch { return { notFound: true }; }
};

const inp: any = { padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '9px', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#0f172a' };

// Mirrors the server-side walk in form_submit: first matching jump wins, then the
// field's `next`, else the following question; '_end', unknown or backward targets end.
const isNum = (x: string) => /^-?\d+(\.\d+)?$/.test(x);
function jumpTarget(f: PField, ans: string): string | null {
  for (const j of f.jumps || []) {
    const v = j.value ?? ''; const op = j.op || 'eq';
    const hit =
      op === 'eq' ? ans === v :
      op === 'ne' ? ans !== v :
      op === 'lte' ? (isNum(ans) && isNum(v) && parseFloat(ans) <= parseFloat(v)) :
      op === 'gte' ? (isNum(ans) && isNum(v) && parseFloat(ans) >= parseFloat(v)) :
      op === 'includes' ? (',' + ans.split(', ').join(',') + ',').includes(',' + v + ',') : false;
    if (hit) return j.to || null;
  }
  return null;
}
function nextIndex(fields: PField[], idx: number, ans: string): number {
  const f = fields[idx];
  const target = jumpTarget(f, ans) ?? (f.next || null);
  if (target === null) return idx + 1 < fields.length ? idx + 1 : -1;
  if (target === '_end') return -1;
  const ni = fields.findIndex((x) => x.key === target);
  return ni > idx ? ni : -1;
}
// Answers actually on the respondent's path (keeps abandoned branches out of the data).
function pathAnswers(fields: PField[], v: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}; let i = 0, steps = 0;
  while (i >= 0 && i < fields.length && steps++ < 200) {
    const k = fields[i].key;
    if (v[k] !== undefined && v[k] !== '') out[k] = v[k];
    i = nextIndex(fields, i, String(v[k] ?? ''));
  }
  if (v['_hpx']) out['_hpx'] = v['_hpx'];
  return out;
}

const CSAT = [
  { v: '1', e: '😞', l: 'Very unsatisfied' }, { v: '2', e: '😕', l: 'Unsatisfied' }, { v: '3', e: '😐', l: 'Neutral' },
  { v: '4', e: '🙂', l: 'Satisfied' }, { v: '5', e: '😍', l: 'Very satisfied' },
];

export default function PublicForm({ form, slug }: { form: PForm; slug: string }) {
  const [v, setV] = useState<Record<string, any>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [idx, setIdx] = useState(0);
  const [hist, setHist] = useState<number[]>([]);
  const [stepErr, setStepErr] = useState('');
  const accent = (form.settings && form.settings.accent) || '#3ECF8E';
  const submitLabel = (form.settings && form.settings.submit_label) || 'Submit';
  const isSurvey = form.kind === 'survey';
  const fields = form.fields || [];
  const set = (k: string, val: any) => { setStepErr(''); setV((s) => ({ ...s, [k]: val })); };

  const send = async (payload: Record<string, any>) => {
    setState('sending'); setMsg('');
    try {
      const { data, error } = await pub.rpc('form_submit', { p_slug: slug, p_data: payload, p_source: typeof document !== 'undefined' ? document.referrer : null });
      if (error) throw new Error(error.message);
      const res: any = data || {};
      if (res.redirect) { window.location.href = res.redirect; return; }
      setMsg(res.message || 'Thanks — your response has been received.'); setState('done');
    } catch (err: any) { setMsg(err.message || 'Something went wrong. Please try again.'); setState('error'); }
  };

  const onSubmit = async (e: any) => { e.preventDefault(); await send(v); };

  const goNext = (ans: string) => {
    const f = fields[idx];
    if (f.required && !String(ans || '').trim()) { setStepErr('This question needs an answer.'); return; }
    const ni = nextIndex(fields, idx, String(ans ?? ''));
    if (ni === -1) { send(pathAnswers(fields, { ...v, [f.key]: ans })); return; }
    setHist((h) => [...h, idx]); setIdx(ni); setStepErr('');
  };
  const goBack = () => { setHist((h) => { const nh = [...h]; const p = nh.pop(); if (p !== undefined) setIdx(p); return nh; }); setStepErr(''); if (state === 'error') setState('idle'); };
  const pick = (k: string, val: string) => { set(k, val); setTimeout(() => goNext(val), 120); };

  const progress = useMemo(() => fields.length ? Math.round(((hist.length) / fields.length) * 100) : 0, [hist.length, fields.length]);

  const choiceBtn = (selected: boolean): any => ({
    padding: '10px 14px', borderRadius: '10px', fontSize: '14px', textAlign: 'left', cursor: 'pointer', width: '100%',
    border: '1px solid ' + (selected ? accent : '#cbd5e1'), background: selected ? accent + '22' : '#fff', color: '#0f172a',
  });

  const widget = (f: PField) => {
    const val = String(v[f.key] ?? '');
    if (f.type === 'nps') return (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" onClick={() => pick(f.key, String(n))}
              style={{ width: 38, height: 38, borderRadius: '9px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                border: '1px solid ' + (val === String(n) ? accent : '#cbd5e1'), background: val === String(n) ? accent : '#fff', color: val === String(n) ? '#04150c' : '#0f172a' }}>{n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}><span>Not at all likely</span><span>Extremely likely</span></div>
      </div>
    );
    if (f.type === 'rating') return (
      <div style={{ display: 'flex', gap: '6px' }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => pick(f.key, String(n))} title={String(n)}
            style={{ fontSize: '30px', background: 'none', border: 0, cursor: 'pointer', color: val !== '' && n <= parseInt(val, 10) ? '#f59e0b' : '#d1d5db', padding: 0 }}>★</button>
        ))}
      </div>
    );
    if (f.type === 'csat') return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {CSAT.map((c) => (
          <button key={c.v} type="button" onClick={() => pick(f.key, c.v)} title={c.l}
            style={{ flex: '1 1 56px', minWidth: 56, padding: '8px 4px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
              border: '1px solid ' + (val === c.v ? accent : '#cbd5e1'), background: val === c.v ? accent + '22' : '#fff' }}>
            <div style={{ fontSize: '22px' }}>{c.e}</div><div style={{ fontSize: '10px', color: '#64748b' }}>{c.l}</div>
          </button>
        ))}
      </div>
    );
    if (f.type === 'select') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(f.options || []).map((o) => <button key={o} type="button" style={choiceBtn(val === o)} onClick={() => pick(f.key, o)}>{o}</button>)}
      </div>
    );
    if (f.type === 'multiselect') {
      const cur = val ? val.split(', ') : [];
      const toggle = (o: string) => set(f.key, (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join(', '));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {(f.options || []).map((o) => (
            <button key={o} type="button" style={choiceBtn(cur.includes(o))} onClick={() => toggle(o)}>{cur.includes(o) ? '☑ ' : '☐ '}{o}</button>
          ))}
        </div>
      );
    }
    if (f.type === 'textarea') return <textarea value={val} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder || ''} rows={4} style={inp} autoFocus />;
    return <input type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'} value={val} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder || ''} style={inp} autoFocus />;
  };

  const cur = fields[idx];

  return (
    <>
      <Head><title>{form.name}</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f1f5f9' }}>
        <div style={{ width: '100%', maxWidth: '520px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
          {isSurvey && state !== 'done' && (
            <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', marginBottom: '18px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: progress + '%', background: accent, transition: 'width .25s' }} />
            </div>
          )}
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 16px', color: '#0f172a' }}>{form.name}</h1>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: accent + '22', color: accent, display: 'grid', placeItems: 'center', margin: '0 auto 12px', fontSize: 24, fontWeight: 700 }}>✓</div>
              <p style={{ color: '#334155', fontSize: '15px', margin: 0 }}>{msg}</p>
            </div>
          ) : isSurvey ? (
            cur ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* honeypot: invisible to humans; bots that fill it are silently dropped server-side */}
                <input type="text" name="_hpx" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v['_hpx'] || ''} onChange={(e) => set('_hpx', e.target.value)} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
                <label style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '15px', color: '#0f172a', fontWeight: 600 }}>
                  <span>{cur.label}{cur.required && <span style={{ color: '#ef4444' }}> *</span>}</span>
                  {widget(cur)}
                </label>
                {(stepErr || state === 'error') && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{stepErr || msg}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  {hist.length > 0 ? <button type="button" onClick={goBack} style={{ background: 'none', border: 0, color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: '8px 0' }}>← Back</button> : <span />}
                  <button type="button" disabled={state === 'sending'} onClick={() => goNext(String(v[cur.key] ?? ''))}
                    style={{ background: accent, color: '#04150c', border: 0, borderRadius: '10px', padding: '11px 20px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}>
                    {state === 'sending' ? 'Sending…' : (nextIndex(fields, idx, String(v[cur.key] ?? '')) === -1 ? submitLabel : 'Next')}
                  </button>
                </div>
              </div>
            ) : <p style={{ color: '#64748b', fontSize: '14px' }}>This survey has no questions yet.</p>
          ) : (
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* honeypot: invisible to humans; bots that fill it are silently dropped server-side */}
              <input type="text" name="_hpx" tabIndex={-1} autoComplete="off" aria-hidden="true" value={v['_hpx'] || ''} onChange={(e) => set('_hpx', e.target.value)} style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
              {fields.map((f) => (
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
