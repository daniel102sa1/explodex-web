"use client";

import { useEffect, useState } from "react";
import { analyzeTechnical, type CandleBar, type Interval } from "@/lib/patternEngine";

const BASE=process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/,"")||
  "https://explodex-backend-production.up.railway.app";
const FRAMES:Interval[]=["15m","1h","4h"];
type Frame={interval:Interval;bars:CandleBar[];error?:string};
function fmt(n:number){return n>=100?n.toFixed(2):n>=1?n.toFixed(4):n.toPrecision(5);}
async function candles(symbol:string,interval:Interval,signal:AbortSignal):Promise<CandleBar[]>{
  const response=await fetch(BASE+"/api/v1/market/candles/"+encodeURIComponent(symbol)+
    "?interval="+encodeURIComponent(interval)+"&limit=120",{signal,cache:"no-store"});
  if(!response.ok)throw Error("HTTP "+response.status);
  const payload=await response.json();
  const raw=Array.isArray(payload.candles)?payload.candles:[];
  return raw.map((c:any)=>({
    timestamp:Number(c.time??c.timestamp),open:Number(c.open),high:Number(c.high),
    low:Number(c.low),close:Number(c.close),volume:Number(c.volume||0)
  })).filter((c:CandleBar)=>c.timestamp>0&&c.open>0&&c.close>0)
    .sort((a:CandleBar,b:CandleBar)=>a.timestamp-b.timestamp);
}
export default function PracticeMultiTimeframes({symbol,active,onSelect,onClose}:{
  symbol:string;active:Interval;onSelect:(v:Interval)=>void;onClose:()=>void;
}){
  const [rows,setRows]=useState<Frame[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setRows([]);
    void Promise.all(FRAMES.map(async interval=>{
      try{return {interval,bars:await candles(symbol,interval,controller.signal)} as Frame;}
      catch(e){return {interval,bars:[],error:e instanceof Error?e.message:"No disponible"} as Frame;}
    })).then(result=>{if(!controller.signal.aborted){setRows(result);setLoading(false);}});
    return()=>controller.abort();
  },[symbol]);
  return <section className="border-b border-slate-800 bg-[#06101b] px-3 py-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="text-[10px] font-black text-slate-200">Tres temporalidades · {symbol}
        <span className="ml-2 font-normal text-slate-500">Una lectura por apertura, sin IA ni escrituras</span></div>
      <button onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400">Cerrar</button>
    </div>
    <div className="grid gap-2 md:grid-cols-3">
      {FRAMES.map(interval=>{
        const item=rows.find(r=>r.interval===interval);
        const bars=item?.bars.slice(-45)||[];
        const read=bars.length>=35?analyzeTechnical(item!.bars,interval):null;
        const min=bars.length?Math.min(...bars.map(b=>b.low)):0;
        const max=bars.length?Math.max(...bars.map(b=>b.high)):1;
        const span=Math.max(1e-9,max-min);
        const yy=(v:number)=>92-(v-min)/span*77;
        return <div key={interval} className={"rounded-lg border p-2 "+(active===interval?"border-cyan-400/40 bg-cyan-400/[.03]":"border-slate-800 bg-slate-950/40")}>
          <div className="flex items-center justify-between">
            <button onClick={()=>onSelect(interval)} className="text-xs font-black text-cyan-200">{interval.toUpperCase()} ↗</button>
            <span className={"text-[9px] "+(read?.trendScore&&read.trendScore>=2?"text-emerald-300":read?.trendScore&&read.trendScore<=-2?"text-rose-300":"text-amber-300")}>
              {read?read.trendScore>=2?"Sesgo alcista":read.trendScore<=-2?"Sesgo bajista":"Sin dirección":"—"}
            </span>
          </div>
          <svg viewBox="0 0 420 105" className="mt-1 h-28 w-full" role="img" aria-label={"Gráfico "+interval}>
            {[20,50,80].map(y=><line key={y} x1="4" x2="416" y1={y} y2={y} stroke="#1e293b" strokeDasharray="3 5"/>)}
            {bars.map((b,i)=>{
              const x=9+i*9.15,green=b.close>=b.open,col=green?"#34d399":"#fb7185";
              return <g key={b.timestamp}>
                <line x1={x+3} x2={x+3} y1={yy(b.high)} y2={yy(b.low)} stroke={col}/>
                <rect x={x} y={Math.min(yy(b.open),yy(b.close))} height={Math.max(1,Math.abs(yy(b.open)-yy(b.close)))} width="6" fill={col}/>
              </g>;
            })}
          </svg>
          <div className="flex justify-between text-[9px] text-slate-500">
            <span>{read?"Soporte "+fmt(read.support):loading?"Cargando…":item?.error?"Sin datos":"Velas insuficientes"}</span>
            <span>{read?"Resistencia "+fmt(read.resistance):""}</span>
          </div>
          {read?.pattern&&<div className="mt-1 truncate text-[9px] text-violet-300">{read.pattern.name} · {read.pattern.status==="FORMING"?"sin confirmar":"ruptura confirmada"}</div>}
        </div>;
      })}
    </div>
  </section>;
}
