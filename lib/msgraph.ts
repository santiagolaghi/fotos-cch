import { decryptSecret, encryptSecret } from './crypto';
import { supabaseAdmin } from './supabase-admin';

const GRAPH='https://graph.microsoft.com/v1.0';
export const MICROSOFT_SCOPES='openid profile email offline_access User.Read Files.ReadWrite';

export function microsoftAuthorizeUrl(slot:string,state:string){
  const p=new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||'',response_type:'code',redirect_uri:`${process.env.APP_URL}/api/onedrive/callback`,response_mode:'query',scope:MICROSOFT_SCOPES,state,prompt:'select_account'});
  p.set('state',`${slot}.${state}`); return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;
}
export async function redeemCode(code:string){
  const body=new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||'',client_secret:process.env.MICROSOFT_CLIENT_SECRET||'',code,redirect_uri:`${process.env.APP_URL}/api/onedrive/callback`,grant_type:'authorization_code',scope:MICROSOFT_SCOPES});
  const r=await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  if(!r.ok) throw new Error(`Microsoft token error ${r.status}`);
  return r.json() as Promise<{access_token:string;refresh_token?:string;expires_in:number}>;
}
export async function graphMe(access:string){
  const r=await fetch(`${GRAPH}/me?$select=id,displayName,userPrincipalName,mail`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Graph /me failed ${r.status}`);
  return r.json();
}
export async function graphDrive(access:string){
  const r=await fetch(`${GRAPH}/me/drive?$select=id,driveType,webUrl,owner`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Graph /drive failed ${r.status}`);
  return r.json();
}
export async function refreshAccess(accountId:string){
  const db=supabaseAdmin();
  const {data:a,error}=await db.from('onedrive_accounts').select('*').eq('id',accountId).single();
  if(error||!a)throw new Error('Account missing');
  if(new Date(a.access_expires_at).getTime()>Date.now()+120000)return decryptSecret(a.access_token_enc);
  const refresh=decryptSecret(a.refresh_token_enc);
  const body=new URLSearchParams({client_id:process.env.MICROSOFT_CLIENT_ID||'',client_secret:process.env.MICROSOFT_CLIENT_SECRET||'',refresh_token:refresh,grant_type:'refresh_token',scope:MICROSOFT_SCOPES});
  const r=await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw new Error(`Token refresh failed ${r.status}`);
  const t=await r.json();
  await db.from('onedrive_accounts').update({access_token_enc:encryptSecret(t.access_token),refresh_token_enc:encryptSecret(t.refresh_token||refresh),access_expires_at:new Date(Date.now()+t.expires_in*1000).toISOString()}).eq('id',accountId);
  return t.access_token as string;
}

type QueueNode={id:string;depth:number};

async function getChildren(access:string,itemId:string){
  const base=itemId==='root'?`${GRAPH}/me/drive/root/children`:`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/children`;
  const first=new URL(base);
  first.searchParams.set('$select','id,name,size,createdDateTime,lastModifiedDateTime,file,folder,image,photo,parentReference');
  first.searchParams.set('$expand','thumbnails');
  first.searchParams.set('$top','200');
  let next:string|null=first.toString();
  const out:any[]=[];
  let pages=0;
  while(next && pages<6){
    const r=await fetch(next,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
    if(!r.ok)throw new Error(`Graph list failed ${r.status}`);
    const j=await r.json();
    out.push(...(j.value||[]));
    next=j['@odata.nextLink']||null;
    pages++;
  }
  return out;
}

export async function listFolderPhotos(accountId:string,folderItemId='root',limit=300){
  const access=await refreshAccess(accountId);
  const photos:any[]=[];
  const queue:QueueNode[]=[{id:folderItemId,depth:0}];
  const maxDepth=5;
  const maxFolders=160;
  let foldersVisited=0;

  while(queue.length && photos.length<limit && foldersVisited<maxFolders){
    const node=queue.shift()!;
    foldersVisited++;
    const children=await getChildren(access,node.id);
    for(const x of children){
      if(x.file && (x.image||x.photo||String(x.file?.mimeType||'').startsWith('image/'))){
        const thumb=x.thumbnails?.[0]?.large?.url||x.thumbnails?.[0]?.medium?.url||x.thumbnails?.[0]?.small?.url||null;
        photos.push({...x,thumbnail:thumb,takenDateTime:x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||null});
        if(photos.length>=limit)break;
      } else if(x.folder && node.depth<maxDepth){
        queue.push({id:x.id,depth:node.depth+1});
      }
    }
  }
  return photos;
}

export async function deleteDriveItem(accountId:string,itemId:string){
  const access=await refreshAccess(accountId);
  const r=await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${access}`}});
  if(r.status!==204)throw new Error(`Delete failed ${r.status}`);
}
