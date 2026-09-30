import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/session';

export async function proxy(req:NextRequest){
  const p=req.nextUrl.pathname;
  if(p==='/login'||p==='/api/auth/login'||p==='/manifest.webmanifest'||p.startsWith('/_next/')||p==='/favicon.ico') return NextResponse.next();
  const ok=await verifySessionToken(req.cookies.get('culto_session')?.value);
  if(ok)return NextResponse.next();
  if(p.startsWith('/api/'))return NextResponse.json({error:'Unauthorized'},{status:401});
  return NextResponse.redirect(new URL('/login',req.url));
}
export const config={matcher:['/((?!_next/static|_next/image).*)']};
