"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, RotateCcw, WalletCards, X } from "lucide-react";
import { closeManualPracticePosition, getManualPracticeAccount, openManualPracticePosition, type ManualPracticeAccount } from "@/lib/api";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}
function money(value?: number | null) { const n=Number(value??0); return Number.isFinite(n) ? "$"+n.toFixed(2) : "—"; }

export default function PracticeOrderPanel({symbol,livePrice}:{symbol:string;livePrice?:number|null}){
  const [account,setAccount]=useState<ManualPracticeAccount|null>(null);
  const [side,setSide]=useState<"LONG"|"SHORT">("LONG");
  const [margin,setMargin]=useState("50");
  const [leverage,setLeverage]=useState("2");
  const [stop,setStop]=useState("");
  const [target,setTarget]=useState("");
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  async function refresh(){try{setAccount(await getManualPracticeAccount())}catch(e){setMessage(e instanceof Error?e.message:"No se pudo cargar la cuenta PAPER.")}}
  useEffect(()=>{refresh();const t=setInterval(refresh,7000);return()=>clearInterval(t)},[]);
  useEffect(()=>{
    if(!livePrice||!Number.isFinite(livePrice))return;
    const p=Number(livePrice);
    const sl=side==="LONG"?p*.99:p*1.01;
    const tp=side==="LONG"?p*1.02:p*.98;
    setStop(String(Number(sl.toPrecision(8)))); setTarget(String(Number(tp.toPrecision(8))));
  },[symbol,side,livePrice]);

  const preview=useMemo(()=>{
    const p=Number(livePrice||0),m=Number(margin||0),lev=Number(leverage||1),s=Number(stop||0),t=Number(target||0);
    const notional=m*lev,qty=p>0?notional/p:0,risk=p>0&&s>0?Math.abs(p-s)*qty:0,reward=p>0&&t>0?Math.abs(t-p)*qty:0;
    return{notional,risk,reward,rr:risk>0?reward/risk:0};
  },[livePrice,margin,leverage,stop,target]);

  async function open(next:"LONG"|"SHORT"){
    if(!livePrice){setMessage("Todavía no hay precio vivo.");return;}
    setBusy(true);setMessage(null);
    try{
      await openManualPracticePosition({symbol,side:next,margin_usdt:Number(margin),leverage:Number(leverage),stop_loss:Number(stop),take_profit:Number(target),practice_note:note});
      setMessage(next+" PAPER abierto. No se envió ninguna orden real."); await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"No se pudo abrir la práctica.")}finally{setBusy(false)}
  }
  async function close(id:number){setBusy(true);setMessage(null);try{await closeManualPracticePosition(id);setMessage("Posición PAPER cerrada al precio de mercado.");await refresh()}catch(e){setMessage(e instanceof Error?e.message:"No se pudo cerrar.")}finally{setBusy(false)}}

  return <section className="terminal-panel overflow-hidden">
    <div className="border-b border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-black text-white"><WalletCards size={15} className="text-cyan-300"/>Cuenta de práctica</div><div className="mt-1 text-[10px] text-slate-500">100% ficticia · nunca envía órdenes a Binance</div></div><button onClick={refresh} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white"><RotateCcw size={13}/></button></div>
      <div className="mt-3 grid grid-cols-2 gap-2"><Mini label="Equity" value={money(account?.equity)}/><Mini label="Disponible" value={money(account?.available_margin)}/><Mini label="PnL abierto" value={money(account?.unrealized_pnl)} tone={(account?.unrealized_pnl??0)>=0?"good":"bad"}/><Mini label="PnL realizado" value={money(account?.realized_pnl)} tone={(account?.realized_pnl??0)>=0?"good":"bad"}/></div>
    </div>
    <div className="p-4">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={()=>setSide("LONG")} className={"rounded-xl border px-3 py-2 text-xs font-black "+(side==="LONG"?"border-emerald-400/40 bg-emerald-400/10 text-emerald-200":"border-slate-800 text-slate-500")}><span className="inline-flex items-center gap-1"><ArrowUpRight size={13}/> LONG</span></button>
        <button onClick={()=>setSide("SHORT")} className={"rounded-xl border px-3 py-2 text-xs font-black "+(side==="SHORT"?"border-rose-400/40 bg-rose-400/10 text-rose-200":"border-slate-800 text-slate-500")}><span className="inline-flex items-center gap-1"><ArrowDownRight size={13}/> SHORT</span></button>
      </div>
      <div className="grid grid-cols-2 gap-2"><Field label="Margen USDT" value={margin} onChange={setMargin}/><Field label="Apalancamiento" value={leverage} onChange={setLeverage} suffix="x"/><Field label="Stop Loss" value={stop} onChange={setStop}/><Field label="Take Profit" value={target} onChange={setTarget}/></div>
      <label className="mt-2 block rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">Nota de práctica</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej. triángulo + retest + RSI..." className="mt-1 w-full bg-transparent text-xs text-slate-200 outline-none"/></label>
      <div className="mt-3 grid grid-cols-4 gap-1.5"><Stat label="Precio" value={fmt(livePrice)}/><Stat label="Notional" value={money(preview.notional)}/><Stat label="Riesgo" value={money(preview.risk)}/><Stat label="R:R" value={preview.rr>0?"1:"+preview.rr.toFixed(2):"—"}/></div>
      <button disabled={busy} onClick={()=>open(side)} className={"mt-3 w-full rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50 "+(side==="LONG"?"border-emerald-400/35 bg-emerald-400/10 text-emerald-200":"border-rose-400/35 bg-rose-400/10 text-rose-200")}>{busy?"Procesando...":"ABRIR "+side+" FICTICIO"}</button>
      {message&&<div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-4 text-slate-400">{message}</div>}
    </div>
    <div className="border-t border-slate-800 p-4"><div className="mb-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Posiciones manuales abiertas</div><div className="space-y-2">
      {account?.positions?.length?account.positions.map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex items-start justify-between gap-2"><div><div className={"text-xs font-black "+(p.side==="LONG"?"text-emerald-300":"text-rose-300")}>{p.symbol+" · "+p.side+" · "+p.leverage+"x"}</div><div className="mt-1 text-[9px] text-slate-600">Entrada {fmt(p.entry_price)} · mark {fmt(p.mark_price)}</div></div><button disabled={busy} onClick={()=>close(p.id)} className="rounded-lg border border-slate-800 p-1.5 text-slate-500 hover:border-rose-400/30 hover:text-rose-300"><X size={12}/></button></div><div className="mt-2 grid grid-cols-3 gap-1.5"><Stat label="PnL" value={money(p.unrealized_pnl)}/><Stat label="SL" value={fmt(p.stop_loss)}/><Stat label="TP" value={fmt(p.take_profit)}/></div></div>):<div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-[10px] text-slate-600">Aún no abriste una práctica manual.</div>}
    </div></div>
  </section>;
}

function Field({label,value,onChange,suffix}:{label:string;value:string;onChange:(v:string)=>void;suffix?:string}){return <label className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">{label}</span><div className="mt-1 flex items-center gap-1"><input value={value} onChange={e=>onChange(e.target.value)} inputMode="decimal" className="w-full bg-transparent font-mono text-xs font-black text-white outline-none"/>{suffix&&<span className="text-[10px] text-slate-600">{suffix}</span>}</div></label>}
function Mini({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}){return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={"mt-1 font-mono text-xs font-black "+(tone==="good"?"text-emerald-300":tone==="bad"?"text-rose-300":"text-white")}>{value}</div></div>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-slate-800 bg-black/15 px-2 py-1.5 text-center"><div className="text-[8px] uppercase text-slate-600">{label}</div><div className="mt-0.5 truncate font-mono text-[10px] font-black text-slate-200">{value}</div></div>}