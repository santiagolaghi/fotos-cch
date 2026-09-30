import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/session';
function safeEqual(a:string,b:string){const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb)}
export async function POST(req:NextRequest){const form=await req.formData();const pass=String(form.get('password')||'');const expected=process.env.APP_PASSWORD||'';if(!expected||!safeEqual(pass,expected))return NextResponse.redirect(new URL('/login?error=1',req.url),303);const token=await createSessionToken();const res=NextResponse.redirect(new URL('/',req.url),303);res.cookies.set('culto_session',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:60*60*12,path:'/'});return res}
