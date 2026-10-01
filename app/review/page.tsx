'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Loader2, Maximize2, RotateCcw, Trash2, X } from 'lucide-react';

type Kind='image'|'video';
type Item={id:string;name:string;date:string|null;size:number;kind:Kind;accountId:string;account:string};
type AlbumResponse={items?:Item[];total?:number;error?:string};
type Decision='keep'|'trash'|null;

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
  const [full,setFull]=useState<Item|null>(null);
  const startX=useRef<number|null>(null);
  const current=items[index];

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
        setItems(j.items||[]);
      }catch(e){setError(e instanceof Error?e.message:'Error');}
      finally{setLoading(false);}
    })();
  },[]);

  const preview=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=review`;
  const original=(item:Item)=>`/api/media/original?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}`;

  useEffect(()=>{
    if(typeof window==='undefined')return;
    items.slice(index,index+4).forEach(item=>{const img=new window.Image();img.src=preview(item);});
  },[items,index]);

  const counts=useMemo(()=>Object.values(decisions).reduce<{keep:number;trash:number}>((a,v)=>{if(v==='keep')a.keep++;if(v==='trash')a.trash++;return a;},{keep:0,trash:0}),[decisions]);

  async function persist(item:Item,action:'keep'|'trash'|'skip'){
    try{
      const r=await fetch('/api/review/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:item.accountId,itemId:item.id,action})});
      if(!r.ok){const j=await r.json() as {error?:string};throw new Error(j.error||'No se pudo guardar');}
      setSyncError(null);
    }catch(e){setSyncError(e instanceof Error?e.message:'No se pudo guardar la decisión');}
  }

  function decide(action:'keep'|'trash'){
    if(!current)return;
    const chosen=current;
    setDecisions(prev=>({...prev,[`${chosen.accountId}:${chosen.id}`]:action}));
    setDrag(0);setIndex(i=>Math.min(i+1,items.length));
    void persist(chosen,action);
  }

  function undo(){
    if(index===0)return;
    const previous=items[index-1];if(!previous)return;
    setDecisions(prev=>({...prev,[`${previous.accountId}:${previous.id}`]:null}));
    setIndex(i=>i-1);void persist(previous,'skip');
  }

  const onDown=(x:number)=>{startX.current=x;};
  const onMove=(x:number)=>{if(startX.current!==null)setDrag(Math.max(-180,Math.min(180,x-startX.current)));};
  const onUp=()=>{if(drag>90)decide('keep');else if(drag<-90)decide('trash');else setDrag(0);startX.current=null;};

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>preparando selección</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Cargando desde el índice</h2><p>No estamos recorriendo OneDrive otra vez.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>Selección</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude abrir este álbum</h2><p>{error}</p><Link className="primary" href="/albums">Volver</Link></section></main>;
  if(!items.length)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>al día</small></div><span/></header><section className="doneCard"><Check/><h2>No quedan pendientes</h2><p>Lo que ya conservaste o descartaste no vuelve a aparecer.</p><Link className="primary" href="/albums">Elegir otro álbum</Link></section></main>;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small className="reviewHeaderSub">{Math.min(index+1,items.length)} de {items.length} · {kind==='image'?'fotos':'videos'}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    {syncError&&<div className="syncWarning">⚠ {syncError}</div>}
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{items.length-index} pendientes</span></section>

    {current?<>
      <section className="swipeStage"><div className="ghostCard ghost1"/><div className="ghostCard ghost2"/><article className="photoCard" style={{transform:`translateX(${drag}px) rotate(${drag/28}deg)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX);}} onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="photoReal reviewHd"><img key={`${current.accountId}:${current.id}`} src={preview(current)} alt={current.name} draggable={false}/><span className="qualityBadge">HD 1200</span>{kind==='image'&&<button className="originalButton" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setFull(current);}}><Maximize2 size={14}/> Original</button>}</div>
        {drag>35&&<div className="stamp keepStamp">CONSERVAR</div>}{drag<-35&&<div className="stamp trashStamp">DESCARTAR</div>}
        <div className="photoMeta"><div><strong>{current.name}</strong><span>{current.date?new Date(current.date).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha'}</span></div><small>{current.account}</small></div>
      </article></section>
      <p className="hint">← descartar &nbsp;&nbsp; · &nbsp;&nbsp; conservar →</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>decide('trash')}><X/></button><button className="keepBtn" onClick={()=>decide('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} a descarte.</p><p className="safeNote">Quedaron guardadas y no reaparecen.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}

    {full&&<section className="fullPreview"><header><strong>{full.name}</strong><button onClick={()=>setFull(null)}><X/></button></header><div><img src={original(full)} alt={full.name}/></div></section>}
  </main>;
}
