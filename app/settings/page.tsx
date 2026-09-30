'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, Cloud, Link2, Loader2, LockKeyhole, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

type Account = {
  id:string;
  slot:number;
  display_name:string|null;
  email:string|null;
  drive_type:string|null;
  last_synced_at:string|null;
};

export default function Settings(){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  async function loadAccounts(){
    setLoading(true); setError(null);
    try{
      const r=await fetch('/api/onedrive/accounts',{cache:'no-store'});
      const j=await r.json();
      if(!r.ok) throw new Error(j?.error||'No se pudieron leer las cuentas');
      setAccounts(Array.isArray(j)?j:[]);
    }catch(e){ setError(e instanceof Error?e.message:'Error'); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ void loadAccounts(); },[]);
  const bySlot=(slot:number)=>accounts.find(a=>a.slot===slot);

  return <main className="settingsShell">
    <header className="topbar"><Link href="/"><ChevronLeft/></Link><div><strong>Conexiones</strong><small>cuentas y seguridad</small></div><button onClick={()=>void loadAccounts()} aria-label="Actualizar"><RefreshCw/></button></header>

    <section className="settingsCard">
      <div className="settingTitle"><Cloud/><div><strong>OneDrive</strong><span>Podés vincular dos cuentas distintas.</span></div></div>
      {loading && <div className="connectionState"><Loader2 className="spin"/><span>Comprobando cuentas conectadas…</span></div>}
      {error && <div className="connectionError">{error}</div>}
      {[1,2].map(slot=>{
        const a=bySlot(slot);
        return <div className="accountSlot" key={slot}>
          <div className="accountInfo">
            {a?<CheckCircle2 className="connectedIcon"/>:<Cloud/>}
            <div>
              <strong>{a ? (a.display_name||a.email||`Cuenta ${slot}`) : `Cuenta ${slot}`}</strong>
              <span>{a ? `${a.email||'Microsoft'} · ${a.drive_type||'OneDrive'}` : 'Todavía no conectada'}</span>
            </div>
          </div>
          <a className={a?'reconnectButton':'connectButton'} href={`/api/onedrive/connect?slot=${slot}`}>
            {a?<><RefreshCw/> Reconectar</>:<><Plus/> Conectar cuenta {slot}</>}
          </a>
        </div>
      })}
    </section>

    <section className="settingsCard"><div className="settingTitle"><ShieldCheck/><div><strong>Protección contra borrado</strong><span>Recomendada para biblioteca de iglesia.</span></div></div><label className="toggleRow"><span>Cola de descarte obligatoria<small>No borra con el swipe.</small></span><input type="checkbox" defaultChecked/></label><label className="toggleRow"><span>Confirmación escrita<small>Escribir “ELIMINAR” antes del lote.</small></span><input type="checkbox" defaultChecked/></label><label className="toggleRow"><span>Esperar 24 h antes de ejecutar<small>Ventana extra para arrepentirse.</small></span><input type="checkbox" defaultChecked/></label></section>
    <section className="settingsCard"><div className="settingTitle"><Link2/><div><strong>Canva</strong><span>Enviar selecciones a Canva desde un álbum.</span></div></div><button className="connectButton" disabled><Plus/> Canva · próxima etapa</button></section>
    <section className="securityNote"><LockKeyhole/><p>Los tokens de Microsoft se guardan cifrados en el servidor. Nunca en localStorage ni dentro del navegador.</p></section>
  </main>
}
