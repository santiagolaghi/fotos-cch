import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { localDateKey, localWeekday, resolvedItems } from '@/lib/library-index';

const SESSION_TITLE='Fotos CCH · curación permanente';

async function reviewedKeys(){
  const db=supabaseAdmin();
  const {data:session,error:sError}=await db.from('review_sessions').select('id').eq('title',SESSION_TITLE).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(sError)throw sError;
  if(!session)return new Set<string>();

  const {data,error}=await db.from('review_actions').select('account_id,drive_item_id,action').eq('session_id',session.id).in('action',['keep','trash']).limit(50000);
  if(error)throw error;
  return new Set((data||[]).map(x=>`${x.account_id}:${x.drive_item_id}`));
}

export async function GET(req:NextRequest){
  try{
    const mode=req.nextUrl.searchParams.get('mode')||'all';
    const kind=req.nextUrl.searchParams.get('kind')==='video'?'video':'image';
    const accountParam=req.nextUrl.searchParams.get('account');
    const folder=req.nextUrl.searchParams.get('folder');
    const date=req.nextUrl.searchParams.get('date');
    const weekday=Number(req.nextUrl.searchParams.get('weekday')||'-1');

    const {data:accounts,error}=await supabaseAdmin().from('onedrive_accounts').select('id,slot,display_name,email').order('slot');
    if(error)throw error;
    const selected=(accounts||[]).filter(a=>!accountParam||a.id===accountParam);
    const done=await reviewedKeys();

    const batches=await Promise.all(selected.map(async account=>{
      const all=await resolvedItems(account.id);
      return all.filter(item=>{
        if(item.isFolder||item.kind!==kind)return false;
        if(done.has(`${account.id}:${item.id}`))return false;
        if(mode==='folder')return item.parentId===(folder||'root');
        if(mode==='date')return localDateKey(item.date)===date;
        if(mode==='weekday')return localWeekday(item.date)===weekday;
        return true;
      }).map(item=>({
        id:item.id,name:item.name,date:item.date,size:item.size,kind:item.kind,
        accountId:account.id,account:account.display_name||account.email||`Cuenta ${account.slot}`
      }));
    }));

    const items=batches.flat().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return NextResponse.json({items,total:items.length});
  }catch(e){
    console.error('Library album failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo abrir el álbum'},{status:500});
  }
}
