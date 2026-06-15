// Per-tenant visual "skin" (theme). Orthogonal to light/dark mode (lib/theme.ts).
// Applied via <html data-skin>. The pre-paint default is set by the inline script
// in _document.tsx (from localStorage); the active org's skin is applied at runtime
// by applyBranding (lib/branding.ts), called pre-auth (host) and post-auth (active org).
export type Skin = 'classic' | 'daylight' | 'vivid' | 'midnight';

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
  { key: 'classic',  label: 'Classic',  blurb: 'Supabase green · clean', swatch: '#3ECF8E', nav: 'left', r: 6,
    c: { bg: '#FAFAF9', sf: '#FFFFFF', bd: '#E6E5E1', tx: '#181816', mu: '#D8D7D2', ac: '#16B57A', on: '#ffffff' } },
  { key: 'daylight', label: 'Daylight', blurb: 'Clean light admin · indigo', swatch: '#4F46E5', nav: 'left', r: 12,
    c: { bg: '#F6F7F9', sf: '#FFFFFF', bd: '#E6E8EC', tx: '#1B1F2A', mu: '#C9CDD6', ac: '#4F46E5', on: '#ffffff' } },
  { key: 'vivid',    label: 'Vivid',    blurb: 'Colorful · gradients · violet', swatch: '#7C3AED', nav: 'left', r: 14,
    c: { bg: '#F8F6FF', sf: '#FFFFFF', bd: '#ECE8F6', tx: '#241A36', mu: '#CDC7DC', ac: '#7C3AED', on: '#ffffff' } },
  { key: 'midnight', label: 'Midnight', blurb: 'Dark glass · neon', swatch: '#7C5CFF', nav: 'left', r: 16,
    c: { bg: '#101233', sf: '#211E4A', bd: '#3A356B', tx: '#EDEAFF', mu: '#4A4780', ac: '#7C5CFF', on: '#ffffff' } },
];

const KEY = 'snr-skin';
const VALID: Skin[] = ['classic', 'daylight', 'vivid', 'midnight'];

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
