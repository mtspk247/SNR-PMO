'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateTaskStatus } from '@/app/actions/tasks';

const STATUSES = ['Backlog','To Do','In Progress','Review','Done','On Hold','Cancelled'];

export function StatusChanger({ id, current }: { id: string; current: string }) {
  const r = useRouter();
  const [err, setErr] = useState('');
  async function change(val: string) {
    setErr('');
    const fd = new FormData(); fd.set('id', id); fd.set('status', val);
    const res: any = await updateTaskStatus(fd);
    if (res?.error) setErr(res.error); else r.refresh();
  }
  return (
    <span>
      <select defaultValue={current} onChange={e => change(e.target.value)} style={{ width: 'auto', padding: '.25rem .4rem', fontSize: '.78rem' }}>
        {STATUSES.map(s => <option key={s}>{s}</option>)}
      </select>
      {err && <div className="b b-red small" style={{ marginTop: '.3rem' }}>{err}</div>}
    </span>
  );
}
