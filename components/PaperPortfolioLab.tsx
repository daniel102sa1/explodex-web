"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Clock3, Coins, ExternalLink, ShieldCheck, Target } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type StrategyMeta = {
  strategy_mode?: string | null;
  pattern_score?: number | null;
  phase?: string | null;
  breakout_level?: number | null;
  retest_price?: number | null;
  soft_invalidation_stop?: number | null;
  hard_stop?: number | null;
  stop_survival_enabled?: boolean;
  chase_limit?: number | null;
  actual_stop_risk_usdt?: number | null;
  net_rr?: number | null;
  trade_profile?: string | null;
  planned_horizon?: string | null;
  max_hold_minutes?: number | null;
  planned_max_leverage?: number | null;
  stop_policy?: string | null;
  leverage_policy?: { tier?: string; reason?: string; base_cap?: number; selected_leverage?: number; eligible?: boolean; paper_only?: boolean } | null;
};
type Position = StrategyMeta & { id:number; symbol:string; side:"LONG"|"SHORT"; leverage:number; entry_price:number; mark_price:number; stop_loss:number; take_profit:number; tp1?:number|null; tp2?:number|null; tp3?:number|null; margin_used:number; unrealized_pnl:number; opened_at:string; notional?:number|null; quantity?:number|null; risk_usdt?:number|null };
type Summary = { paper_only:boolean; starting_balance:number; cash_balance:number; unrealized_pnl:number; equity:number; realized_pnl:number; total_costs:number; open_positions:Position[]; closed_trades:number; winners:number; losers:number; win_rate_pct:number|null; assumptions?:Record<string,number> };
type HistoryRow = StrategyMeta & { id:number; symbol:string; side:string; leverage:number; entry_price:number; exit_price:number|null; opened_at:string; closed_at:string|null; exit_reason:string|null; gross_pnl:number|null; net_pnl:number|null; fees:number|null; slippage:number|null; funding_estimate:number|null };

const money=(v?:number|null)=>v==null||!Number.isFinite(Number(v))?"—":`${Number(v).toFixed(2)} USDT`;
const px=(v?:number|null)=>v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString(undefined,{maximumSignificantDigits:9});
const dt=(v?:string|null)=>!v?"—":new Date(v).toLocaleString("es-GT",{dateStyle:"short",timeStyle:"short"});
const pct=(v?:number|null,d=2)=>v==null||!Number.isFinite(Number(v))?"—":`${Number(v)>=0?"+":""}${Number(v).toFixed(d)}%`;
const clean=(v?:string|null)=>String(v??"—").replaceAll("_"," ");
const ageLabel=(opened?:string|null)=>{
  if(!opened)return"—";
  const min=Math.max(0,Math.floor((Date.now()-new Date(opened).getTime())/60000));
  if(min>=1440)return `${(min/1440).toFixed(1)} d`;
  if(min>=60)return `${Math.floor(min/60)}h ${min%60}m`;
  return `${min}m`;
};
const strategyLabel=(v?:string|null)=>({
  STRUCTURE_RETEST_PAPER:"STRUCTURE RETEST",
  TACTICAL:"TACTICAL",
  AGGRESSIVE_PAPER:"AGGRESSIVE",
  SWING_PAPER:"SWING",
  PRE_EVENT_PAPER:"PRE-EVENT"
} as Record<string,string>)[String(v??"")] ?? String(v??"HEART").replaceAll("_"," ");
const horizonLabel=(p:StrategyMeta)=>{
  if(p.planned_horizon)return String(p.planned_horizon).replaceAll("_"," ");
  if(p.strategy_mode==="SWING_PAPER")return "4–48h";
  if(p.strategy_mode==="AGGRESSIVE_PAPER")return "0–2h";
  if(p.strategy_mode==="TACTICAL")return "intradiario";
  if(p.strategy_mode==="MICRO_SCALP")return "micro";
  return "—";
};
const holdLabel=(v?:number|null)=>{
  if(v==null||!Number.isFinite(Number(v)))return "—";
  const m=Number(v);
  if(m>=1440)return m%1440===0?`${m/1440} día${m===1440?"":"s"}`:`${(m/1440).toFixed(1)} días`;
  if(m>=60)return `${(m/60).toFixed(m%60===0?0:1)} h`;
  return `${m} min`;
};

