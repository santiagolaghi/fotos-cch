'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, ChevronLeft, Download, ImageOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';

type Decision='keep'|'trash'|null;
type Account={id:string;slot:number;display_name:string|null;email:string|null};
type Photo={id:string;name:string;date:string;accountId:string;account:string;thumbnail:string|null;albumHint:string};

function hint(date:string){
  if(!date) return 'Sin fecha';
  const d=new Date(date); const day=d.getDay();
  if(day===0)return 'Domingo'; if(day===3)return 'Miércoles';
  return d.toLocaleDateString('es-AR',{weekday:'long'});
}

export default function ReviewPage(){
  const [photos,setPhotos]=useState<Photo[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [drag,setDrag]=useState(0); const startX=useRef<number|null>(null);
  const current=photos[index];

  useEffect(()=>{ void (async()=>{
    try{
      setLoading(true); setError(null);
      const ar=await fetch('/api/onedrive/accounts',{cache:'no-store'});
      const accounts=await ar.json() as Account[];
      if(!ar.ok) throw new Error((accounts as any)?.error||'No se pudieron leer las cuentas');
      if(!accounts.length){setPhotos([]);return;}
      const batches=await Promise.all(accounts.map(async a=>{
        const r=await fetch(`/api/media/queue?account=${encodeURIComponent(a.id)}&limit=300`,{cache:'no-store'});
        const j=await r.json();
        if(!r.ok) throw new Error(j?.error||`No se pudieron leer fotos de la cuenta ${a.slot}`);
        return (j.items||[]).map((x:any)=>{
          const date=x.takenDateTime||x.photo?.takenDateTime||x.createdDateTime||x.lastModifiedDateTime||'';
          const t=x.thumbnail||x.thumbnails?.[0]?.large?.url||x.thumbnails?.[0]?.medium?.url||x.thumbnails?.[0]?.small?.url||null;
          return {id:x.id,name:x.name,date,accountId:a.id,account:a.display_name||a.email||`Cuenta ${a.slot}`,thumbnail:t,albumHint:hint(date)} as Photo;
        });
      }));
      const merged=batches.flat().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      setPhotos(merged);
    }catch(e){setError(e instanceof Error?e.message:'Error leyendo OneDrive');}
    finally{setLoading(false);}
  })(); },[]);

  const counts=useMemo(()=>Object.values(decisions).reduce((a,v)=>{if(v==='keep')a.keep++;if(v==='trash')a.trash++;return a},{keep:0,trash:0}),[decisions]);
  const key=(p:Photo)=>`${p.accountId}:${p.id}`;
  const decide=(d:Decision)=>{if(!current)return;setDecisions(x=>({...x,[key(current)]:d}));setDrag(0);setIndex(i=>Math.min(i+1,photos.length));};
  const undo=()=>{if(index===0)return;const prev=photos[index-1];setDecisions(x=>({...x,[key(prev)]:null}));setIndex(i=>i-1);};
  const onDown=(x:number)=>{startX.current=x}; const onMove=(x:number)=>{if(startX.current!==null)setDrag(Math.max(-180,Math.min(180,x-startX.current)))};
  const onUp=()=>{if(drag>90)decide('keep');else if(drag<-90)decide('trash');else setDrag(0);startX.current=null;};

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Selección rápida</strong><small>leyendo OneDrive</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Buscando tus fotos</h2><p>La primera carga puede tardar un poco si hay muchas carpetas. Después la experiencia de swipe es inmediata.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Selección rápida</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude cargar las fotos</h2><p>{error}</p><Link className="primary" href="/settings">Revisar conexión</Link></section></main>;
  if(!photos.length)return <main className="reviewShell"><header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Selección rápida</strong><small>sin fotos</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No encontré fotos</h2><p>La cuenta está conectada, pero no encontré imágenes en las carpetas exploradas.</p><Link className="primary" href="/settings">Ver cuentas</Link></section></main>;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Selección rápida</strong><small>{Math.min(index+1,photos.length)} de {photos.length}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{photos.length-index} pendientes</span></section>
    {current ? <>
      <section className="swipeStage"><div className="ghostCard ghost1"/><div className="ghostCard ghost2"/><article className="photoCard" style={{transform:`translateX(${drag}px) rotate(${drag/28}deg)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX)}} onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="photoReal">{current.thumbnail?<img src={current.thumbnail} alt={current.name} draggable={false}/>:<div className="noPreview"><ImageOff/><span>Sin miniatura</span></div>}</div>
        {drag>35&&<div className="stamp keepStamp">CONSERVAR</div>}{drag<-35&&<div className="stamp trashStamp">DESCARTAR</div>}
        <div className="photoMeta"><div><strong>{current.albumHint}</strong><span>{current.date?new Date(current.date).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha'}</span></div><small>{current.account}</small></div>
      </article></section>
      <p className="hint">← descartar &nbsp;&nbsp; · &nbsp;&nbsp; conservar →</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>decide('trash')}><X/></button><button className="miniBtn" title="Descargar" disabled><Download/></button><button className="miniBtn" title="Álbum" disabled><Archive/></button><button className="keepBtn" onClick={()=>decide('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} para conservar · {counts.trash} marcadas para descarte.</p><p className="safeNote">Todavía no se eliminó nada de OneDrive.</p><button onClick={()=>{setIndex(0);setDecisions({})}}>Empezar de nuevo</button></section>}
  </main>;
}
