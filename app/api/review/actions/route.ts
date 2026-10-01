import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const SESSION_TITLE='Fotos CCH · curación permanente';
type Action='keep'|'trash'|'skip';

async function ensureSession(){
  const db=supabaseAdmin();
  const {data:existing,error}=await db.from('review_sessions').select('id').eq('title',SESSION_TITLE).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(error)throw error;
  if(existing)return existing.id as string;
  const {data:created,error:createError}=await db.from('review_sessions').insert({title:SESSION_TITLE,source:{kind:'global'}}).select('id').single();
  if(createError)throw createError;
  return created.id as string;
}

async function cancelQueuedDelete(accountId:string,itemId:string){
  const {error}=await supabaseAdmin().from('delete_queue').update({status:'cancelled',error:null}).eq('account_id',accountId).eq('drive_item_id',itemId).eq('status','queued');
  if(error)throw error;
}

async function queueDelete(accountId:string,itemId:string,originalName?:string){
  const db=supabaseAdmin();
  const {data:existing,error:findError}=await db.from('delete_queue').select('id,status').eq('account_id',accountId).eq('drive_item_id',itemId).in('status',['queued','deleted']).order('queued_at',{ascending:false}).limit(1).maybeSingle();
  if(findError)throw findError;
  if(existing)return;

  const executeAfter=new Date(Date.now()+24*60*60*1000).toISOString();
  const {error}=await db.from('delete_queue').insert({
    account_id:accountId,
    drive_item_id:itemId,
    original_name:originalName||null,
    execute_after:executeAfter,
    status:'queued'
  });
  if(error)throw error;
}

async function sessionCounts(sessionId:string){
  const {data,error}=await supabaseAdmin().from('review_actions').select('action').eq('session_id',sessionId).in('action',['keep','trash']).limit(50000);
  if(error)throw error;
  let keep=0,trash=0;
  for(const row of data||[]){if(row.action==='keep')keep++;else if(row.action==='trash')trash++;}
  return {keep,trash};
}

export async function GET(){
  try{
    const sessionId=await ensureSession();
    const {data,error}=await supabaseAdmin().from('review_actions').select('account_id,drive_item_id,action,created_at').eq('session_id',sessionId).in('action',['keep','trash']).order('created_at',{ascending:false}).limit(50000);
    if(error)throw error;
    const items=data||[];
    const keep=items.filter(x=>x.action==='keep').length;
    const trash=items.filter(x=>x.action==='trash').length;
    return NextResponse.json({items,counts:{keep,trash}});
  }catch(e){
    console.error('Review actions read failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudieron leer las decisiones'},{status:500});
  }
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json() as {accountId?:string;itemId?:string;itemName?:string;action?:Action};
    if(!body.accountId||!body.itemId||!body.action||!['keep','trash','skip'].includes(body.action))return NextResponse.json({error:'Datos inválidos'},{status:400});

    const db=supabaseAdmin();
    const sessionId=await ensureSession();

    if(body.action==='skip'){
      const {error}=await db.from('review_actions').delete().eq('session_id',sessionId).eq('account_id',body.accountId).eq('drive_item_id',body.itemId);
      if(error)throw error;
      await cancelQueuedDelete(body.accountId,body.itemId);
    }else{
      const {error}=await db.from('review_actions').upsert({
        session_id:sessionId,
        account_id:body.accountId,
        drive_item_id:body.itemId,
        action:body.action,
        created_at:new Date().toISOString()
      },{onConflict:'session_id,account_id,drive_item_id'});
      if(error)throw error;

      if(body.action==='trash')await queueDelete(body.accountId,body.itemId,body.itemName);
      else await cancelQueuedDelete(body.accountId,body.itemId);
    }

    return NextResponse.json({ok:true,counts:await sessionCounts(sessionId)});
  }catch(e){
    console.error('Review action save failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar la decisión'},{status:500});
  }
}