export default function PaperPortfolioLab(){
 const [summary,setSummary]=useState<Summary|null>(null); const [history,setHistory]=useState<HistoryRow[]>([]); const [error,setError]=useState<string|null>(null);
 useEffect(()=>{let dead=false; async function load(){if(!BASE_URL){setError("NEXT_PUBLIC_API_BASE_URL no configurada");return;} try{const [s,h]=await Promise.all([fetch(`${BASE_URL}/api/v1/paper-trading/summary`,{cache:"no-store"}),fetch(`${BASE_URL}/api/v1/paper-trading/history?limit=100`,{cache:"no-store"})]); if(!s.ok||!h.ok)throw new Error(`Backend ${!s.ok?s.status:h.status}`); const sj=await s.json(); const hj=await h.json(); if(!dead){setSummary(sj);setHistory(hj.rows??[]);setError(null)}}catch(e){if(!dead)setError(e instanceof Error?e.message:String(e))}} load(); const t=window.setInterval(load,10000); return()=>{dead=true;window.clearInterval(t)}},[]);
 if(error)return <div className="terminal-panel border-rose-500/20 p-5 text-sm text-rose-200">PAPER Portfolio temporalmente no disponible: {error}</div>;
 if(!summary)return <div className="terminal-panel p-5 text-sm text-slate-500"><Activity className="mr-2 inline animate-pulse" size={14}/>Cargando cuenta PAPER de 1,000 USDT…</div>;
 const delta=summary.equity-summary.starting_balance;
 return <div className="space-y-5">
  <section className="rounded-3xl border border-amber-400/25 bg-amber-400/[.05] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-amber-300"><ShieldCheck size={16}/> SIMULACIÓN · NO DINERO REAL</div><div className="mt-1 text-sm text-slate-400">ExplodeX abre únicamente señales autorizadas por el Heart. El saldo, apalancamiento, PnL y costos son virtuales.</div></div><span className="rounded-full border border-amber-400/25 px-3 py-1 text-[10px] font-black text-amber-200">HEART RISK ADAPTIVE</span></div></section>
  <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Stat label="Capital inicial" value={money(summary.starting_balance)}/><Stat label="Equity actual" value={money(summary.equity)} tone={delta>=0?"good":"bad"}/><Stat label="Resultado total" value={money(delta)} tone={delta>=0?"good":"bad"}/><Stat label="PnL realizado" value={money(summary.realized_pnl)} tone={summary.realized_pnl>=0?"good":"bad"}/><Stat label="PnL abierto" value={money(summary.unrealized_pnl)} tone={summary.unrealized_pnl>=0?"good":"bad"}/><Stat label="Costos simulados" value={money(summary.total_costs)}/></section>
  <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]"><div><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-white">ABIERTAS AHORA · posiciones activas</h2><span className="text-[10px] text-slate-600">actualiza cada 10 s</span></div><div className="grid gap-3 xl:grid-cols-2">{summary.open_positions.map(p=><PositionCard key={p.id} p={p} equity={summary.equity}/>)}{!summary.open_positions.length&&<div className="terminal-panel col-span-full p-8 text-center text-sm text-slate-600">No hay posiciones abiertas ahora. Cuando ExplodeX abra una simulación, aparecerá en esta sección.</div>}</div></div>
  <aside className="terminal-panel h-fit p-4 xl:sticky xl:top-24"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-cyan-300"><Coins size={14}/> CÓMO LEER PAPER</div><div className="mt-4 space-y-2 text-xs leading-5 text-slate-400"><p>Presupuesto base de riesgo: <b className="text-white">{summary.assumptions?.risk_per_trade_pct??3}%</b> del saldo antes de los frenos del Heart.</p><p>El riesgo real de cada trade puede ser menor por margen disponible, convicción, BTC, Quant, Council, historial calibrado y modo defensivo. Mira <b className="text-white">Riesgo hasta SL</b> y <b className="text-white">Riesgo / equity</b> en cada tarjeta.</p><p>Apalancamiento PAPER: techo técnico <b className="text-white">x{summary.assumptions?.max_paper_leverage??20}</b>; el techo no se usa por defecto y no aumenta por sí solo el presupuesto de riesgo.</p><p>Máximo: <b className="text-white">{summary.assumptions?.max_open_positions??3}</b> posiciones simultáneas.</p><p>En modo defensivo se reduce fuertemente la exposición y no se permiten entradas agresivas tempranas.</p><p>Structure Retest: <b className="text-white">stop estructural primero, tamaño después</b>; nunca acerca el stop por una pérdida monetaria deseada.</p><p>Taker asumido: <b className="text-white">{summary.assumptions?.taker_fee_pct_per_side??0.05}%</b> por lado.</p><p>Slippage asumido: <b className="text-white">{summary.assumptions?.slippage_pct_per_side??0.02}%</b> por lado.</p><p>Funding estimado: <b className="text-white">{summary.assumptions?.funding_estimate_pct_per_8h??0.01}% / 8h</b>.</p><p><b className="text-white">Horizonte fijado antes de entrar:</b> micro/scalp se gestiona corto; táctico es intradiario; SWING puede durar 4–48h. No se convierte un scalp perdedor en swing.</p><p><b className="text-white">Leverage no es el objetivo de ganancia:</b> se usa para margen; el riesgo lo define el stop estructural y el tamaño.</p></div><div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-[10px] leading-5 text-slate-500">Las comisiones, slippage y funding son supuestos de investigación; no representan una factura exacta de Binance.</div></aside></section>
  <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-white">HISTORIAL · operaciones cerradas</h2><div className="text-xs text-slate-500">{summary.closed_trades} cerradas · {summary.win_rate_pct==null?"sin muestra":`${summary.win_rate_pct}% ganadoras`}</div></div><div className="terminal-panel overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="border-b border-slate-800 text-[9px] uppercase tracking-[.1em] text-slate-600"><tr><th className="px-3 py-2 text-left">Activo</th><th className="px-3 text-left">Estrategia</th><th>Horizonte</th><th>Dir.</th><th>Lev.</th><th>Entrada</th><th>Salida</th><th>Neto</th><th>R/R</th><th>Costos</th><th className="px-3 text-left">Abierta</th><th className="px-3 text-left">Cerrada</th><th className="text-left">Cierre</th></tr></thead><tbody>{history.map(r=>{const costs=Number(r.fees??0)+Number(r.slippage??0)+Number(r.funding_estimate??0);return <tr key={r.id} className="border-t border-slate-900"><td className="px-3 py-3 font-black text-white">{r.symbol}</td><td className="px-3 py-3 text-left"><span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-bold text-slate-300">{strategyLabel(r.strategy_mode)}</span></td><td className="px-3 py-3 text-center text-cyan-200">{horizonLabel(r)}<div className="text-[9px] text-slate-600">{holdLabel(r.max_hold_minutes)}</div></td><td className={`px-3 py-3 font-bold ${r.side==="LONG"?"text-emerald-400":"text-rose-400"}`}>{r.side}</td><td className="px-3 py-3 text-center">{r.leverage}x</td><td className="px-3 py-3 text-right font-mono">{px(r.entry_price)}</td><td className="px-3 py-3 text-right font-mono">{px(r.exit_price)}</td><td className={`px-3 py-3 text-right font-black ${Number(r.net_pnl??0)>=0?"text-emerald-400":"text-rose-400"}`}>{money(r.net_pnl)}</td><td className="px-3 py-3 text-right text-slate-300">{r.net_rr==null?"—":Number(r.net_rr).toFixed(2)}</td><td className="px-3 py-3 text-right text-slate-500">{money(costs)}</td><td className="whitespace-nowrap px-3 py-3 text-left text-slate-500">{dt(r.opened_at)}</td><td className="whitespace-nowrap px-3 py-3 text-left text-slate-500">{dt(r.closed_at)}</td><td className="px-3 py-3 text-left text-slate-400">{String(r.exit_reason??"—").replaceAll("_"," ")}</td></tr>})}</tbody></table></div>{!history.length&&<div className="p-8 text-center text-sm text-slate-600">Todavía no hay operaciones PAPER cerradas.</div>}</div></section>
 </div>
}
function PositionCard({p,equity}:{p:Position;equity:number}){
 const stop=Number(p.hard_stop??p.stop_loss); const entry=Number(p.entry_price); const mark=Number(p.mark_price); const target=Number(p.tp1??p.take_profit);
 const dir=p.side==="LONG"?1:-1; const grossMove=entry>0?dir*(mark-entry)/entry*100:0; const stopGap=mark>0?dir*(mark-stop)/mark*100:0; const tpGap=mark>0?dir*(target-mark)/mark*100:0;
 const targetDist=dir*(target-entry); const progress=targetDist>0?dir*(mark-entry)/targetDist*100:0; const progressWidth=Math.max(0,Math.min(100,progress));
 const rr=Math.abs(entry-stop)>0?Math.abs(target-entry)/Math.abs(entry-stop):null; const roiMargin=Number(p.margin_used)>0?Number(p.unrealized_pnl)/Number(p.margin_used)*100:null;
 const risk=Number(p.actual_stop_risk_usdt??p.risk_usdt??0); const riskPct=equity>0&&risk>0?risk/equity*100:null; const exposure=Number(p.notional??(Number(p.margin_used)*Number(p.leverage)));
 const elapsedMin=Math.max(0,Math.floor((Date.now()-new Date(p.opened_at).getTime())/60000)); const remaining=p.max_hold_minutes!=null?Math.max(0,Number(p.max_hold_minutes)-elapsedMin):null;
 const levTier=p.leverage_policy?.tier; const levReason=p.leverage_policy?.reason;
 return <article className="terminal-panel overflow-hidden">
  <div className="border-b border-slate-800/80 p-4">
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><div className="flex flex-wrap items-center gap-2"><Link href={`/coin/${p.symbol}?position=${p.id}`} className="text-2xl font-black text-white hover:text-cyan-300">{p.symbol}</Link><span className={`inline-flex items-center gap-1 text-xs font-black ${p.side==="LONG"?"text-emerald-400":"text-rose-400"}`}>{p.side==="LONG"?<ArrowUpRight size={14}/>:<ArrowDownRight size={14}/>} {p.side}</span><span className="rounded-full border border-cyan-500/20 bg-cyan-500/[.05] px-2 py-0.5 text-[9px] font-black text-cyan-200">{strategyLabel(p.strategy_mode)}</span></div>
    <div className="mt-1 text-[10px] text-slate-500"><Clock3 className="mr-1 inline" size={11}/>abierta hace {ageLabel(p.opened_at)} · {dt(p.opened_at)} · horizonte <span className="text-cyan-300">{horizonLabel(p)}</span></div></div>
    <div className="flex items-center gap-2"><span className="rounded-xl border border-cyan-500/25 bg-cyan-500/[.05] px-3 py-1.5 text-sm font-black text-cyan-200">x{p.leverage}</span><Link href={`/coin/${p.symbol}?position=${p.id}`} className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-[10px] font-black text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200">VER EN VIVO <ExternalLink size={11}/></Link></div>
   </div>
  </div>
  <div className="p-4">
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Cell label="Entrada real" value={px(entry)}/><Cell label="Precio vivo" value={px(mark)}/><Cell label="SL estructural fijo" value={px(stop)} bad/><Cell label="TP principal" value={px(target)} good/></div>
   <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500"><Target size={12}/>Progreso entrada → TP</div><div className={`font-mono text-xs font-black ${progress>=0?"text-emerald-300":"text-rose-300"}`}>{progress.toFixed(1)}%</div></div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{width:`${progressWidth}%`}}/></div>
    <div className="mt-2 grid grid-cols-3 text-[9px] text-slate-600"><span>SL {px(stop)}</span><span className="text-center">Entrada {px(entry)}</span><span className="text-right">TP {px(target)}</span></div>
   </div>
   <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
    <Cell label="PnL flotante" value={`${Number(p.unrealized_pnl)>=0?"+":""}${money(p.unrealized_pnl)}`} good={Number(p.unrealized_pnl)>=0} bad={Number(p.unrealized_pnl)<0}/>
    <Cell label="Movimiento" value={pct(grossMove)} good={grossMove>=0} bad={grossMove<0}/>
    <Cell label="ROI margen sim." value={roiMargin==null?"—":pct(roiMargin)} good={Number(roiMargin)>=0} bad={Number(roiMargin)<0}/>
    <Cell label="Margen usado" value={money(p.margin_used)}/>
    <Cell label="Exposición" value={money(exposure)}/>
    <Cell label="Riesgo hasta SL" value={risk>0?money(risk):"—"}/>
    <Cell label="Distancia al SL" value={pct(stopGap)} bad={stopGap<=0}/>
    <Cell label="Distancia al TP" value={pct(tpGap)} good={tpGap>=0}/>
   </div>
   <div className="mt-3 grid gap-2 sm:grid-cols-3"><Info label="R/R inicial" value={rr==null?"—":`${rr.toFixed(2)}R`}/><Info label="Riesgo / equity" value={riskPct==null?"—":`${riskPct.toFixed(2)}%`}/><Info label="Tiempo restante" value={remaining==null?holdLabel(p.max_hold_minutes):remaining<=0?"TIME-STOP vencido":holdLabel(remaining)}/></div>
   <div className="mt-3 flex flex-wrap gap-1.5 text-[9px]">
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[.04] px-2 py-1 text-emerald-200">SL: {clean(p.stop_policy??"IMMUTABLE STRUCTURAL STOP")}</span>
    {levTier&&<span className="rounded-full border border-cyan-500/20 bg-cyan-500/[.04] px-2 py-1 text-cyan-200">Leverage {clean(levTier)}</span>}
    {levReason&&<span className="rounded-full border border-slate-700 px-2 py-1 text-slate-400">{clean(levReason)}</span>}
    {p.planned_max_leverage!=null&&<span className="rounded-full border border-slate-700 px-2 py-1 text-slate-500">base plan x{p.planned_max_leverage}</span>}
    {p.stop_survival_enabled&&<span className="rounded-full border border-amber-500/20 px-2 py-1 text-amber-200">stop suave + hard stop fijo</span>}
   </div>
  </div>
 </article>
}
function Info({label,value}:{label:string;value:string}){return <div className="rounded-xl border border-slate-800 bg-black/15 px-3 py-2"><div className="text-[9px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className="mt-1 text-xs font-black text-slate-200">{value}</div></div>}
function Stat({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}){return <div className="terminal-panel p-3"><div className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-2 text-lg font-black ${tone==="good"?"text-emerald-300":tone==="bad"?"text-rose-300":"text-white"}`}>{value}</div></div>}
function Cell({label,value,good=false,bad=false}:{label:string;value:string;good?:boolean;bad?:boolean}){return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-2.5"><div className="text-[9px] text-slate-600">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good?"text-emerald-300":bad?"text-rose-300":"text-white"}`}>{value}</div></div>}
