import { useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

// Public signer page — standalone (no Layout = no auth gate), token in the URL path.
// All reads/writes go through rate-limited SECURITY DEFINER RPCs; no table access.
const pub = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { db: { schema: 'snrpmo' }, auth: { persistSession: false, autoRefreshToken: false } },
);

type PField = { id: string; type: string; label: string | null; required: boolean; value: string | null };
type PData = {
  title: string; message: string | null; org: string | null; doc: string | null;
  request_status: string; expires_at: string | null;
  recipient: { email: string; name: string | null; role: string; status: string };
  fields: PField[];
};

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const token = String(ctx.params?.token || '');
  try {
    const { data, error } = await pub.rpc('sign_public_get', { p_token: token });
    if (error || !data) return { notFound: true };
    return { props: { d: data as PData, token } };
  } catch { return { notFound: true }; }
};

const inp: any = { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '9px', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff', color: '#0f172a' };
const accent = '#10b981';

export default function SignerPage({ d, token }: { d: PData; token: string }) {
  const alreadyDone = d.recipient.status === 'signed' || d.request_status === 'completed';
  const isViewer = d.recipient.role !== 'signer';
  const [consented, setConsented] = useState(d.recipient.status === 'consented' || alreadyDone);
  const [agree, setAgree] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(d.fields.map((f) => [f.id, f.value || ''])));
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'declined' | 'error'>(alreadyDone ? 'done' : 'idle');
  const [msg, setMsg] = useState(alreadyDone ? 'This document has been signed.' : '');

  const consent = async () => {
    if (!agree) { setMsg('Please tick the consent box first.'); setState('error'); return; }
    setState('sending'); setMsg('');
    try {
      const { error } = await pub.rpc('sign_consent', { p_token: token });
      if (error) throw new Error(error.message);
      setConsented(true); setState('idle');
    } catch (e: any) { setMsg(e.message); setState('error'); }
  };

  const submit = async () => {
    setState('sending'); setMsg('');
    try {
      const { data, error } = await pub.rpc('sign_submit', { p_token: token, p_values: v });
      if (error) throw new Error(error.message);
      const res: any = data || {};
      setMsg(res.completed ? 'All done — every signer has completed this document.' : 'Signed! Other signers will be notified.');
      setState('done');
    } catch (e: any) { setMsg(e.message); setState('error'); }
  };

  const decline = async () => {
    const reason = window.prompt('Decline to sign? You can add an optional reason:');
    if (reason === null) return;
    setState('sending'); setMsg('');
    try {
      const { error } = await pub.rpc('sign_decline', { p_token: token, p_reason: reason || null });
      if (error) throw new Error(error.message);
      setMsg('You declined this request. The sender has been notified.'); setState('declined');
    } catch (e: any) { setMsg(e.message); setState('error'); }
  };

  return (
    <>
      <Head><title>{d.title} — signature request</title><meta name="robots" content="noindex" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f1f5f9', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif' }}>
        <div style={{ width: '100%', maxWidth: '560px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 4px' }}>{d.org || 'A company'} requests your {isViewer ? 'review' : 'signature'}</p>
          <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px', color: '#0f172a' }}>{d.title}</h1>
          {d.doc && <p style={{ fontSize: '13px', color: '#334155', margin: '0 0 4px' }}>Document: <b>{d.doc}</b></p>}
          {d.message && <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0', lineHeight: 1.5 }}>{d.message}</p>}
          {d.expires_at && state === 'idle' && <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: '6px 0 0' }}>Link expires {new Date(d.expires_at).toLocaleDateString()}</p>}
          <hr style={{ border: 'none', borderTop: '1px solid #eef2f2', margin: '18px 0' }} />

          {state === 'done' || state === 'declined' ? (
            <div style={{ textAlign: 'center', padding: '18px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: (state === 'done' ? accent : '#e11d48') + '22', color: state === 'done' ? accent : '#e11d48', display: 'grid', placeItems: 'center', margin: '0 auto 12px', fontSize: 24, fontWeight: 700 }}>{state === 'done' ? '✓' : '—'}</div>
              <p style={{ color: '#334155', fontSize: '15px', margin: 0 }}>{msg}</p>
            </div>
          ) : isViewer ? (
            <p style={{ fontSize: '13.5px', color: '#475569' }}>You are receiving this as a viewer (CC). No action is needed.</p>
          ) : !consented ? (
            <div>
              <p style={{ fontSize: '13.5px', color: '#475569', lineHeight: 1.55 }}>Before signing, please confirm you agree to do business electronically. Your signature, together with a secure audit trail (time, network fingerprint, and this consent), forms the record of your agreement.</p>
              <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', margin: '14px 0', fontSize: '13.5px', color: '#0f172a', cursor: 'pointer' }}>
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I agree to use electronic records and signatures, and I intend for my electronic signature to be legally binding.</span>
              </label>
              {state === 'error' && <p style={{ color: '#ef4444', fontSize: '13px', margin: '0 0 10px' }}>{msg}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" onClick={decline} style={{ background: 'none', border: 0, color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}>Decline</button>
                <button type="button" disabled={state === 'sending'} onClick={consent}
                  style={{ background: accent, color: '#04150c', border: 0, borderRadius: '10px', padding: '11px 20px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}>Continue</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {d.fields.map((f) => (
                <label key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#334155' }}>
                  <span>{f.label || f.type}{f.required && <span style={{ color: '#ef4444' }}> *</span>}{f.type === 'date' && <span style={{ color: '#94a3b8' }}> (auto-filled)</span>}</span>
                  {f.type === 'signature' || f.type === 'initials' ? (
                    <input value={v[f.id] || ''} onChange={(e) => setV((s) => ({ ...s, [f.id]: e.target.value }))}
                      placeholder={f.type === 'initials' ? 'Your initials' : 'Type your full legal name'}
                      style={{ ...inp, fontFamily: '"Segoe Script","Brush Script MT",cursive', fontSize: '20px', padding: '12px 14px', borderBottom: '2px solid ' + accent }} />
                  ) : f.type === 'checkbox' ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={v[f.id] === 'Yes'} onChange={(e) => setV((s) => ({ ...s, [f.id]: e.target.checked ? 'Yes' : '' }))} /><span style={{ color: '#64748b' }}>Yes</span></span>
                  ) : f.type === 'date' ? (
                    <input value={v[f.id] || new Date().toISOString().slice(0, 10)} readOnly style={{ ...inp, background: '#f8fafc', color: '#64748b' }} />
                  ) : (
                    <input value={v[f.id] || ''} onChange={(e) => setV((s) => ({ ...s, [f.id]: e.target.value }))} style={inp} />
                  )}
                </label>
              ))}
              {state === 'error' && <p style={{ color: '#ef4444', fontSize: '13px', margin: 0 }}>{msg}</p>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                <button type="button" onClick={decline} style={{ background: 'none', border: 0, color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}>Decline</button>
                <button type="button" disabled={state === 'sending'} onClick={submit}
                  style={{ background: accent, color: '#04150c', border: 0, borderRadius: '10px', padding: '11px 22px', fontWeight: 600, fontSize: '14px', cursor: 'pointer', opacity: state === 'sending' ? 0.7 : 1 }}>
                  {state === 'sending' ? 'Signing…' : 'Sign document'}
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>Signed as {d.recipient.email}. Every step is recorded in a tamper-evident audit trail.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
