"use client";
import { useEffect, useMemo, useState } from "react";
import { analyzeTechnical, type CandleBar } from "@/lib/patternEngine";
import { findPracticeOpportunity, opportunityCanLoad, type PracticeOpportunity } from "@/lib/practiceOpportunity";

const BASE=process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/,"")||
  "https://explodex-backend-production.up.railway.app";
const DEFAULT=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","LINKUSDT","DOGEUSDT","ADAUSDT","BNBUSDT"];
type Ticker={symbol:string;price:number;change:number;volume:number};
type Scan={pattern:string;status:string;bias:string;opportunity:PracticeOpportunity|null;scannedAt:number};
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
    bias:read.trendScore>=2?"Alcista":read.trendScore<=-2?"Bajista":"Mixto",
    opportunity:findPracticeOpportunity(symbol,bars),scannedAt:Date.now()}:null;
}
export default function PracticeScanner({symbol,onSelect,onPlan,onClose}:{
  symbol:string;onSelect:(s:string)=>void;onPlan:(idea:PracticeOpportunity)=>void;onClose:()=>void;
}){
  const [watch,setWatch]=useState<string[]>(DEFAULT);
  const [input,setInput]=useState("");
  const [tickers,setTickers]=useState<Ticker[]>([]);
  const [reads,setReads]=useState<Record<string,Scan|null>>({});
  const [loading,setLoading]=useState(false),[scanning,setScanning]=useState(false);
  const [error,setError]=useState("");
  const [sort,setSort]=useState<"volume"|"change"|"abs">("volume");
  const [onlyReady,setOnlyReady]=useState(false);
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
    setScanning(true);setError("");
    const limited=[...new Set([symbol,...watch])].slice(0,6);
    const result=await Promise.all(limited.map(async s=>{
      try{return [s,await scanSymbol(s)] as const;}
      catch{return [s,null] as const;}
    }));
    const next=Object.fromEntries(result);
    setReads(next);
    if(result.every(([,read])=>read===null))setError("No se pudieron consultar las velas; revisa el acceso al backend e inténtalo de nuevo.");
    setScanning(false);
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
        <p className="mt-1 text-[9px] text-slate-500">Radar 15m: zona de entrada, condición, SL y TP único. Hasta seis pares por solicitud, sin IA pagada ni escrituras en PostgreSQL.</p></div>
      <div className="flex gap-1">
        <button disabled={loading} onClick={()=>void refresh()} className="rounded border border-cyan-500/30 px-2 py-1.5 text-[9px] text-cyan-200">{loading?"Cargando…":"Actualizar precios"}</button>
        <button disabled={scanning} onClick={()=>void technical()} className="rounded border border-violet-500/30 px-2 py-1.5 text-[9px] text-violet-200">{scanning?"Analizando…":"🔎 Buscar oportunidades · máx. 6"}</button>
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
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[9px] text-slate-400">
        <input type="checkbox" checked={onlyReady} onChange={e=>setOnlyReady(e.target.checked)} className="accent-cyan-400"/>
        Solo oportunidades en zona
      </label>
      <span className="text-[9px] text-slate-600">Una señal se descarta si pierde el SL, se aleja de la zona o sus datos caducan.</span>
    </div>
    {Object.keys(reads).length>0&&<div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(reads).filter(([,read])=>read?.opportunity&&(!onlyReady||read.opportunity.status==="EN_ZONA")).map(([pair,read])=>{
        const idea=read!.opportunity!;
        const aged=Date.now()-read!.scannedAt>10*60_000;
        const enabled=opportunityCanLoad(idea)&&!aged;
        const label=aged?"REVISAR DE NUEVO":idea.status==="EN_ZONA"?"EN ZONA":idea.status==="ESPERAR_CONFIRMACION"?"ESPERAR RUPTURA":
          idea.status==="ESPERAR_RETEST"?"ESPERAR RETEST":idea.status==="PRECIO_EXTENDIDO"?"PRECIO EXTENDIDO":
          idea.status==="INVALIDADA"?"INVALIDADA":"DATOS ANTIGUOS";
        return <article key={pair} className="rounded-xl border border-cyan-400/15 bg-[#0b1621] p-3">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <b className="text-xs text-white">{pair} · <span className={idea.side==="LONG"?"text-emerald-300":"text-rose-300"}>{idea.side}</span></b>
            <span className={"text-[9px] font-black "+(enabled?"text-emerald-300":"text-amber-300")}>{label}</span>
          </div>
          <p className="mt-1 text-[9px] text-slate-500">{idea.pattern} · 15m · {idea.measured?"TP medido":"TP condicional"} · cierre {new Date(idea.closedAt).toLocaleTimeString()}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
            <div className="rounded bg-slate-950 p-2 text-slate-400">Zona de entrada
              <b className="mt-1 block font-mono text-cyan-200">{fmt(idea.entryLow)}–{fmt(idea.entryHigh)}</b>
            </div>
            <div className="rounded bg-slate-950 p-2 text-slate-400">Nivel de ruptura
              <b className="mt-1 block font-mono text-white">{fmt(idea.trigger)}</b>
            </div>
            <div className="rounded bg-slate-950 p-2 text-slate-400">Stop Loss
              <b className="mt-1 block font-mono text-rose-300">{fmt(idea.stop)}</b>
            </div>
            <div className="rounded bg-slate-950 p-2 text-slate-400">TP único
              <b className="mt-1 block font-mono text-emerald-300">{fmt(idea.takeProfit)}</b>
            </div>
          </div>
          <p className="mt-2 text-[9px] text-slate-300">{idea.condition}</p>
          <div className="mt-1 text-[9px] text-slate-500">R:R neto estimado 1:{idea.netRiskReward.toFixed(2)} · ROI aproximado {idea.estimatedRoiPct.toFixed(2)} % con 5x.</div>
          <details className="mt-2 text-[9px] text-slate-500">
            <summary className="cursor-pointer text-violet-300">Ver evidencias y condiciones</summary>
            {idea.checks.map((line,i)=><p key={i} className="mt-1">{line}</p>)}
            <p className="mt-1">{idea.reason}</p>
          </details>
          <div className="mt-3 flex gap-2">
            <button onClick={()=>onSelect(pair)} className="rounded border border-slate-700 px-2 py-1.5 text-[9px] text-slate-200">Ver gráfico</button>
            <button disabled={!enabled} onClick={()=>onPlan(idea)}
              title={enabled?"Copiar niveles a la orden PAPER para revisarlos antes de confirmar":"Requiere cierre confirmado, precio en zona y escaneo reciente"}
              className="rounded bg-cyan-400 px-2 py-1.5 text-[9px] font-black text-slate-950 disabled:bg-slate-800 disabled:text-slate-500">
              Cargar en ticket PAPER
            </button>
          </div>
        </article>;
      })}
      {Object.values(reads).every(read=>!read?.opportunity)&&
        <p className="col-span-full rounded-lg border border-slate-800 p-3 text-[10px] text-slate-400">
          No se encontró una configuración con figura o tendencia y relación R:R suficiente en las monedas revisadas. No se fabrican entradas cuando faltan condiciones.
        </p>}
    </div>}
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
