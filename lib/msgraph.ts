import { decryptSecret, encryptSecret } from './crypto';
import { supabaseAdmin } from './supabase-admin';

const GRAPH='https://graph.microsoft.com/v1.0';
export const MICROSOFT_SCOPES='openid profile email offline_access User.Read Files.ReadWrite';

type TokenResponse={access_token:string;refresh_token?:string;expires_in:number};
export type MediaKind='image'|'video';
export type DriveMediaItem={
  id:string;
  name:string;
  size?:number;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  takenDateTime?:string|null;
  mimeType:string;
  kind:MediaKind;
};

type GraphItem={
  id:string;
  name:string;
  size?:number;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  file?:{mimeType?:string};
  photo?:{takenDateTime?:string};
  deleted?:Record<string,unknown>;
};

type GraphListResponse={
  value?:GraphItem[];
  '@odata.nextLink'?:string;
};

export function microsoftAuthorizeUrl(slot:string,state:string){
  const p=new URLSearchParams({
    client_id:process.env.MICROSOFT_CLIENT_ID||'',
    response_type:'code',
    redirect_uri:`${process.env.APP_URL}/api/onedrive/callback`,
    response_mode:'query',
    scope:MICROSOFT_SCOPES,
    state,
    prompt:'select_account'
  });
  p.set('state',`${slot}.${state}`);
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${p}`;
}

export async function redeemCode(code:string):Promise<TokenResponse>{
  const body=new URLSearchParams({
    client_id:process.env.MICROSOFT_CLIENT_ID||'',
    client_secret:process.env.MICROSOFT_CLIENT_SECRET||'',
    code,
    redirect_uri:`${process.env.APP_URL}/api/onedrive/callback`,
    grant_type:'authorization_code',
    scope:MICROSOFT_SCOPES
  });
  const r=await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  if(!r.ok)throw new Error(`Microsoft token error ${r.status}`);
  return await r.json() as TokenResponse;
}

export async function graphMe(access:string){
  const r=await fetch(`${GRAPH}/me?$select=id,displayName,userPrincipalName,mail`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Graph /me failed ${r.status}`);
  return await r.json() as {id:string;displayName?:string;userPrincipalName?:string;mail?:string};
}

export async function graphDrive(access:string){
  const r=await fetch(`${GRAPH}/me/drive?$select=id,driveType,webUrl,owner`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Graph /drive failed ${r.status}`);
  return await r.json() as {id:string;driveType?:string;webUrl?:string;owner?:unknown};
}

export async function refreshAccess(accountId:string):Promise<string>{
  const db=supabaseAdmin();
  const {data:a,error}=await db.from('onedrive_accounts').select('*').eq('id',accountId).single();
  if(error||!a)throw new Error('Account missing');
  if(new Date(a.access_expires_at).getTime()>Date.now()+120000)return decryptSecret(a.access_token_enc);

  const refresh=decryptSecret(a.refresh_token_enc);
  const body=new URLSearchParams({
    client_id:process.env.MICROSOFT_CLIENT_ID||'',
    client_secret:process.env.MICROSOFT_CLIENT_SECRET||'',
    refresh_token:refresh,
    grant_type:'refresh_token',
    scope:MICROSOFT_SCOPES
  });
  const r=await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  if(!r.ok)throw new Error(`Token refresh failed ${r.status}`);

  const t=await r.json() as TokenResponse;
  await db.from('onedrive_accounts').update({
    access_token_enc:encryptSecret(t.access_token),
    refresh_token_enc:encryptSecret(t.refresh_token||refresh),
    access_expires_at:new Date(Date.now()+t.expires_in*1000).toISOString()
  }).eq('id',accountId);
  return t.access_token;
}

export async function listDriveMedia(accountId:string,limit=2500):Promise<DriveMediaItem[]>{
  const access=await refreshAccess(accountId);
  const first=new URL(`${GRAPH}/me/drive/root/delta`);
  first.searchParams.set('$select','id,name,size,createdDateTime,lastModifiedDateTime,file,photo,deleted');
  first.searchParams.set('$top','200');

  let next:string|null=first.toString();
  const items:DriveMediaItem[]=[];
  let pages=0;
  const maxPages=30;

  while(next && pages<maxPages && items.length<limit){
    const r=await fetch(next,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
    if(!r.ok)throw new Error(`Graph delta failed ${r.status}`);
    const j=await r.json() as GraphListResponse;

    for(const x of j.value||[]){
      if(x.deleted||!x.file)continue;
      const mime=String(x.file.mimeType||'').toLowerCase();
      const kind:MediaKind|null=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':null;
      if(!kind)continue;
      items.push({
        id:x.id,
        name:x.name,
        size:x.size,
        createdDateTime:x.createdDateTime,
        lastModifiedDateTime:x.lastModifiedDateTime,
        takenDateTime:x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||null,
        mimeType:mime,
        kind
      });
      if(items.length>=limit)break;
    }

    next=j['@odata.nextLink']||null;
    pages++;
  }

  return items.sort((a,b)=>String(b.takenDateTime||'').localeCompare(String(a.takenDateTime||'')));
}

export async function getDriveThumbnailUrl(accountId:string,itemId:string,size:'small'|'medium'|'large'='medium'){
  const access=await refreshAccess(accountId);
  const r=await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/thumbnails`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Thumbnail failed ${r.status}`);
  const j=await r.json() as {value?:Array<{small?:{url?:string};medium?:{url?:string};large?:{url?:string}}>} ;
  const set=j.value?.[0];
  return set?.[size]?.url||set?.medium?.url||set?.small?.url||set?.large?.url||null;
}

export async function listFolderPhotos(accountId:string,_folderItemId='root',limit=300){
  return (await listDriveMedia(accountId,limit)).filter(x=>x.kind==='image');
}

export async function deleteDriveItem(accountId:string,itemId:string){
  const access=await refreshAccess(accountId);
  const r=await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${access}`}});
  if(r.status!==204)throw new Error(`Delete failed ${r.status}`);
}
