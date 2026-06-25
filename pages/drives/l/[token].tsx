import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { resolveShareLink, shareLinkFileUrl } from '@/lib/db';
import { Icon, Spinner } from '@/components/ui';

const fmtBytes = (n: number) => { if (!n) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(n) / Math.log(1024)); return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`; };

function Wrap({ children }: { children: any }) {
  return (
    <div className="min-h-screen bg-surface2 flex items-center justify-center p-4">
      <Head><title>Shared · SNR-PMO</title></Head>
      <div className="w-full max-w-2xl card p-6">{children}</div>
    </div>
  );
}

// Public landing for a share link. Works for anonymous visitors (public links) and
// signed-in members (internal links auto-grant on resolve). RLS/RPC is the wall.
export default function SharedLinkPage() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (!token) return; resolveShareLink(token).then((r) => { setRes(r); setLoading(false); }).catch(() => { setRes({ ok: false, error: 'error' }); setLoading(false); }); }, [token]);
  const dl = async (fid: string) => { try { const u = await shareLinkFileUrl(token, fid); window.open(u, '_blank'); } catch (e: any) { alert(e.message); } };

  if (loading) return <Wrap><div className="py-10"><Spinner /></div></Wrap>;
  if (!res || !res.ok) {
    const e = res?.error;
    const msg = e === 'login_required' ? 'Please sign in to your workspace to open this link.' : e === 'expired' ? 'This link has expired.' : e === 'revoked' ? 'This link has been revoked.' : e === 'used_up' ? 'This link has reached its usage limit.' : e === 'rate_limited' ? 'Too many attempts — please try again shortly.' : 'This link is no longer available.';
    return (
      <Wrap>
        <div className="text-center py-6">
          <Icon name={e === 'login_required' ? 'ti-lock' : 'ti-link-off'} className="text-3xl text-muted2" />
          <p className="mt-3 text-sm">{msg}</p>
          {e === 'login_required' && <a className="btn btn-primary mt-4 inline-flex" href={`/login?next=${encodeURIComponent('/drives/l/' + token)}`}>Sign in</a>}
        </div>
      </Wrap>
    );
  }
  return (
    <Wrap>
      <div className="flex items-center gap-2 mb-4">
        <Icon name={res.kind === 'file' ? 'ti-file' : 'ti-folders'} className="text-accentstrong text-xl" />
        <h1 className="text-lg font-semibold truncate">{res.name}</h1>
        <span className="ml-auto text-2xs text-muted2 capitalize">{res.level} · {res.mode}</span>
      </div>
      {res.kind === 'file' && res.file_kind === 'doc' && (
        <div className="prose prose-sm max-w-none border border-line rounded-lg p-4 bg-surface" dangerouslySetInnerHTML={{ __html: res.content || '<p>Empty document.</p>' }} />
      )}
      {res.kind === 'file' && res.file_kind !== 'doc' && (
        <button className="btn btn-primary" onClick={() => dl(res.file_id)}><Icon name="ti-download" className="text-sm" />Download {res.name}</button>
      )}
      {(res.kind === 'folder' || res.kind === 'drive') && (
        <div className="rounded-lg border border-line divide-y divide-line">
          {(res.children || []).length === 0 && <p className="px-3 py-3 text-2xs text-muted2">This {res.kind} is empty.</p>}
          {(res.children || []).map((c: any) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <Icon name={c.file_kind === 'doc' ? 'ti-file-text' : 'ti-file'} className="text-muted" />
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-2xs text-muted2 tabular-nums">{fmtBytes(c.size || 0)}</span>
              {c.file_kind !== 'doc' && <button className="btn h-7 py-0" title="Download" onClick={() => dl(c.id)}><Icon name="ti-download" className="text-sm" /></button>}
            </div>
          ))}
        </div>
      )}
      <p className="text-2xs text-muted2 mt-4 text-center">Shared securely via SNR-PMO</p>
    </Wrap>
  );
}
