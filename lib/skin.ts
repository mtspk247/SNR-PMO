// Per-tenant visual "skin" (theme). Orthogonal to light/dark mode (lib/theme.ts).
// Applied via <html data-skin>. The pre-paint default is set by the inline script
// in _document.tsx (from localStorage); the active org's skin is applied at runtime
// by applyBranding (lib/branding.ts), called pre-auth (host) and post-auth (active org).
export type Skin = 'classic' | 'nebula' | 'atlas' | 'coral';

export interface SkinMeta {
  key: Skin;
  label: string;
  blurb: string;
  swatch: string;
  nav: 'left' | 'top';
  r: number;                 // thumbnail corner radius (px)
  // Representative light-mode palette for the Settings preview thumbnail.
  c: { bg: string; sf: string; bd: string; tx: string; mu: string; ac: string; on: string };
}

export const SKINS: SkinMeta[] = [
  { key: 'classic', label: 'Classic', blurb: 'Supabase green · left sidebar', swatch: '#3ECF8E', nav: 'left', r: 6,
    c: { bg: '#FAFAF9', sf: '#FFFFFF', bd: '#E6E5E1', tx: '#181816', mu: '#D8D7D2', ac: '#16B57A', on: '#ffffff' } },
  { key: 'nebula',  label: 'Nebula',  blurb: 'ClickUp-style · purple · sidebar', swatch: '#7B68EE', nav: 'left', r: 10,
    c: { bg: '#F7F8FA', sf: '#FFFFFF', bd: '#E8E9EF', tx: '#1A1A2E', mu: '#D4D6E0', ac: '#7B68EE', on: '#ffffff' } },
  { key: 'atlas',   label: 'Atlas',   blurb: 'Jira-style · blue · flat & compact', swatch: '#0052CC', nav: 'left', r: 3,
    c: { bg: '#F4F5F7', sf: '#FFFFFF', bd: '#DFE1E6', tx: '#172B4D', mu: '#C7CDD6', ac: '#0052CC', on: '#ffffff' } },
  { key: 'coral',   label: 'Coral',   blurb: 'Asana-style · coral · sidebar', swatch: '#F06A6A', nav: 'left', r: 7,
    c: { bg: '#FAFBFB', sf: '#FFFFFF', bd: '#EDEDED', tx: '#1E1F21', mu: '#DCDCDC', ac: '#F06A6A', on: '#ffffff' } },
];

const KEY = 'snr-skin';
const VALID: Skin[] = ['classic', 'nebula', 'atlas', 'coral'];

export function normalizeSkin(s?: string | null): Skin {
  return (VALID as string[]).includes(s || '') ? (s as Skin) : 'classic';
}

export function getSkin(): Skin {
  if (typeof document === 'undefined') return 'classic';
  return normalizeSkin(document.documentElement.dataset.skin);
}

export function applySkin(s?: string | null): Skin {
  const skin = normalizeSkin(s);
  if (typeof document === 'undefined') return skin;
  document.documentElement.dataset.skin = skin;
  try { localStorage.setItem(KEY, skin); } catch { /* ignore */ }
  return skin;
}
