import { NextRequest, NextResponse } from 'next/server';
const PUBLIC=['/','/login','/api/auth','/api/cron'];
export function middleware(req:NextRequest){
  const token=req.cookies.get('snr_session')?.value;
  const {pathname}=req.nextUrl;
  const isPublic=PUBLIC.some(p=>p==='/'?pathname==='/':pathname.startsWith(p));
  if(!token&&!isPublic){const u=req.nextUrl.clone();u.pathname='/login';return NextResponse.redirect(u);}
  if(token&&pathname==='/login'){const u=req.nextUrl.clone();u.pathname='/dashboard';return NextResponse.redirect(u);}
  return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
