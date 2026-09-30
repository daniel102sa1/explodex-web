"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Eraser, Minus, MousePointer2, Sigma, TrendingUp, Triangle, Undo2 } from "lucide-react";
import type { Candle } from "@/lib/api";
import type { ChartPatternOverlay, ChartPlan } from "@/components/PriceChart";

type Tool = "select" | "trend" | "hline" | "fib" | "triangle";
type Point = { i: number; p: number };
type Drawing = { id: string; type: Exclude<Tool, "select">; points: Point[] };

function fmt(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined,{maximumFractionDigits:2});
  if (Math.abs(value) >= 1) return value.toLocaleString(undefined,{maximumFractionDigits:6});
  return value.toLocaleString(undefined,{maximumSignificantDigits:8});
}

function ema(values:number[],period:number){
  if(!values.length)return[];
  const a=2/(period+1); const out:number[]=[]; let x=values[0]; out.push(x);
  for(let i=1;i<values.length;i++){x=values[i]*a+x*(1-a);out.push(x)}
  return out;
}

function rsiSeries(values:number[],period=14){
  const out:(number|null)[]=Array(values.length).fill(null);
  if(values.length<=period)return out;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d}
  let ag=gains/period,al=losses/period;
  out[period]=al===0?100:100-100/(1+ag/al);
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1],g=Math.max(d,0),l=Math.max(-d,0);
    ag=(ag*(period-1)+g)/period; al=(al*(period-1)+l)/period;
    out[i]=al===0?100:100-100/(1+ag/al);
  }
  return out;
}

function macdSeries(values:number[]){
  const e12=ema(values,12),e26=ema(values,26);
  const line=values.map((_,i)=>e12[i]-e26[i]);
  const signal=ema(line,9);
  return {line,signal,hist:line.map((v,i)=>v-signal[i])};
}

function pathFrom(values:(number|null)[],x:(i:number)=>number,y:(v:number)=>number){
  let started=false; let d="";
  values.forEach((v,i)=>{if(v==null||!Number.isFinite(v))return;d+=(started?" L ":"M ")+x(i)+" "+y(v);started=true});
  return d;
}

