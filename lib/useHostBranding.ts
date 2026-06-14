import { useEffect, useState } from 'react';
import { getOrgBranding, getOrgBrandingByHost } from '@/lib/db';
import { Organization } from '@/lib/supabase';

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Slice 4 — resolve the tenant brand for a pre-auth page from the current host:
 * a subdomain (via the org-slug cookie set in middleware) or a verified custom domain.
 * Returns the workspace name + logo for white-label login/signup. Colours are applied
 * separately by applyBranding in _app.
 */
export function useHostBranding(): { name: string; logoUrl?: string; resolved: boolean } {
  const [org, setOrg] = useState<Organization | null>(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    let active = true;
    const slug = readCookie('org-slug');
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const p = slug ? getOrgBranding(slug) : host ? getOrgBrandingByHost(host) : Promise.resolve(null);
    p.then((o) => { if (active) { setOrg(o); setResolved(true); } }).catch(() => { if (active) setResolved(true); });
    return () => { active = false; };
  }, []);
  return { name: org?.name || 'SNR-PMO', logoUrl: org?.branding?.logo_url, resolved };
}
