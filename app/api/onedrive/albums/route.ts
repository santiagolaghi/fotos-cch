import { NextResponse } from 'next/server';
import { listOneDriveAlbums } from '@/lib/msgraph';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(){
  try{
    const {data:accounts,error}=await supabaseAdmin().from('onedrive_accounts').select('id,slot,display_name,email,drive_type').order('slot');
    if(error)throw error;

    const groups=await Promise.all((accounts||[]).map(async account=>{
      if(account.drive_type&&account.drive_type!=='personal'){
        return {...account,albums:[],albumsSupported:false};
      }
      try{
        const albums=await listOneDriveAlbums(account.id);
        return {...account,albums,albumsSupported:true};
      }catch(e){
        console.error('Albums failed for account',account.id,e);
        return {...account,albums:[],albumsSupported:false};
      }
    }));

    const res=NextResponse.json({accounts:groups});
    res.headers.set('Cache-Control','private, max-age=60, stale-while-revalidate=240');
    return res;
  }catch(e){
    console.error('OneDrive albums route failed',e);
    return NextResponse.json({error:e instanceof Error?e.message:'No se pudieron leer los álbumes'},{status:500});
  }
}
