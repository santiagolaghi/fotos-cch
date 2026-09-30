'use client';

import Link from 'next/link';
import { CalendarDays, ChevronLeft, Images, Loader2, PlaySquare, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
type Album={key:string;name:string;rule:string;items:CatalogItem[]};

function dateKey(value?:string|null){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function prettyDate(key:string){
  const [y,m,d]=key.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

export default function Albums(){
  const [items,setItems]=useState<CatalogItem[]>([]);
  const [kind,setKind]=useState<MediaKind>('image');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    void (async()=>{
      try{
        setLoading(true); setError(null);
        const r=await fetch('/api/media/catalog?limit=2500');
        const j=await r.json() as CatalogResponse;
        if(!r.ok)throw new Error(j.error||'No se pudo cargar la biblioteca');
        setItems(j.items||[]);
      }catch(e){setError(e instanceof Error?e.message:'Error cargando biblioteca');}
      finally{setLoading(false);}
    })();
  },[]);

  const filtered=useMemo(()=>items.filter(x=>x.kind===kind),[items,kind]);
  const albums=useMemo<Album[]>(()=>{
    if(!filtered.length)return [];
    const out:Album[]=[];
    out.push({key:'all',name:kind==='image'?'Todas las fotos':'Todos los videos',rule:'Toda la biblioteca',items:filtered});

    const wed=filtered.filter(x=>x.takenDateTime&&new Date(x.takenDateTime).getDay()===3);
    if(wed.length)out.push({key:'day:3',name:'Miércoles',rule:'Día de semana = miércoles',items:wed});
    const sun=filtered.filter(x=>x.takenDateTime&&new Date(x.takenDateTime).getDay()===0);
    if(sun.length)out.push({key:'day:0',name:'Domingos',rule:'Día de semana = domingo',items:sun});

    const dates=new Map<string,CatalogItem[]>();
    for(const item of filtered){
      const k=dateKey(item.takenDateTime||item.createdDateTime||item.lastModifiedDateTime);
      if(!k)continue;
      const arr=dates.get(k)||[]; arr.push(item); dates.set(k,arr);
    }
    [...dates.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,8).forEach(([key,dateItems])=>{
      out.push({key:`date:${key}`,name:prettyDate(key),rule:'Fecha de captura',items:dateItems});
    });
    return out;
  },[filtered,kind]);

  return <main className="albumShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Álbumes</strong><small>elegí primero qué querés revisar</small></div><span/></header>

    <section className="mediaTabs" aria-label="Tipo de contenido">
      <button className={kind==='image'?'active':''} onClick={()=>setKind('image')}><Images/> Fotos</button>
      <button className={kind==='video'?'active':''} onClick={()=>setKind('video')}><PlaySquare/> Videos</button>
    </section>

    <section className="smartBanner"><Sparkles/><div><strong>Álbumes inteligentes</strong><p>Se arman con las fechas reales de OneDrive. Ya no se mezclan fotos y videos.</p></div></section>

    <section className="peopleBanner"><Users/><div><strong>Personas</strong><p>Los grupos “Personas” de OneDrive no están expuestos por Microsoft Graph. Para tenerlos acá necesitamos hacer reconocimiento facial propio.</p></div><span>próxima etapa</span></section>

    {loading&&<section className="albumsLoading"><Loader2 className="spin"/><strong>Armando tus álbumes…</strong><span>La biblioteca se lee sin descargar los originales.</span></section>}
    {error&&<section className="connectionError">{error}</section>}

    {!loading&&!error&&<section className="albumGrid realAlbums">
      {albums.map(album=>{
        const preview=album.items[0];
        const href=`/review?kind=${kind}&rule=${encodeURIComponent(album.key)}&name=${encodeURIComponent(album.name)}`;
        return <Link className="albumCardLink" href={href} key={`${kind}-${album.key}`}>
          <article>
            <div className="albumCover realCover">
              {preview?<img src={`/api/media/thumbnail?account=${encodeURIComponent(preview.accountId)}&item=${encodeURIComponent(preview.id)}&size=medium`} alt="" loading="lazy"/>:<CalendarDays/>}
              <span className="albumCount">{album.items.length}</span>
            </div>
            <div><strong>{album.name}</strong><span>{album.rule}</span><small>{album.items.length} {kind==='image'?'fotos':'videos'} · tocar para seleccionar</small></div>
          </article>
        </Link>;
      })}
    </section>}
  </main>;
}
