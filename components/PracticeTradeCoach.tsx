"use client";

type Trade={id:number;symbol:string;side:"LONG"|"SHORT";pattern?:string;timeframe?:string;
  entry_price:number;exit_price:number;net_pnl:number;fees?:number;slippage?:number;
  r_multiple?:number|null;close_reason?:string;opened_at?:string;closed_at?:string};
type Review={available:boolean;summary:string;reasons:string[];risks:string[]}|null;
const usd=(v:number)=>(v>=0?"+":"")+"$"+v.toFixed(2);
export default function PracticeTradeCoach({trade,history,onClose,onAi,review,busy}:{
  trade:Trade;history:Trade[];onClose:()=>void;onAi:()=>void;review:Review;busy:boolean;
}){
  const net=Number(trade.net_pnl||0);
  const r=trade.r_multiple==null?null:Number(trade.r_multiple);
  const comparable=history.filter(x=>x.id!==trade.id&&x.symbol===trade.symbol&&
    x.pattern===trade.pattern&&x.timeframe===trade.timeframe);
  const comparableWin=comparable.filter(x=>Number(x.net_pnl)>0).length;
  const reasons:string[]=[];
  if(trade.close_reason==="SL"||trade.close_reason==="STOP_LOSS")
    reasons.push("El SL se ejecutó. Que el precio lo alcance no demuestra por sí mismo un error; revisa si estaba situado antes de la entrada según tu plan.");
  else if(trade.close_reason==="TP"||trade.close_reason==="TP1"||trade.close_reason==="TAKE_PROFIT")
    reasons.push("Se alcanzó el TP. Compara el beneficio neto con el riesgo inicial y las comisiones.");
  else if(trade.close_reason==="USER_CLOSE"||trade.close_reason==="CIERRE_MANUAL")
    reasons.push("Cerraste manualmente. Revisa si ese cierre estaba previsto o fue una decisión tomada durante el movimiento.");
  else reasons.push("Revisa el motivo de salida, la estructura del mercado y la validez de la entrada.");
  if(net<0&&r!=null&&r < -1.2)
    reasons.push("La pérdida medida en R supera el riesgo inicial estimado; revisa deslizamiento, cambios de SL y cierres.");
  if((Number(trade.fees)||0)+(Number(trade.slippage)||0)>Math.abs(net)*.3)
    reasons.push("Los costes registrados son grandes frente al PnL neto. Comprueba cómo influyen en operaciones de corta duración.");
  if(comparable.length>=5)
    reasons.push("En "+comparable.length+" prácticas anteriores de esta misma moneda, figura y temporalidad, "+
      comparableWin+" cerraron en positivo. Es una muestra histórica, no una previsión.");
  else reasons.push("Hay menos de cinco prácticas comparables de este mismo setup; la muestra es insuficiente para evaluar consistencia.");
  return <div className="mt-3 rounded-xl border border-violet-400/20 bg-[#0d1120] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><b className="text-[11px] text-violet-200">Entrenador · operación #{trade.id}</b>
        <p className="mt-1 text-[9px] text-slate-500">{trade.symbol} · {trade.side} · {trade.pattern||"MANUAL"} · {trade.timeframe||"—"}</p></div>
      <button onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400">Cerrar</button>
    </div>
    <div className="mt-2 grid grid-cols-3 gap-2">
      <div className="rounded bg-slate-950 p-2 text-[9px] text-slate-500">PnL neto<b className={"mt-1 block text-xs "+(net>=0?"text-emerald-300":"text-rose-300")}>{usd(net)}</b></div>
      <div className="rounded bg-slate-950 p-2 text-[9px] text-slate-500">R múltiplo<b className="mt-1 block text-xs text-white">{r==null?"No registrado":r.toFixed(2)+"R"}</b></div>
      <div className="rounded bg-slate-950 p-2 text-[9px] text-slate-500">Salida<b className="mt-1 block text-xs text-white">{trade.close_reason||"No indicada"}</b></div>
    </div>
    <div className="mt-3 space-y-1.5">
      {reasons.map((s,i)=><p key={i} className="text-[10px] leading-5 text-slate-300">• {s}</p>)}
    </div>
    <div className="mt-3 border-t border-slate-800 pt-2">
      <button onClick={onAi} disabled={busy} className="rounded border border-violet-400/30 px-3 py-2 text-[10px] font-black text-violet-200 disabled:opacity-40">
        {busy?"Consultando IA…":"🤖 Evaluación adicional con IA · bajo demanda"}
      </button>
      <p className="mt-1 text-[9px] text-slate-600">El entrenador anterior es gratuito. Este botón consume una de las consultas diarias disponibles de IA si está configurada.</p>
      {review&&<div className="mt-2 rounded border border-slate-700 p-2 text-[10px] leading-5 text-slate-300">
        <b className="text-violet-200">{review.available?"Evaluación de IA":"Motor técnico; IA no disponible"}</b>
        <p>{review.summary}</p>
        {review.available&&review.reasons?.slice(0,3).map((x,i)=><p key={i}>• {x}</p>)}
        {review.available&&review.risks?.slice(0,2).map((x,i)=><p key={i} className="text-amber-200">• {x}</p>)}
      </div>}
    </div>
  </div>;
}
