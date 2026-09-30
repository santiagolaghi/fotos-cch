'use client';

import { useMemo, useRef, useState } from 'react';
import { Archive, Check, ChevronLeft, Download, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';

type Decision = 'keep' | 'trash' | null;
type Photo = { id:string; name:string; date:string; account:string; albumHint:string; hue:number };
const demo: Photo[] = Array.from({ length: 12 }).map((_,i) => ({
  id:`demo-${i+1}`, name:`IMG_${3100+i}.JPG`, date:`2026-09-${String(2 + (i%24)).padStart(2,'0')}T19:30:00`,
  account: i%2 ? 'OneDrive · Fotos 2' : 'OneDrive · Fotos 1', albumHint: i%3===0 ? 'Miércoles' : 'Domingo', hue:(205+i*17)%360
}));

export default function ReviewPage(){
  const [index,setIndex]=useState(0); const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [drag,setDrag]=useState(0); const startX=useRef<number|null>(null);
  const current=demo[index];
  const counts=useMemo(()=>Object.values(decisions).reduce((a,v)=>{if(v==='keep')a.keep++; if(v==='trash')a.trash++; return a},{keep:0,trash:0}),[decisions]);
  const decide=(d:Decision)=>{ if(!current) return; setDecisions(x=>({...x,[current.id]:d})); setDrag(0); setIndex(i=>Math.min(i+1,demo.length)); };
  const undo=()=>{ if(index===0) return; const prev=demo[index-1]; setDecisions(x=>({...x,[prev.id]:null})); setIndex(i=>i-1); };
  const onDown=(x:number)=>{startX.current=x}; const onMove=(x:number)=>{if(startX.current!==null)setDrag(Math.max(-180,Math.min(180,x-startX.current)))};
  const onUp=()=>{ if(drag>90)decide('keep'); else if(drag<-90)decide('trash'); else setDrag(0); startX.current=null; };

  return <main className="reviewShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Selección rápida</strong><small>{Math.min(index+1,demo.length)} de {demo.length}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{demo.length-index} pendientes</span></section>
    {current ? <>
      <section className="swipeStage">
        <div className="ghostCard ghost1"/><div className="ghostCard ghost2"/>
        <article className="photoCard" style={{transform:`translateX(${drag}px) rotate(${drag/28}deg)`}}
          onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX)}}
          onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="photoMock" style={{background:`linear-gradient(145deg,hsl(${current.hue} 70% 48%),hsl(${(current.hue+60)%360} 64% 18%))`}}>
            <span>Vista previa OneDrive</span><b>{current.name}</b>
          </div>
          {drag>35 && <div className="stamp keepStamp">CONSERVAR</div>}
          {drag<-35 && <div className="stamp trashStamp">DESCARTAR</div>}
          <div className="photoMeta"><div><strong>{current.albumHint}</strong><span>{new Date(current.date).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</span></div><small>{current.account}</small></div>
        </article>
      </section>
      <p className="hint">← descartar &nbsp;&nbsp; · &nbsp;&nbsp; conservar →</p>
      <section className="decisionBar">
        <button className="trashBtn" onClick={()=>decide('trash')}><X/></button>
        <button className="miniBtn" title="Descargar"><Download/></button>
        <button className="miniBtn" title="Álbum"><Archive/></button>
        <button className="keepBtn" onClick={()=>decide('keep')}><Check/></button>
      </section>
    </> : <section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} para conservar · {counts.trash} en cola de descarte.</p><button className="dangerReview">Revisar {counts.trash} descartes antes de eliminar</button><button onClick={()=>{setIndex(0);setDecisions({})}}>Empezar de nuevo</button></section>}
  </main>
}
