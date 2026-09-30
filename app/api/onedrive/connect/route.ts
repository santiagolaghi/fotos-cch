import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { microsoftAuthorizeUrl } from '@/lib/msgraph';
export async function GET(req:NextRequest){ const slot=req.nextUrl.searchParams.get('slot')||'1'; const nonce=crypto.randomBytes(20).toString('hex'); const res=NextResponse.redirect(microsoftAuthorizeUrl(slot,nonce)); res.cookies.set('ms_oauth_state',nonce,{httpOnly:true,secure:true,sameSite:'lax',maxAge:600,path:'/'}); return res; }
