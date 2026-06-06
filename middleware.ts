import { NextRequest, NextResponse } from 'next/server';

// Lightweight presence check (full verify happens in layouts/actions).
export function middleware(req: NextRequest) {
  const token = req.cookies.get('snr_session')?.value;
  const { pathname } = req.nextUrl;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/api/cron');
  if (!token && !isPublic) {
    const url = req.nextUrl.clone(); url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  if (token && pathname === '/login') {
    const url = req.nextUrl.clone(); url.pathname = '/';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
