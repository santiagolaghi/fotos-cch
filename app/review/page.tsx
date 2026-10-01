'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Loader2, Maximize2, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';

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

function ZoomViewer({item,preview,original,onClose}:{item:Item;preview:string;original:string;onClose:()=>void}){
  const imgRef=useRef<HTMLImageElement|null>(null);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const state=useRef({scale:1,x:0,y:0});
  const pinch=useRef<{distance:number;scale:number}|null>(null);
  const lastSingle=useRef<{x:number;y:number}|null>(null);

  function apply(){
    const img=imgRef.current;if(!img)return;
    const s=state.current;
    img.style.transform=`translate3d(${s.x}px,${s.y}px,0) scale(${s.scale})`;
  }
  function setScale(next:number){
    state.current.scale=Math.max(1,Math.min(5,next));
    if(state.current.scale===1){state.current.x=0;state.current.y=0;}
    apply();
  }
  function distance(){
    const values=[...pointers.current.values()];
    if(values.length<2)return 0;
    return Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
  }

  return <section className="zoomViewer">
    <header>
      <div><strong>{item.date?new Date(item.date).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Foto'}</strong><small>Pellizcá para ampliar · arrastrá para mover</small></div>
      <button onClick={onClose}><X/></button>
    </header>
    <div className="zoomStage"
      onPointerDown={e=>{
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.current.size===1)lastSingle.current={x:e.clientX,y:e.clientY};
        if(pointers.current.size===2)pinch.current={distance:distance(),scale:state.current.scale};
      }}
      onPointerMove={e=>{
        if(!pointers.current.has(e.pointerId))return;
        const prev=pointers.current.get(e.pointerId)!;
        pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.current.size>=2&&pinch.current){
          const d=distance();
          if(pinch.current.distance>0)setScale(pinch.current.scale*(d/pinch.current.distance));
          return;
        }
        if(pointers.current.size===1&&state.current.scale>1){
          state.current.x+=e.clientX-prev.x;
          state.current.y+=e.clientY-prev.y;
          apply();
        }
      }}
      onPointerUp={e=>{
        pointers.current.delete(e.pointerId);
        pinch.current=null;
        lastSingle.current=null;
      }}
      onPointerCancel={e=>{
        pointers.current.delete(e.pointerId);
        pinch.current=null;
        lastSingle.current=null;
      }}
      onDoubleClick={()=>setScale(state.current.scale>1?1:2.5)}
    >
      <img ref={imgRef} src={preview} alt={item.name} draggable={false}/>
    </div>
    <footer>
      <button onClick={()=>setScale(state.current.scale-0.5)}><Minus/></button>
      <button className="zoomReset" onClick={()=>setScale(1)}>100%</button>
      <button onClick={()=>setScale(state.current.scale+0.5)}><Plus/></button>
      <a href={original} target="_blank" rel="noreferrer">Abrir original</a>
    </footer>
  </section>;
}

