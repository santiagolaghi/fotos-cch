'use client';

import Link from 'next/link';
import { ChevronLeft, Images, Loader2, Sparkles, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Album={id:string;name:string;childCount:number;coverImageItemId?:string|null};
type AccountGroup={
  id:string;
  slot:number;
  display_name:string|null;
  email:string|null;
  drive_type:string|null;
  albumsSupported:boolean;
  albums:Album[];
};
type ResponseShape={accounts?:AccountGroup[];error?:string};

export default function Albums(){
  const [groups,setGroups]=useState<AccountGroup[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    void (async()=>{
      try{
        setLoading(true); setError(null);
        const r=await fetch('/api/onedrive/albums',{cache:'no-store'});
        const j=await r.json() as ResponseShape;
        if(!r.ok)throw new Error(j.error||'No se pudieron cargar los álbumes');
        setGroups(j.accounts||[]);
      }catch(e){setError(e instanceof Error?e.message:'Error cargando álbumes');}
      finally{setLoading(false);}
    })();
  },[]);

  const total=useMemo(()=>groups.reduce((n,g)=>n+g.albums.length,0),[groups]);

  return <main className="albumShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Álbumes de OneDrive</strong><small>tocá uno para empezar</small></div><span/></header>

    <section className="realAlbumSummary"><div><strong>{loading?'…':total} álbumes reales</strong><div>Traídos directamente de OneDrive, no inventados por fecha.</div></div><Images/></section>

    <section className="peopleBanner"><Users/><div><strong>Personas</strong><p>La sección “Personas” de OneDrive no está disponible en Microsoft Graph. La voy a resolver como agrupación propia por rostros, sin depender de OneDrive.</p></div><em>pendiente</em></section>

    {loading&&<section className="albumsLoading"><Loader2 className="spin"/><strong>Leyendo solo tus álbumes…</strong><span>Ya no escaneamos miles de archivos para mostrar esta pantalla.</span></section>}
    {error&&<section className="connectionError">{error}</section>}

    {!loading&&!error&&groups.map(group=><section className="driveSection" key={group.id}>
      <div className="driveSectionTitle"><div><strong>{group.display_name||group.email||`Cuenta ${group.slot}`}</strong><span>{group.email||'OneDrive'} · {group.drive_type||'drive'}</span></div><small>{group.albums.length} álbumes</small></div>

      {!group.albumsSupported&&<div className="albumEmpty"><strong>Esta cuenta no expone álbumes mediante Graph</strong>Los álbumes reales por API están disponibles para OneDrive Personal. Podemos mantener álbumes inteligentes para esta cuenta.</div>}

      {group.albumsSupported&&group.albums.length===0&&<div className="albumEmpty"><strong>No encontré álbumes en esta cuenta</strong>Si en OneDrive sí ves álbumes, avisame y reviso la respuesta exacta de esa cuenta.</div>}

      <div className="onedriveAlbumGrid">
        {group.albums.map(album=><Link className="onedriveAlbumCard" key={album.id} href={`/review?source=album&account=${encodeURIComponent(group.id)}&album=${encodeURIComponent(album.id)}&name=${encodeURIComponent(album.name)}&kind=image`}>
          <div className="onedriveAlbumCover">
            <Sparkles/>
            <img src={`/api/media/thumbnail?account=${encodeURIComponent(group.id)}&item=${encodeURIComponent(album.id)}&usage=cover`} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>
            <span className="realBadge">ONEDRIVE</span>
            <span className="albumCount">{album.childCount}</span>
          </div>
          <div className="onedriveAlbumMeta"><strong>{album.name}</strong><span>{album.childCount} elementos</span><small>Tocar para revisar</small></div>
        </Link>)}
      </div>
    </section>)}
  </main>;
}
