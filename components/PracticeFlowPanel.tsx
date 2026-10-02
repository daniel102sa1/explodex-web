"use client";

import { useState } from "react";

type MarketFlow = {
  at: number;
  openInterest: number | null;
  openInterestChange: number | null;
  buySellRatio: number | null;
  delta: number | null;
  fundingRate: number | null;
  markPrice: number | null;
  timestamp: number | null;
};
function valid(value: unknown):number|null {
  const n=Number(value);
  return value==null || !Number.isFinite(n)?null:n;
}
function signed(value:number|null,digits=2):string {
  return value==null?"—":(value>0?"+":"")+value.toFixed(digits);
}
async function read(url:string):Promise<any>{
  const response=await fetch(url,{cache:"no-store"});
  if(!response.ok)throw new Error("Binance HTTP "+response.status);
  return response.json();
}
export default function PracticeFlowPanel({symbol}:{symbol:string}){
  const [flow,setFlow]=useState<MarketFlow|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [lastSymbol,setLastSymbol]=useState("");
  async function load(){
    if(loading)return;
    setLoading(true);setError("");
    try {
      const query=encodeURIComponent(symbol);
      const [oi, takers, funding]=await Promise.allSettled([
        read("https://fapi.binance.com/futures/data/openInterestHist?symbol="+query+"&period=5m&limit=2"),
        read("https://fapi.binance.com/futures/data/takerlongshortRatio?symbol="+query+"&period=5m&limit=1"),
        read("https://fapi.binance.com/fapi/v1/premiumIndex?symbol="+query),
      ]);
      const oiRows=oi.status==="fulfilled"&&Array.isArray(oi.value)?oi.value:[];
      const takerRows=takers.status==="fulfilled"&&Array.isArray(takers.value)?takers.value:[];
      const fundingRow=funding.status==="fulfilled"?funding.value:{};
      if(!oiRows.length&&!takerRows.length&&funding.status==="rejected")throw new Error("Los endpoints públicos no respondieron; podrían estar bloqueados en tu región.");
      const lastOI=valid(oiRows.at(-1)?.sumOpenInterest);
      const firstOI=valid(oiRows.at(-2)?.sumOpenInterest);
      const latest=takerRows.at(-1)||{};
      const buy=valid(latest.buyVol),sell=valid(latest.sellVol);
      setFlow({
        at:Date.now(),openInterest:lastOI,
        openInterestChange:lastOI!=null&&firstOI!=null&&firstOI>0?(lastOI/firstOI-1)*100:null,
        buySellRatio:valid(latest.buySellRatio),
        delta:buy!=null&&sell!=null?buy-sell:null,
        fundingRate:valid(fundingRow?.lastFundingRate),
        markPrice:valid(fundingRow?.markPrice),
        timestamp:valid(latest.timestamp)||valid(oiRows.at(-1)?.timestamp),
      });
      setLastSymbol(symbol);
    } catch(e){setError(e instanceof Error?e.message:"No fue posible leer el flujo público.");}
    finally {setLoading(false);}
  }
  const shown=lastSymbol===symbol?flow:null;
  const signal=shown?.openInterestChange!=null&&shown.buySellRatio!=null
    ? shown.openInterestChange>0&&shown.buySellRatio>1?"OI creciente con predominio de compras agresivas.":"OI y compras/ventas no muestran una expansión compradora conjunta."
    : "Datos incompletos. No hay confirmación suficiente.";
  return <div className="border-b border-slate-800 bg-[#07121c] px-3 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><div className="text-[11px] font-black text-white">Flujo de mercado · {symbol}</div>
        <div className="mt-1 text-[9px] text-slate-500">Binance Futures público · 5m · consulta manual, sin escrituras en BD</div></div>
      <button onClick={load} disabled={loading} className="rounded-lg border border-cyan-400/30 px-3 py-2 text-[10px] font-black text-cyan-200 disabled:opacity-40">{loading?"Consultando…":"Consultar flujo"}</button>
    </div>
    {error&&<p className="mt-2 text-[10px] text-amber-300">{error}</p>}
    {shown&&<div className="mt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric name="Open Interest" value={shown.openInterest==null?"—":shown.openInterest.toLocaleString("en-US",{maximumFractionDigits:0})}/>
        <Metric name="Cambio OI / 5m" value={signed(shown.openInterestChange)+"%"}/>
        <Metric name="Taker buy/sell" value={shown.buySellRatio==null?"—":shown.buySellRatio.toFixed(2)+"x"}/>
        <Metric name="Delta taker / 5m" value={signed(shown.delta)+" BTC/activos"}/>
        <Metric name="Funding indicado" value={shown.fundingRate==null?"—":signed(shown.fundingRate*100,4)+"%"}/>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">{signal} No demuestra quién abrió las posiciones ni garantiza continuidad.</p>
      <p className="mt-1 text-[9px] text-slate-600">Leído {new Date(shown.at).toLocaleTimeString()} · último dato {shown.timestamp?new Date(shown.timestamp).toLocaleTimeString():"sin hora"} · delta de una ventana, no CVD acumulado. La disponibilidad depende de Binance.</p>
    </div>}
  </div>;
}
function Metric({name,value}:{name:string;value:string}){
  return <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-2 py-2"><div className="text-[8px] text-slate-600">{name}</div>
    <div className="mt-1 truncate font-mono text-[10px] font-bold text-slate-200" title={value}>{value}</div></div>;
}
