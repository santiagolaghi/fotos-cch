import { NextRequest, NextResponse } from 'next/server';
export async function POST(req:NextRequest){const res=NextResponse.redirect(new URL('/login',req.url),303);res.cookies.set('culto_session','',{httpOnly:true,maxAge:0,path:'/'});return res}
