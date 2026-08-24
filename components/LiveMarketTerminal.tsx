"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, CheckCircle2, CircleDashed, ExternalLink, Gauge, RadioTower, Search, ShieldAlert, Target, TimerReset, Zap } from "lucide-react";
import LiveCandleChart from "@/components/LiveCandleChart";
import { getAlerts, getLiveAnalysis, type AlertItem, type LiveAnalysis } from "@/lib/api";

type LiveTicker = { symbol: string; price: number; change24h: number; quoteVolume: number; bid: number; ask: number; flash: "up" | "down" | "flat"; flashAt: number };
type BookRow = { price: number; qty: number };
type TapeRow = { id: string; price: number; qty: number; side: "BUY" | "SELL"; at: number };

type MarketSource = "BINANCE_WS" | "OKX_WS" | "CONECTANDO";

const OKX_SYMBOLS = ["BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","LINK","SUI","LTC","BCH","TRX","DOT","NEAR","APT","ARB","OP","ATOM","FIL","ZEC","PEPE","WLD","AAVE","ENA","PENGU","FET","ICP","TON","ETC"];

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined,{maximumFractionDigits:2});
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined,{maximumFractionDigits:6});
  return n.toLocaleString(undefined,{maximumSignificantDigits:8});
}
function money(value?: number | null) { const n=Number(value??0); if(!Number.isFinite(n)) return "—"; if(Math.abs(n)>=1e9)return `$${(n/1e9).toFixed(2)}B`; if(Math.abs(n)>=1e6)return `$${(n/1e6).toFixed(2)}M`; if(Math.abs(n)>=1e3)return `$${(n/1e3).toFixed(1)}K`; return `$${n.toFixed(0)}`; }
function pct(value?: number | null) { if(value==null||!Number.isFinite(Number(value)))return "—"; const n=Number(value); return `${n>=0?"+":""}${n.toFixed(2)}%`; }
function phaseEs(value?: string) { const map:Record<string,string>={SIN_DATOS:"SIN DATOS",SIN_SETUP:"SIN SETUP",VIGILAR:"VIGILAR",PREACTIVACION:"PREACTIVACIÓN",VIGILAR_CONFIRMACION:"FALTA CONFIRMACIÓN",ACTIVADO:"ACTIVADO",ESPERAR_RETEST:"ESPERAR RETEST",VIGILAR_CONFLICTOS:"CONFLICTOS"}; return map[String(value??"").toUpperCase()]??String(value??"—"); }
function typeEs(value?: string) { const map:Record<string,string>={IMPULSO_LONG:"IMPULSO LONG",IMPULSO_SHORT:"IMPULSO SHORT",REBOTE_LONG:"REBOTE LONG",RECHAZO_SHORT:"RECHAZO SHORT",SIN_SETUP:"SIN SETUP"}; return map[String(value??"").toUpperCase()]??String(value??"—"); }
function duration(min?:number,max?:number){const f=(n:number)=>n>=60?`${(n/60).toFixed(n%60===0?0:1)} h`:`${n} min`;return min&&max?`${f(min)} – ${f(max)}`:"—";}

function setupConditions(a: LiveAnalysis) {
  const p=a.prediction; const m=a.metrics??{}; const s=p?.sequence??{}; if(!p)return [];
  const d=p.direction;
  return [
    {label:"Compresión",ready:Boolean(s.compressed)},
    {label:d==="LONG"?"Mínimos crecientes":"Máximos decrecientes",ready:d==="LONG"?Boolean(s.higher_lows):Boolean(s.lower_highs)},
    {label:"Volumen acelera",ready:Number(s.volume_acceleration??m.volume_acceleration??0)>=1.15},
    {label:"OI acompaña",ready:Math.abs(Number(m.oi_change_pct??0))>=.2||Math.abs(Number(a.coinglass?.open_interest?.change_15m_pct??0))>=.2},
    {label:"Futuros",ready:d==="LONG"?Number(m.futures_delta_ratio??0)>.04:Number(m.futures_delta_ratio??0)<-.04},
    {label:"Spot",ready:d==="LONG"?Number(m.spot_delta_ratio??0)>.03:Number(m.spot_delta_ratio??0)<-.03},
    {label:"Order book",ready:d==="LONG"?Number(m.order_book_imbalance??0)>.04:Number(m.order_book_imbalance??0)<-.04},
    {label:"BTC compatible",ready:d==="LONG"?m.btc_trend!=="BEARISH":m.btc_trend!=="BULLISH"},
    {label:"Trigger",ready:Boolean(p.trigger_hit)&&!Boolean(s.chase_risk)},
  ];
}

