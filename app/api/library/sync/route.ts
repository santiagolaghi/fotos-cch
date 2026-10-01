import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { scanDriveDeltaBatch } from '@/lib/msgraph';
import { appendChunk, computeSummary, createState, getState, resetIndex, updateState } from '@/lib/library-index';

export async function POST(req:NextRequest){
  try{
    const body=await req.json() as {accountId?:string;restart?:boolean};
    if(!body.accountId)return NextResponse.json({error:'accountId requerido'},{status:400});

    const db=supabaseAdmin();
    const {data:account,error}=await db.from('onedrive_accounts').select('id,slot,display_name,email').eq('id',body.accountId).single();
    if(error||!account)throw new Error('Cuenta no encontrada');

    let state=await getState(account.id);
    if(body.restart||state?.rule?.version!==3){
      await resetIndex(account.id);
      state=null;
    }
    if(!state)state=await createState(account);

    const rule=state.rule;
    const cursor=rule.nextLink||(rule.complete?rule.deltaLink:null);
    const batch=await scanDriveDeltaBatch(account.id,cursor,4);
    const sequence=Number(rule.sequence||0)+1;
    await appendChunk(account.id,sequence,batch.items);

    const complete=!batch.nextLink;
    const nextRule={...rule,
      version:3,
      sequence,
      nextLink:batch.nextLink,
      deltaLink:batch.deltaLink||rule.deltaLink||null,
      complete,
      totalScanned:Number(rule.totalScanned||0)+batch.items.length,
      syncedAt:complete?new Date().toISOString():rule.syncedAt||null
    };

    if(complete)nextRule.summary=await computeSummary(account.id);
    await updateState(state.id,nextRule);

    return NextResponse.json({
      ok:true,
      accountId:account.id,
      done:complete,
      scanned:nextRule.totalScanned,
      added:batch.items.length,
      summary:complete?nextRule.summary:null
    });
  }catch(e){
    console.error('Library sync failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo sincronizar'},{status:500});
  }
}
