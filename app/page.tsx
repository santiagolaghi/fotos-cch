import Link from 'next/link';
import { ArrowRight, Images, Layers3, ShieldCheck, Zap } from 'lucide-react';

export default function Home(){
  return <main className="shell">
    <section className="hero">
      <div className="eyebrow">ONE DRIVE · CURADURÍA VISUAL</div>
      <h1>Elegí cientos de fotos<br/><span>sin perder tiempo.</span></h1>
      <p>Primero elegís el álbum y si querés revisar fotos o videos. Después hacés swipe sin que vuelva a aparecer lo que ya decidiste.</p>
      <div className="heroActions"><Link className="primary" href="/albums">Elegir álbum <ArrowRight size={18}/></Link><Link className="secondary" href="/settings">Conexiones</Link></div>
    </section>
    <section className="featureGrid">
      <article><Zap/><h3>Swipe ultrarrápido</h3><p>Miniaturas bajo demanda y precarga de las próximas imágenes.</p></article>
      <article><ShieldCheck/><h3>Decisiones persistentes</h3><p>Lo conservado o descartado queda registrado y no reaparece.</p></article>
      <article><Layers3/><h3>Álbumes reales</h3><p>Elegí miércoles, domingo o una fecha concreta antes de empezar.</p></article>
      <article><Images/><h3>Fotos y videos separados</h3><p>Cada tipo de contenido tiene su propia selección.</p></article>
    </section>
    <section className="quickPanel"><div><span className="label">Flujo</span><strong>Álbum → selección → decisión</strong><small>sin contenido al azar</small></div><div><span className="label">Seguridad</span><strong>0 eliminaciones directas</strong><small>el swipe solo registra la decisión</small></div><Link href="/albums">Ver álbumes <ArrowRight size={16}/></Link></section>
  </main>;
}