export default function LiveMarketTerminal(){
  const [rows,setRows]=useState<LiveTicker[]>([]); const dataRef=useRef(new Map<string,LiveTicker>());
  const [source,setSource]=useState<MarketSource>("CONECTANDO"); const [connected,setConnected]=useState(false);
  const [query,setQuery]=useState(""); const [sort,setSort]=useState<"volume"|"gainers"|"losers">("volume"); const [selected,setSelected]=useState("BTCUSDT");
  const [analysis,setAnalysis]=useState<LiveAnalysis|null>(null); const [analysisError,setAnalysisError]=useState<string|null>(null);
  const [bids,setBids]=useState<BookRow[]>([]); const [asks,setAsks]=useState<BookRow[]>([]); const [tape,setTape]=useState<TapeRow[]>([]); const [microSource,setMicroSource]=useState("CONECTANDO");
  const [alerts,setAlerts]=useState<AlertItem[]>([]);

  useEffect(()=>{
    let disposed=false; let ws:WebSocket|null=null; let gotBinance=false;
    const render=setInterval(()=>!disposed&&setRows(Array.from(dataRef.current.values())),250);
    const put=(x:Omit<LiveTicker,"flash"|"flashAt">)=>{const prev=dataRef.current.get(x.symbol); const flash=!prev?"flat":x.price>prev.price?"up":x.price<prev.price?"down":"flat"; dataRef.current.set(x.symbol,{...x,flash,flashAt:flash==="flat"?prev?.flashAt??0:Date.now()});};
    const okx=()=>{try{ws?.close()}catch{}; setSource("OKX_WS"); ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public"); ws.onopen=()=>{setConnected(true);ws?.send(JSON.stringify({op:"subscribe",args:OKX_SYMBOLS.map(c=>({channel:"tickers",instId:`${c}-USDT-SWAP`}))}))}; ws.onmessage=e=>{try{const p=JSON.parse(e.data);for(const i of p?.data??[]){const price=Number(i.last??0);if(!price)continue;const base=String(i.instId).split("-")[0];const open=Number(i.open24h??0);put({symbol:`${base}USDT`,price,change24h:open?((price-open)/open)*100:0,quoteVolume:Number(i.volCcy24h??0)*price,bid:Number(i.bidPx??0),ask:Number(i.askPx??0)})}}catch{}}; ws.onclose=()=>setConnected(false);};
    ws=new WebSocket("wss://fstream.binance.com/ws/!ticker@arr"); setSource("CONECTANDO"); ws.onopen=()=>{setConnected(true);setSource("BINANCE_WS")}; ws.onmessage=e=>{gotBinance=true;try{const p=JSON.parse(e.data);if(!Array.isArray(p))return;for(const i of p){const symbol=String(i.s??"");const price=Number(i.c??0);if(!symbol.endsWith("USDT")||symbol.includes("_")||!price)continue;put({symbol,price,change24h:Number(i.P??0),quoteVolume:Number(i.q??0),bid:Number(i.b??0),ask:Number(i.a??0)})}}catch{}}; ws.onerror=()=>{if(!gotBinance)okx()}; ws.onclose=()=>{setConnected(false);if(!disposed&&!gotBinance)okx()}; const fallback=setTimeout(()=>{if(!gotBinance)okx()},5000);
    return()=>{disposed=true;clearInterval(render);clearTimeout(fallback);try{ws?.close()}catch{}};
  },[]);

  useEffect(()=>{
    let cancelled=false; async function load(){try{const a=await getLiveAnalysis(selected);if(!cancelled){setAnalysis(a);setAnalysisError(null)}}catch(e){if(!cancelled)setAnalysisError(e instanceof Error?e.message:"Error de análisis")}}
    load(); const timer=setInterval(load,20_000); return()=>{cancelled=true;clearInterval(timer)};
  },[selected]);

  useEffect(()=>{let cancel=false;async function load(){try{const x=await getAlerts();if(!cancel)setAlerts(x.slice(-12).reverse())}catch{}}load();const t=setInterval(load,5000);return()=>{cancel=true;clearInterval(t)}},[]);

  useEffect(()=>{
    let disposed=false; let ws:WebSocket|null=null; let gotBinance=false; setBids([]);setAsks([]);setTape([]);setMicroSource("CONECTANDO");
    const pushTape=(row:TapeRow)=>setTape(cur=>[row,...cur].slice(0,30));
    const connectOkx=()=>{try{ws?.close()}catch{};const base=selected.replace(/USDT$/,'');setMicroSource("OKX");ws=new WebSocket("wss://ws.okx.com:8443/ws/v5/public");ws.onopen=()=>ws?.send(JSON.stringify({op:"subscribe",args:[{channel:"books5",instId:`${base}-USDT-SWAP`},{channel:"trades",instId:`${base}-USDT-SWAP`}]}));ws.onmessage=e=>{try{const p=JSON.parse(e.data);if(p?.arg?.channel==="books5"){const d=p.data?.[0];setBids((d?.bids??[]).map((r:any)=>({price:Number(r[0]),qty:Number(r[1])})).slice(0,8));setAsks((d?.asks??[]).map((r:any)=>({price:Number(r[0]),qty:Number(r[1])})).slice(0,8));}else if(p?.arg?.channel==="trades"){for(const r of p.data??[])pushTape({id:`${r.tradeId}-${r.ts}`,price:Number(r.px),qty:Number(r.sz),side:String(r.side).toUpperCase()==="BUY"?"BUY":"SELL",at:Number(r.ts)})}}catch{}};};
    const stream=`${selected.toLowerCase()}@depth20@100ms/${selected.toLowerCase()}@aggTrade`;ws=new WebSocket(`wss://fstream.binance.com/stream?streams=${stream}`);setMicroSource("BINANCE");ws.onmessage=e=>{gotBinance=true;try{const msg=JSON.parse(e.data);const d=msg.data??{};if(Array.isArray(d.b)||Array.isArray(d.a)){if(d.b)setBids(d.b.slice(0,8).map((r:any)=>({price:Number(r[0]),qty:Number(r[1])})));if(d.a)setAsks(d.a.slice(0,8).map((r:any)=>({price:Number(r[0]),qty:Number(r[1])})));}else if(d.e==="aggTrade"){pushTape({id:String(d.a??`${d.T}-${d.p}`),price:Number(d.p),qty:Number(d.q),side:d.m?"SELL":"BUY",at:Number(d.T)})}}catch{}};ws.onerror=()=>{if(!gotBinance)connectOkx()};const fb=setTimeout(()=>{if(!gotBinance)connectOkx()},4500);return()=>{disposed=true;clearTimeout(fb);try{ws?.close()}catch{}};
  },[selected]);

  const visible=useMemo(()=>{const q=query.trim().toUpperCase();const list=rows.filter(r=>!q||r.symbol.includes(q));if(sort==="gainers")list.sort((a,b)=>b.change24h-a.change24h);else if(sort==="losers")list.sort((a,b)=>a.change24h-b.change24h);else list.sort((a,b)=>b.quoteVolume-a.quoteVolume);return list.slice(0,80)},[rows,query,sort]);
  const prediction=analysis?.prediction; const conditions=analysis?setupConditions(analysis):[]; const ready=conditions.filter(x=>x.ready).length; const selectedTicker=dataRef.current.get(selected);
  const bidQty=bids.reduce((a,b)=>a+b.qty,0), askQty=asks.reduce((a,b)=>a+b.qty,0); const imbalance=(bidQty+askQty)>0?(bidQty-askQty)/(bidQty+askQty)*100:0;

  return <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
    <aside className="terminal-panel overflow-hidden xl:h-[calc(100vh-150px)]">
      <div className="border-b border-slate-800 p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black text-white"><RadioTower size={15} className="text-emerald-400"/> Mercado</div><span className={`status-pill ${connected?"status-ready":"status-watch"}`}>{source.replace("_WS","")}</span></div><label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2"><Search size={14} className="text-slate-500"/><input className="w-full bg-transparent text-xs text-white outline-none" placeholder="BTC, ENA, PENGU..." value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="mt-2 grid grid-cols-3 gap-1">{(["volume","gainers","losers"] as const).map(x=><button key={x} onClick={()=>setSort(x)} className={`rounded-lg border px-2 py-1.5 text-[10px] font-bold ${sort===x?"border-emerald-500/30 bg-emerald-500/10 text-emerald-200":"border-slate-800 text-slate-500"}`}>{x==="volume"?"Volumen":x==="gainers"?"Suben":"Bajan"}</button>)}</div></div>
      <div className="max-h-[570px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-[#07111d] text-[9px] uppercase tracking-[.1em] text-slate-600"><tr><th className="px-3 py-2 text-left">Par</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">24h</th></tr></thead><tbody>{visible.map(r=><tr key={r.symbol} onClick={()=>setSelected(r.symbol)} className={`cursor-pointer border-t border-slate-900 ${selected===r.symbol?"bg-emerald-500/[.07]":"hover:bg-slate-900/55"}`}><td className="px-3 py-2.5 font-black text-slate-200">{r.symbol}</td><td className={`mono-number px-3 py-2.5 text-right font-bold ${Date.now()-r.flashAt<700?(r.flash==="up"?"price-flash-up text-emerald-300":"price-flash-down text-rose-300"):"text-white"}`}>{fmt(r.price)}</td><td className={`px-3 py-2.5 text-right font-bold ${r.change24h>=0?"text-emerald-400":"text-rose-400"}`}>{pct(r.change24h)}</td></tr>)}</tbody></table></div>
    </aside>

    <main className="min-w-0 space-y-3">
      <section className="terminal-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3"><div><div className="flex items-center gap-2"><h1 className="text-xl font-black text-white">{selected}</h1>{prediction&&<span className={`status-pill ${prediction.direction==="LONG"?"status-long":"status-short"}`}>{typeEs(prediction.type)}</span>}{prediction&&<span className={`status-pill ${prediction.phase==="ACTIVADO"?"status-ready":prediction.phase==="PREACTIVACION"?"status-watch":"status-neutral"}`}>{phaseEs(prediction.phase)}</span>}</div><div className="mt-1 text-[11px] text-slate-500">Precio vivo · estructura + flujo + derivados + CoinGlass</div></div><div className="text-right"><div className="mono-number text-2xl font-black text-white">{fmt(selectedTicker?.price??analysis?.current_price)}</div><div className={`text-xs font-bold ${(selectedTicker?.change24h??0)>=0?"text-emerald-400":"text-rose-400"}`}>{pct(selectedTicker?.change24h)}</div></div></div><div className="p-3"><LiveCandleChart symbol={selected}/></div></section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="terminal-panel p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black text-white"><BookOpen size={15} className="text-cyan-300"/> Libro de órdenes</div><div className={`text-[10px] font-bold ${imbalance>5?"text-emerald-300":imbalance<-5?"text-rose-300":"text-slate-500"}`}>Imbalance {pct(imbalance)} · {microSource}</div></div><div className="space-y-1">{[...asks].reverse().map((r,i)=><Book key={`a${i}`} row={r} side="SELL" max={Math.max(...asks.map(x=>x.qty),1)}/>)}<div className="my-2 flex items-center justify-between border-y border-slate-800 py-2"><span className="text-[10px] text-slate-500">MID</span><span className="mono-number font-black text-white">{fmt(selectedTicker?.price??analysis?.current_price)}</span></div>{bids.map((r,i)=><Book key={`b${i}`} row={r} side="BUY" max={Math.max(...bids.map(x=>x.qty),1)}/>)}</div></div>
        <div className="terminal-panel p-4"><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black text-white"><Activity size={15} className="text-violet-300"/> Tape</div><span className="text-[10px] text-slate-600">trades agresivos</span></div><div className="max-h-[315px] space-y-1 overflow-auto">{tape.length?tape.map(t=><div key={t.id} className="grid grid-cols-[58px_1fr_1fr] items-center rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-900/55"><span className={t.side==="BUY"?"font-black text-emerald-400":"font-black text-rose-400"}>{t.side==="BUY"?"COMPRA":"VENTA"}</span><span className="mono-number text-right text-slate-200">{fmt(t.price)}</span><span className="mono-number text-right text-slate-500">{fmt(t.qty)}</span></div>):<div className="py-10 text-center text-xs text-slate-600">Esperando operaciones...</div>}</div></div>
      </section>
    </main>

    <aside className="space-y-3 xl:h-[calc(100vh-150px)] xl:overflow-auto">
      <section className="terminal-panel p-4">{analysis&&prediction?<><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-violet-300">Predictor previo</div><div className="mt-1 text-xl font-black text-white">{prediction.title??typeEs(prediction.type)}</div></div><Link href={`/coin/${selected}`} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white"><ExternalLink size={14}/></Link></div><div className="mt-4 grid grid-cols-3 gap-2"><Mini label="Preparación" value={`${prediction.preactivation_score.toFixed(1)}`} accent/><Mini label="Setup" value={analysis.setup_score.toFixed(1)}/><Mini label="Riesgo" value={analysis.risk_score.toFixed(1)}/></div><div className={`mt-3 rounded-xl border p-3 ${analysis.state==="READY"&&prediction.phase==="ACTIVADO"?"border-emerald-500/30 bg-emerald-500/[.07]":"border-amber-500/20 bg-amber-500/[.04]"}`}><div className="text-xs font-black text-white">{analysis.state==="READY"&&prediction.phase==="ACTIVADO"?"READY · ENTRADA HABILITADA":"NO ENTRAR TODAVÍA"}</div><div className="mt-1 text-[11px] leading-5 text-slate-400">{analysis.state==="READY"&&prediction.phase==="ACTIVADO"?"El trigger activó y el plan sigue vigente.":prediction.management?.before_trigger??"Esperar la secuencia."}</div></div><div className="mt-3 grid grid-cols-2 gap-2"><Plan label="Trigger" value={prediction.trigger_price}/><Plan label="Entrada" value={`${fmt(prediction.entry_low)}–${fmt(prediction.entry_high)}`}/><Plan label="Stop" value={prediction.stop_loss} danger/><Plan label="TP1" value={prediction.tp1} good/><Plan label="TP2" value={prediction.tp2} good/><Plan label="TP3" value={prediction.tp3} good/></div><div className="mt-3 grid grid-cols-2 gap-2"><Mini label="Duración" value={duration(prediction.expected_duration_min_minutes,prediction.expected_duration_max_minutes)}/><Mini label="Time stop" value={prediction.time_stop_minutes?`${prediction.time_stop_minutes} min`:"—"}/></div><div className="mt-4"><div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[.12em] text-slate-500"><span>Condiciones</span><span className="text-emerald-300">{ready}/{conditions.length}</span></div><div className="grid grid-cols-2 gap-1.5">{conditions.map(c=><div key={c.label} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] ${c.ready?"border-emerald-500/15 bg-emerald-500/[.04] text-emerald-200":"border-slate-800 text-slate-500"}`}>{c.ready?<CheckCircle2 size={12}/>:<CircleDashed size={12}/>} {c.label}</div>)}</div></div></>:<div className="py-10 text-center text-xs text-slate-500">{analysisError??"Calculando predicción..."}</div>}</section>

      <section className="terminal-panel p-4"><div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Gauge size={15} className="text-cyan-300"/> Flujo y derivados</div>{analysis?<div className="grid grid-cols-2 gap-2"><Mini label="OI CoinGlass" value={money(analysis.coinglass?.open_interest?.open_interest_usd)}/><Mini label="OI 15m" value={pct(analysis.coinglass?.open_interest?.change_15m_pct)}/><Mini label="Futuros" value={pct(Number(analysis.metrics?.futures_delta_ratio??0)*100)}/><Mini label="Spot" value={pct(Number(analysis.metrics?.spot_delta_ratio??0)*100)}/><Mini label="Taker" value={analysis.coinglass?.taker?.available?`${Number(analysis.coinglass?.taker?.buy_sell_ratio??1).toFixed(2)}x`:"—"}/><Mini label="Funding" value={pct(analysis.coinglass?.funding?.median_rate_pct)}/></div>:null}</section>

      <section className="terminal-panel p-4"><div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Bell size={15} className="text-amber-300"/> Eventos recientes</div><div className="space-y-2">{alerts.slice(0,6).map(a=><div key={a.id} className="rounded-xl border border-slate-800 bg-slate-950/45 p-2.5"><div className="flex items-center justify-between gap-2"><span className={`text-[10px] font-black ${a.severity==="READY"||a.severity==="ENTRY"?"text-emerald-300":a.severity==="EXIT"?"text-rose-300":"text-amber-200"}`}>{a.severity}</span><span className="text-[9px] text-slate-600">{new Date(a.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span></div><div className="mt-1 text-[11px] font-bold text-slate-200">{a.title}</div></div>)}{!alerts.length&&<div className="py-5 text-center text-xs text-slate-600">Sin eventos nuevos.</div>}</div></section>
    </aside>
  </div>;
}

function Mini({label,value,accent=false}:{label:string;value:string;accent?:boolean}){return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-2.5"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-xs font-black ${accent?"text-cyan-300":"text-slate-100"}`}>{value}</div></div>}
function Plan({label,value,danger=false,good=false}:{label:string;value:number|string|undefined;danger?:boolean;good?:boolean}){return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-2.5"><div className="text-[9px] text-slate-600">{label}</div><div className={`mono-number mt-1 text-xs font-black ${danger?"text-rose-300":good?"text-emerald-300":"text-white"}`}>{typeof value==="number"?fmt(value):value??"—"}</div></div>}
function Book({row,side,max}:{row:BookRow;side:"BUY"|"SELL";max:number}){const w=Math.max(3,(row.qty/max)*100);return <div className="relative grid grid-cols-2 overflow-hidden rounded-md px-2 py-1 text-[10px]"><div className={`absolute inset-y-0 ${side==="BUY"?"left-0 bg-emerald-500/[.08]":"right-0 bg-rose-500/[.08]"}`} style={{width:`${w}%`}}/><span className={`relative mono-number font-bold ${side==="BUY"?"text-emerald-300":"text-rose-300"}`}>{fmt(row.price)}</span><span className="relative mono-number text-right text-slate-500">{fmt(row.qty)}</span></div>}
