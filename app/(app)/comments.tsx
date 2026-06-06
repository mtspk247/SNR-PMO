'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addComment } from '@/app/actions/tasks';

export function CommentBox({ entityType, entityId }: { entityType: string; entityId: string }) {
  const r = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  async function submit(fd: FormData) {
    setBusy(true); await addComment(fd); setBusy(false);
    ref.current?.reset(); r.refresh();
  }
  return (
    <form ref={ref} action={submit} style={{ marginTop: '.6rem' }}>
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="entity_id" value={entityId} />
      <textarea name="body" rows={2} placeholder="Write a comment… use @username to mention" required />
      <button className="btn" disabled={busy} type="submit" style={{ marginTop: '.4rem' }}>{busy ? 'Posting…' : 'Comment'}</button>
    </form>
  );
}
