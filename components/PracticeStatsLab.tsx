"use client";

import { useMemo } from "react";

type Closed = {
  id?: number; symbol?: string; pattern?: string; timeframe?: string;
  close_reason?: string; net_pnl?: number; fees?: number; slippage?: number;
  r_multiple?: number | null; closed_at?: string;
};
function dollars(n: number) { return (n >= 0 ? "+" : "") + "$" + n.toFixed(2); }

export default function PracticeStatsLab({ history }: { history: Closed[] }) {
  const report = useMemo(() => {
    const rows = history.filter(row => Number.isFinite(Number(row.net_pnl)))
      .slice().sort((a,b) => Date.parse(a.closed_at || "") - Date.parse(b.closed_at || ""));
    let cumulative = 0, peak = 0, maxDD = 0;
    const curve = [0];
    let wins = 0, grossWin = 0, grossLoss = 0, totalCost = 0;
    const groups = new Map<string,{count:number; wins:number; net:number}>();
    const multiples: number[] = [];
    for (const row of rows) {
      const net = Number(row.net_pnl || 0);
      cumulative += net;
      curve.push(cumulative);
      peak = Math.max(peak,cumulative);
      maxDD = Math.max(maxDD,peak-cumulative);
      totalCost += Number(row.fees || 0)+Number(row.slippage || 0);
      if (net > 0) { wins++; grossWin+=net; } else if(net<0) grossLoss+=-net;
      if (row.r_multiple!=null && Number.isFinite(Number(row.r_multiple))) multiples.push(Number(row.r_multiple));
      const key = (row.pattern || "MANUAL").replaceAll("_"," ");
      const g = groups.get(key) || {count:0,wins:0,net:0};
      g.count++;g.net+=net;if(net>0)g.wins++;
      groups.set(key,g);
    }
    const setups = Array.from(groups.entries()).map(([name,g])=>({name,...g}))
      .sort((a,b)=>b.count-a.count).slice(0,6);
    const messages:string[] = [];
    const weak = setups.find(x=>x.count>=5 && x.net<0);
    if (weak) messages.push("El patrón "+weak.name+" acumula "+dollars(weak.net)+" en "+weak.count+" operaciones. Revisa sus entradas antes de repetirlo.");
    const early = rows.filter(x=>x.close_reason==="USER_CLOSE");
    if (early.length>=5) messages.push("Has cerrado "+early.length+" operaciones manualmente. Compáralas con el plan original y sus costes.");
    if (totalCost>0 && totalCost>Math.abs(cumulative)*.3) messages.push("Las comisiones y el deslizamiento son importantes en esta muestra: "+totalCost.toFixed(2)+" USDT estimados.");
    if (!messages.length) messages.push(rows.length<10
      ? "Hay pocos cierres para detectar patrones consistentes. Sigue practicando antes de sacar conclusiones."
      : "Compara tus resultados por patrón y temporalidad; una ganancia histórica no garantiza la siguiente operación.");
    return {count:rows.length,wins,net:cumulative,cost:totalCost,maxDD,
      expectancy:rows.length?cumulative/rows.length:0,
      profitFactor:grossLoss>0?grossWin/grossLoss:null,
      avgR:multiples.length?multiples.reduce((a,b)=>a+b,0)/multiples.length:null,
      setups,messages,curve};
  },[history]);

  if (!report.count) return <div className="rounded-xl border border-dashed border-slate-700 p-5 text-xs text-slate-500">
    Las estadísticas se calculan aquí, en el navegador, cuando cierres operaciones ficticias. No se guarda ninguna tabla adicional.
  </div>;

  const lo=Math.min(...report.curve), hi=Math.max(...report.curve);
  const span=Math.max(1,hi-lo), step=report.curve.length>1?950/(report.curve.length-1):0;
  const points=report.curve.map((v,i)=>(25+i*step)+","+(130-(v-lo)/span*110)).join(" ");

  return <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric title="Operaciones" value={String(report.count)}/>
        <Metric title="Aciertos" value={(report.wins/report.count*100).toFixed(1)+"%"}/>
        <Metric title="PnL neto" value={dollars(report.net)}/>
        <Metric title="Expectativa" value={dollars(report.expectancy)}/>
        <Metric title="Profit factor" value={report.profitFactor===null?"—":report.profitFactor.toFixed(2)}/>
        <Metric title="R promedio" value={report.avgR===null?"—":report.avgR.toFixed(2)+"R"}/>
        <Metric title="Retroceso máx." value={"$"+report.maxDD.toFixed(2)}/>
        <Metric title="Costos reportados" value={"$"+report.cost.toFixed(2)}/>
      </div>
      <div className="rounded-lg border border-slate-800 bg-[#050b14] p-3">
        <div className="mb-2 text-[10px] font-bold text-slate-400">Resultado acumulado · historial disponible</div>
        <svg viewBox="0 0 1000 150" role="img" aria-label="Curva de ganancias y pérdidas acumuladas" className="h-28 w-full">
          <line x1="25" y1="130" x2="975" y2="130" stroke="#334155" strokeWidth="1"/>
          <polyline fill="none" stroke={report.net>=0?"#34d399":"#fb7185"} strokeWidth="2" points={points}/>
        </svg>
      </div>
    </div>
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-800 bg-[#050b14] p-3">
        <div className="mb-2 text-[10px] font-bold text-white">Resultados por figura</div>
        <div className="space-y-2">
          {report.setups.map(s=><div key={s.name} className="flex items-center justify-between gap-3 border-b border-slate-800/60 pb-2 text-[10px]">
            <div><div className="font-bold text-slate-200">{s.name}</div><div className="text-slate-600">{s.count} prácticas · {s.count<10?"muestra pequeña":(s.wins/s.count*100).toFixed(1)+"% aciertos"}</div></div>
            <b className={s.net>=0?"text-emerald-300":"text-rose-300"}>{dollars(s.net)}</b>
          </div>)}
        </div>
      </div>
      <div className="rounded-lg border border-cyan-500/15 bg-cyan-500/[.035] p-3">
        <div className="mb-2 text-[10px] font-bold text-cyan-200">Entrenador gratuito · lectura del historial</div>
        {report.messages.map((s,i)=><p key={i} className="mb-2 text-[10px] leading-5 text-slate-300">{s}</p>)}
        <p className="text-[9px] text-slate-600">Se calcula localmente, sin utilizar tokens de IA ni crear registros en PostgreSQL.</p>
      </div>
    </div>
  </div>;
}

function Metric({title,value}:{title:string;value:string}){
  return <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
    <div className="text-[8px] text-slate-600">{title}</div>
    <div className="mt-1 font-mono text-[11px] font-black text-slate-100">{value}</div>
  </div>;
}
