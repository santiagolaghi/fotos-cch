'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Loader2, PlaySquare, RotateCcw, Trash2, X } from 'lucide-react';

type Decision='keep'|'trash'|null;
type MediaKind='image'|'video';
type CatalogItem={
  id:string;
  name:string;
  takenDateTime?:string|null;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  kind:MediaKind;
  accountId:string;
  account:string;
};
type CatalogResponse={items?:CatalogItem[];error?:string};
type ActionRow={account_id:string;drive_item_id:string;action:'keep'|'trash'|'skip'};
type ActionsResponse={items?:ActionRow[];error?:string};

function itemDate(item:CatalogItem){return item.takenDateTime||item.createdDateTime||item.lastModifiedDateTime||'';}
function matchesRule(item:CatalogItem,rule:string){
  if(rule==='all')return true;
  if(rule.startsWith('day:'))return itemDate(item)?new Date(itemDate(item)).getDay()===Number(rule.slice(4)):false;
  if(rule.startsWith('date:')){
    const d=new Date(itemDate(item));
    if(Number.isNaN(d.getTime()))return false;
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return key===rule.slice(5);
  }
  return true;
}
function thumb(item:CatalogItem){return `/api/media/thumbnail?account=${encodeURIComponent(item.accountId)}&item=${encodeURIComponent(item.id)}&size=medium`;}

export default function ReviewPage(){
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [drag,setDrag]=useState(0);
  const [albumName,setAlbumName]=useState('Selección');
  const [kind,setKind]=useState<MediaKind>('image');
  const startX=useRef<number|null>(null);
  const current=items[index];

  useEffect(()=>{
    void (async()=>{
      try{
        setLoading(true); setError(null);
        const params=new URLSearchParams(window.location.search);
        const selectedKind:MediaKind=params.get('kind')==='video'?'video':'image';
        const rule=params.get('rule')||'all';
        const name=params.get('name')||(selectedKind==='image'?'Todas las fotos':'Todos los videos');
        setKind(selectedKind); setAlbumName(name);

        const [catalogRes,actionsRes]=await Promise.all([
          fetch('/api/media/catalog?limit=2500'),
          fetch('/api/review/actions',{cache:'no-store'})
        ]);
        const catalog=await catalogRes.json() as CatalogResponse;
        const actions=await actionsRes.json() as ActionsResponse;
        if(!catalogRes.ok)throw new Error(catalog.error||'No se pudo cargar la biblioteca');
        if(!actionsRes.ok)throw new Error(actions.error||'No se pudieron leer las decisiones anteriores');

        const reviewed=new Set((actions.items||[]).filter(x=>x.action==='keep'||x.action==='trash').map(x=>`${x.account_id}:${x.drive_item_id}`));
        const list=(catalog.items||[])
          .filter(x=>x.kind===selectedKind)
          .filter(x=>matchesRule(x,rule))
          .filter(x=>!reviewed.has(`${x.accountId}:${x.id}`))
          .sort((a,b)=>String(itemDate(b)).localeCompare(String(itemDate(a))));
        setItems(list);
      }catch(e){setError(e instanceof Error?e.message:'Error leyendo OneDrive');}
      finally{setLoading(false);}
    })();
  },[]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    items.slice(index,index+4).forEach(item=>{const img=new window.Image();img.src=thumb(item);});
  },[items,index]);

  const counts=useMemo(()=>Object.values(decisions).reduce<{keep:number;trash:number}>((a,v)=>{if(v==='keep')a.keep++;if(v==='trash')a.trash++;return a;},{keep:0,trash:0}),[decisions]);
  const itemKey=(p:CatalogItem)=>`${p.accountId}:${p.id}`;

  async function persist(item:CatalogItem,action:'keep'|'trash'|'skip'){
    try{
      const r=await fetch('/api/review/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:item.accountId,itemId:item.id,action})});
      if(!r.ok){const j=await r.json() as {error?:string};throw new Error(j.error||'No se pudo guardar');}
      setSyncError(null);
    }catch(e){setSyncError(e instanceof Error?e.message:'No se pudo guardar la decisión');}
  }

  const decide=(decision:'keep'|'trash')=>{
    if(!current)return;
    const chosen=current;
    setDecisions(prev=>({...prev,[itemKey(chosen)]:decision}));
    setDrag(0);
    setIndex(prev=>Math.min(prev+1,items.length));
    void persist(chosen,decision);
  };

  const undo=()=>{
    if(index===0)return;
    const previous=items[index-1];
    if(!previous)return;
    setDecisions(prev=>({...prev,[itemKey(previous)]:null}));
    setIndex(prev=>prev-1);
    void persist(previous,'skip');
  };

  const onDown=(x:number)=>{startX.current=x;};
  const onMove=(x:number)=>{if(startX.current!==null)setDrag(Math.max(-180,Math.min(180,x-startX.current)));};
  const onUp=()=>{if(drag>90)decide('keep');else if(drag<-90)decide('trash');else setDrag(0);startX.current=null;};

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{albumName}</strong><small>cargando biblioteca</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Preparando la selección</h2><p>Ahora se leen los metadatos primero y las miniaturas se cargan solo cuando hacen falta.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>Selección</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude cargar este álbum</h2><p>{error}</p><Link className="primary" href="/albums">Volver a álbumes</Link></section></main>;
  if(!items.length)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{albumName}</strong><small>sin pendientes</small></div><span/></header><section className="doneCard"><Check/><h2>Este álbum está al día</h2><p>No quedan {kind==='image'?'fotos':'videos'} pendientes de revisar. Lo que ya conservaste o descartaste no vuelve a aparecer.</p><Link className="primary" href="/albums">Elegir otro álbum</Link></section></main>;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{albumName}</strong><small>{Math.min(index+1,items.length)} de {items.length} · {kind==='image'?'fotos':'videos'}</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>
    {syncError&&<div className="syncWarning">⚠ {syncError}</div>}
    <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{items.length-index} pendientes</span></section>

    {current?<>
      <section className="swipeStage"><div className="ghostCard ghost1"/><div className="ghostCard ghost2"/><article className="photoCard" style={{transform:`translateX(${drag}px) rotate(${drag/28}deg)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX);}} onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="photoReal"><img key={itemKey(current)} src={thumb(current)} alt={current.name} draggable={false}/>{kind==='video'&&<div className="videoBadge"><PlaySquare/> VIDEO</div>}</div>
        {drag>35&&<div className="stamp keepStamp">CONSERVAR</div>}{drag<-35&&<div className="stamp trashStamp">DESCARTAR</div>}
        <div className="photoMeta"><div><strong>{current.name}</strong><span>{itemDate(current)?new Date(itemDate(current)).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha'}</span></div><small>{current.account}</small></div>
      </article></section>
      <p className="hint">← descartar &nbsp;&nbsp; · &nbsp;&nbsp; conservar →</p>
      <section className="decisionBar"><button className="trashBtn" onClick={()=>decide('trash')}><X/></button><button className="keepBtn" onClick={()=>decide('keep')}><Check/></button></section>
    </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} marcadas para descarte.</p><p className="safeNote">Las decisiones quedaron guardadas y no volverán a aparecer.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}
  </main>;
}
