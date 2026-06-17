import { useState } from 'react';
import { Icon, Avatar } from '@/components/ui';
import { avatarSrc } from '@/lib/db';
import { PRESET_AVATARS, buildPreset, presetColor, parsePreset } from '@/lib/avatars';

/**
 * Reusable avatar chooser: pick a fun preset emoji avatar, optionally upload a photo,
 * or remove. `value` is whatever is stored in the entity's avatar field (a storage
 * path, an http url, or "preset:<emoji>"). onChange returns the new stored value.
 */
export default function AvatarPicker({ value, name, onChange, onUpload, size = 56, allowUpload = true }: {
  value?: string | null;
  name?: string;
  onChange: (v: string) => void;
  onUpload?: (file: File) => Promise<string>; // returns stored path
  size?: number;
  allowUpload?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f || !onUpload) return;
    setBusy(true); setErr('');
    try { const path = await onUpload(f); onChange(path); }
    catch (er: any) { setErr(er.message || 'Upload failed'); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={name || 'U'} size={size} src={avatarSrc(value)} />
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className="btn btn-ghost border border-line text-xs"><Icon name="ti-mood-smile" className="text-sm" />Choose avatar</button>
            {allowUpload && onUpload && <label className="btn btn-ghost border border-line text-xs cursor-pointer"><Icon name="ti-upload" className="text-sm" />{busy ? 'Uploading…' : 'Upload photo'}<input type="file" accept="image/*" className="hidden" onChange={upload} /></label>}
            {value && <button type="button" onClick={() => onChange('')} className="btn-ghost text-xs text-muted">Remove</button>}
          </div>
          {err && <span className="text-2xs text-rose-600">{err}</span>}
          <span className="text-2xs text-muted">Pick a fun avatar{allowUpload && onUpload ? ' or upload your own photo' : ''}.</span>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-8 sm:grid-cols-12 gap-2 p-3 rounded-lg border border-line bg-surface2/40">
          {PRESET_AVATARS.map((e) => {
            const active = parsePreset(value)?.emoji === e;
            return (
              <button key={e} type="button" title="Use this avatar"
                onClick={() => { onChange(buildPreset(e)); setOpen(false); }}
                style={{ background: presetColor(e) }}
                className={`w-9 h-9 rounded-full grid place-items-center text-lg transition hover:scale-110 ${active ? 'ring-2 ring-offset-2 ring-accent' : ''}`}>
                <span>{e}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
