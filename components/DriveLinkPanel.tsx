import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { DriveShareLink, createShareLink, listShareLinks, revokeShareLink, deleteShareLink } from '@/lib/db';

const LEVELS = [{ value: 'viewer', label: 'Viewer' }, { value: 'commenter', label: 'Commenter' }];
const MODES = [{ value: 'internal', label: 'Workspace (sign-in)' }, { value: 'public', label: 'Public (anyone)' }];
const EXPIRY = [{ value: 'never', label: 'Never expires' }, { value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '3 months' }, { value: 'custom', label: 'Until a date…' }];
const USES = [{ value: 'unlimited', label: 'Unlimited uses' }, { value: 'once', label: 'Single use' }, { value: 'custom', label: 'Limited uses…' }];

function expiryToISO(sel: string, customDate: string): string | null {
  if (sel === 'never') return null;
  if (sel === 'custom') return customDate ? new Date(customDate).toISOString() : null;
  const map: Record<string, number> = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, '90d': 90 * 86400e3 };
  return new Date(Date.now() + (map[sel] || 0)).toISOString();
}

// Create/list/revoke share links for a drive/folder/file. Expiry + usage per Tariq's spec.
export default function DriveLinkPanel({ target }: { target: { drive_id: string; folder_id?: string | null; file_id?: string | null } }) {
  const [links, setLinks] = useState<DriveShareLink[] | null>(null);
  const [mode, setMode] = useState('internal'); const [level, setLevel] = useState('viewer');
  const [expSel, setExpSel] = useState('never'); const [expDate, setExpDate] = useState('');
  const [useSel, setUseSel] = useState('unlimited'); const [useN, setUseN] = useState(5);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [copied, setCopied] = useState('');

  const load = () => listShareLinks(target).then(setLinks).catch((e) => setErr(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [target.drive_id, target.folder_id, target.file_id]);

  const linkUrl = (t: string) => (typeof window !== 'undefined' ? window.location.origin : '') + '/drives/l/' + t;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(linkUrl(t)); setCopied(t); setTimeout(() => setCopied(''), 1500); } catch { /* noop */ } };
  const create = async () => {
    setBusy(true); setErr('');
    try {
      const max_uses = useSel === 'unlimited' ? null : useSel === 'once' ? 1 : Math.max(1, Number(useN) || 1);
      const t = await createShareLink({ drive_id: target.drive_id, folder_id: target.folder_id ?? null, file_id: target.file_id ?? null, level: level as any, mode: mode as any, expires_at: expiryToISO(expSel, expDate), max_uses });
      load(); copy(t);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { try { await revokeShareLink(id); load(); } catch (e: any) { setErr(e.message); } };
  const del = async (id: string) => { try { await deleteShareLink(id); load(); } catch (e: any) { setErr(e.message); } };

  return (
    <div className="space-y-2">
      {err && <p className="text-2xs text-rose-600">{err}</p>}
      <div className="rounded-lg border border-line p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select width={170} value={mode} onChange={setMode} options={MODES} />
          <Select width={130} value={level} onChange={setLevel} options={LEVELS} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select width={150} value={expSel} onChange={setExpSel} options={EXPIRY} />
          {expSel === 'custom' && <input type="datetime-local" className="input h-8 py-0" value={expDate} onChange={(e) => setExpDate(e.target.value)} />}
          <Select width={150} value={useSel} onChange={setUseSel} options={USES} />
          {useSel === 'custom' && <input type="number" min={1} className="input h-8 py-0 w-20" value={useN} onChange={(e) => setUseN(Number(e.target.value))} />}
          <button className="btn btn-primary h-8 py-0 ml-auto" disabled={busy} onClick={create}><Icon name="ti-link" className="text-sm" />Create link</button>
        </div>
        <p className="text-2xs text-muted2">{mode === 'public' ? 'Anyone with the link can open it (no sign-in).' : 'Only people signed in to your workspace can open it.'}</p>
      </div>
      {links && links.length > 0 && (
        <div className="rounded-lg border border-line divide-y divide-line">
          {links.map((l) => {
            const expired = !!l.expires_at && new Date(l.expires_at) <= new Date();
            const usedup = l.max_uses != null && l.use_count >= l.max_uses;
            const dead = l.revoked || expired || usedup;
            return (
              <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-2xs">
                <Icon name={l.mode === 'public' ? 'ti-world' : 'ti-lock'} className={dead ? 'text-muted2' : 'text-accentstrong'} />
                <span className="flex-1 truncate">
                  <span className="capitalize">{l.mode}</span> · {l.level}
                  {l.expires_at ? ' · until ' + new Date(l.expires_at).toLocaleDateString() : ' · no expiry'}
                  {l.max_uses != null ? ` · ${l.use_count}/${l.max_uses} uses` : ''}
                  {l.revoked ? ' · revoked' : expired ? ' · expired' : usedup ? ' · used up' : ''}
                </span>
                {!dead && <button className="text-muted2 hover:text-content" title="Copy link" onClick={() => copy(l.token)}><Icon name={copied === l.token ? 'ti-check' : 'ti-copy'} /></button>}
                {!l.revoked && <button className="text-muted2 hover:text-amber-600" title="Revoke" onClick={() => revoke(l.id)}><Icon name="ti-ban" /></button>}
                <button className="text-muted2 hover:text-rose-500" title="Delete" onClick={() => del(l.id)}><Icon name="ti-trash" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
