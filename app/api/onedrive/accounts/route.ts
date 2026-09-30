import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(){
  try{
    const {data,error}=await supabaseAdmin().from('onedrive_accounts').select('id,slot,display_name,email,drive_type,last_synced_at').order('slot');
    if(error) throw error;
    return NextResponse.json(data||[]);
  }catch(e){
    console.error('OneDrive accounts read failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudieron leer las cuentas'},{status:500});
  }
}
