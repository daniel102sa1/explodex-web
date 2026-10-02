"use client";

import { useEffect, useState } from "react";

type Side = "LONG" | "SHORT";
type Position = {
  id:number; symbol:string; side:Side; entry_price:number; stop_loss:number;
  take_profit:number; margin_used:number; quantity:number; tp2?:number|null;
  tp3?:number|null;mark_price?:number;
};
type Hint = { direction:"LONG"|"SHORT"|"WAIT"; tp1:number; stop_loss:number; available:boolean } | null;

function fmt(n:number){return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:n>=100?3:8}):"—";}

export default function PracticePositionEditor({
  position,sessionId,baseUrl,aiHint,onSaved,onCancel
}:{
  position:Position; sessionId:string;baseUrl:string;aiHint:Hint;
  onSaved:()=>Promise<void>;onCancel:()=>void;
}){
  const [stop,setStop]=useState(String(position.stop_loss));
  const [target,setTarget]=useState(String(position.take_profit));
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    setStop(String(position.stop_loss));setTarget(String(position.take_profit));setError("");
  },[position.id]);
  const sl=Number(stop),tp=Number(target),entry=Number(position.entry_price);
  const validSL=Number.isFinite(sl)&&sl>0&&(position.side==="LONG"?sl<=entry:sl>=entry);
  const validTP=Number.isFinite(tp)&&tp>0&&(position.side==="LONG"?tp>entry:tp<entry);
  const grossReward=(position.side==="LONG"?tp-entry:entry-tp)*position.quantity;
  const grossLoss=(position.side==="LONG"?sl-entry:entry-sl)*position.quantity;
  const feeReward=(entry+tp)*position.quantity*.0005;
  const feeLoss=(entry+sl)*position.quantity*.0005;
  const netReward=grossReward-feeReward;
  const netLoss=grossLoss-feeLoss;
  const roi=position.margin_used>0?netReward/position.margin_used*100:0;
  async function save(){
    if(saving||!validSL||!validTP)return;
    setSaving(true);setError("");
    try{
      const response=await fetch(baseUrl+"/api/v1/practice/"+position.id+"/modify",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({session_id:sessionId,stop_loss:sl,take_profit:tp,single_target:true}),
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.detail||"No se pudo guardar el nivel.");
      await onSaved();
      onCancel();
    }catch(e){setError(e instanceof Error?e.message:"No se pudo actualizar.");}
    finally{setSaving(false);}
  }
  return <div className="mt-3 rounded-xl border border-cyan-400/20 bg-[#091723] p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-[10px] font-black text-cyan-200">Editar posición #{position.id} · TP único</div>
      <span className="text-[9px] text-slate-500">Se dibujarán 3 líneas: entrada, SL y TP</span>
    </div>
    {(position.tp2!=null||position.tp3!=null)&&<p className="mb-2 text-[9px] leading-4 text-amber-200">
      Esta posición se creó con varios objetivos. Al guardar, se eliminarán TP2 y TP3
      y el TP indicado cerrará toda la cantidad restante.
    </p>}
    {position.mark_price!=null && validTP &&
      (position.side==="LONG"?tp<=position.mark_price:tp>=position.mark_price) &&
      <p className="mb-2 text-[9px] text-amber-200">El precio actual ya alcanzó o superó el TP indicado. El simulador podría ejecutarlo en la próxima sincronización; revisa el nivel antes de guardar.</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block"><span className="mb-1 block text-[9px] font-black text-rose-300">Stop Loss · precio</span>
        <input type="number" step="any" value={stop} onChange={e=>setStop(e.target.value)}
          className={"w-full rounded-lg border bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none "+
          (stop&&!validSL?"border-rose-500":"border-slate-700 focus:border-cyan-500")}/></label>
      <label className="block"><span className="mb-1 block text-[9px] font-black text-emerald-300">Take Profit · precio</span>
        <input type="number" step="any" value={target} onChange={e=>setTarget(e.target.value)}
          className={"w-full rounded-lg border bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none "+
          (target&&!validTP?"border-rose-500":"border-slate-700 focus:border-cyan-500")}/></label>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2 text-[9px]">
      <div className="rounded-md bg-slate-950/70 p-2 text-slate-400">Entrada <b className="block text-slate-100">{fmt(entry)}</b></div>
      <div className="rounded-md bg-slate-950/70 p-2 text-slate-400">Pérdida SL <b className="block text-rose-300">{validSL?"$"+netLoss.toFixed(2):"—"}</b></div>
      <div className="rounded-md bg-slate-950/70 p-2 text-slate-400">PnL / ROI en TP <b className="block text-emerald-300">{validTP?"$"+netReward.toFixed(2)+" / "+roi.toFixed(2)+"%":"—"}</b></div>
    </div>
    {aiHint&&aiHint.direction===position.side&&aiHint.tp1>0&&
      (position.side==="LONG"?aiHint.tp1>entry:aiHint.tp1<entry)&&
      <button type="button" onClick={()=>setTarget(String(aiHint.tp1))}
        className="mt-2 rounded-md border border-violet-400/30 px-2.5 py-1.5 text-[9px] font-bold text-violet-200">
        Usar TP sugerido por {aiHint.available?"IA":"motor técnico"}: {fmt(aiHint.tp1)}
      </button>}
    {error&&<p className="mt-2 text-[10px] text-rose-300">{error}</p>}
    <div className="mt-3 flex gap-2">
      <button type="button" disabled={!validSL||!validTP||saving} onClick={save}
        className="rounded-lg bg-cyan-400 px-4 py-2 text-[10px] font-black text-slate-950 disabled:opacity-35">
        {saving?"Guardando…":"Guardar SL y un TP"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300">Cancelar</button>
    </div>
    <p className="mt-2 text-[9px] leading-4 text-slate-600">Ganancias y costes aproximados: comisión taker del 0,05 % por lado; no incluye funding ni deslizamiento. Solo PAPER.</p>
  </div>;
}
