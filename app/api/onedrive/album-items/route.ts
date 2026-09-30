import { NextRequest, NextResponse } from 'next/server';
import { listAlbumMedia } from '@/lib/msgraph';

export async function GET(req:NextRequest){
  try{
    const account=req.nextUrl.searchParams.get('account');
    const album=req.nextUrl.searchParams.get('album');
    if(!account||!album)return NextResponse.json({error:'account y album requeridos'},{status:400});
    const items=await listAlbumMedia(account,album);
    const res=NextResponse.json({items});
    res.headers.set('Cache-Control','private, max-age=60, stale-while-revalidate=180');
    return res;
  }catch(e){
    console.error('OneDrive album items failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo cargar el álbum'},{status:500});
  }
}
