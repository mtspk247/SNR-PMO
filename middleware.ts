import { NextRequest, NextResponse } from 'next/server';

// Resolve <slug>.app.com -> org slug, exposed to the client via header + cookie so
// branding (logo/colors/name) can be loaded before auth. White-label entry point.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};

const RESERVED = new Set(['www', 'app', 'admin', 'api', 'staging', '']);

function resolveSlug(hostname: string): string {
  // bare IP or localhost -> no tenant subdomain
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return '';
  const parts = hostname.split('.');

  // acme.localhost (local dev)
  if (hostname.endsWith('.localhost')) return RESERVED.has(parts[0]) ? '' : parts[0];
  if (hostname === 'localhost') return '';

  // acme.app.com / acme.example.co.uk -> first label is the tenant
  if (parts.length > 2) {
    const slug = parts[0];
    return RESERVED.has(slug) ? '' : slug;
  }
  return '';
}

export function middleware(req: NextRequest) {
  const hostname = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  const slug = resolveSlug(hostname);

  const res = NextResponse.next();
  res.headers.set('x-org-slug', slug);
  res.cookies.set('org-slug', slug, { path: '/', sameSite: 'lax' });
  return res;
}
