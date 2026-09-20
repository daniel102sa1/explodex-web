"use client";

import { useEffect, useState } from "react";
import { Activity, FlaskConical, ShieldCheck } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Horizon = {
  sample:number;
  correct:number;
  accuracy_pct:number|null;
  avg_directional_return_pct:number|null;
  avg_mfe_pct:number|null;
  avg_mae_pct:number|null;
  status:string;
};
type Report = {
  generation:string;
  paper_only:boolean;
  paper:{
    trades:number;
    open_trades:number;
    closed_trades:number;
    winners:number;
    losers:number;
    win_rate_pct:number|null;
    net_pnl:number;
    expectancy_net:number|null;
    profit_factor:number|null;
    pre_tp1_protect_stops:number;
    post_tp_profit_lock_stops:number;
    tp1_exits:number;
    time_exits:number;
    status:string;
  };
  shadow:{
    captured_signals:number;
    horizons:Record<string,Horizon>;
    continues_while_paper_kill_switch_is_active:boolean;
  };
};

const n=(v:number|null|undefined,d=2)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toFixed(d);

export default function PaperVNextEvaluation(){
  const [data,setData]=useState<Report|null>(null);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{
    let dead=false;
    async function load(){
      if(!BASE_URL){setError("Backend no configurado");return;}
      try{
        const r=await fetch(`${BASE_URL}/api/v1/paper-trading/vnext-evaluation`,{cache:"no-store"});
        if(!r.ok)throw new Error(`Backend ${r.status}`);
        const j=await r.json();
        if(!dead){setData(j);setError(null);}
      }catch(e){if(!dead)setError(e instanceof Error?e.message:String(e));}
    }
    load();
    const t=window.setInterval(load,15000);
    return()=>{dead=true;window.clearInterval(t);};
  },[]);

  if(error)return <section className="terminal-panel p-4 text-xs text-rose-300">VNext evaluación: {error}</section>;
  if(!data)return <section className="terminal-panel p-4 text-xs text-slate-500"><Activity size={13} className="mr-2 inline animate-pulse"/>Cargando evaluación VNext…</section>;

  const horizons=Object.entries(data.shadow.horizons||{});
  return <section className="terminal-panel p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-cyan-300"><FlaskConical size={14}/> ExplodeX VNext · cohorte limpia</div>
        <div className="mt-1 text-xs text-slate-500">{data.generation}</div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 px-3 py-1 text-[10px] font-black text-emerald-300"><ShieldCheck size={12}/> PAPER / SHADOW</div>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
      <Card label="PAPER nuevas" value={String(data.paper.closed_trades)}/>
      <Card label="Win rate VNext" value={data.paper.win_rate_pct==null?"CALIBRANDO":`${n(data.paper.win_rate_pct)}%`}/>
      <Card label="Profit factor" value={data.paper.profit_factor==null?"—":n(data.paper.profit_factor,3)}/>
      <Card label="Expectancy" value={data.paper.expectancy_net==null?"—":`${n(data.paper.expectancy_net,3)} USDT`}/>
      <Card label="Pre-TP1 protegidas" value={String(data.paper.pre_tp1_protect_stops)}/>
      <Card label="Shadow capturadas" value={String(data.shadow.captured_signals)}/>
    </div>

    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-950/40 text-[9px] uppercase tracking-[.1em] text-slate-600"><tr><th className="px-3 py-2 text-left">Horizonte shadow</th><th>Muestra</th><th>Acierto</th><th>Retorno dir.</th><th>MFE</th><th>MAE</th><th>Estado</th></tr></thead>
        <tbody>{horizons.map(([label,h])=><tr key={label} className="border-t border-slate-900"><td className="px-3 py-2 font-black text-white">{label}</td><td className="px-3 py-2 text-center">{h.sample}</td><td className="px-3 py-2 text-center">{h.accuracy_pct==null?"—":`${n(h.accuracy_pct)}%`}</td><td className="px-3 py-2 text-center">{h.avg_directional_return_pct==null?"—":`${n(h.avg_directional_return_pct,3)}%`}</td><td className="px-3 py-2 text-center">{h.avg_mfe_pct==null?"—":`${n(h.avg_mfe_pct,3)}%`}</td><td className="px-3 py-2 text-center">{h.avg_mae_pct==null?"—":`${n(h.avg_mae_pct,3)}%`}</td><td className={`px-3 py-2 text-center font-black ${h.status==="USABLE"?"text-emerald-300":"text-amber-300"}`}>{h.status}</td></tr>)}</tbody>
      </table>
    </div>

    <div className="mt-3 text-[10px] leading-5 text-slate-500">La cohorte nueva no se mezcla con las 206 operaciones antiguas. El shadow sigue aprendiendo aunque el kill-switch PAPER bloquee nuevas posiciones. Las métricas pasan a considerarse comparables desde 30 casos.</div>
  </section>;
}

function Card({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className="mt-1 font-black text-white">{value}</div></div>}
