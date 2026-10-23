import { NextResponse } from 'next/server';
import { SESSION_COOKIE,readSession } from './lib/session.js';
export async function middleware(request) {
  const session=await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if(session?.role==='admin')return NextResponse.next();
  if(request.nextUrl.pathname.startsWith('/api/'))return NextResponse.json({error:session?'管理者権限が必要です':'ログインしてください'},{status:session?403:401,headers:{'Cache-Control':'no-store'}});
  const url=new URL('/login',request.url);url.searchParams.set('next','/admin');return NextResponse.redirect(url);
}
export const config={matcher:['/admin/:path*','/api/admin/:path*']};
