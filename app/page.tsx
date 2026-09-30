import Link from 'next/link';
import { ArrowRight, Images, Layers3, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">ONE DRIVE · CURADURÍA VISUAL</div>
        <h1>Elegí cientos de fotos<br/><span>sin perder tiempo.</span></h1>
        <p>Swipe para conservar o mandar a descarte. Álbumes virtuales por fecha, día y evento, sin mover los originales.</p>
        <div className="heroActions">
          <Link className="primary" href="/review">Empezar selección <ArrowRight size={18}/></Link>
          <Link className="secondary" href="/settings">Conectar OneDrive</Link>
        </div>
      </section>
      <section className="featureGrid">
        <article><Zap/><h3>Swipe ultrarrápido</h3><p>Miniaturas precargadas y decisiones instantáneas.</p></article>
        <article><ShieldCheck/><h3>Borrado seguro</h3><p>Cola de descarte, revisión y confirmación antes de tocar OneDrive.</p></article>
        <article><Layers3/><h3>Álbumes virtuales</h3><p>Una misma foto puede aparecer en varios álbumes sin duplicarse.</p></article>
        <article><Images/><h3>Dos cuentas</h3><p>Una sola biblioteca visual para tus dos OneDrive.</p></article>
      </section>
      <section className="quickPanel">
        <div><span className="label">Regla sugerida</span><strong>Miércoles</strong><small>detectado automáticamente por fecha de captura</small></div>
        <div><span className="label">Seguridad</span><strong>0 eliminaciones directas</strong><small>todo pasa por revisión</small></div>
        <Link href="/albums">Ver álbumes <ArrowRight size={16}/></Link>
      </section>
    </main>
  );
}
