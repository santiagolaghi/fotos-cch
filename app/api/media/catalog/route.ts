import { NextRequest, NextResponse } from 'next/server';
import { listDriveMedia } from '@/lib/msgraph';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req:NextRequest){
  try{
    const requested=Number(req.nextUrl.searchParams.get('limit')||2500);
    const limit=Math.max(200,Math.min(Number.isFinite(requested)?requested:2500,4000));
    const {data:accounts,error}=await supabaseAdmin().from('onedrive_accounts').select('id,slot,display_name,email').order('slot');
    if(error)throw error;
    if(!accounts?.length)return NextResponse.json({items:[],accounts:[]});

    const batches=await Promise.all(accounts.map(async account=>{
      const media=await listDriveMedia(account.id,limit);
      return media.map(item=>({
        ...item,
        accountId:account.id,
        account:account.display_name||account.email||`Cuenta ${account.slot}`,
        slot:account.slot
      }));
    }));

    const items=batches.flat().sort((a,b)=>String(b.takenDateTime||'').localeCompare(String(a.takenDateTime||'')));
    const res=NextResponse.json({items,accounts});
    res.headers.set('Cache-Control','private, max-age=120, stale-while-revalidate=300');
    return res;
  }catch(e){
    console.error('Media catalog failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo leer la biblioteca'},{status:500});
  }
}
