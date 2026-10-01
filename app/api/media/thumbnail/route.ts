import { NextRequest, NextResponse } from 'next/server';
import { getDriveThumbnailUrl } from '@/lib/msgraph';

export async function GET(req:NextRequest){
  try{
    const account=req.nextUrl.searchParams.get('account');
    const item=req.nextUrl.searchParams.get('item');
    const usageRaw=req.nextUrl.searchParams.get('usage');
    const usage=usageRaw==='cover'||usageRaw==='review'?usageRaw:'standard';
    if(!account||!item)return NextResponse.json({error:'account e item requeridos'},{status:400});

    const url=await getDriveThumbnailUrl(account,item,usage);
    if(!url)return NextResponse.json({error:'Sin miniatura'},{status:404});

    const res=NextResponse.redirect(url,302);
    res.headers.set('Cache-Control','private, max-age=3600, stale-while-revalidate=3600');
    return res;
  }catch(e){
    console.error('Thumbnail route failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'Error de miniatura'},{status:500});
  }
}
