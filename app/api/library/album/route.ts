import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { localDateKey, localWeekday, resolvedItems } from '@/lib/library-index';

const SESSION_TITLE='Fotos CCH · curación permanente';
type ReviewedAction='keep'|'trash';

async function reviewedActions(){
  const db=supabaseAdmin();
  const {data:session,error:sError}=await db.from('review_sessions').select('id').eq('title',SESSION_TITLE).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(sError)throw sError;
  if(!session)return new Map<string,ReviewedAction>();

  const {data,error}=await db.from('review_actions').select('account_id,drive_item_id,action').eq('session_id',session.id).in('action',['keep','trash']).limit(50000);
  if(error)throw error;
  return new Map<string,ReviewedAction>((data||[]).map(x=>[`${x.account_id}:${x.drive_item_id}`,x.action as ReviewedAction]));
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
    const reviewed=await reviewedActions();

    let total=0,keep=0,trash=0;
    const batches=await Promise.all(selected.map(async account=>{
      const all=await resolvedItems(account.id);
      const matched=all.filter(item=>{
        if(item.isFolder||item.kind!==kind)return false;
        if(mode==='folder')return item.parentId===(folder||'root');
        if(mode==='date')return localDateKey(item.date)===date;
        if(mode==='weekday')return localWeekday(item.date)===weekday;
        return true;
      });

      total+=matched.length;
      const pending=[];
      for(const item of matched){
        const action=reviewed.get(`${account.id}:${item.id}`);
        if(action==='keep'){keep++;continue;}
        if(action==='trash'){trash++;continue;}
        pending.push({
          id:item.id,name:item.name,date:item.date,size:item.size,kind:item.kind,
          accountId:account.id,account:account.display_name||account.email||`Cuenta ${account.slot}`
        });
      }
      return pending;
    }));

    const items=batches.flat().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return NextResponse.json({items,total,stats:{total,keep,trash,pending:items.length}});
  }catch(e){
    console.error('Library album failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo abrir el álbum'},{status:500});
  }
}
