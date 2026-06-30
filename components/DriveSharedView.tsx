import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import Select from '@/components/Select';
import { OrgUser, Project, sb } from '@/lib/supabase';
import {
  Drive, DriveFolder, DriveGrant, DriveShareLink,
  listDriveGrants, removeDriveGrant, createShareLink, revokeShareLink, deleteShareLink, setDriveProject,
} from '@/lib/db';

const LEVELS = [{ value: 'viewer', label: 'Viewer' }, { value: 'commenter', label: 'Commenter' }];
const MODES = [{ value: 'internal', label: 'Workspace (sign-in)' }, { value: 'public', label: 'Public (anyone)' }];
const EXPIRY = [{ value: 'never', label: 'Never expires' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: '90d', label: '3 months' }];

function expiryToISO(sel: string): string | null {
  const map: Record<string, number> = { '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, '90d': 90 * 86400e3 };
  return sel === 'never' ? null : new Date(Date.now() + (map[sel] || 0)).toISOString();
}

// Drive-scoped "who has access to what" management surface: internal grants (people/roles),
// share links (all scopes), and the client-portal link — with revoke / copy / re-share / bulk.
// RLS is the wall: every action reuses the same policy-enforced db helpers as the Share modal,
// so this view can only ever read/revoke what the signed-in manager is already allowed to.
export default function DriveSharedView({ drive, people, projects, canManage, folders, onPortalChange }: {
  drive: Drive; people: OrgUser[]; projects: Project[]; canManage: boolean; folders: DriveFolder[]; onPortalChange: (projectId: string | null) => void;
}) {
  const [grants, setGrants] = useState<DriveGrant[] | null>(null);
  const [links, setLinks] = useState<DriveShareLink[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [copied, setCopied] = useState('');
  const [mode, setMode] = useState('internal'); const [level, setLevel] = useState('viewer'); const [exp, setExp] = useState('never');

  const loadGrants = () => listDriveGrants(drive.id).then(setGrants).catch((e) => setErr(e.message));
  const loadLinks = () => sb.from('drive_share_links').select('*').eq('drive_id', drive.id).order('created_at', { ascending: false }).then(({ data }) => setLinks((data as DriveShareLink[]) || []));
  useEffect(() => { setSel(new Set()); setGrants(null); setLinks(null); loadGrants(); loadLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [drive.id]);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;
  const scopeLabel = (g: { folder_id: string | null; file_id: string | null }) => g.file_id ? 'A file' : g.folder_id ? ('Folder: ' + (folderName(g.folder_id) || 'a folder')) : 'Whole drive';
  const subjectLabel = (g: DriveGrant) => g.subject_user_id ? (people.find((p) => p.id === g.subject_user_id)?.full_name || people.find((p) => p.id === g.subject_user_id)?.email || 'Unknown user') : ('Role: ' + (g.subject_role || '—'));

  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const revokeGrant = async (id: string) => { setBusy(true); setErr(''); try { await removeDriveGrant(id); setSel((p) => { const n = new Set(p); n.delete(id); return n; }); loadGrants(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const revokeSelected = async () => {
    if (!sel.size || !confirm(`Revoke access for ${sel.size} grant(s)?`)) return;
    setBusy(true); setErr('');
    try { for (const id of Array.from(sel)) await removeDriveGrant(id); setSel(new Set()); loadGrants(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const linkUrl = (t: string) => (typeof window !== 'undefined' ? window.location.origin : '') + '/drives/l/' + t;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(linkUrl(t)); setCopied(t); setTimeout(() => setCopied(''), 1500); } catch { /* noop */ } };
  const createLink = async () => {
    setBusy(true); setErr('');
    try { const t = await createShareLink({ drive_id: drive.id, level: level as any, mode: mode as any, expires_at: expiryToISO(exp) }); await copy(t); loadLinks(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const revokeLink = async (id: string) => { setErr(''); try { await revokeShareLink(id); loadLinks(); } catch (e: any) { setErr(e.message); } };
  const deleteLink = async (id: string) => { setErr(''); try { await deleteShareLink(id); loadLinks(); } catch (e: any) { setErr(e.message); } };

  const portalProject = projects.find((p) => p.id === drive.project_id);
  const setPortal = async (pid: string) => { const v = pid || null; setBusy(true); setErr(''); try { await setDriveProject(drive.id, v); onPortalChange(v); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };

  return (
    <div className="p-4 space-y-5">
      {err && <p className="text-sm text-rose-600">{err}</p>}

      <section className="space-y-2">
        <div className="flex items-center gap-2"><Icon name="ti-users" className="text-accentstrong" /><h3 className="text-sm font-medium">Client portal</h3></div>
        <div className="rounded-lg border border-line p-3 flex flex-wrap items-center gap-3">
          <p className="text-2xs text-muted flex-1 min-w-[12rem]">{portalProject ? <>This drive’s files are visible to the client of <b className="text-content">{portalProject.name}</b> in their branded portal (read-only).</> : 'Not shared with a client portal. Pick a project to let its client see this drive’s files (read-only) in their branded portal.'}</p>
          {canManage ? (
            <Select width={230} value={drive.project_id || ''} onChange={setPortal} options={[{ value: '', label: 'Not shared' }, ...projects.map((pr) => ({ value: pr.id, label: pr.name }))]} />
          ) : portalProject ? <span className="pill pill-gray">{portalProject.name}</span> : <span className="text-2xs text-muted2">Not shared</span>}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="ti-user-shield" className="text-accentstrong" /><h3 className="text-sm font-medium">People &amp; roles with access</h3>
          {sel.size > 0 && canManage && <button className="btn h-7 py-0 text-rose-600 ml-auto" disabled={busy} onClick={revokeSelected}><Icon name="ti-ban" className="text-sm" />Revoke {sel.size}</button>}
        </div>
        <div className="rounded-lg border border-line divide-y divide-line">
          <div className="flex items-center gap-2 px-3 py-2 text-sm"><Icon name="ti-shield-check" className="text-accentstrong" /><span className="flex-1">Owners &amp; admins</span><span className="text-2xs text-muted2">Full access</span></div>
          {grants === null ? <div className="px-3 py-3 text-2xs text-muted2">Loading…</div> :
            grants.length === 0 ? <div className="px-3 py-3 text-2xs text-muted2">No explicit grants. {drive.restricted ? 'Only owners/admins can open this drive.' : 'Everyone in your workspace can access this drive.'}</div> :
              grants.map((g) => (
                <div key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {canManage && <input type="checkbox" className="shrink-0" checked={sel.has(g.id)} onChange={() => toggle(g.id)} />}
                  <Icon name={g.subject_role ? 'ti-tag' : 'ti-user'} className="text-muted2 shrink-0" />
                  <span className="flex-1 truncate">{subjectLabel(g)} <span className="text-2xs text-muted2">· {scopeLabel(g)}</span></span>
                  <span className="pill pill-gray capitalize">{g.level}</span>
                  {canManage && <button onClick={() => revokeGrant(g.id)} className="text-muted2 hover:text-rose-500" title="Revoke access"><Icon name="ti-x" className="text-sm" /></button>}
                </div>
              ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2"><Icon name="ti-link" className="text-accentstrong" /><h3 className="text-sm font-medium">Share links</h3></div>
        {canManage && (
          <div className="rounded-lg border border-line p-3 flex flex-wrap items-center gap-2">
            <Select width={170} value={mode} onChange={setMode} options={MODES} />
            <Select width={130} value={level} onChange={setLevel} options={LEVELS} />
            <Select width={150} value={exp} onChange={setExp} options={EXPIRY} />
            <button className="btn btn-primary h-8 py-0 ml-auto" disabled={busy} onClick={createLink}><Icon name="ti-link" className="text-sm" />Create &amp; copy link</button>
          </div>
        )}
        {links && links.length > 0 ? (
          <div className="rounded-lg border border-line divide-y divide-line">
            {links.map((l) => {
              const expired = !!l.expires_at && new Date(l.expires_at) <= new Date();
              const usedup = l.max_uses != null && l.use_count >= l.max_uses;
              const dead = l.revoked || expired || usedup;
              return (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2 text-2xs">
                  <Icon name={l.mode === 'public' ? 'ti-world' : 'ti-lock'} className={dead ? 'text-muted2' : 'text-accentstrong'} />
                  <span className="flex-1 truncate">
                    <span className="capitalize">{l.mode}</span> · {l.level} · {l.file_id ? 'a file' : l.folder_id ? 'a folder' : 'whole drive'}
                    {l.expires_at ? ' · until ' + new Date(l.expires_at).toLocaleDateString() : ' · no expiry'}
                    {l.max_uses != null ? ` · ${l.use_count}/${l.max_uses} uses` : ''}
                    {l.revoked ? ' · revoked' : expired ? ' · expired' : usedup ? ' · used up' : ''}
                  </span>
                  {!dead && <button className="text-muted2 hover:text-content" title="Copy link" onClick={() => copy(l.token)}><Icon name={copied === l.token ? 'ti-check' : 'ti-copy'} /></button>}
                  {canManage && !l.revoked && <button className="text-muted2 hover:text-amber-600" title="Revoke link" onClick={() => revokeLink(l.id)}><Icon name="ti-ban" /></button>}
                  {canManage && <button className="text-muted2 hover:text-rose-500" title="Delete link" onClick={() => deleteLink(l.id)}><Icon name="ti-trash" /></button>}
                </div>
              );
            })}
          </div>
        ) : <p className="text-2xs text-muted2 px-1">No share links yet.</p>}
      </section>
    </div>
  );
}
