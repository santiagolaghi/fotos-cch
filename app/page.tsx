import Link from 'next/link';
import { ArrowRight, Images, Layers3, ShieldCheck, Zap } from 'lucide-react';

export default function Home(){
  return <main className="shell">
    <section className="hero"><div className="eyebrow">FOTOS CCH · BIBLIOTECA INDEXADA</div><h1>Elegí rápido.<br/><span>Y viendo bien.</span></h1><p>La app indexa OneDrive una vez, arma álbumes por carpetas y fechas, separa fotos de videos y recuerda cada decisión.</p><div className="heroActions"><Link className="primary" href="/albums">Abrir biblioteca <ArrowRight size={18}/></Link><Link className="secondary" href="/settings">Conexiones</Link></div></section>
    <section className="featureGrid"><article><Zap/><h3>Índice persistente</h3><p>Después de la primera sincronización no recorre toda la nube al abrir.</p></article><article><ShieldCheck/><h3>No reaparecen</h3><p>Conservar y descartar queda guardado en Supabase.</p></article><article><Layers3/><h3>Álbumes útiles</h3><p>Carpetas reales, fechas, miércoles, domingos y biblioteca completa.</p></article><article><Images/><h3>Preview HD</h3><p>1200 px para decidir y acceso al original con un toque.</p></article></section>
  </main>;
}
