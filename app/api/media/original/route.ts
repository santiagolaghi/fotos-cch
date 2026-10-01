import { NextRequest, NextResponse } from 'next/server';
import { getOriginalDownloadUrl } from '@/lib/msgraph';

export async function GET(req:NextRequest){
  try{
    const account=req.nextUrl.searchParams.get('account');
    const item=req.nextUrl.searchParams.get('item');
    if(!account||!item)return NextResponse.json({error:'account e item requeridos'},{status:400});
    const url=await getOriginalDownloadUrl(account,item);
    if(!url)return NextResponse.json({error:'Original no disponible'},{status:404});
    return NextResponse.redirect(url,302);
  }catch(e){
    console.error('Original route failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo abrir el original'},{status:500});
  }
}
