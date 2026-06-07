import { Organization } from './supabase';

// Apply a tenant's branding to CSS custom properties. Used pre-auth (from the
// subdomain in _app) and post-auth (from the active org in Layout). Keys mirror
// the :root tokens in styles/globals.css.
export function applyBranding(org: Pick<Organization, 'name' | 'branding'> | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const b = org?.branding || {};
  setVar(root, '--brand-primary', b.primary_color);
  setVar(root, '--brand-accent', b.accent_color);
  setVar(root, '--brand-ink', b.ink_color);
  if (org?.name) root.dataset.orgName = org.name;
}

function setVar(root: HTMLElement, name: string, value?: string) {
  if (value && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) root.style.setProperty(name, value);
}