export default function Review(){
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [name,setName]=useState('Selección');
  const [kind,setKind]=useState<Kind>('image');
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [baseCounts,setBaseCounts]=useState({keep:0,trash:0});
  const [zoomItem,setZoomItem]=useState<Item|null>(null);

  const cardRef=useRef<HTMLElement|null>(null);
  const keepStampRef=useRef<HTMLDivElement|null>(null);
  const trashStampRef=useRef<HTMLDivElement|null>(null);
  const start=useRef({x:0,y:0,t:0});
  const dragX=useRef(0);
  const animating=useRef(false);

  const current=items[index];
  const next=items[index+1];

  const preview=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=review`;
  const cover=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=cover`;
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

        setBaseCounts({keep:(j.stats?.keep||0)+extraKeep,trash:(j.stats?.trash||0)+extraTrash});
        setItems(pending);
        setIndex(0);
      }catch(e){setError(e instanceof Error?e.message:'Error');}
      finally{setLoading(false);}
    })();
  },[]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    items.slice(index,index+3).forEach(item=>{const img=new window.Image();img.decoding='async';img.src=preview(item);});
    items.slice(index+3,index+7).forEach(item=>{const img=new window.Image();img.decoding='async';img.src=cover(item);});
  },[items,index]);

  useEffect(()=>{
    const card=cardRef.current;
    if(card){
      card.style.transition='none';
      card.style.transform='translate3d(0,0,0) rotate(0deg)';
      card.style.opacity='1';
    }
    if(keepStampRef.current)keepStampRef.current.style.opacity='0';
    if(trashStampRef.current)trashStampRef.current.style.opacity='0';
    dragX.current=0;
    animating.current=false;
  },[index]);

  const sessionCounts=useMemo(()=>Object.values(decisions).reduce<{keep:number;trash:number}>((a,v)=>{
    if(v==='keep')a.keep++;
    if(v==='trash')a.trash++;
    return a;
  },{keep:0,trash:0}),[decisions]);

  const counts={keep:baseCounts.keep+sessionCounts.keep,trash:baseCounts.trash+sessionCounts.trash};
  const pending=Math.max(0,items.length-index);

  function finishDecision(item:Item,action:'keep'|'trash'){
    remember(item,action);
    setDecisions(prev=>({...prev,[itemKey(item)]:action}));
    setIndex(i=>Math.min(i+1,items.length));
    void persist(item,action);
  }

  function fly(action:'keep'|'trash'){
    if(!current||animating.current)return;
    animating.current=true;
    const chosen=current;
    const card=cardRef.current;
    if(!card){finishDecision(chosen,action);return;}
    const direction=action==='keep'?1:-1;
    card.style.transition='transform 145ms cubic-bezier(.2,.8,.25,1), opacity 145ms ease';
    card.style.transform=`translate3d(${direction*115}vw,0,0) rotate(${direction*14}deg)`;
    card.style.opacity='.2';
    window.setTimeout(()=>finishDecision(chosen,action),118);
  }

  function undo(){
    if(index===0||animating.current)return;
    const previous=items[index-1];
    if(!previous)return;
    forget(previous);
    setDecisions(prev=>({...prev,[itemKey(previous)]:null}));
    setIndex(i=>i-1);
    void persist(previous,'skip');
  }

  function paint(dx:number){
    const card=cardRef.current;if(!card)return;
    dragX.current=dx;
    card.style.transition='none';
    card.style.transform=`translate3d(${dx}px,0,0) rotate(${dx/46}deg)`;
    const opacity=Math.min(1,Math.abs(dx)/26);
    if(keepStampRef.current)keepStampRef.current.style.opacity=dx>0?String(opacity):'0';
    if(trashStampRef.current)trashStampRef.current.style.opacity=dx<0?String(opacity):'0';
  }

  function onPointerDown(e:React.PointerEvent<HTMLElement>){
    if(animating.current)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current={x:e.clientX,y:e.clientY,t:performance.now()};
    dragX.current=0;
  }
  function onPointerMove(e:React.PointerEvent<HTMLElement>){
    if(animating.current)return;
    const dx=e.clientX-start.current.x;
    const dy=e.clientY-start.current.y;
    if(Math.abs(dy)>Math.abs(dx)*1.4&&Math.abs(dy)>12)return;
    paint(Math.max(-180,Math.min(180,dx)));
  }
  function onPointerUp(){
    if(animating.current)return;
    const dx=dragX.current;
    const elapsed=Math.max(1,performance.now()-start.current.t);
    const velocity=Math.abs(dx)/elapsed;
    const width=cardRef.current?.getBoundingClientRect().width||360;
    const threshold=Math.min(34,width*.09);
    const flick=Math.abs(dx)>=14&&velocity>=.14;
    if(dx>=threshold||(flick&&dx>0))fly('keep');
    else if(dx<=-threshold||(flick&&dx<0))fly('trash');
    else{
      const card=cardRef.current;
      if(card){card.style.transition='transform 150ms cubic-bezier(.2,.8,.25,1)';card.style.transform='translate3d(0,0,0) rotate(0deg)';}
      if(keepStampRef.current)keepStampRef.current.style.opacity='0';
      if(trashStampRef.current)trashStampRef.current.style.opacity='0';
      dragX.current=0;
    }
  }

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>preparando selección</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Cargando selección</h2><p>Precargando las próximas fotos.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>Selección</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude abrir este álbum</h2><p>{error}</p><Link className="primary" href="/albums">Volver</Link></section></main>;
  if(!items.length)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small>al día</small></div><span/></header><section className="doneCard"><Check/><h2>No quedan pendientes</h2><p>{counts.keep} conservadas · {counts.trash} descartadas.</p><Link className="primary" href="/albums">Elegir otro álbum</Link></section></main>;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{name}</strong><small className="reviewHeaderSub">{pending} pendientes · {kind==='image'?'fotos':'videos'}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    {syncError&&<div className="syncWarning">⚠ {syncError} · La decisión quedó guardada en este dispositivo y se reintentará.</div>}
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{pending} pendientes</span></section>

    {current?<>
      <section className="swipeStage swipeStageLive">
        {next&&<article className="photoCard swipeNextCard" aria-hidden="true">
          <div className="photoReal reviewHd"><img src={preview(next)} alt="" draggable={false}/></div>
          <div className="photoMeta"><div><strong>{next.date?new Date(next.date).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Sin fecha'}</strong></div></div>
        </article>}
        <article ref={cardRef} className="photoCard swipeFast activeSwipeCard"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="photoReal reviewHd">
            <img key={itemKey(current)} src={preview(current)} alt={current.name} draggable={false} fetchPriority="high" decoding="async"/>
            <span className="qualityBadge">HD</span>
            {kind==='image'&&<button className="originalButton" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setZoomItem(current);}}><Maximize2 size={14}/> Zoom</button>}
          </div>
          <div ref={keepStampRef} className="stamp keepStamp gestureStamp">CONSERVAR</div>
          <div ref={trashStampRef} className="stamp trashStamp gestureStamp">DESCARTAR</div>
          <div className="photoMeta"><div><strong>{current.date?new Date(current.date).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Sin fecha'}</strong><span>{current.name}</span></div><small>{current.account}</small></div>
        </article>
      </section>
      <p className="hint">Un gesto corto alcanza: ← descartar · conservar →</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>fly('trash')}><X/></button><button className="keepBtn" onClick={()=>fly('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} descartadas.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}

    {zoomItem&&<ZoomViewer item={zoomItem} preview={preview(zoomItem)} original={original(zoomItem)} onClose={()=>setZoomItem(null)}/>}
  </main>;
}
