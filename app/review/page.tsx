'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronLeft, ImageOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';

type Kind='image'|'video';
type Item={id:string;name:string;date:string|null;size:number;kind:Kind;accountId:string;account:string};
type Stats={total:number;keep:number;trash:number;pending:number};
type AlbumResponse={items?:Item[];total?:number;stats?:Stats;error?:string};
type Decision='keep'|'trash'|null;
type LocalMemory=Record<string,'keep'|'trash'>;
type Point={x:number;y:number};
type GestureMode='idle'|'swipe'|'pinch'|'pan';

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
function pointDistance(a:Point,b:Point){return Math.hypot(a.x-b.x,a.y-b.y);}
function pointCenter(a:Point,b:Point){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}

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

  const cardRef=useRef<HTMLElement|null>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const keepStampRef=useRef<HTMLDivElement|null>(null);
  const trashStampRef=useRef<HTMLDivElement|null>(null);

  const pointers=useRef(new Map<number,Point>());
  const mode=useRef<GestureMode>('idle');
  const swipeStart=useRef({x:0,y:0,t:0});
  const dragX=useRef(0);
  const horizontalLocked=useRef(false);
  const animating=useRef(false);

  const zoom=useRef({scale:1,x:0,y:0});
  const panLast=useRef<Point|null>(null);
  const pinchStart=useRef<{distance:number;scale:number;center:Point;x:number;y:number}|null>(null);

  const current=items[index];
  const next=items[index+1];

  const preview=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=review`;
  const cover=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&usage=cover`;

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
    items.slice(index+3,index+8).forEach(item=>{const img=new window.Image();img.decoding='async';img.src=cover(item);});
  },[items,index]);

  function applyImageZoom(){
    const img=imageRef.current;if(!img)return;
    const z=zoom.current;
    img.style.transform=`translate3d(${z.x}px,${z.y}px,0) scale(${z.scale})`;
  }

  function resetImageZoom(){
    zoom.current={scale:1,x:0,y:0};
    applyImageZoom();
  }

  function resetCardVisual(){
    const card=cardRef.current;
    if(card){
      card.style.transition='none';
      card.style.transform='translate3d(0,0,0) rotate(0deg)';
      card.style.opacity='1';
    }
    if(keepStampRef.current)keepStampRef.current.style.opacity='0';
    if(trashStampRef.current)trashStampRef.current.style.opacity='0';
    dragX.current=0;
  }

  useEffect(()=>{
    resetCardVisual();
    resetImageZoom();
    pointers.current.clear();
    mode.current='idle';
    panLast.current=null;
    pinchStart.current=null;
    horizontalLocked.current=false;
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
    resetImageZoom();
    const chosen=current;
    const card=cardRef.current;
    if(!card){finishDecision(chosen,action);return;}
    const direction=action==='keep'?1:-1;
    card.style.transition='transform 130ms cubic-bezier(.16,.8,.24,1), opacity 130ms ease';
    card.style.transform=`translate3d(${direction*115}vw,0,0) rotate(${direction*12}deg)`;
    card.style.opacity='.12';
    window.setTimeout(()=>finishDecision(chosen,action),105);
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

  function paintSwipe(dx:number){
    const card=cardRef.current;if(!card)return;
    dragX.current=dx;
    card.style.transition='none';
    card.style.transform=`translate3d(${dx}px,0,0) rotate(${dx/54}deg)`;
    const opacity=Math.min(1,Math.max(0,(Math.abs(dx)-5)/20));
    if(keepStampRef.current)keepStampRef.current.style.opacity=dx>0?String(opacity):'0';
    if(trashStampRef.current)trashStampRef.current.style.opacity=dx<0?String(opacity):'0';
  }

  function startPinch(){
    const values=[...pointers.current.values()];
    if(values.length<2)return;
    const a=values[0],b=values[1];
    const center=pointCenter(a,b);
    pinchStart.current={
      distance:Math.max(1,pointDistance(a,b)),
      scale:zoom.current.scale,
      center,
      x:zoom.current.x,
      y:zoom.current.y
    };
    mode.current='pinch';
    horizontalLocked.current=false;
    resetCardVisual();
  }

  function onPointerDown(e:ReactPointerEvent<HTMLElement>){
    if(animating.current)return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(pointers.current.size>=2){
      startPinch();
      return;
    }

    if(zoom.current.scale>1.015){
      mode.current='pan';
      panLast.current={x:e.clientX,y:e.clientY};
      return;
    }

    mode.current='swipe';
    swipeStart.current={x:e.clientX,y:e.clientY,t:performance.now()};
    dragX.current=0;
    horizontalLocked.current=false;
  }

  function onPointerMove(e:ReactPointerEvent<HTMLElement>){
    if(animating.current||!pointers.current.has(e.pointerId))return;
    const previous=pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(pointers.current.size>=2||mode.current==='pinch'){
      if(mode.current!=='pinch')startPinch();
      const values=[...pointers.current.values()];
      if(values.length<2||!pinchStart.current)return;
      const a=values[0],b=values[1];
      const center=pointCenter(a,b);
      const factor=pointDistance(a,b)/pinchStart.current.distance;
      const nextScale=Math.max(1,Math.min(5,pinchStart.current.scale*factor));
      zoom.current.scale=nextScale;
      zoom.current.x=pinchStart.current.x+(center.x-pinchStart.current.center.x);
      zoom.current.y=pinchStart.current.y+(center.y-pinchStart.current.center.y);
      if(nextScale<=1.015){zoom.current={scale:1,x:0,y:0};}
      applyImageZoom();
      return;
    }

    if(mode.current==='pan'||zoom.current.scale>1.015){
      mode.current='pan';
      const last=panLast.current||previous;
      zoom.current.x+=e.clientX-last.x;
      zoom.current.y+=e.clientY-last.y;
      panLast.current={x:e.clientX,y:e.clientY};
      applyImageZoom();
      return;
    }

    if(mode.current!=='swipe')return;
    const dx=e.clientX-swipeStart.current.x;
    const dy=e.clientY-swipeStart.current.y;

    if(!horizontalLocked.current){
      if(Math.abs(dx)<7&&Math.abs(dy)<7)return;
      if(Math.abs(dy)>Math.abs(dx)*1.15){
        mode.current='idle';
        resetCardVisual();
        return;
      }
      horizontalLocked.current=true;
    }

    paintSwipe(Math.max(-160,Math.min(160,dx)));
  }

  function onPointerUp(e:ReactPointerEvent<HTMLElement>){
    if(animating.current)return;
    pointers.current.delete(e.pointerId);

    if(mode.current==='pinch'){
      pinchStart.current=null;
      resetCardVisual();
      if(pointers.current.size===1){
        const remaining=[...pointers.current.values()][0];
        panLast.current=remaining;
        mode.current=zoom.current.scale>1.015?'pan':'idle';
      }else{
        panLast.current=null;
        mode.current='idle';
        if(zoom.current.scale<=1.015)resetImageZoom();
      }
      return;
    }

    if(mode.current==='pan'){
      if(pointers.current.size===0){mode.current='idle';panLast.current=null;}
      return;
    }

    if(mode.current!=='swipe'){
      if(pointers.current.size===0)mode.current='idle';
      return;
    }

    const dx=dragX.current;
    const elapsed=Math.max(1,performance.now()-swipeStart.current.t);
    const velocity=Math.abs(dx)/elapsed;
    const threshold=26;
    const flick=Math.abs(dx)>=10&&velocity>=.11;

    if(dx>=threshold||(flick&&dx>0))fly('keep');
    else if(dx<=-threshold||(flick&&dx<0))fly('trash');
    else{
      const card=cardRef.current;
      if(card){
        card.style.transition='transform 115ms cubic-bezier(.2,.8,.25,1)';
        card.style.transform='translate3d(0,0,0) rotate(0deg)';
      }
      if(keepStampRef.current)keepStampRef.current.style.opacity='0';
      if(trashStampRef.current)trashStampRef.current.style.opacity='0';
      dragX.current=0;
      mode.current='idle';
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

        <article ref={cardRef} className="photoCard swipeFast activeSwipeCard pinchSwipeCard"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="photoReal reviewHd inlinePinchStage">
            <img ref={imageRef} key={itemKey(current)} src={preview(current)} alt={current.name} draggable={false} fetchPriority="high" decoding="async"/>
            <span className="qualityBadge">HD</span>
            <span className="pinchHint">2 dedos = zoom</span>
          </div>

          <div ref={keepStampRef} className="stamp keepStamp gestureStamp">CONSERVAR</div>
          <div ref={trashStampRef} className="stamp trashStamp gestureStamp">DESCARTAR</div>

          <div className="photoMeta"><div><strong>{current.date?new Date(current.date).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'Sin fecha'}</strong><span>{current.name}</span></div><small>{current.account}</small></div>
        </article>
      </section>

      <p className="hint">1 dedo: swipe corto · 2 dedos: ampliar · con zoom: 1 dedo mueve</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>fly('trash')}><X/></button><button className="keepBtn" onClick={()=>fly('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} descartadas.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}
  </main>;
}
