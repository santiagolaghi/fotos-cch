'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Loader2, Maximize2, RotateCcw, Trash2, X } from 'lucide-react';

type Kind='image'|'video';
type Item={id:string;name:string;date:string|null;size:number;kind:Kind;accountId:string;account:string};
type Stats={total:number;keep:number;trash:number;pending:number};
type AlbumResponse={items?:Item[];total?:number;stats?:Stats;error?:string};
type Decision='keep'|'trash'|null;
type LocalMemory=Record<string,'keep'|'trash'>;

const MEMORY_KEY='fotos-cch-review-memory-v2';

function itemKey(item:Item){return `${item.accountId}:${item.id}`;}
function readMemory():LocalMemory{
  try{return JSON.parse(localStorage.getItem(MEMORY_KEY)||'{}') as LocalMemory;}catch{return {};}
}
function writeMemory(memory:LocalMemory){
  try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memory));}catch{}
}
function remember(item:Item,action:'keep'|'trash'){
  const memory=readMemory();memory[itemKey(item)]=action;writeMemory(memory);
}
function forget(item:Item){
  const memory=readMemory();delete memory[itemKey(item)];writeMemory(memory);
}

export default function Review(){
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [drag,setDrag]=useState(0);
  const [name,setName]=useState('Selección');
  const [kind,setKind]=useState<Kind>('image');
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [baseCounts,setBaseCounts]=useState({keep:0,trash:0});
  const [full,setFull]=useState<Item|null>(null);
  const startX=useRef<number|null>(null);
  const startAt=useRef(0);
  const dragRef=useRef(0);
  const current=items[index];

  const preview=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=review`;
  const original=(item:Item)=>`/api/media/original?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}`;

  async function persist(item:Item,action:'keep'|'trash'|'skip'){
    try{
      const r=await fetch('/api/review/actions',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({accountId:item.accountId,itemId:item.id,itemName:item.name,action}),
        keepalive:true
      });
      if(!r.ok){const j=await r.json() as {error?:string};throw new Error(j.error||'No se pudo guardar');}
      if(action==='keep'||action==='trash')forget(item);
      setSyncError(null);
    }catch(e){
      setSyncError(e instanceof Error?e.message:'No se pudo guardar la decisión');
    }
  }

  useEffect(()=>{
    void (async()=>{
      try{
        setLoading(true);setError(null);
        const q=new URLSearchParams(window.location.search);
        setName(q.get('name')||'Selección');
        setKind(q.get('kind')==='video'?'video':'image');
        const r=await fetch(`/api/library/album?${q.toString()}`,{cache:'no-store'});
        const j=await r.json() as AlbumResponse;
        if(!r.ok)throw new Error(j.error||'No se pudo abrir el álbum');

        const memory=readMemory();
        let extraKeep=0,extraTrash=0;
        const pending=(j.items||[]).filter(item=>{
          const action=memory[itemKey(item)];
          if(action==='keep'){extraKeep++;void persist(item,'keep');return false;}
          if(action==='trash'){extraTrash++;void persist(item,'trash');return false;}
          return true;
        });

        setBaseCounts({
          keep:(j.stats?.keep||0)+extraKeep,
          trash:(j.stats?.trash||0)+extraTrash
        });
        setItems(pending);
        setIndex(0);
      }catch(e){setError(e instanceof Error?e.message:'Error');}
      finally{setLoading(false);}
    })();
  },[]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    items.slice(index,index+10).forEach(item=>{const img=new window.Image();img.decoding='async';img.src=preview(item);});
  },[items,index]);

  const sessionCounts=useMemo(()=>Object.values(decisions).reduce<{keep:number;trash:number}>((a,v)=>{
    if(v==='keep')a.keep++;
    if(v==='trash')a.trash++;
    return a;
  },{keep:0,trash:0}),[decisions]);

  const counts={keep:baseCounts.keep+sessionCounts.keep,trash:baseCounts.trash+sessionCounts.trash};
  const pending=Math.max(0,items.length-index);

  function decide(action:'keep'|'trash'){
    if(!current)return;
    const chosen=current;
    remember(chosen,action);
    setDecisions(prev=>({...prev,[itemKey(chosen)]:action}));
    dragRef.current=0;
    setDrag(0);
    setIndex(i=>Math.min(i+1,items.length));
    void persist(chosen,action);
  }

  function undo(){
    if(index===0)return;
    const previous=items[index-1];
    if(!previous)return;
    forget(previous);
    setDecisions(prev=>({...prev,[itemKey(previous)]:null}));
    setIndex(i=>i-1);
    void persist(previous,'skip');
  }

  const onDown=(x:number)=>{
    startX.current=x;
    startAt.current=performance.now();
    dragRef.current=0;
  };
  const onMove=(x:number)=>{
    if(startX.current===null)return;
    const next=Math.max(-180,Math.min(180,x-startX.current));
    dragRef.current=next;
    setDrag(next);
  };
  const onUp=()=>{
    const dx=dragRef.current;
    const elapsed=Math.max(1,performance.now()-startAt.current);
    const speed=Math.abs(dx)/elapsed;
    const isFlick=Math.abs(dx)>=22&&speed>=0.28;
    if(dx>=42||isFlick&&dx>0)decide('keep');
    else if(dx<=-42||isFlick&&dx<0)decide('trash');
    else{dragRef.current=0;setDrag(0);}
    startX.current=null;
  };

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>preparando selección</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Cargando selección</h2><p>Precargando las próximas fotos para que el swipe sea más rápido.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>Selección</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude abrir este álbum</h2><p>{error}</p><Link className="primary" href="/albums">Volver</Link></section></main>;
  if(!items.length)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>al día</small></div><span/></header><section className="doneCard"><Check/><h2>No quedan pendientes</h2><p>{counts.keep} conservadas · {counts.trash} descartadas.</p><p className="safeNote">Los descartes quedan fuera de pendientes al instante y se borran de OneDrive después de 24 h.</p><Link className="primary" href="/albums">Elegir otro álbum</Link></section></main>;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small className="reviewHeaderSub">{pending} pendientes · {kind==='image'?'fotos':'videos'}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    {syncError&&<div className="syncWarning">⚠ {syncError} · La decisión quedó guardada en este dispositivo y se reintentará.</div>}
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{pending} pendientes</span></section>

    {current?<>
      <section className="swipeStage"><div className="ghostCard ghost1"/><div className="ghostCard ghost2"/><article className="photoCard swipeFast" style={{transform:`translate3d(${drag}px,0,0) rotate(${drag/34}deg)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX);}} onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="photoReal reviewHd"><img key={itemKey(current)} src={preview(current)} alt={current.name} draggable={false} fetchPriority="high" decoding="async"/><span className="qualityBadge">HD</span>{kind==='image'&&<button className="originalButton" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setFull(current);}}><Maximize2 size={14}/> Original</button>}</div>
        {drag>18&&<div className="stamp keepStamp">CONSERVAR</div>}{drag<-18&&<div className="stamp trashStamp">DESCARTAR</div>}
        <div className="photoMeta"><div><strong>{current.date?new Date(current.date).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Sin fecha'}</strong><span>{current.name}</span></div><small>{current.account}</small></div>
      </article></section>
      <p className="hint">Deslizá apenas: ← descartar · conservar →</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>decide('trash')}><X/></button><button className="keepBtn" onClick={()=>decide('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} descartadas.</p><p className="safeNote">Los descartes se borran automáticamente de OneDrive después de 24 h.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}

    {full&&<section className="fullPreview"><header><strong>{full.name}</strong><button onClick={()=>setFull(null)}><X/></button></header><div><img src={original(full)} alt={full.name}/></div></section>}
  </main>;
}
