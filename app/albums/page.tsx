'use client';

import Link from 'next/link';
import { CalendarDays, ChevronLeft, Folder, Images, Loader2, PlaySquare, RefreshCw, Sun, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

type Kind='image'|'video';
type FolderSummary={id:string;name:string;path:string;imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null;latestDate:string|null};
type DateSummary={date:string;imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null};
type Summary={imageCount:number;videoCount:number;folders:FolderSummary[];dates:DateSummary[];weekdays:Record<string,{imageCount:number;videoCount:number;coverImageId:string|null;coverVideoId:string|null}>};
type AccountIndex={id:string;slot:number;displayName:string;email:string;state:{complete:boolean;totalScanned:number;syncedAt:string|null;needsSync:boolean;summary:Summary|null}};
type IndexResponse={accounts?:AccountIndex[];error?:string};

function prettyDate(key:string){
  const [y,m,d]=key.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
function countFor(kind:Kind,entry:{imageCount:number;videoCount:number}){return kind==='image'?entry.imageCount:entry.videoCount;}
function coverFor(kind:Kind,entry:{coverImageId:string|null;coverVideoId:string|null}){return kind==='image'?entry.coverImageId:entry.coverVideoId;}

export default function Albums(){
  const [data,setData]=useState<AccountIndex[]>([]);
  const [kind,setKind]=useState<Kind>('image');
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const mounted=useRef(true);

  async function loadIndex(){
    const r=await fetch('/api/library/index',{cache:'no-store'});
    const j=await r.json() as IndexResponse;
    if(!r.ok)throw new Error(j.error||'No se pudo leer la biblioteca');
    if(mounted.current)setData(j.accounts||[]);
    return j.accounts||[];
  }

  async function syncAccounts(accounts:AccountIndex[],restart=false){
    setSyncing(true);
    try{
      let pending=accounts.filter(a=>restart||a.state.needsSync);
      let rounds=0;
      while(pending.length&&rounds<80&&mounted.current){
        await Promise.all(pending.map(async account=>{
          const r=await fetch('/api/library/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account.id,restart:restart&&rounds===0})});
          const j=await r.json() as {error?:string};
          if(!r.ok)throw new Error(j.error||'Falló la sincronización');
        }));
        const fresh=await loadIndex();
        pending=fresh.filter(a=>!a.state.complete);
        rounds++;
      }
    }finally{if(mounted.current)setSyncing(false);}
  }

  useEffect(()=>{
    mounted.current=true;
    void (async()=>{
      try{
        setLoading(true);setError(null);
        const accounts=await loadIndex();
        if(accounts.some(a=>a.state.needsSync))await syncAccounts(accounts);
      }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Error');}
      finally{if(mounted.current)setLoading(false);}
    })();
    return()=>{mounted.current=false;};
  },[]);

  async function refreshAll(){
    try{setError(null);await syncAccounts(data,true);}
    catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar');}
  }

  const total=useMemo(()=>data.reduce((n,a)=>n+(a.state.summary?(kind==='image'?a.state.summary.imageCount:a.state.summary.videoCount):0),0),[data,kind]);
  const allFolders=useMemo(()=>data.flatMap(account=>(account.state.summary?.folders||[]).map(folder=>({account,folder}))).filter(x=>countFor(kind,x.folder)>0),[data,kind]);
  const dateMap=useMemo(()=>{
    const map=new Map<string,{count:number;cover:{accountId:string;itemId:string}|null}>();
    for(const account of data)for(const d of account.state.summary?.dates||[]){
      const c=countFor(kind,d);if(!c)continue;
      const prev=map.get(d.date)||{count:0,cover:null};
      prev.count+=c;
      const cover=coverFor(kind,d);if(!prev.cover&&cover)prev.cover={accountId:account.id,itemId:cover};
      map.set(d.date,prev);
    }
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  },[data,kind]);

  const weekdayCount=(day:number)=>data.reduce((n,a)=>n+countFor(kind,a.state.summary?.weekdays?.[String(day)]||{imageCount:0,videoCount:0}),0);
  const scanned=data.reduce((n,a)=>n+a.state.totalScanned,0);
  const complete=data.length>0&&data.every(a=>a.state.complete);

  return <main className="albumShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Biblioteca CCH</strong><small>rápida · indexada · sin álbumes falsos</small></div><button onClick={()=>void refreshAll()} disabled={syncing}><RefreshCw className={syncing?'spin':''}/></button></header>

    <section className="libraryStatus">
      {syncing?<Loader2 className="spin"/>:<Zap/>}
      <div><strong>{syncing?'Sincronizando OneDrive…':'Biblioteca lista'}</strong><span>{scanned.toLocaleString('es-AR')} elementos indexados · {total.toLocaleString('es-AR')} {kind==='image'?'fotos':'videos'}</span>{syncing&&<div className="syncProgress"><i style={{width:complete?'100%':'65%'}}/></div>}<small>{complete?'La próxima apertura usa este índice y carga mucho más rápido.':'Primera sincronización en curso.'}</small></div>
    </section>

    <section className="kindTabs">
      <button className={kind==='image'?'active':''} onClick={()=>setKind('image')}><Images/> Fotos</button>
      <button className={kind==='video'?'active':''} onClick={()=>setKind('video')}><PlaySquare/> Videos</button>
    </section>

    {error&&<div className="connectionError">{error}</div>}
    {loading&&!data.length&&<section className="albumsLoading"><Loader2 className="spin"/><strong>Creando el índice por única vez…</strong><span>Después no vuelve a recorrer toda tu nube.</span></section>}

    {!!data.length&&<>
      <section className="albumSection">
        <div className="albumSectionHead"><div><strong>Accesos rápidos</strong><span>Álbumes inteligentes creados desde tu biblioteca real</span></div></div>
        <div className="quickAlbumGrid">
          <Link className="quickAlbum" href={`/review?mode=all&kind=${kind}&name=${encodeURIComponent(kind==='image'?'Todas las fotos':'Todos los videos')}`}><Images/><div><strong>{kind==='image'?'Todas las fotos':'Todos los videos'}</strong><span>{total.toLocaleString('es-AR')} pendientes antes de filtrar revisadas</span></div></Link>
          <Link className="quickAlbum" href={`/review?mode=weekday&weekday=3&kind=${kind}&name=Miércoles`}><CalendarDays/><div><strong>Miércoles</strong><span>{weekdayCount(3).toLocaleString('es-AR')} {kind==='image'?'fotos':'videos'}</span></div></Link>
          <Link className="quickAlbum" href={`/review?mode=weekday&weekday=0&kind=${kind}&name=Domingos`}><Sun/><div><strong>Domingos</strong><span>{weekdayCount(0).toLocaleString('es-AR')} {kind==='image'?'fotos':'videos'}</span></div></Link>
          <Link className="quickAlbum" href={dateMap[0]?`/review?mode=date&date=${dateMap[0][0]}&kind=${kind}&name=${encodeURIComponent(prettyDate(dateMap[0][0]))}`:'#'}><CalendarDays/><div><strong>Última fecha</strong><span>{dateMap[0]?prettyDate(dateMap[0][0]):'Sin fecha todavía'}</span></div></Link>
        </div>
      </section>

      <section className="albumSection">
        <div className="albumSectionHead"><div><strong>Carpetas de OneDrive</strong><span>Cada carpeta que contiene medios funciona como álbum</span></div><small>{allFolders.length} carpetas</small></div>
        {!allFolders.length&&!syncing&&<div className="emptyLibrary"><strong>No encontré carpetas con {kind==='image'?'fotos':'videos'}</strong><p>Probá actualizar la biblioteca con el botón de arriba.</p></div>}
        <div className="folderAlbumGrid">
          {allFolders.map(({account,folder})=>{
            const count=countFor(kind,folder);const cover=coverFor(kind,folder);
            return <Link className="folderAlbum" key={`${account.id}:${folder.id}:${kind}`} href={`/review?mode=folder&account=${encodeURIComponent(account.id)}&folder=${encodeURIComponent(folder.id)}&kind=${kind}&name=${encodeURIComponent(folder.name)}`}>
              <div className="folderAlbumCover"><Folder/>{cover&&<img src={`/api/media/thumbnail?account=${encodeURIComponent(account.id)}&item=${encodeURIComponent(cover)}&usage=cover`} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>}<span className="folderAlbumCount">{count}</span></div>
              <div className="folderAlbumMeta"><strong>{folder.name}</strong><span>{folder.path}</span><small>{account.displayName}</small></div>
            </Link>;
          })}
        </div>
      </section>

      <section className="albumSection">
        <div className="albumSectionHead"><div><strong>Por fecha</strong><span>Todas las fechas encontradas en la biblioteca</span></div><small>{dateMap.length} fechas</small></div>
        <div className="dateAlbumGrid">
          {dateMap.map(([date,info])=><Link className="dateAlbum" key={date} href={`/review?mode=date&date=${date}&kind=${kind}&name=${encodeURIComponent(prettyDate(date))}`}>
            <div className="dateAlbumPreview">{info.cover&&<img src={`/api/media/thumbnail?account=${encodeURIComponent(info.cover.accountId)}&item=${encodeURIComponent(info.cover.itemId)}&usage=cover`} alt="" loading="lazy"/>}</div>
            <div className="dateAlbumMeta"><strong>{prettyDate(date)}</strong><span>{info.count} {kind==='image'?'fotos':'videos'}</span></div>
          </Link>)}
        </div>
      </section>
    </>}
  </main>;
}
