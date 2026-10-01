'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ImageOff, Images, Loader2, PlaySquare, RotateCcw, Trash2, X } from 'lucide-react';

type Decision='keep'|'trash'|null;
type MediaKind='image'|'video';
type Item={
  id:string;
  name:string;
  takenDateTime?:string|null;
  createdDateTime?:string;
  lastModifiedDateTime?:string;
  kind:MediaKind;
};
type ItemsResponse={items?:Item[];error?:string};
type ActionRow={account_id:string;drive_item_id:string;action:'keep'|'trash'|'skip'};
type ActionsResponse={items?:ActionRow[];error?:string};

function itemDate(item:Item){return item.takenDateTime||item.createdDateTime||item.lastModifiedDateTime||'';}

export default function ReviewPage(){
  const [allItems,setAllItems]=useState<Item[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [syncError,setSyncError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [drag,setDrag]=useState(0);
  const [albumName,setAlbumName]=useState('Álbum');
  const [kind,setKind]=useState<MediaKind>('image');
  const [accountId,setAccountId]=useState('');
  const [albumId,setAlbumId]=useState('');
  const [reviewed,setReviewed]=useState<Set<string>>(new Set());
  const startX=useRef<number|null>(null);
  const current=items[index];

  useEffect(()=>{
    void (async()=>{
      try{
        setLoading(true); setError(null);
        const params=new URLSearchParams(window.location.search);
        const account=params.get('account')||'';
        const album=params.get('album')||'';
        const selectedKind:MediaKind=params.get('kind')==='video'?'video':'image';
        const name=params.get('name')||'Álbum';
        if(!account||!album)throw new Error('Falta elegir un álbum');

        setAccountId(account); setAlbumId(album); setKind(selectedKind); setAlbumName(name);

        const [mediaRes,actionsRes]=await Promise.all([
          fetch(`/api/onedrive/album-items?account=${encodeURIComponent(account)}&album=${encodeURIComponent(album)}`,{cache:'no-store'}),
          fetch('/api/review/actions',{cache:'no-store'})
        ]);

        const media=await mediaRes.json() as ItemsResponse;
        const actions=await actionsRes.json() as ActionsResponse;
        if(!mediaRes.ok)throw new Error(media.error||'No se pudo abrir el álbum');
        if(!actionsRes.ok)throw new Error(actions.error||'No se pudieron leer tus decisiones');

        const done=new Set((actions.items||[]).filter(x=>x.action==='keep'||x.action==='trash').map(x=>`${x.account_id}:${x.drive_item_id}`));
        setReviewed(done);
        const loaded=media.items||[];
        setAllItems(loaded);
        setItems(loaded.filter(x=>x.kind===selectedKind&&!done.has(`${account}:${x.id}`)));
      }catch(e){setError(e instanceof Error?e.message:'Error leyendo OneDrive');}
      finally{setLoading(false);}
    })();
  },[]);

  useEffect(()=>{
    if(!accountId)return;
    const list=allItems.filter(x=>x.kind===kind&&!reviewed.has(`${accountId}:${x.id}`));
    setItems(list); setIndex(0); setDecisions({});
  },[kind,allItems,reviewed,accountId]);

  const preview=(item:Item)=>`/api/media/thumbnail?account=${encodeURIComponent(accountId)}&item=${encodeURIComponent(item.id)}&usage=review`;

  useEffect(()=>{
    if(typeof window==='undefined'||!accountId)return;
    items.slice(index,index+5).forEach(item=>{const img=new window.Image();img.src=preview(item);});
  },[items,index,accountId]);

  const counts=useMemo(()=>Object.values(decisions).reduce<{keep:number;trash:number}>((a,v)=>{if(v==='keep')a.keep++;if(v==='trash')a.trash++;return a;},{keep:0,trash:0}),[decisions]);

  async function persist(item:Item,action:'keep'|'trash'|'skip'){
    try{
      const r=await fetch('/api/review/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId,itemId:item.id,action})});
      if(!r.ok){const j=await r.json() as {error?:string};throw new Error(j.error||'No se pudo guardar');}
      setSyncError(null);
      if(action==='keep'||action==='trash')setReviewed(prev=>new Set(prev).add(`${accountId}:${item.id}`));
      else setReviewed(prev=>{const n=new Set(prev);n.delete(`${accountId}:${item.id}`);return n;});
    }catch(e){setSyncError(e instanceof Error?e.message:'No se pudo guardar la decisión');}
  }

  const decide=(decision:'keep'|'trash')=>{
    if(!current)return;
    const chosen=current;
    setDecisions(prev=>({...prev,[chosen.id]:decision}));
    setDrag(0); setIndex(prev=>Math.min(prev+1,items.length));
    void persist(chosen,decision);
  };

  const undo=()=>{
    if(index===0)return;
    const previous=items[index-1];
    if(!previous)return;
    setDecisions(prev=>({...prev,[previous.id]:null})); setIndex(prev=>prev-1);
    void persist(previous,'skip');
  };

  const switchKind=(next:MediaKind)=>{
    if(next===kind)return;
    setKind(next);
    const u=new URL(window.location.href);u.searchParams.set('kind',next);window.history.replaceState({},'',u.toString());
  };

  const onDown=(x:number)=>{startX.current=x;};
  const onMove=(x:number)=>{if(startX.current!==null)setDrag(Math.max(-180,Math.min(180,x-startX.current)));};
  const onUp=()=>{if(drag>90)decide('keep');else if(drag<-90)decide('trash');else setDrag(0);startX.current=null;};

  if(loading)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{albumName}</strong><small>abriendo álbum</small></div><span/></header><section className="loadingCard"><Loader2 className="spin"/><h2>Cargando este álbum</h2><p>Ya no estamos recorriendo todo OneDrive. Solo leemos los elementos de este álbum.</p></section></main>;
  if(error)return <main className="reviewShell"><header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>Selección</strong><small>error</small></div><span/></header><section className="doneCard"><ImageOff/><h2>No pude abrir el álbum</h2><p>{error}</p><Link className="primary" href="/albums">Volver a álbumes</Link></section></main>;

  const photoTotal=allItems.filter(x=>x.kind==='image').length;
  const videoTotal=allItems.filter(x=>x.kind==='video').length;

  return <main className="reviewShell">
    <header className="topbar"><Link href="/albums"><ChevronLeft/></Link><div><strong>{albumName}</strong><small>{items.length?Math.min(index+1,items.length):0} de {items.length} pendientes</small></div><button onClick={undo} disabled={index===0}><RotateCcw/></button></header>

    <section className="reviewMediaTabs">
      <a className={kind==='image'?'active':''} onClick={e=>{e.preventDefault();switchKind('image');}} href="#"><Images/> Fotos · {photoTotal}</a>
      <a className={kind==='video'?'active':''} onClick={e=>{e.preventDefault();switchKind('video');}} href="#"><PlaySquare/> Videos · {videoTotal}</a>
    </section>

    {syncError&&<div className="syncWarning">⚠ {syncError}</div>}

    {!items.length?<section className="doneCard"><Check/><h2>{kind==='image'?'Fotos':'Videos'} al día</h2><p>No quedan elementos pendientes en este álbum. Lo que ya conservaste o descartaste no vuelve a aparecer.</p><Link className="primary" href="/albums">Elegir otro álbum</Link></section>:<>
      <section className="statusRow"><span className="keepPill"><Check/> {counts.keep} conservar</span><span className="trashPill"><Trash2/> {counts.trash} descarte</span><span>{items.length-index} pendientes</span></section>

      {current?<>
        <section className="swipeStage"><div className="ghostCard ghost1"/><div className="ghostCard ghost2"/><article className="photoCard" style={{transform:`translateX(${drag}px) rotate(${drag/28}deg)`}} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);onDown(e.clientX);}} onPointerMove={e=>onMove(e.clientX)} onPointerUp={onUp} onPointerCancel={onUp}>
          <div className="photoReal reviewQuality"><img key={`${accountId}:${current.id}`} src={preview(current)} alt={current.name} draggable={false}/><span className="hiResLabel">PREVIEW HD</span>{kind==='video'&&<div className="videoBadge"><PlaySquare/> VIDEO</div>}</div>
          {drag>35&&<div className="stamp keepStamp">CONSERVAR</div>}{drag<-35&&<div className="stamp trashStamp">DESCARTAR</div>}
          <div className="photoMeta"><div><strong>{current.name}</strong><span>{itemDate(current)?new Date(itemDate(current)).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha'}</span></div><small>{albumName}</small></div>
        </article></section>
        <p className="hint">← descartar &nbsp;&nbsp; · &nbsp;&nbsp; conservar →</p>
        <section className="decisionBar"><button className="trashBtn" onClick={()=>decide('trash')}><X/></button><button className="keepBtn" onClick={()=>decide('keep')}><Check/></button></section>
      </>:<section className="doneCard"><Check/><h2>Selección terminada</h2><p>{counts.keep} conservadas · {counts.trash} marcadas para descarte.</p><p className="safeNote">Las decisiones quedaron guardadas.</p><Link className="primary" href="/albums">Volver a álbumes</Link></section>}
    </>}
  </main>;
}
