import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deleteDriveItem } from '@/lib/msgraph';

const SESSION_TITLE='Fotos CCH · curación permanente';

async function backfillTrashQueue(){
  const db=supabaseAdmin();
  const {data:session,error:sError}=await db.from('review_sessions').select('id').eq('title',SESSION_TITLE).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(sError)throw sError;
  if(!session)return 0;

  const {data:trash,error:tError}=await db.from('review_actions').select('account_id,drive_item_id').eq('session_id',session.id).eq('action','trash').limit(5000);
  if(tError)throw tError;
  if(!trash?.length)return 0;

  const {data:queued,error:qError}=await db.from('delete_queue').select('account_id,drive_item_id,status').in('status',['queued','deleted']).limit(10000);
  if(qError)throw qError;
  const existing=new Set((queued||[]).map(x=>`${x.account_id}:${x.drive_item_id}`));
  const executeAfter=new Date(Date.now()+24*60*60*1000).toISOString();
  const missing=trash.filter(x=>!existing.has(`${x.account_id}:${x.drive_item_id}`)).map(x=>({
    account_id:x.account_id,
    drive_item_id:x.drive_item_id,
    execute_after:executeAfter,
    status:'queued'
  }));
  if(!missing.length)return 0;
  const {error:iError}=await db.from('delete_queue').insert(missing);
  if(iError)throw iError;
  return missing.length;
}

export async function POST(){
  try{
    const db=supabaseAdmin();
    const backfilled=await backfillTrashQueue();
    const now=new Date().toISOString();
    const {data:due,error}=await db.from('delete_queue').select('id,account_id,drive_item_id').eq('status','queued').lte('execute_after',now).order('execute_after',{ascending:true}).limit(20);
    if(error)throw error;

    let deleted=0,failed=0;
    for(const row of due||[]){
      try{
        await deleteDriveItem(row.account_id,row.drive_item_id);
        const {error:updateError}=await db.from('delete_queue').update({status:'deleted',deleted_at:new Date().toISOString(),error:null}).eq('id',row.id);
        if(updateError)throw updateError;
        deleted++;
      }catch(e){
        failed++;
        await db.from('delete_queue').update({status:'failed',error:e instanceof Error?e.message:'Error al borrar'}).eq('id',row.id);
      }
    }
    return NextResponse.json({ok:true,backfilled,processed:(due||[]).length,deleted,failed});
  }catch(e){
    console.error('Delete queue processor failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo procesar el descarte'},{status:500});
  }
}
