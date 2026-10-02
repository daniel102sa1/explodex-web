"use client";

import { useEffect, useState } from "react";
import type { CandleBar } from "@/lib/patternEngine";

type Side = "LONG" | "SHORT";
type ReplayPosition = {side:Side; entry:number; stop:number; target:number; qty:number; margin:number; at:number};
type ReplayResult = {symbol:string;side:Side;entry:number;exit:number;net:number;roi:number;reason:string;at:number};
function price(n:number){return Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:n>100?2:6}):"—";}

export default function PracticeReplayLab({
  candles,symbol,interval,sessionId,onClose
}:{
  candles:CandleBar[];symbol:string;interval:string;sessionId:string;onClose:()=>void;
}){
  const [rows,setRows]=useState<CandleBar[]>(candles.slice(-300));
  const [calendarDate,setCalendarDate]=useState("");
  const [loadingDate,setLoadingDate]=useState(false);
  const [dateError,setDateError]=useState("");
  const [speed,setSpeed]=useState(1);
  const [index,setIndex]=useState(Math.min(60,Math.max(0,rows.length-2)));
  const [side,setSide]=useState<Side>("LONG");
  const [margin,setMargin]=useState("25");
  const [leverage,setLeverage]=useState("3");
  const [stopPct,setStopPct]=useState("0.5");
  const [tpPct,setTpPct]=useState("1.0");
  const [position,setPosition]=useState<ReplayPosition|null>(null);
  const [result,setResult]=useState<ReplayResult|null>(null);
  const [playing,setPlaying]=useState(false);
  const [completed,setCompleted]=useState(0);
  const key="explodex:replay:closed:"+sessionId;
  useEffect(()=>{
    try { const saved=JSON.parse(localStorage.getItem(key)||"[]");setCompleted(Array.isArray(saved)?saved.length:0); }catch{}
  },[key]);
  const current=rows[index],hasNext=index<rows.length-1;
  async function loadDate(){
    if(!calendarDate||loadingDate)return;
    const start=Date.parse(calendarDate+"T00:00:00Z");
    if(!Number.isFinite(start)||start>Date.now()){setDateError("Selecciona una fecha histórica válida.");return;}
    setLoadingDate(true);setDateError("");setPlaying(false);
    try{
      const response=await fetch("https://fapi.binance.com/fapi/v1/klines?symbol="+encodeURIComponent(symbol)+
        "&interval="+encodeURIComponent(interval)+"&startTime="+start+"&limit=300",{cache:"no-store"});
      if(!response.ok)throw Error("Binance no respondió: HTTP "+response.status);
      const data=await response.json();
      if(!Array.isArray(data))throw Error("Respuesta inválida del historial");
      const bars:CandleBar[]=data.map((r:any[])=>({timestamp:Number(r[0]),open:Number(r[1]),high:Number(r[2]),
        low:Number(r[3]),close:Number(r[4]),volume:Number(r[7]??r[5]??0)})).filter(r=>r.timestamp>0&&r.open>0&&r.close>0)
        .sort((a,b)=>a.timestamp-b.timestamp);
      if(bars.length<65)throw Error("Hay menos de 65 velas en el historial disponible desde esa fecha.");
      setRows(bars);setIndex(60);setPosition(null);setResult(null);
    }catch(e){setDateError(e instanceof Error?e.message:"No se pudo cargar el histórico.");}
    finally{setLoadingDate(false);}
  }
  function advance(amount:number){
    let cursor=index;
    let closed:ReplayResult|null=null;
    for(let step=0;step<amount && cursor<rows.length-1;step++){
      cursor++;
      if(position){
        const bar=rows[cursor];
        const sl=position.side==="LONG"?bar.low<=position.stop:bar.high>=position.stop;
        const tp=position.side==="LONG"?bar.high>=position.target:bar.low<=position.target;
        if(sl||tp){
          // Both touched inside one candle? Without ticks, assume SL first.
          const exit=sl?position.stop:position.target;
          const gross=(position.side==="LONG"?exit-position.entry:position.entry-exit)*position.qty;
          const fees=(position.entry+exit)*position.qty*.0005;
          const net=gross-fees;
          closed={symbol,side:position.side,entry:position.entry,exit,net,
            roi:position.margin>0?net/position.margin*100:0,
            reason:sl?"SL":"TP",at:bar.timestamp};
          break;
        }
      }
    }
    setIndex(cursor);
    if(closed){
      setPosition(null);setPlaying(false);setResult(closed);
      try {
        const saved=JSON.parse(localStorage.getItem(key)||"[]");
        const records=Array.isArray(saved)?saved:[];
        const next=[closed,...records].slice(0,100);
        localStorage.setItem(key,JSON.stringify(next));
        setCompleted(next.length);
      }catch{}
    }
    if(cursor>=rows.length-1)setPlaying(false);
  }
  useEffect(()=>{
    if(!playing||!hasNext)return;
    const timer=window.setInterval(()=>advance(1),Math.max(100,850/speed));
    return ()=>window.clearInterval(timer);
  });
  function closeAtMarket(){
    if(!position||!current||playing)return;
    const exit=current.close;
    const gross=(position.side==="LONG"?exit-position.entry:position.entry-exit)*position.qty;
    const fees=(position.entry+exit)*position.qty*.0005;
    const net=gross-fees;
    const closed:ReplayResult={symbol,side:position.side,entry:position.entry,exit,net,
      roi:position.margin>0?net/position.margin*100:0,reason:"CIERRE_MANUAL",at:current.timestamp};
    setPosition(null);setResult(closed);
    try{
      const saved=JSON.parse(localStorage.getItem(key)||"[]");
      const records=Array.isArray(saved)?saved:[];
      const next=[closed,...records].slice(0,100);
      localStorage.setItem(key,JSON.stringify(next));setCompleted(next.length);
    }catch{}
  }
  function openTrade(){
    if(!current || !hasNext || position)return;
    const m=Number(margin),lev=Number(leverage),risk=Number(stopPct)/100,target=Number(tpPct)/100;
    const entry=current.close;
    if(!(m>0&&lev>=1&&lev<=20&&risk>0&&risk<.25&&target>0&&target<.25&&entry>0))return;
    const stop=side==="LONG"?entry*(1-risk):entry*(1+risk);
    const tp=side==="LONG"?entry*(1+target):entry*(1-target);
    const qty=m*lev/entry;
    setPosition({side,entry,stop,target:tp,qty,margin:m,at:index});
    setResult(null);
  }
  const visible=rows.slice(Math.max(0,index-54),index+1);
  const values=visible.flatMap(c=>[c.high,c.low]);
  if(position)values.push(position.stop,position.target,position.entry);
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(max-min,Math.abs(max)*.001,1e-8);
  const y=(v:number)=>310-(v-min)/range*270;
  const spacing=940/Math.max(1,visible.length),candleWidth=Math.max(2,spacing*.65);
  const currentPrice=current?.close||0;
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#030812]/95 p-3 backdrop-blur-sm sm:p-6">
    <div className="mx-auto max-w-[1350px] overflow-hidden rounded-2xl border border-slate-700 bg-[#08111b] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
        <div><h2 className="text-base font-black text-white">Replay histórico · {symbol} · {interval}</h2>
          <p className="mt-1 text-[10px] text-slate-500">Dinero ficticio · velas ya descargadas · no usa IA ni PostgreSQL</p></div>
        <button onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-black text-white">Cerrar Replay</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 border-b border-slate-800 px-4 py-2">
        <label className="text-[10px] text-slate-400">Iniciar Replay en otra fecha (UTC)
          <input type="date" value={calendarDate} max={new Date().toISOString().slice(0,10)}
            onChange={e=>setCalendarDate(e.target.value)} className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white"/>
        </label>
        <button onClick={()=>void loadDate()} disabled={!calendarDate||loadingDate}
          className="rounded border border-cyan-500/30 px-3 py-2 text-[10px] font-black text-cyan-200 disabled:opacity-30">{loadingDate?"Cargando…":"Cargar histórico"}</button>
        <span className="text-[9px] text-slate-500">Máximo 300 velas por consulta directa; no usa la base de datos.</span>
        {dateError&&<span role="alert" className="text-[10px] text-amber-200">{dateError}</span>}
      </div>
      {rows.length<65?<p className="p-6 text-sm text-slate-400">Se necesitan al menos 65 velas para iniciar el Replay. Abre el gráfico y carga su historial.</p>:<>
      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 rounded-xl border border-slate-800 bg-[#050b14] p-3">
          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-300">
            <b>Vela {index+1} / {rows.length}</b><span>{current?new Date(current.timestamp).toLocaleString():""}</span>
            <span className="font-mono font-bold text-cyan-300">{price(currentPrice)}</span>
          </div>
          <svg viewBox="0 0 1000 338" role="img" aria-label="Gráfico histórico de velas sin mostrar el futuro" className="h-[340px] w-full rounded-lg bg-[#030811]">
            {[0,1,2,3,4].map(i=><g key={i}><line x1="15" x2="975" y1={35+i*64} y2={35+i*64} stroke="#172231" strokeWidth="1"/>
              <text x="975" y={30+i*64} textAnchor="end" fill="#64748b" fontSize="10">{price(max-i/4*range)}</text></g>)}
            {visible.map((bar,i)=>{
              const x=22+i*spacing+spacing/2;
              const color=bar.close>=bar.open?"#34d399":"#fb7185";
              return <g key={bar.timestamp}><line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} stroke={color} strokeWidth="1.6"/>
                <rect x={x-candleWidth/2} y={Math.min(y(bar.open),y(bar.close))}
                  width={candleWidth} height={Math.max(1,Math.abs(y(bar.close)-y(bar.open)))} fill={color}/></g>;
            })}
            {position && ([
              {label:"ENTRADA",n:position.entry,color:"#22d3ee"},
              {label:"SL",n:position.stop,color:"#fb7185"},
              {label:"TP",n:position.target,color:"#34d399"}
            ]).map(z=><g key={z.label}><line x1="16" x2="975" y1={y(z.n)} y2={y(z.n)} stroke={z.color} strokeDasharray="7 4"/>
              <text x="25" y={y(z.n)-4} fill={z.color} fontSize="11">{z.label+" "+price(z.n)}</text></g>)}
          </svg>
          <div className="mt-3 flex flex-wrap gap-2">
            <button disabled={!hasNext} onClick={()=>{setPlaying(false);advance(1);}} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-30">+ 1 vela</button>
            <button disabled={!hasNext} onClick={()=>{setPlaying(false);advance(5);}} className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-30">+ 5 velas</button>
            <button disabled={!hasNext} onClick={()=>setPlaying(x=>!x)} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 disabled:opacity-30">{playing?"Pausar":"▶ Reproducir"}</button>
            <label className="self-center text-[10px] text-slate-400">Velocidad
              <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}
                className="ml-1 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-slate-200">
                {[1,2,4,8].map(v=><option key={v} value={v}>{v}x</option>)}
              </select>
            </label>
            <span className="self-center text-[10px] text-slate-600">Sin acceso a velas futuras durante la práctica.</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 p-3">
            <h3 className="mb-3 text-xs font-bold text-white">Abrir operación ficticia</h3>
            <div className="mb-2 grid grid-cols-2 gap-2">
              {(["LONG","SHORT"] as const).map(s=><button key={s} disabled={Boolean(position)} onClick={()=>setSide(s)}
                className={"rounded-lg px-3 py-2 text-xs font-bold "+(side===s?(s==="LONG"?"bg-emerald-500/20 text-emerald-200":"bg-rose-500/20 text-rose-200"):"border border-slate-700 text-slate-500")}>{s}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Margen USDT" value={margin} set={setMargin} disabled={Boolean(position)}/>
              <Field label="Apalancamiento" value={leverage} set={setLeverage} disabled={Boolean(position)}/>
              <Field label="SL precio (%)" value={stopPct} set={setStopPct} disabled={Boolean(position)}/>
              <Field label="TP precio (%)" value={tpPct} set={setTpPct} disabled={Boolean(position)}/>
            </div>
            <button disabled={Boolean(position)||!hasNext} onClick={openTrade} className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-black text-slate-950 disabled:opacity-30">Abrir {side} PAPER</button>
            <div className="mt-2 text-[10px] leading-5 text-slate-500">Comisión simulada: 0.05% por lado. Cuando SL y TP se tocan en la misma vela, se asume SL por prudencia.</div>
          </div>
          {position && <div className="rounded-xl border border-cyan-400/20 p-3 text-xs text-slate-300">
            <b className="text-cyan-300">Operación abierta</b><div className="mt-2">Entrada: {price(position.entry)} · SL: {price(position.stop)}</div>
            <div>TP: {price(position.target)} · Cantidad: {position.qty.toFixed(5)}</div>
            <button disabled={playing} onClick={closeAtMarket} className="mt-2 rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-200 disabled:opacity-40">Cerrar a precio actual</button>
          </div>}
          {result && <div className="rounded-xl border border-slate-700 p-3 text-xs">
            <b className={result.net>=0?"text-emerald-300":"text-rose-300"}>{result.reason} · {result.net.toFixed(2)} USDT · {result.roi.toFixed(2)}% ROI</b>
            <div className="mt-1 text-slate-500">La práctica se guardó solo en este navegador.</div>
          </div>}
          <div className="text-[10px] text-slate-500">Prácticas cerradas guardadas localmente: {completed} / 100.</div>
        </div>
      </div></>}
    </div>
  </div>;
}
function Field({label,value,set,disabled}:{label:string;value:string;set:(value:string)=>void;disabled:boolean}){
  return <label className="rounded-lg border border-slate-700 p-2"><span className="block text-[9px] text-slate-500">{label}</span>
    <input type="number" step="any" disabled={disabled} value={value} onChange={e=>set(e.target.value)}
      className="mt-1 w-full bg-transparent font-mono text-xs font-bold text-white outline-none disabled:opacity-50"/></label>;
}
