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

export async function GET(){
  try{
    const sessionId=await ensureSession();
    const {data,error}=await supabaseAdmin().from('review_actions').select('account_id,drive_item_id,action,created_at').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(10000);
    if(error)throw error;
    return NextResponse.json({items:data||[]});
  }catch(e){
    console.error('Review actions read failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudieron leer las decisiones'},{status:500});
  }
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json() as {accountId?:string;itemId?:string;action?:Action};
    if(!body.accountId||!body.itemId||!body.action||!['keep','trash','skip'].includes(body.action))return NextResponse.json({error:'Datos inválidos'},{status:400});
    const sessionId=await ensureSession();
    const {error}=await supabaseAdmin().from('review_actions').upsert({
      session_id:sessionId,
      account_id:body.accountId,
      drive_item_id:body.itemId,
      action:body.action,
      created_at:new Date().toISOString()
    },{onConflict:'session_id,account_id,drive_item_id'});
    if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){
    console.error('Review action save failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar la decisión'},{status:500});
  }
}
