"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Ban, RotateCcw, ShieldCheck, Trash2, WalletCards, X } from "lucide-react";
import {
  cancelManualPracticeOrder,
  closeManualPracticePosition,
  getManualPracticeAccount,
  moveManualPracticeStopToBreakEven,
  openManualPracticePosition,
  resetManualPracticeAccount,
  type ManualPracticeAccount,
} from "@/lib/api";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n=Number(value);
  if(Math.abs(n)>=1000)return n.toLocaleString(undefined,{maximumFractionDigits:2});
  if(Math.abs(n)>=1)return n.toLocaleString(undefined,{maximumFractionDigits:6});
  return n.toLocaleString(undefined,{maximumSignificantDigits:8});
}
function money(value?:number|null){const n=Number(value??0);return Number.isFinite(n)?"$"+n.toFixed(2):"—";}
function pct(value:number){return (value*100).toFixed(1)+"%";}

export default function PracticeOrderPanel({symbol,livePrice}:{symbol:string;livePrice?:number|null}){
  const [account,setAccount]=useState<ManualPracticeAccount|null>(null);
  const [side,setSide]=useState<"LONG"|"SHORT">("LONG");
  const [orderType,setOrderType]=useState<"MARKET"|"LIMIT">("MARKET");
  const [margin,setMargin]=useState("50");
  const [leverage,setLeverage]=useState("3");
  const [limitPrice,setLimitPrice]=useState("");
  const [stop,setStop]=useState("");
  const [tp1,setTp1]=useState("");
  const [tp2,setTp2]=useState("");
  const [tp3,setTp3]=useState("");
  const [autoBe,setAutoBe]=useState(false);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [tab,setTab]=useState<"open"|"orders"|"history">("open");

  async function refresh(){
    try{setAccount(await getManualPracticeAccount())}
    catch(e){setMessage(e instanceof Error?e.message:"No se pudo cargar la cuenta de práctica.")}
  }
  useEffect(()=>{refresh();const t=setInterval(refresh,5000);return()=>clearInterval(t)},[]);

  useEffect(()=>{
    if(!livePrice||!Number.isFinite(Number(livePrice)))return;
    const p=Number(livePrice);
    const entry=orderType==="LIMIT"?(side==="LONG"?p*.995:p*1.005):p;
    setLimitPrice(String(Number(entry.toPrecision(9))));
    const s=side==="LONG"?entry*.99:entry*1.01;
    const a=side==="LONG"?entry*1.01:entry*.99;
    const b=side==="LONG"?entry*1.02:entry*.98;
    const d=side==="LONG"?entry*1.03:entry*.97;
    setStop(String(Number(s.toPrecision(9))));
    setTp1(String(Number(a.toPrecision(9))));
    setTp2(String(Number(b.toPrecision(9))));
    setTp3(String(Number(d.toPrecision(9))));
  },[symbol,side,orderType,livePrice]);

  const preview=useMemo(()=>{
    const market=Number(livePrice||0);
    const entry=orderType==="LIMIT"?Number(limitPrice||0):market;
    const m=Number(margin||0),lev=Math.max(1,Number(leverage||1));
    const s=Number(stop||0),t=Number(tp3||0);
    const notional=m*lev,qty=entry>0?notional/entry:0;
    const risk=entry>0&&s>0?Math.abs(entry-s)*qty:0;
    const reward=entry>0&&t>0?Math.abs(t-entry)*qty:0;
    const liquidation=lev<=1?0:(side==="LONG"?entry*(1-1/lev):entry*(1+1/lev));
    return{entry,notional,qty,risk,reward,rr:risk>0?reward/risk:0,liquidation};
  },[livePrice,limitPrice,orderType,margin,leverage,stop,tp3,side]);

  async function run(action:()=>Promise<unknown>,success:string){
    setBusy(true);setMessage(null);
    try{await action();setMessage(success);await refresh()}
    catch(e){setMessage(e instanceof Error?e.message:"No se pudo completar la acción.")}
    finally{setBusy(false)}
  }

  async function open(){
    if(!livePrice){setMessage("Todavía no hay precio vivo.");return;}
    await run(()=>openManualPracticePosition({
      symbol,side,order_type:orderType,margin_usdt:Number(margin),leverage:Number(leverage),
      stop_loss:Number(stop),tp1:Number(tp1),tp2:Number(tp2),tp3:Number(tp3),
      limit_price:orderType==="LIMIT"?Number(limitPrice):undefined,
      practice_note:note,auto_be_after_tp1:autoBe,
    }),orderType==="MARKET"?side+" PAPER abierto.":"Orden LIMIT ficticia colocada.");
  }

  async function reset(){
    if(typeof window!=="undefined"&&!window.confirm("¿Reiniciar la cuenta de práctica a $1,000? Se borrará su historial manual."))return;
    await run(()=>resetManualPracticeAccount(),"Cuenta de práctica reiniciada a $1,000.");
  }

  return <section className="terminal-panel overflow-hidden">
    <div className="border-b border-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><div className="flex items-center gap-2 text-sm font-black text-white"><WalletCards size={15} className="text-cyan-300"/>Futuros demo · $1,000</div><div className="mt-1 text-[10px] text-slate-500">Cuenta aislada de práctica · ninguna orden llega al exchange</div></div>
        <div className="flex gap-1"><button onClick={refresh} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white"><RotateCcw size={13}/></button><button onClick={reset} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-rose-300"><Trash2 size={13}/></button></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Mini label="Equity" value={money(account?.equity)}/>
        <Mini label="Disponible" value={money(account?.available_margin)}/>
        <Mini label="Margen usado" value={money(account?.used_margin)}/>
        <Mini label="Reservado Limit" value={money(account?.reserved_margin)}/>
        <Mini label="PnL abierto" value={money(account?.unrealized_pnl)} tone={(account?.unrealized_pnl??0)>=0?"good":"bad"}/>
        <Mini label="PnL realizado" value={money(account?.realized_pnl)} tone={(account?.realized_pnl??0)>=0?"good":"bad"}/>
      </div>
    </div>

    <div className="p-4">
      <div className="grid grid-cols-2 gap-2">
        <button onClick={()=>setSide("LONG")} className={"rounded-xl border px-3 py-2 text-xs font-black "+(side==="LONG"?"border-emerald-400/40 bg-emerald-400/10 text-emerald-200":"border-slate-800 text-slate-500")}><span className="inline-flex items-center gap-1"><ArrowUpRight size={13}/>LONG</span></button>
        <button onClick={()=>setSide("SHORT")} className={"rounded-xl border px-3 py-2 text-xs font-black "+(side==="SHORT"?"border-rose-400/40 bg-rose-400/10 text-rose-200":"border-slate-800 text-slate-500")}><span className="inline-flex items-center gap-1"><ArrowDownRight size={13}/>SHORT</span></button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["MARKET","LIMIT"] as const).map(v=><button key={v} onClick={()=>setOrderType(v)} className={"rounded-lg border px-3 py-2 text-[10px] font-black "+(orderType===v?"border-violet-400/30 bg-violet-400/[.08] text-violet-200":"border-slate-800 text-slate-500")}>{v}</button>)}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Margen USDT" value={margin} onChange={setMargin}/>
        <Field label="Apalancamiento" value={leverage} onChange={v=>setLeverage(String(Math.max(1,Math.min(20,Number(v)||1))))} suffix="x"/>
        {orderType==="LIMIT"&&<Field label="Precio Limit" value={limitPrice} onChange={setLimitPrice}/>}
        <Field label="Stop Loss" value={stop} onChange={setStop}/>
        <Field label="TP1 · 33%" value={tp1} onChange={setTp1}/>
        <Field label="TP2 · 33%" value={tp2} onChange={setTp2}/>
        <Field label="TP3 · resto" value={tp3} onChange={setTp3}/>
      </div>

      <label className="mt-2 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] text-slate-400"><span>Después de TP1 mover SL a BE automáticamente</span><input type="checkbox" checked={autoBe} onChange={e=>setAutoBe(e.target.checked)}/></label>
      <label className="mt-2 block rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">Diario / motivo</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej. triángulo + breakout + retest + RSI..." className="mt-1 w-full bg-transparent text-xs text-slate-200 outline-none"/></label>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Stat label="Entrada" value={fmt(preview.entry)}/>
        <Stat label="Notional" value={money(preview.notional)}/>
        <Stat label="Riesgo SL" value={money(preview.risk)}/>
        <Stat label="R:R TP3" value={preview.rr>0?"1:"+preview.rr.toFixed(2):"—"}/>
      </div>
      <div className="mt-2 rounded-xl border border-amber-400/15 bg-amber-400/[.04] p-2 text-[9px] leading-4 text-amber-100/75">
        Liquidación simulada: <b>{preview.liquidation>0?fmt(preview.liquidation):"sin apalancamiento"}</b>. Es un modelo educativo simple de margen aislado; no replica la fórmula exacta de un exchange.
      </div>

      <button disabled={busy} onClick={open} className={"mt-3 w-full rounded-xl border px-4 py-3 text-sm font-black disabled:opacity-50 "+(side==="LONG"?"border-emerald-400/35 bg-emerald-400/10 text-emerald-200":"border-rose-400/35 bg-rose-400/10 text-rose-200")}>{busy?"Procesando...":orderType==="MARKET"?"ABRIR "+side+" FICTICIO":"COLOCAR LIMIT "+side}</button>
      {message&&<div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-4 text-slate-400">{message}</div>}
    </div>

    <div className="border-t border-slate-800">
      <div className="grid grid-cols-3 border-b border-slate-800">{(["open","orders","history"] as const).map(v=><button key={v} onClick={()=>setTab(v)} className={"px-2 py-2 text-[9px] font-black uppercase "+(tab===v?"bg-cyan-400/[.06] text-cyan-200":"text-slate-600")}>{v==="open"?"Posiciones":v==="orders"?"Limit":"Historial"}</button>)}</div>
      <div className="max-h-[430px] space-y-2 overflow-auto p-3">
        {tab==="open"&&(account?.positions?.length?account.positions.map(p=><div key={p.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
          <div className="flex items-start justify-between gap-2"><div><div className={"text-xs font-black "+(p.side==="LONG"?"text-emerald-300":"text-rose-300")}>{p.symbol+" · "+p.side+" · "+p.leverage+"x"}</div><div className="mt-1 text-[9px] text-slate-600">Entrada {fmt(p.entry_price)} · mark {fmt(p.mark_price)} · qty {fmt(p.quantity_remaining)}</div></div><button disabled={busy} onClick={()=>run(()=>closeManualPracticePosition(p.id,1),"Posición cerrada.")} className="rounded-lg border border-slate-800 p-1.5 text-slate-500 hover:text-rose-300"><X size={12}/></button></div>
          <div className="mt-2 grid grid-cols-4 gap-1"><Stat label="PnL" value={money(p.unrealized_pnl)}/><Stat label="SL" value={fmt(p.stop_loss)}/><Stat label="TP1/2" value={(p.tp1_hit?"✓":"○")+"/"+(p.tp2_hit?"✓":"○")}/><Stat label="Liq." value={fmt(p.liquidation_price)}/></div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            <SmallButton label="25%" onClick={()=>run(()=>closeManualPracticePosition(p.id,.25),"Cierre parcial 25%.")}/>
            <SmallButton label="50%" onClick={()=>run(()=>closeManualPracticePosition(p.id,.5),"Cierre parcial 50%.")}/>
            <SmallButton label="BE" icon={<ShieldCheck size={10}/>} onClick={()=>run(()=>moveManualPracticeStopToBreakEven(p.id),"Stop movido a break-even.")}/>
            <SmallButton label="Cerrar" onClick={()=>run(()=>closeManualPracticePosition(p.id,1),"Posición cerrada.")}/>
          </div>
          {p.note&&<div className="mt-2 text-[9px] leading-4 text-slate-500">Diario: {p.note}</div>}
        </div>):<Empty text="No hay posiciones manuales abiertas."/>)}

        {tab==="orders"&&(account?.pending_orders?.length?account.pending_orders.map(o=><div key={o.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex items-start justify-between"><div><div className={"text-xs font-black "+(o.side==="LONG"?"text-emerald-300":"text-rose-300")}>{o.symbol+" · LIMIT "+o.side+" · "+o.leverage+"x"}</div><div className="mt-1 text-[9px] text-slate-600">Entrada {fmt(o.limit_price)} · margen {money(o.margin_usdt)}</div></div><button disabled={busy} onClick={()=>run(()=>cancelManualPracticeOrder(o.id),"Orden Limit cancelada.")} className="rounded-lg border border-slate-800 p-1.5 text-slate-500 hover:text-rose-300"><Ban size={12}/></button></div><div className="mt-2 grid grid-cols-4 gap-1"><Stat label="SL" value={fmt(o.stop_loss)}/><Stat label="TP1" value={fmt(o.tp1)}/><Stat label="TP2" value={fmt(o.tp2)}/><Stat label="TP3" value={fmt(o.tp3)}/></div></div>):<Empty text="No hay órdenes Limit pendientes."/>)}

        {tab==="history"&&(account?.history?.length?account.history.map(h=><div key={h.id} className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex justify-between gap-2"><div className={"text-xs font-black "+(h.side==="LONG"?"text-emerald-300":"text-rose-300")}>{h.symbol+" · "+h.side+" · "+h.leverage+"x"}</div><div className={"font-mono text-xs font-black "+(h.realized_pnl>=0?"text-emerald-300":"text-rose-300")}>{money(h.realized_pnl)}</div></div><div className="mt-1 text-[9px] text-slate-600">Entrada {fmt(h.entry_price)} · salida {fmt(h.exit_price)} · {h.exit_reason??"—"} · costos {money(h.total_costs)}</div>{h.practice_note&&<div className="mt-2 text-[9px] leading-4 text-slate-500">Diario: {h.practice_note}</div>}</div>):<Empty text="Todavía no hay operaciones cerradas."/>)}
      </div>
    </div>
  </section>;
}

function Field({label,value,onChange,suffix}:{label:string;value:string;onChange:(v:string)=>void;suffix?:string}){return <label className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"><span className="text-[9px] font-bold uppercase tracking-[.1em] text-slate-600">{label}</span><div className="mt-1 flex items-center gap-1"><input value={value} onChange={e=>onChange(e.target.value)} inputMode="decimal" className="w-full bg-transparent font-mono text-xs font-black text-white outline-none"/>{suffix&&<span className="text-[10px] text-slate-600">{suffix}</span>}</div></label>}
function Mini({label,value,tone}:{label:string;value:string;tone?:"good"|"bad"}){return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={"mt-1 font-mono text-xs font-black "+(tone==="good"?"text-emerald-300":tone==="bad"?"text-rose-300":"text-white")}>{value}</div></div>}
function Stat({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-slate-800 bg-black/15 px-2 py-1.5 text-center"><div className="text-[8px] uppercase text-slate-600">{label}</div><div className="mt-0.5 truncate font-mono text-[9px] font-black text-slate-200">{value}</div></div>}
function SmallButton({label,onClick,icon}:{label:string;onClick:()=>void;icon?:React.ReactNode}){return <button onClick={onClick} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-800 px-2 py-1.5 text-[9px] font-black text-slate-400 hover:border-cyan-400/20 hover:text-cyan-200">{icon}{label}</button>}
function Empty({text}:{text:string}){return <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-[10px] text-slate-600">{text}</div>}
