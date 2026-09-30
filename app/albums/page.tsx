import Link from 'next/link';
import { CalendarDays, ChevronLeft, Plus, Sparkles } from 'lucide-react';

const albums=[
  {name:'Miércoles',rule:'Día de semana = miércoles',count:428},
  {name:'Domingos',rule:'Día de semana = domingo',count:1320},
  {name:'Septiembre 2026',rule:'01/09/2026 → 30/09/2026',count:711},
  {name:'Culto 27 Sep',rule:'Fecha de captura = 27/09/2026',count:184},
];
export default function Albums(){return <main className="albumShell"><header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Álbumes virtuales</strong><small>sin mover ni duplicar fotos</small></div><button><Plus/></button></header><section className="smartBanner"><Sparkles/><div><strong>Álbum inteligente</strong><p>Las fotos entran solas según reglas de fecha, día, cuenta o carpeta.</p></div></section><section className="albumGrid">{albums.map((a,i)=><article key={a.name}><div className="albumCover" data-i={i}><CalendarDays/></div><div><strong>{a.name}</strong><span>{a.rule}</span><small>{a.count} fotos</small></div></article>)}</section></main>}
