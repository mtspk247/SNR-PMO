'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function Modal({ label, title, children, variant }: { label: string; title: string; children: React.ReactNode; variant?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn ${variant || ''}`} onClick={() => setOpen(true)}>{label}</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 50, padding: '4vh 1rem', overflow: 'auto' }}>
          <div onClick={e => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.8rem' }}>
              <h3 style={{ margin: 0 }}>{title}</h3>
              <button className="btn gray" style={{ padding: '.2rem .6rem' }} onClick={() => setOpen(false)}>✕</button>
            </div>
            <div onClick={() => setTimeout(() => setOpen(false), 50)}>{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

// Button that invokes a server action with no form fields and surfaces {error}
export function ActionButton({ action, label, variant, confirm }: { action: (fd: FormData) => Promise<any>; label: string; variant?: string; confirm?: string }) {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setErr('');
    const res: any = await action(new FormData());
    setBusy(false);
    if (res?.error) setErr(res.error); else r.refresh();
  }
  return (
    <span>
      <button className={`btn ${variant || ''}`} disabled={busy} onClick={go}>{busy ? '…' : label}</button>
      {err && <span className="b b-red" style={{ marginLeft: '.5rem' }}>{err}</span>}
    </span>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const map: any = { Done: 'b-green', Active: 'b-green', Approved: 'b-green', 'In Progress': 'b-amber', Pending: 'b-amber', Review: 'b-blue', Planning: 'b-blue', 'To Do': 'b-blue', 'On Hold': 'b-gray', Cancelled: 'b-gray', Rejected: 'b-red', Backlog: 'b-gray', Urgent: 'b-red', High: 'b-amber', Medium: 'b-blue', Low: 'b-gray' };
  return <span className={`b ${map[s] || 'b-gray'}`}>{s}</span>;
}