export default function PracticePriceChart({
  candles,plan,livePrice,pattern,symbol
}:{
  candles:Candle[];plan?:ChartPlan;livePrice?:number;pattern?:ChartPatternOverlay;symbol:string
}){
  const [tool,setTool]=useState<Tool>("select");
  const [draft,setDraft]=useState<Point[]>([]);
  const [drawings,setDrawings]=useState<Drawing[]>([]);
  const [showEma,setShowEma]=useState(true);
  const [showRsi,setShowRsi]=useState(true);
  const [showMacd,setShowMacd]=useState(true);

  const storageKey="explodex.practice.drawings."+symbol.toUpperCase();
  useEffect(()=>{try{const raw=localStorage.getItem(storageKey);setDrawings(raw?JSON.parse(raw):[])}catch{setDrawings([])}setDraft([])},[storageKey]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(drawings))}catch{}},[storageKey,drawings]);

  const visible=candles.slice(-120);
  const width=1120,priceHeight=360,volumeHeight=70,gap=16,totalHeight=priceHeight+gap+volumeHeight;
  const left=54,right=18,plotRight=width-right,top=18;
  const last=Number(livePrice||visible.at(-1)?.close||0);
  const closes=visible.map((c,i)=>i===visible.length-1&&livePrice?Number(livePrice):Number(c.close));
  const e20=ema(closes,20),e50=ema(closes,50),rsi=rsiSeries(closes),macd=macdSeries(closes);

  const drawingPrices=drawings.flatMap(d=>d.points.map(p=>p.p)).concat(draft.map(p=>p.p));
  const planPrices=[plan?.trigger,plan?.entryLow,plan?.entryHigh,plan?.stop,plan?.tp1,plan?.tp2,plan?.tp3,plan?.invalidation,plan?.actualEntry]
    .map(Number).filter(v=>Number.isFinite(v)&&v>0);
  const high=Math.max(...visible.map(c=>c.high),last,...drawingPrices,...planPrices);
  const low=Math.min(...visible.map(c=>c.low),last,...drawingPrices,...planPrices);
  const span=Math.max(high-low,Math.abs(high)*.001,1e-9);
  const maxP=high+span*.08,minP=low-span*.08,priceSpan=maxP-minP;
  const slot=(plotRight-left)/Math.max(1,visible.length);
  const body=Math.max(2,Math.min(8,slot*.62));
  const x=(i:number)=>left+slot*i+slot/2;
  const y=(p:number)=>top+((maxP-p)/priceSpan)*(priceHeight-top*2);
  const invY=(py:number)=>maxP-((py-top)/(priceHeight-top*2))*priceSpan;
  const maxVol=Math.max(...visible.map(c=>c.volume),1);

  function clickChart(ev:MouseEvent<SVGSVGElement>){
    if(tool==="select")return;
    const rect=ev.currentTarget.getBoundingClientRect();
    const sx=(ev.clientX-rect.left)*(width/rect.width);
    const sy=(ev.clientY-rect.top)*(totalHeight/rect.height);
    if(sx<left||sx>plotRight||sy<top||sy>priceHeight-top)return;
    const idx=Math.max(0,Math.min(visible.length-1,Math.round((sx-left-slot/2)/slot)));
    const pt={i:idx,p:invY(sy)};
    if(tool==="hline"){setDrawings(v=>v.concat({id:String(Date.now()),type:"hline",points:[pt]}));return}
    const needed=tool==="triangle"?4:2;
    const next=draft.concat(pt);
    if(next.length>=needed){setDrawings(v=>v.concat({id:String(Date.now()),type:tool,points:next}));setDraft([])}
    else setDraft(next);
  }

  const rsiVals=rsi.filter((v):v is number=>v!=null);
  const rsiNow=rsiVals.at(-1)??null;
  const macdNow=macd.hist.at(-1)??0;
  const ema20Now=e20.at(-1)??last,ema50Now=e50.at(-1)??last;

  const planLevels=[
    ["AHORA",last,"#67e8f9"],["TRIGGER",Number(plan?.trigger||0),"#a78bfa"],["ENTRADA",Number(plan?.actualEntry||0),"#f472b6"],
    ["SL",Number(plan?.stop||0),"#fb7185"],["TP1",Number(plan?.tp1||0),"#34d399"],["TP2",Number(plan?.tp2||0),"#22d3ee"],["TP3",Number(plan?.tp3||0),"#60a5fa"]
  ].filter((r)=>Number(r[1])>0) as Array<[string,number,string]>;

  if(!visible.length)return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  return <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="text-sm font-black text-white">ExplodeX Chart · práctica</div>
        <div className="mt-1 text-[10px] text-slate-500">Haz clic sobre el gráfico para marcar estructura. Los dibujos se guardan por moneda en este navegador.</div>
      </div>
      <div className="flex flex-wrap gap-1">
        <ToolButton active={tool==="select"} onClick={()=>{setTool("select");setDraft([])}} icon={<MousePointer2 size={12}/>} label="Cursor"/>
        <ToolButton active={tool==="trend"} onClick={()=>{setTool("trend");setDraft([])}} icon={<TrendingUp size={12}/>} label="Tendencia"/>
        <ToolButton active={tool==="hline"} onClick={()=>{setTool("hline");setDraft([])}} icon={<Minus size={12}/>} label="Horizontal"/>
        <ToolButton active={tool==="fib"} onClick={()=>{setTool("fib");setDraft([])}} icon={<Sigma size={12}/>} label="Fibonacci"/>
        <ToolButton active={tool==="triangle"} onClick={()=>{setTool("triangle");setDraft([])}} icon={<Triangle size={12}/>} label="Triángulo"/>
        <button onClick={()=>setDrawings(v=>v.slice(0,-1))} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white" title="Deshacer"><Undo2 size={12}/></button>
        <button onClick={()=>{setDrawings([]);setDraft([])}} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-rose-300" title="Borrar dibujos"><Eraser size={12}/></button>
      </div>
    </div>

    <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
      <Toggle active={showEma} onClick={()=>setShowEma(v=>!v)} label={"EMA20/50 "+fmt(ema20Now)+" / "+fmt(ema50Now)}/>
      <Toggle active={showRsi} onClick={()=>setShowRsi(v=>!v)} label={"RSI14 "+(rsiNow==null?"—":rsiNow.toFixed(1))}/>
      <Toggle active={showMacd} onClick={()=>setShowMacd(v=>!v)} label={"MACD "+macdNow.toFixed(5)}/>
      {draft.length>0&&<span className="rounded-lg border border-amber-400/20 bg-amber-400/[.05] px-2 py-1 text-amber-200">Punto {draft.length} marcado · sigue haciendo clic</span>}
    </div>

    <svg viewBox={"0 0 "+width+" "+totalHeight} className={"h-auto w-full "+(tool==="select"?"cursor-default":"cursor-crosshair")} onClick={clickChart} role="img" aria-label="Gráfico de práctica con herramientas de dibujo">
      {[.2,.4,.6,.8].map(v=><line key={v} x1={left} x2={plotRight} y1={top+(priceHeight-top*2)*v} y2={top+(priceHeight-top*2)*v} stroke="rgba(148,163,184,.10)"/>)}
      {visible.map((c,i)=>{
        const xx=x(i),open=y(c.open),close=y(i===visible.length-1&&livePrice?Number(livePrice):c.close),hi=y(c.high),lo=y(c.low);
        const bull=(i===visible.length-1&&livePrice?Number(livePrice):c.close)>=c.open;
        const vh=(c.volume/maxVol)*volumeHeight,vy=priceHeight+gap+(volumeHeight-vh);
        return <g key={String(c.time)+"-"+i} className={bull?"text-emerald-400":"text-rose-400"}><line x1={xx} x2={xx} y1={hi} y2={lo} stroke="currentColor" strokeWidth="1.2"/><rect x={xx-body/2} y={Math.min(open,close)} width={body} height={Math.max(1.5,Math.abs(close-open))} fill="currentColor"/><rect x={xx-body/2} y={vy} width={body} height={vh} fill="currentColor" opacity=".22"/></g>
      })}
      {showEma&&<><path d={pathFrom(e50.map(v=>v),x,y)} fill="none" stroke="#f59e0b" strokeWidth="1.6"/><path d={pathFrom(e20.map(v=>v),x,y)} fill="none" stroke="#22d3ee" strokeWidth="1.8"/></>}
      {planLevels.map(([label,p,color])=><g key={label}><line x1={left} x2={plotRight} y1={y(p)} y2={y(p)} stroke={color} strokeDasharray={label==="AHORA"?"2 4":"6 5"} opacity=".75"/><text x={left+4} y={Math.max(10,y(p)-3)} fill={color} fontSize="9" fontWeight="800">{label+" "+fmt(p)}</text></g>)}
      {pattern&&pattern.level&&<><line x1={left} x2={plotRight} y1={y(Number(pattern.level))} y2={y(Number(pattern.level))} stroke="#c4b5fd" strokeDasharray="8 5"/><text x={left+4} y={y(Number(pattern.level))-4} fill="#c4b5fd" fontSize="9">{pattern.name.replaceAll("_"," ")}</text></>}
      {drawings.map(d=><DrawingShape key={d.id} drawing={d} x={x} y={y} left={left} right={plotRight}/>)}
      {draft.map((p,i)=><circle key={i} cx={x(p.i)} cy={y(p.p)} r="4" fill="#fbbf24"/>)}
      <line x1={left} x2={plotRight} y1={priceHeight+gap-6} y2={priceHeight+gap-6} stroke="rgba(148,163,184,.18)"/>
    </svg>

    <div className="mt-1 flex justify-between text-[9px] text-slate-600"><span>Low {fmt(low)}</span><span>{visible.length} velas · precio {fmt(last)}</span><span>High {fmt(high)}</span></div>

    {showRsi&&<RsiPanel values={rsi}/>}
    {showMacd&&<MacdPanel line={macd.line} signal={macd.signal} hist={macd.hist}/>}
  </div>;
}

