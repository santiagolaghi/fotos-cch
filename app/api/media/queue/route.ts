import { NextRequest, NextResponse } from 'next/server';
import { listFolderPhotos } from '@/lib/msgraph';

export async function GET(req:NextRequest){
  try{
    const account=req.nextUrl.searchParams.get('account');
    const folder=req.nextUrl.searchParams.get('folder')||'root';
    const requested=Number(req.nextUrl.searchParams.get('limit')||300);
    const limit=Math.max(1,Math.min(Number.isFinite(requested)?requested:300,600));
    if(!account)return NextResponse.json({error:'account required'},{status:400});
    const items=await listFolderPhotos(account,folder,limit);
    return NextResponse.json({items});
  }catch(e){
    console.error('OneDrive media queue failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'error'},{status:500});
  }
}
