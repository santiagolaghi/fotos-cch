import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getState } from '@/lib/library-index';

export async function GET(){
  try{
    const {data:accounts,error}=await supabaseAdmin().from('onedrive_accounts').select('id,slot,display_name,email').order('slot');
    if(error)throw error;

    const result=await Promise.all((accounts||[]).map(async account=>{
      const state=await getState(account.id);
      const rule=state?.rule;
      const syncedAt=rule?.syncedAt||null;
      const age=syncedAt?Date.now()-new Date(syncedAt).getTime():Number.POSITIVE_INFINITY;
      const needsSync=!rule?.complete||!rule?.summary||age>30*60*1000;
      return {
        id:account.id,
        slot:account.slot,
        displayName:account.display_name||account.email||`Cuenta ${account.slot}`,
        email:account.email||'',
        state:rule?{
          complete:Boolean(rule.complete),
          totalScanned:Number(rule.totalScanned||0),
          syncedAt,
          needsSync,
          summary:rule.summary||null
        }:{complete:false,totalScanned:0,syncedAt:null,needsSync:true,summary:null}
      };
    }));

    const res=NextResponse.json({accounts:result});
    res.headers.set('Cache-Control','private, no-store');
    return res;
  }catch(e){
    console.error('Library index failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudo leer el índice'},{status:500});
  }
}
