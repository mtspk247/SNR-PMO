import { Organization } from './supabase';
import { applySkin } from './skin';

// Apply a tenant's branding to the live theme. The org's primary colour drives the
// real accent tokens (--accent/--accent-strong/--accent-fg) that every page reads
// via Tailwind, so buttons, links, focus rings, active nav, logo marks and progress
// bars all recolour to the tenant. Used pre-auth (subdomain, in _app) and post-auth
// (active org, in Layout). We inject a <style> element rather than inline root vars
// so we can give light and dark themes their own readable accent-strong shade.
export function applyBranding(org: (Pick<Organization, 'name' | 'branding'> & { theme_skin?: string | null }) | null, skinOverride?: string | null) {
  if (typeof document === 'undefined') return;
  if (!org) return; // FOUC fix: never reset the skin to 'classic' while the active org is still loading
  const root = document.documentElement;
  const b = org?.branding || {};
  applySkin(skinOverride ?? org?.theme_skin);
  if (org?.name) root.dataset.orgName = org.name;

  // A primary colour equal to the stock default is treated as "not customised"
  // so the active skin's own accent shows; a genuinely custom colour still overrides.
  const customPrimary = b.primary_color && b.primary_color.toLowerCase() !== '#3ecf8e' ? b.primary_color : undefined;
  // Keep the hex brand vars (consumed by logo marks + progress bars).
  setVar(root, '--brand-primary', customPrimary);
  setVar(root, '--brand-accent', b.accent_color);
  setVar(root, '--brand-ink', b.ink_color);

  const primary = parseHex(customPrimary);
  const styleEl = ensureStyleEl();
  if (!primary) { styleEl.textContent = ''; return; }   // no brand → fall back to defaults

  const accent = triplet(primary);
  const fg = luminance(primary) > 0.55 ? '12 22 17' : '255 255 255'; // contrast on fills
  const strongLight = triplet(scale(primary, 0.6)); // darker, readable as text on light
  const strongDark = accent;                         // primary itself reads on dark
  // Raise specificity (:root[data-skin]) so a tenant's custom brand colour always
  // overrides the active skin's default accent (white-label wins, deterministically).
  styleEl.textContent =
    `:root,:root[data-skin]{--accent:${accent};--accent-strong:${strongLight};--accent-fg:${fg};}` +
    `:root[data-theme="dark"],:root[data-skin][data-theme="dark"]{--accent:${accent};--accent-strong:${strongDark};--accent-fg:${fg};}`;
}

function ensureStyleEl(): HTMLStyleElement {
  let el = document.getElementById('brand-theme') as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = 'brand-theme'; document.head.appendChild(el); }
  return el;
}

function setVar(root: HTMLElement, name: string, value?: string) {
  if (value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) root.style.setProperty(name, value);
}

type RGB = { r: number; g: number; b: number };

function parseHex(hex?: string): RGB | null {
  if (!hex || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const triplet = (c: RGB) => `${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)}`;
const scale = (c: RGB, f: number): RGB => ({ r: c.r * f, g: c.g * f, b: c.b * f });

// Relative luminance (0–1), sRGB-weighted — used to choose readable contrast text.
function luminance(c: RGB): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}
