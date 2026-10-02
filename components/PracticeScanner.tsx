"use client";
import { useEffect, useMemo, useState } from "react";
import { analyzeTechnical, type CandleBar } from "@/lib/patternEngine";

const BASE=process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/,"")||
  "https://explodex-backend-production.up.railway.app";
const DEFAULT=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","LINKUSDT","DOGEUSDT","ADAUSDT","BNBUSDT"];
type Ticker={symbol:string;price:number;change:number;volume:number};
type Scan={pattern:string;status:string;bias:string};
const fmt=(n:number)=>n>=100?n.toFixed(2):n>=1?n.toFixed(5):n.toPrecision(5);
async function getTickers():Promise<Ticker[]>{
  const response=await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr",{cache:"no-store"});
  if(!response.ok)throw Error("Binance HTTP "+response.status);
  const payload=await response.json();
  if(!Array.isArray(payload))throw Error("Respuesta inválida");
  return payload.filter((r:any)=>typeof r.symbol==="string"&&r.symbol.endsWith("USDT"))
    .map((r:any)=>({symbol:r.symbol,price:Number(r.lastPrice),change:Number(r.priceChangePercent),volume:Number(r.quoteVolume)}))
    .filter((r:Ticker)=>r.price>0&&Number.isFinite(r.change)&&Number.isFinite(r.volume));
}
async function scanSymbol(symbol:string):Promise<Scan|null>{
  const response=await fetch(BASE+"/api/v1/market/candles/"+encodeURIComponent(symbol)+"?interval=15m&limit=150",{cache:"no-store"});
  if(!response.ok)return null;
  const payload=await response.json();
  const bars:CandleBar[]=(Array.isArray(payload.candles)?payload.candles:[]).map((r:any)=>({
    timestamp:Number(r.time??r.timestamp),open:Number(r.open),high:Number(r.high),low:Number(r.low),
    close:Number(r.close),volume:Number(r.volume||0)
  })).filter((r:CandleBar)=>r.timestamp>0&&r.close>0);
  const read=analyzeTechnical(bars.slice(0,-1),"15m");
  return read?{pattern:read.pattern?.name||"Sin figura clara",status:read.pattern?.status||"NONE",
    bias:read.trendScore>=2?"Alcista":read.trendScore<=-2?"Bajista":"Mixto"}:null;
}
export default function PracticeScanner({symbol,onSelect,onClose}:{
  symbol:string;onSelect:(s:string)=>void;onClose:()=>void;
}){
  const [watch,setWatch]=useState<string[]>(DEFAULT);
  const [input,setInput]=useState("");
  const [tickers,setTickers]=useState<Ticker[]>([]);
  const [reads,setReads]=useState<Record<string,Scan|null>>({});
  const [loading,setLoading]=useState(false),[scanning,setScanning]=useState(false);
  const [error,setError]=useState("");
  const [sort,setSort]=useState<"volume"|"change"|"abs">("volume");
  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem("explodex:watchlist:v1")||"null");
      if(Array.isArray(saved))setWatch(saved.filter((s:any)=>typeof s==="string"&&/^[A-Z0-9]+USDT$/.test(s)).slice(0,20));
    }catch{}
  },[]);
  function setWatchlist(next:string[]){
    const list=[...new Set(next)].slice(0,20);
    setWatch(list);try{localStorage.setItem("explodex:watchlist:v1",JSON.stringify(list));}catch{}
  }
  async function refresh(){
    setLoading(true);setError("");
    try{setTickers(await getTickers());}
    catch(e){setError("Binance no está accesible desde este navegador. La lista guardada sigue disponible.");}
    finally{setLoading(false);}
  }
  async function technical(){
    if(scanning)return;
    setScanning(true);
    const limited=[...new Set([symbol,...watch])].slice(0,6);
    const result=await Promise.all(limited.map(async s=>{
      try{return [s,await scanSymbol(s)] as const;}
      catch{return [s,null] as const;}
    }));
    setReads(old=>({...old,...Object.fromEntries(result)}));setScanning(false);
  }
  const sorted=useMemo(()=>{
    const map=new Map(tickers.map(t=>[t.symbol,t]));
    return watch.map(s=>map.get(s)||{symbol:s,price:0,change:0,volume:0}).sort((a,b)=>
      sort==="volume"?b.volume-a.volume:sort==="change"?b.change-a.change:Math.abs(b.change)-Math.abs(a.change));
  },[tickers,watch,sort]);
  function add(){
    const value=input.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const s=value.endsWith("USDT")?value:value+"USDT";
    if(/^[A-Z0-9]{2,25}USDT$/.test(s)){setWatchlist([...watch,s]);setInput("");}
  }
  return <section className="border-b border-slate-800 bg-[#07101a] p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><div className="text-xs font-black text-white">Escáner y lista personalizada</div>
        <p className="mt-1 text-[9px] text-slate-500">Datos públicos por solicitud. Análisis de un máximo de seis pares; sin IA ni escrituras en PostgreSQL.</p></div>
      <div className="flex gap-1">
        <button disabled={loading} onClick={()=>void refresh()} className="rounded border border-cyan-500/30 px-2 py-1.5 text-[9px] text-cyan-200">{loading?"Cargando…":"Actualizar precios"}</button>
        <button disabled={scanning} onClick={()=>void technical()} className="rounded border border-violet-500/30 px-2 py-1.5 text-[9px] text-violet-200">{scanning?"Analizando…":"Figuras 15m · máx. 6"}</button>
        <button onClick={onClose} className="rounded border border-slate-700 px-2 py-1.5 text-[9px] text-slate-400">Cerrar</button>
      </div>
    </div>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <input aria-label="Añadir moneda a lista" value={input} onChange={e=>setInput(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")add();}} placeholder="Añadir moneda, ej. NEAR"
        className="rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none"/>
      <button onClick={add} className="rounded bg-cyan-400 px-3 py-1.5 text-[9px] font-black text-slate-950">Añadir</button>
      <label className="text-[9px] text-slate-500">Ordenar
        <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="ml-1 rounded border border-slate-700 bg-slate-950 p-1 text-slate-200">
          <option value="volume">Volumen</option><option value="change">Variación +</option><option value="abs">Movimiento absoluto</option>
        </select>
      </label>
    </div>
    {error&&<p className="mb-2 text-[10px] text-amber-200">{error}</p>}
    <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
      {sorted.map(t=><div key={t.symbol} className={"flex items-center gap-2 rounded-lg border p-2 "+(t.symbol===symbol?"border-cyan-400/40":"border-slate-800")}>
        <button onClick={()=>onSelect(t.symbol)} className="min-w-0 flex-1 text-left">
          <div className="text-[11px] font-black text-white">{t.symbol.replace(/USDT$/,"")} <span className="text-slate-600">/ USDT</span></div>
          <div className="mt-1 flex gap-2 text-[9px]">
            <span className="text-slate-400">{t.price?fmt(t.price):"Sin precio"}</span>
            {t.price>0&&<span className={t.change>=0?"text-emerald-300":"text-rose-300"}>{t.change>=0?"+":""}{t.change.toFixed(2)}%</span>}
          </div>
          {reads[t.symbol]&&<div className="mt-1 truncate text-[9px] text-violet-300">{reads[t.symbol]?.bias} · {reads[t.symbol]?.pattern}</div>}
        </button>
        <button title={"Quitar "+t.symbol} onClick={()=>setWatchlist(watch.filter(s=>s!==t.symbol))}
          className="px-1 text-xs text-slate-600 hover:text-rose-300">×</button>
      </div>)}
    </div>
  </section>;
}
