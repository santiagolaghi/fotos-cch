import { supabaseAdmin } from './supabase-admin';
import type { IndexedDriveItem } from './msgraph';

const STATE_PREFIX='__LIB_STATE_V3__:';
const CHUNK_PREFIX='__LIB_CHUNK_V3__:';

export type IndexStateRule={
  version:number;
  accountId:string;
  slot:number;
  displayName:string;
  email:string;
  nextLink:string|null;
  deltaLink:string|null;
  complete:boolean;
  totalScanned:number;
  sequence:number;
  syncedAt:string|null;
  summary?:LibrarySummary;
};

export type FolderSummary={
  id:string;
  name:string;
  path:string;
  imageCount:number;
  videoCount:number;
  coverImageId:string|null;
  coverVideoId:string|null;
  latestDate:string|null;
};

export type DateSummary={
  date:string;
  imageCount:number;
  videoCount:number;
  coverImageId:string|null;
  coverVideoId:string|null;
};

export type LibrarySummary={
  imageCount:number;
  videoCount:number;
  folders:FolderSummary[];
  dates:DateSummary[];
  weekdays:Record<string,{imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null}>;
};

export function stateName(accountId:string){return `${STATE_PREFIX}${accountId}`;}
export function chunkPrefix(accountId:string){return `${CHUNK_PREFIX}${accountId}:`;}

export async function getState(accountId:string){
  const {data,error}=await supabaseAdmin().from('virtual_albums').select('id,name,rule,created_at').eq('name',stateName(accountId)).order('created_at',{ascending:true}).limit(1).maybeSingle();
  if(error)throw error;
  return data as {id:string;name:string;rule:IndexStateRule;created_at:string}|null;
}

export async function createState(account:{id:string;slot:number;display_name:string|null;email:string|null}){
  const rule:IndexStateRule={
    version:3,
    accountId:account.id,
    slot:account.slot,
    displayName:account.display_name||account.email||`Cuenta ${account.slot}`,
    email:account.email||'',
    nextLink:null,
    deltaLink:null,
    complete:false,
    totalScanned:0,
    sequence:0,
    syncedAt:null
  };
  const {data,error}=await supabaseAdmin().from('virtual_albums').insert({name:stateName(account.id),is_smart:true,rule}).select('id,name,rule,created_at').single();
  if(error)throw error;
  return data as {id:string;name:string;rule:IndexStateRule;created_at:string};
}

export async function resetIndex(accountId:string){
  const db=supabaseAdmin();
  const {error:e1}=await db.from('virtual_albums').delete().like('name',`${chunkPrefix(accountId)}%`);
  if(e1)throw e1;
  const {error:e2}=await db.from('virtual_albums').delete().eq('name',stateName(accountId));
  if(e2)throw e2;
}

export async function appendChunk(accountId:string,sequence:number,items:IndexedDriveItem[]){
  if(!items.length)return;
  const name=`${chunkPrefix(accountId)}${String(sequence).padStart(6,'0')}`;
  const {error}=await supabaseAdmin().from('virtual_albums').insert({name,is_smart:true,rule:{version:3,accountId,sequence,items}});
  if(error)throw error;
}

export async function updateState(id:string,rule:IndexStateRule){
  const {error}=await supabaseAdmin().from('virtual_albums').update({rule}).eq('id',id);
  if(error)throw error;
}

export async function resolvedItems(accountId:string){
  const {data,error}=await supabaseAdmin().from('virtual_albums').select('name,rule,created_at').like('name',`${chunkPrefix(accountId)}%`).order('created_at',{ascending:true});
  if(error)throw error;
  const map=new Map<string,IndexedDriveItem>();
  for(const row of data||[]){
    const items=(row.rule?.items||[]) as IndexedDriveItem[];
    for(const item of items){
      if(item.deleted)map.delete(item.id);
      else map.set(item.id,item);
    }
  }
  return [...map.values()];
}

function argentinaDateParts(value:string|null){
  if(!value)return null;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  const weekdayMap:Record<string,number>={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return {date:`${get('year')}-${get('month')}-${get('day')}`,weekday:weekdayMap[get('weekday')]??d.getUTCDay()};
}

export async function computeSummary(accountId:string):Promise<LibrarySummary>{
  const items=await resolvedItems(accountId);
  const folders=new Map<string,IndexedDriveItem>();
  for(const item of items)if(item.isFolder)folders.set(item.id,item);

  const pathCache=new Map<string,string>();
  const folderPath=(id:string)=>{
    if(pathCache.has(id))return pathCache.get(id)!;
    const chain:string[]=[]; let cur=folders.get(id); let guard=0;
    while(cur&&guard<30){if(cur.name)chain.unshift(cur.name);cur=cur.parentId?folders.get(cur.parentId):undefined;guard++;}
    const path=chain.join(' / ')||'Raíz'; pathCache.set(id,path); return path;
  };

  type Acc={name:string;imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null;latestDate:string|null};
  const folderAcc=new Map<string,Acc>();
  const dateAcc=new Map<string,{imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null}>();
  const weekdays:LibrarySummary['weekdays']={};
  let imageCount=0,videoCount=0;

  for(const item of items){
    if(item.isFolder||!item.kind)continue;
    if(item.kind==='image')imageCount++; else videoCount++;

    const parent=item.parentId||'root';
    const existing=folderAcc.get(parent)||{name:folders.get(parent)?.name||'Raíz',imageCount:0,videoCount:0,coverImageId:null,coverVideoId:null,latestDate:null};
    if(item.kind==='image'){existing.imageCount++;existing.coverImageId=existing.coverImageId||item.id;}
    else{existing.videoCount++;existing.coverVideoId=existing.coverVideoId||item.id;}
    if(item.date&&(!existing.latestDate||item.date>existing.latestDate))existing.latestDate=item.date;
    folderAcc.set(parent,existing);

    const p=argentinaDateParts(item.date);
    if(p){
      const da=dateAcc.get(p.date)||{imageCount:0,videoCount:0,coverImageId:null,coverVideoId:null};
      if(item.kind==='image'){da.imageCount++;da.coverImageId=da.coverImageId||item.id;}
      else{da.videoCount++;da.coverVideoId=da.coverVideoId||item.id;}
      dateAcc.set(p.date,da);

      const wk=weekdays[String(p.weekday)]||{imageCount:0,videoCount:0,coverImageId:null,coverVideoId:null};
      if(item.kind==='image'){wk.imageCount++;wk.coverImageId=wk.coverImageId||item.id;}
      else{wk.videoCount++;wk.coverVideoId=wk.coverVideoId||item.id;}
      weekdays[String(p.weekday)]=wk;
    }
  }

  const folderSummaries:FolderSummary[]=[...folderAcc.entries()].map(([id,a])=>({
    id,name:a.name,path:id==='root'?'Raíz':folderPath(id),imageCount:a.imageCount,videoCount:a.videoCount,
    coverImageId:a.coverImageId,coverVideoId:a.coverVideoId,latestDate:a.latestDate
  })).sort((a,b)=>String(b.latestDate||'').localeCompare(String(a.latestDate||''))||a.path.localeCompare(b.path,'es'));

  const dates:DateSummary[]=[...dateAcc.entries()].map(([date,a])=>({date,...a})).sort((a,b)=>b.date.localeCompare(a.date));
  return {imageCount,videoCount,folders:folderSummaries,dates,weekdays};
}

export function localDateKey(value:string|null){
  return argentinaDateParts(value)?.date||'';
}
export function localWeekday(value:string|null){
  return argentinaDateParts(value)?.weekday??-1;
}