function DrawingShape({drawing,x,y,left,right}:{drawing:Drawing;x:(i:number)=>number;y:(p:number)=>number;left:number;right:number}){
  const p=drawing.points;
  if(drawing.type==="hline")return <g><line x1={left} x2={right} y1={y(p[0].p)} y2={y(p[0].p)} stroke="#facc15" strokeWidth="1.4" strokeDasharray="5 4"/><text x={right-80} y={y(p[0].p)-4} fill="#fde047" fontSize="9">{fmt(p[0].p)}</text></g>;
  if(drawing.type==="trend")return <line x1={x(p[0].i)} y1={y(p[0].p)} x2={x(p[1].i)} y2={y(p[1].p)} stroke="#e879f9" strokeWidth="2"/>;
  if(drawing.type==="triangle")return <g><line x1={x(p[0].i)} y1={y(p[0].p)} x2={x(p[1].i)} y2={y(p[1].p)} stroke="#f59e0b" strokeWidth="2"/><line x1={x(p[2].i)} y1={y(p[2].p)} x2={x(p[3].i)} y2={y(p[3].p)} stroke="#38bdf8" strokeWidth="2"/></g>;
  if(drawing.type==="fib"){
    const a=p[0].p,b=p[1].p,d=b-a;
    const levels=[0,.236,.382,.5,.618,.786,1];
    return <g>{levels.map(l=>{const value=a+d*l;return <g key={l}><line x1={Math.min(x(p[0].i),x(p[1].i))} x2={right} y1={y(value)} y2={y(value)} stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 4" opacity=".72"/><text x={right-95} y={y(value)-3} fill="#c4b5fd" fontSize="8">{String(l)+" · "+fmt(value)}</text></g>})}</g>;
  }
  return null;
}

function RsiPanel({values}:{values:(number|null)[]}){
  const width=1120,height=115,left=54,right=18,top=10,bottom=15,plotRight=width-right;
  const slot=(plotRight-left)/Math.max(1,values.length);
  const x=(i:number)=>left+slot*i+slot/2,y=(v:number)=>top+((100-v)/100)*(height-top-bottom);
  return <div className="mt-3 rounded-xl border border-slate-800 bg-black/15 p-2"><div className="mb-1 text-[9px] font-black text-slate-500">RSI 14 · 70/30 son referencias, no órdenes automáticas</div><svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full"><line x1={left} x2={plotRight} y1={y(70)} y2={y(70)} stroke="#f59e0b" strokeDasharray="5 5" opacity=".45"/><line x1={left} x2={plotRight} y1={y(30)} y2={y(30)} stroke="#22d3ee" strokeDasharray="5 5" opacity=".45"/><line x1={left} x2={plotRight} y1={y(50)} y2={y(50)} stroke="#64748b" opacity=".22"/><path d={pathFrom(values,x,y)} fill="none" stroke="#a78bfa" strokeWidth="2"/></svg></div>
}

function MacdPanel({line,signal,hist}:{line:number[];signal:number[];hist:number[]}){
  const width=1120,height=125,left=54,right=18,top=10,bottom=15,plotRight=width-right;
  const all=line.concat(signal).concat(hist);const mx=Math.max(...all.map(Math.abs),1e-9);
  const slot=(plotRight-left)/Math.max(1,line.length),x=(i:number)=>left+slot*i+slot/2,y=(v:number)=>top+((mx-v)/(mx*2))*(height-top-bottom),zero=y(0);
  return <div className="mt-3 rounded-xl border border-slate-800 bg-black/15 p-2"><div className="mb-1 text-[9px] font-black text-slate-500">MACD 12/26/9 · momentum y cambio de ritmo</div><svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full"><line x1={left} x2={plotRight} y1={zero} y2={zero} stroke="#64748b" opacity=".3"/>{hist.map((v,i)=><rect key={i} x={x(i)-2} y={Math.min(zero,y(v))} width="4" height={Math.max(1,Math.abs(zero-y(v)))} fill={v>=0?"#34d399":"#fb7185"} opacity=".45"/>)}<path d={pathFrom(line,x,y)} fill="none" stroke="#22d3ee" strokeWidth="1.7"/><path d={pathFrom(signal,x,y)} fill="none" stroke="#f59e0b" strokeWidth="1.5"/></svg></div>
}

function ToolButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button onClick={onClick} className={"inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black "+(active?"border-cyan-400/35 bg-cyan-400/10 text-cyan-200":"border-slate-800 text-slate-500 hover:text-white")}>{icon}{label}</button>}
function Toggle({active,onClick,label}:{active:boolean;onClick:()=>void;label:string}){return <button onClick={onClick} className={"rounded-lg border px-2 py-1 "+(active?"border-violet-400/25 bg-violet-400/[.06] text-violet-200":"border-slate-800 text-slate-600")}>{label}</button>}
