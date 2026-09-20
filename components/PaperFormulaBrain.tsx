"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, FlaskConical } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Horizon = {
  sample:number;
  correct:number;
  accuracy_pct:number|null;
  high_consensus_sample:number;
  high_consensus_accuracy_pct:number|null;
  status:string;
};
type Formula = { name:string; purpose:string; equation:string };
type Report = {
  version:string;
  mode:string;
  research_only:boolean;
  captured_formula_signals:number;
  mature_horizon_observations:number;
  minimum_sample:number;
  horizons:Record<string,Horizon>;
  registry:{ formulas:Formula[] };
};

const pct=(v:number|null|undefined)=>v==null?"—":`${Number(v).toFixed(1)}%`;

export default function PaperFormulaBrain(){
  const [data,setData]=useState<Report|null>(null);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let dead=false;
    async function load(){
      if(!BASE_URL){setError("Backend no configurado");return;}
      try{
        const r=await fetch(`${BASE_URL}/api/v1/paper-trading/formula-brain`,{cache:"no-store"});
        if(!r.ok)throw new Error(`Backend ${r.status}`);
        const j=await r.json();
        if(!dead){setData(j);setError(null);}
      }catch(e){if(!dead)setError(e instanceof Error?e.message:String(e));}
    }
    load();
    const t=window.setInterval(load,20000);
    return()=>{dead=true;window.clearInterval(t);};
  },[]);

  if(error)return <section className="terminal-panel p-4 text-xs text-rose-300">Formula Brain: {error}</section>;
  if(!data)return <section className="terminal-panel p-4 text-xs text-slate-500">Cargando Formula Brain…</section>;

  return <section className="terminal-panel p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-violet-300"><BrainCircuit size={14}/> Formula Brain · laboratorio cuantitativo</div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">RSI, MACD, ADX, Bollinger, VWAP, Donchian, Kaufman ER, Choppiness, autocorrelación, entropía, OBV, ROC y volatilidad realizada. Por ahora solo aprende en SHADOW.</p>
      </div>
      <div className="rounded-full border border-violet-500/20 px-3 py-1 text-[10px] font-black text-violet-300"><FlaskConical size={12} className="mr-1 inline"/>{data.mode}</div>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      <Card label="Fórmulas" value={String(data.registry?.formulas?.length ?? 0)}/>
      <Card label="Señales capturadas" value={String(data.captured_formula_signals)}/>
      <Card label="Observaciones maduras" value={String(data.mature_horizon_observations)}/>
      <Card label="Muestra mínima" value={String(data.minimum_sample)}/>
    </div>

    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-950/40 text-[9px] uppercase tracking-[.1em] text-slate-600"><tr><th className="px-3 py-2 text-left">Horizonte</th><th>Muestra</th><th>Acierto</th><th>Alta confluencia</th><th>Estado</th></tr></thead>
        <tbody>{Object.entries(data.horizons||{}).map(([h,v])=><tr key={h} className="border-t border-slate-900"><td className="px-3 py-2 font-black text-white">{h}</td><td className="px-3 py-2 text-center">{v.sample}</td><td className="px-3 py-2 text-center">{pct(v.accuracy_pct)}</td><td className="px-3 py-2 text-center">{v.high_consensus_sample} · {pct(v.high_consensus_accuracy_pct)}</td><td className={`px-3 py-2 text-center font-black ${v.status==="USABLE"?"text-emerald-300":"text-amber-300"}`}>{v.status}</td></tr>)}</tbody>
      </table>
    </div>

    <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-3">
      <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Ver fórmulas del cerebro</summary>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">{(data.registry?.formulas||[]).map(f=><div key={f.name} className="rounded-lg border border-slate-900 p-2"><div className="text-[10px] font-black text-white">{f.name}</div><div className="text-[10px] text-slate-500">{f.purpose}</div><div className="mt-1 font-mono text-[9px] text-slate-600">{f.equation}</div></div>)}</div>
    </details>

    <p className="mt-3 text-[10px] leading-5 text-slate-500">No crea entradas, no sube leverage y no mueve stops. Solo podrá proponerse para decisiones después de acumular al menos {data.minimum_sample} casos comparables y demostrar resultados.</p>
  </section>;
}

function Card({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className="mt-1 font-black text-white">{value}</div></div>}
