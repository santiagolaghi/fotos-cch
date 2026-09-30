import Link from 'next/link';
import { ArrowRight, Images, Layers3, ShieldCheck, Zap } from 'lucide-react';

export default function Home(){
  return <main className="shell">
    <section className="hero">
      <div className="eyebrow">ONE DRIVE · CURADURÍA VISUAL</div>
      <h1>Elegí rápido.<br/><span>Pero viendo bien.</span></h1>
      <p>Entrá a un álbum real de OneDrive, separá fotos de videos y decidí con una vista previa HD. Nada de recorrer toda tu nube antes de empezar.</p>
      <div className="heroActions"><Link className="primary" href="/albums">Abrir álbumes <ArrowRight size={18}/></Link><Link className="secondary" href="/settings">Conexiones</Link></div>
    </section>
    <section className="featureGrid">
      <article><Zap/><h3>Carga por álbum</h3><p>Solo se consulta el álbum que abrís, no miles de archivos.</p></article>
      <article><ShieldCheck/><h3>Decisiones persistentes</h3><p>Lo conservado o descartado queda registrado y no reaparece.</p></article>
      <article><Layers3/><h3>Álbumes de OneDrive</h3><p>Traemos los álbumes reales directamente desde Microsoft.</p></article>
      <article><Images/><h3>Preview HD</h3><p>Vista previa de alta resolución para decidir con criterio.</p></article>
    </section>
  </main>;
}
