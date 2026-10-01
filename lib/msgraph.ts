import { decryptSecret, encryptSecret } from './crypto';
import { supabaseAdmin } from './supabase-admin';

const GRAPH='https://graph.microsoft.com/v1.0';
export const MICROSOFT_SCOPES='openid profile email offline_access User.Read Files.ReadWrite';

type TokenResponse={access_token:string;refresh_token?:string;expires_in:number};
type GraphPage<T>={value?:T[];'@odata.nextLink'?:string;'@odata.deltaLink'?:string};

export type MediaKind='image'|'video';
export type AlbumMediaItem={
  id:string;
  name:string;
  size?:number;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  takenDateTime?:string|null;
  mimeType:string;
  kind:MediaKind;
};

export type IndexedDriveItem={
  id:string;
  name:string;
  parentId:string|null;
  isFolder:boolean;
  kind:MediaKind|null;
  mimeType:string|null;
  date:string|null;
  size:number;
  deleted:boolean;
};

export type OneDriveAlbum={
  id:string;
  name:string;
  childCount:number;
  coverImageItemId?:string|null;
};

type GraphAlbum={
  id:string;
  name:string;
  bundle?:{childCount?:number;album?:{coverImageItemId?:string|null}};
};

type GraphItem={
  id:string;
  name?:string;
  size?:number;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  parentReference?:{id?:string};
  folder?:Record<string,unknown>;
  file?:{mimeType?:string};
  photo?:{takenDateTime?:string};
  video?:Record<string,unknown>;
  deleted?:Record<string,unknown>;
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

async function graphPaged<T>(firstUrl:string,access:string,maxPages=30){
  let next:string|null=firstUrl;
  const out:T[]=[];
  let pages=0;
  while(next&&pages<maxPages){
    const r=await fetch(next,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
    if(!r.ok)throw new Error(`Graph request failed ${r.status}`);
    const j=await r.json() as GraphPage<T>;
    out.push(...(j.value||[]));
    next=j['@odata.nextLink']||null;
    pages++;
  }
  return out;
}

export async function listOneDriveAlbums(accountId:string):Promise<OneDriveAlbum[]>{
  const access=await refreshAccess(accountId);
  const db=supabaseAdmin();
  const {data:account,error}=await db.from('onedrive_accounts').select('drive_id').eq('id',accountId).single();
  if(error||!account)throw new Error('Account drive missing');

  const attempts:string[]=[
    `${GRAPH}/drive/bundles?filter=bundle%2Falbum%20ne%20null`,
    `${GRAPH}/drive/bundles?$filter=bundle%2Falbum%20ne%20null`,
    `${GRAPH}/drive/bundles`,
    `${GRAPH}/drives/${encodeURIComponent(account.drive_id)}/bundles?filter=bundle%2Falbum%20ne%20null`
  ];

  let best:GraphAlbum[]=[];
  for(const url of attempts){
    try{
      const found=await graphPaged<GraphAlbum>(url,access,20);
      console.info('OneDrive albums attempt',{url:url.replace(GRAPH,''),count:found.length});
      if(found.length>best.length)best=found;
      const albumsOnly=found.filter(x=>x.bundle?.album!==undefined&&x.bundle?.album!==null);
      if(albumsOnly.length){
        best=albumsOnly;
        break;
      }
    }catch(e){
      console.warn('OneDrive albums attempt failed',{url:url.replace(GRAPH,''),error:e instanceof Error?e.message:'error'});
    }
  }

  const albums=best.filter(x=>x.bundle?.album!==undefined&&x.bundle?.album!==null);
  console.info('OneDrive albums resolved',{accountId,count:albums.length,totalBundles:best.length});

  return albums
    .map(x=>({
      id:x.id,
      name:x.name,
      childCount:x.bundle?.childCount||0,
      coverImageItemId:x.bundle?.album?.coverImageItemId||null
    }))
    .sort((a,b)=>a.name.localeCompare(b.name,'es'));
}

export async function listAlbumMedia(accountId:string,albumId:string):Promise<AlbumMediaItem[]>{
  const access=await refreshAccess(accountId);
  const u=new URL(`${GRAPH}/drive/items/${encodeURIComponent(albumId)}/children`);
  u.searchParams.set('$select','id,name,size,createdDateTime,lastModifiedDateTime,file,photo');
  u.searchParams.set('$top','200');

  const raw=await graphPaged<GraphItem>(u.toString(),access,30);
  const media:AlbumMediaItem[]=[];

  for(const x of raw){
    if(!x.file||x.deleted)continue;
    const mime=String(x.file.mimeType||'').toLowerCase();
    const kind:MediaKind|null=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':null;
    if(!kind)continue;
    media.push({
      id:x.id,
      name:x.name||'',
      size:x.size,
      createdDateTime:x.createdDateTime,
      lastModifiedDateTime:x.lastModifiedDateTime,
      takenDateTime:x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||null,
      mimeType:mime,
      kind
    });
  }

  return media.sort((a,b)=>String(b.takenDateTime||'').localeCompare(String(a.takenDateTime||'')));
}

export async function listDriveMedia(accountId:string,limit=2500):Promise<AlbumMediaItem[]>{
  const access=await refreshAccess(accountId);
  const first=new URL(`${GRAPH}/me/drive/root/delta`);
  first.searchParams.set('$select','id,name,size,createdDateTime,lastModifiedDateTime,file,photo,deleted');
  first.searchParams.set('$top','200');

  let next:string|null=first.toString();
  const items:AlbumMediaItem[]=[];
  let pages=0;
  while(next&&pages<30&&items.length<limit){
    const r=await fetch(next,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
    if(!r.ok)throw new Error(`Graph delta failed ${r.status}`);
    const j=await r.json() as GraphPage<GraphItem>;
    for(const x of j.value||[]){
      if(x.deleted||!x.file)continue;
      const mime=String(x.file.mimeType||'').toLowerCase();
      const kind:MediaKind|null=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':null;
      if(!kind)continue;
      items.push({id:x.id,name:x.name||'',size:x.size,createdDateTime:x.createdDateTime,lastModifiedDateTime:x.lastModifiedDateTime,takenDateTime:x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||null,mimeType:mime,kind});
      if(items.length>=limit)break;
    }
    next=j['@odata.nextLink']||null;
    pages++;
  }
  return items.sort((a,b)=>String(b.takenDateTime||'').localeCompare(String(a.takenDateTime||'')));
}

export async function scanDriveDeltaBatch(accountId:string,cursor?:string|null,maxPages=4){
  const access=await refreshAccess(accountId);
  let next=cursor||null;
  if(!next){
    const u=new URL(`${GRAPH}/me/drive/root/delta`);
    u.searchParams.set('$select','id,name,size,createdDateTime,lastModifiedDateTime,parentReference,folder,file,photo,video,deleted');
    u.searchParams.set('$top','200');
    next=u.toString();
  }

  const items:IndexedDriveItem[]=[];
  let deltaLink:string|null=null;
  let pages=0;

  while(next&&pages<maxPages){
    const r=await fetch(next,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
    if(!r.ok)throw new Error(`Graph delta failed ${r.status}`);
    const j=await r.json() as GraphPage<GraphItem>;
    for(const x of j.value||[]){
      const mime=String(x.file?.mimeType||'').toLowerCase();
      const kind:MediaKind|null=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':null;
      items.push({
        id:x.id,
        name:x.name||'',
        parentId:x.parentReference?.id||null,
        isFolder:Boolean(x.folder),
        kind,
        mimeType:mime||null,
        date:x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||null,
        size:Number(x.size||0),
        deleted:Boolean(x.deleted)
      });
    }
    next=j['@odata.nextLink']||null;
    deltaLink=j['@odata.deltaLink']||deltaLink;
    pages++;
    if(!next)break;
  }

  return {items,nextLink:next,deltaLink,pages};
}

async function thumbnailRequest(access:string,itemId:string,key:string){
  const u=new URL(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/thumbnails`);
  u.searchParams.set('$select',key);
  const r=await fetch(u,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)return null;
  const j=await r.json() as {value?:Array<Record<string,{url?:string}|string>>};
  const set=j.value?.[0];
  const candidate=set?.[key];
  return candidate&&typeof candidate==='object'&&'url' in candidate?candidate.url||null:null;
}

export async function getDriveThumbnailUrl(accountId:string,itemId:string,usage:'cover'|'review'|'standard'='standard'){
  const access=await refreshAccess(accountId);
  const custom=usage==='cover'?'c520x360_crop':usage==='review'?'c1200x1200':'large';
  const exact=await thumbnailRequest(access,itemId,custom);
  if(exact)return exact;

  const r=await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}/thumbnails`,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Thumbnail failed ${r.status}`);
  const j=await r.json() as {value?:Array<{small?:{url?:string};medium?:{url?:string};large?:{url?:string}}>} ;
  const set=j.value?.[0];
  return set?.large?.url||set?.medium?.url||set?.small?.url||null;
}

export async function getOriginalDownloadUrl(accountId:string,itemId:string){
  const access=await refreshAccess(accountId);
  const u=new URL(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`);
  u.searchParams.set('$select','id,@microsoft.graph.downloadUrl');
  const r=await fetch(u,{headers:{Authorization:`Bearer ${access}`},cache:'no-store'});
  if(!r.ok)throw new Error(`Original URL failed ${r.status}`);
  const j=await r.json() as {'@microsoft.graph.downloadUrl'?:string};
  return j['@microsoft.graph.downloadUrl']||null;
}

export async function listFolderPhotos(accountId:string,_folderItemId='root',limit=300){
  return (await listDriveMedia(accountId,limit)).filter(x=>x.kind==='image');
}

export async function deleteDriveItem(accountId:string,itemId:string){
  const access=await refreshAccess(accountId);
  const r=await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(itemId)}`,{method:'DELETE',headers:{Authorization:`Bearer ${access}`}});
  if(r.status!==204)throw new Error(`Delete failed ${r.status}`);
}
