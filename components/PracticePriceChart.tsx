"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Eraser, Minus, MousePointer2, Sigma, TrendingUp, Triangle, Undo2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import type { Candle } from "@/lib/api";
import type { ChartPatternOverlay, ChartPlan } from "@/components/PriceChart";

type Tool = "select"|"trend"|"hline"|"fib"|"triangle"|"channel"|"rect"|"abcd"|"xabcd"|"hch"|"ruler"|"longpos"|"shortpos";
type Point={t:number;p:number};
type Drawing={id:string;type:Exclude<Tool,"select">;points:Point[]};

function fmt(v:number){if(!Number.isFinite(v))return"—";if(Math.abs(v)>=1000)return v.toLocaleString(undefined,{maximumFractionDigits:2});if(Math.abs(v)>=1)return v.toLocaleString(undefined,{maximumFractionDigits:6});return v.toLocaleString(undefined,{maximumSignificantDigits:8})}
function ema(v:number[],p:number){if(!v.length)return[];const a=2/(p+1),o:number[]=[];let x=v[0];o.push(x);for(let i=1;i<v.length;i++){x=v[i]*a+x*(1-a);o.push(x)}return o}
function rsiSeries(v:number[],p=14){const o:(number|null)[]=Array(v.length).fill(null);if(v.length<=p)return o;let g=0,l=0;for(let i=1;i<=p;i++){const d=v[i]-v[i-1];if(d>=0)g+=d;else l-=d}let ag=g/p,al=l/p;o[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p;o[i]=al===0?100:100-100/(1+ag/al)}return o}
function macdSeries(v:number[]){const a=ema(v,12),b=ema(v,26),line=v.map((_,i)=>a[i]-b[i]),signal=ema(line,9);return{line,signal,hist:line.map((x,i)=>x-signal[i])}}
function pathFrom(v:(number|null)[],x:(i:number)=>number,y:(v:number)=>number){let s=false,d="";v.forEach((n,i)=>{if(n==null||!Number.isFinite(n))return;d+=(s?" L ":"M ")+x(i)+" "+y(n);s=true});return d}

const POINTS:Record<Exclude<Tool,"select">,number>={trend:2,hline:1,fib:2,triangle:4,channel:3,rect:2,abcd:4,xabcd:5,hch:5,ruler:2,longpos:3,shortpos:3};

export default function PracticePriceChart({candles,plan,livePrice,pattern,symbol,interval}:{candles:Candle[];plan?:ChartPlan;livePrice?:number;pattern?:ChartPatternOverlay;symbol:string;interval:string}){
  const [tool,setTool]=useState<Tool>("select");
  const [draft,setDraft]=useState<Point[]>([]);
  const [drawings,setDrawings]=useState<Drawing[]>([]);
  const [showEma,setShowEma]=useState(true);
  const [showRsi,setShowRsi]=useState(true);
  const [showMacd,setShowMacd]=useState(true);
  const [windowSize,setWindowSize]=useState(96);
  const [pan,setPan]=useState(0);

  const storageKey="explodex.practice.drawings."+symbol.toUpperCase()+"."+interval;
  useEffect(()=>{try{const raw=localStorage.getItem(storageKey);setDrawings(raw?JSON.parse(raw):[])}catch{setDrawings([])}setDraft([]);setPan(0)},[storageKey]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(drawings))}catch{}},[storageKey,drawings]);

  const end=Math.max(1,candles.length-pan);
  const start=Math.max(0,end-windowSize);
  const visible=candles.slice(start,end);
  const width=1120,priceHeight=370,volumeHeight=70,gap=16,totalHeight=priceHeight+gap+volumeHeight,left=54,right=18,plotRight=width-right,top=18;
  const last=Number(livePrice||visible.at(-1)?.close||0);
  const closes=visible.map((c,i)=>i===visible.length-1&&pan===0&&livePrice?Number(livePrice):Number(c.close));
  const e20=ema(closes,20),e50=ema(closes,50),rsi=rsiSeries(closes),macd=macdSeries(closes);

  if(!visible.length)return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  const drawingPrices=drawings.flatMap(d=>d.points.map(p=>p.p)).concat(draft.map(p=>p.p));
  const planPrices=[plan?.trigger,plan?.entryLow,plan?.entryHigh,plan?.stop,plan?.tp1,plan?.tp2,plan?.tp3,plan?.invalidation,plan?.actualEntry].map(Number).filter(v=>Number.isFinite(v)&&v>0);
  const high=Math.max(...visible.map(c=>c.high),last,...drawingPrices,...planPrices),low=Math.min(...visible.map(c=>c.low),last,...drawingPrices,...planPrices);
  const span=Math.max(high-low,Math.abs(high)*.001,1e-9),maxP=high+span*.08,minP=low-span*.08,priceSpan=maxP-minP;
  const slot=(plotRight-left)/Math.max(1,visible.length),body=Math.max(2,Math.min(8,slot*.62));
  const x=(i:number)=>left+slot*i+slot/2;
  const firstT=Number(visible[0].time),lastT=Number(visible.at(-1)?.time||firstT+1),timeSpan=Math.max(1,lastT-firstT);
  const xt=(t:number)=>left+((t-firstT)/timeSpan)*(plotRight-left);
  const y=(p:number)=>top+((maxP-p)/priceSpan)*(priceHeight-top*2);
  const invY=(py:number)=>maxP-((py-top)/(priceHeight-top*2))*priceSpan;
  const maxVol=Math.max(...visible.map(c=>c.volume),1);

  function choose(next:Tool){setTool(next);setDraft([])}
  function clickChart(ev:MouseEvent<SVGSVGElement>){
    if(tool==="select")return;
    const rect=ev.currentTarget.getBoundingClientRect(),sx=(ev.clientX-rect.left)*(width/rect.width),sy=(ev.clientY-rect.top)*(totalHeight/rect.height);
    if(sx<left||sx>plotRight||sy<top||sy>priceHeight-top)return;
    const idx=Math.max(0,Math.min(visible.length-1,Math.round((sx-left-slot/2)/slot))),pt={t:Number(visible[idx].time),p:invY(sy)};
    const kind=tool as Exclude<Tool,"select">,next=draft.concat(pt);
    if(next.length>=POINTS[kind]){setDrawings(v=>v.concat({id:String(Date.now()),type:kind,points:next}));setDraft([])}else setDraft(next);
  }

  const rsiNow=rsi.filter((v):v is number=>v!=null).at(-1)??null,macdNow=macd.hist.at(-1)??0,ema20Now=e20.at(-1)??last,ema50Now=e50.at(-1)??last;
  const planLevels=[["AHORA",last,"#67e8f9"],["TRIGGER",Number(plan?.trigger||0),"#a78bfa"],["ENTRADA",Number(plan?.actualEntry||0),"#f472b6"],["SL",Number(plan?.stop||0),"#fb7185"],["TP1",Number(plan?.tp1||0),"#34d399"],["TP2",Number(plan?.tp2||0),"#22d3ee"],["TP3",Number(plan?.tp3||0),"#60a5fa"]].filter(r=>Number(r[1])>0) as Array<[string,number,string]>;

  return <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><div className="text-sm font-black text-white">ExplodeX Chart · mesa de práctica</div><div className="mt-1 text-[10px] text-slate-500">Dibujos guardados por moneda + temporalidad. Clics sobre el gráfico = puntos de la herramienta.</div></div>
      <div className="flex items-center gap-1">
        <button onClick={()=>setPan(Math.min(Math.max(0,candles.length-windowSize),pan+Math.max(8,Math.floor(windowSize/4))))} className="tool-mini"><ChevronLeft size={12}/></button>
        <button onClick={()=>setPan(Math.max(0,pan-Math.max(8,Math.floor(windowSize/4))))} className="tool-mini"><ChevronRight size={12}/></button>
        <button onClick={()=>setWindowSize(v=>Math.max(36,v-20))} className="tool-mini"><ZoomIn size={12}/></button>
        <button onClick={()=>setWindowSize(v=>Math.min(240,v+20))} className="tool-mini"><ZoomOut size={12}/></button>
      </div>
    </div>

    <div className="mb-2 flex flex-wrap gap-1">
      <ToolButton active={tool==="select"} onClick={()=>choose("select")} icon={<MousePointer2 size={11}/>} label="Cursor"/>
      <ToolButton active={tool==="trend"} onClick={()=>choose("trend")} icon={<TrendingUp size={11}/>} label="Tendencia"/>
      <ToolButton active={tool==="hline"} onClick={()=>choose("hline")} icon={<Minus size={11}/>} label="Horizontal"/>
      <ToolButton active={tool==="channel"} onClick={()=>choose("channel")} label="Canal"/>
      <ToolButton active={tool==="rect"} onClick={()=>choose("rect")} label="Rectángulo"/>
      <ToolButton active={tool==="fib"} onClick={()=>choose("fib")} icon={<Sigma size={11}/>} label="Fib + ext."/>
      <ToolButton active={tool==="ruler"} onClick={()=>choose("ruler")} label="Regla"/>
      <ToolButton active={tool==="triangle"} onClick={()=>choose("triangle")} icon={<Triangle size={11}/>} label="Triángulo"/>
      <ToolButton active={tool==="hch"} onClick={()=>choose("hch")} label="HCH"/>
      <ToolButton active={tool==="abcd"} onClick={()=>choose("abcd")} label="ABCD"/>
      <ToolButton active={tool==="xabcd"} onClick={()=>choose("xabcd")} label="XABCD"/>
      <ToolButton active={tool==="longpos"} onClick={()=>choose("longpos")} label="Long Pos."/>
      <ToolButton active={tool==="shortpos"} onClick={()=>choose("shortpos")} label="Short Pos."/>
      <button onClick={()=>setDrawings(v=>v.slice(0,-1))} className="tool-mini" title="Deshacer"><Undo2 size={12}/></button>
      <button onClick={()=>{setDrawings([]);setDraft([])}} className="tool-mini hover:text-rose-300" title="Borrar"><Eraser size={12}/></button>
    </div>

    <div className="mb-2 flex flex-wrap gap-1.5 text-[10px]">
      <Toggle active={showEma} onClick={()=>setShowEma(v=>!v)} label={"EMA20/50 "+fmt(ema20Now)+" / "+fmt(ema50Now)}/>
      <Toggle active={showRsi} onClick={()=>setShowRsi(v=>!v)} label={"RSI14 "+(rsiNow==null?"—":rsiNow.toFixed(1))}/>
      <Toggle active={showMacd} onClick={()=>setShowMacd(v=>!v)} label={"MACD "+macdNow.toFixed(5)}/>
      <span className="rounded-lg border border-slate-800 px-2 py-1 text-slate-600">{visible.length} velas · desplazamiento {pan}</span>
      {draft.length>0&&<span className="rounded-lg border border-amber-400/20 bg-amber-400/[.05] px-2 py-1 text-amber-200">Punto {draft.length}/{POINTS[tool as Exclude<Tool,"select">]||0} · continúa</span>}
    </div>

    <svg viewBox={"0 0 "+width+" "+totalHeight} className={"h-auto w-full "+(tool==="select"?"cursor-default":"cursor-crosshair")} onClick={clickChart}>
      {[.2,.4,.6,.8].map(v=><line key={v} x1={left} x2={plotRight} y1={top+(priceHeight-top*2)*v} y2={top+(priceHeight-top*2)*v} stroke="rgba(148,163,184,.10)"/>)}
      {visible.map((c,i)=>{const xx=x(i),op=y(c.open),cl=y(i===visible.length-1&&pan===0&&livePrice?Number(livePrice):c.close),hi=y(c.high),lo=y(c.low),bull=(i===visible.length-1&&pan===0&&livePrice?Number(livePrice):c.close)>=c.open,vh=(c.volume/maxVol)*volumeHeight,vy=priceHeight+gap+(volumeHeight-vh);return <g key={String(c.time)+"-"+i} className={bull?"text-emerald-400":"text-rose-400"}><line x1={xx} x2={xx} y1={hi} y2={lo} stroke="currentColor" strokeWidth="1.2"/><rect x={xx-body/2} y={Math.min(op,cl)} width={body} height={Math.max(1.5,Math.abs(cl-op))} fill="currentColor"/><rect x={xx-body/2} y={vy} width={body} height={vh} fill="currentColor" opacity=".22"/></g>})}
      {showEma&&<><path d={pathFrom(e50,x,y)} fill="none" stroke="#f59e0b" strokeWidth="1.6"/><path d={pathFrom(e20,x,y)} fill="none" stroke="#22d3ee" strokeWidth="1.8"/></>}
      {planLevels.map(([label,p,color])=><g key={label}><line x1={left} x2={plotRight} y1={y(p)} y2={y(p)} stroke={color} strokeDasharray={label==="AHORA"?"2 4":"6 5"} opacity=".72"/><text x={left+4} y={Math.max(10,y(p)-3)} fill={color} fontSize="9" fontWeight="800">{label+" "+fmt(p)}</text></g>)}
      {pattern&&pattern.level&&<><line x1={left} x2={plotRight} y1={y(Number(pattern.level))} y2={y(Number(pattern.level))} stroke="#c4b5fd" strokeDasharray="8 5"/><text x={left+4} y={y(Number(pattern.level))-4} fill="#c4b5fd" fontSize="9">{pattern.name.replaceAll("_"," ")}</text></>}
      {drawings.map(d=><DrawingShape key={d.id} drawing={d} xt={xt} y={y} left={left} right={plotRight}/>)}
      {draft.map((p,i)=><circle key={i} cx={xt(p.t)} cy={y(p.p)} r="4" fill="#fbbf24"/>)}
      <line x1={left} x2={plotRight} y1={priceHeight+gap-6} y2={priceHeight+gap-6} stroke="rgba(148,163,184,.18)"/>
    </svg>

    <div className="mt-1 flex justify-between text-[9px] text-slate-600"><span>Low {fmt(low)}</span><span>{interval.toUpperCase()} · {fmt(last)}</span><span>High {fmt(high)}</span></div>
    {showRsi&&<RsiPanel values={rsi}/>}
    {showMacd&&<MacdPanel line={macd.line} signal={macd.signal} hist={macd.hist}/>}
    <style jsx>{".tool-mini{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgb(30 41 59);border-radius:.5rem;padding:.45rem;color:rgb(100 116 139)}"}</style>
  </div>;
}

function DrawingShape({drawing,xt,y,left,right}:{drawing:Drawing;xt:(t:number)=>number;y:(p:number)=>number;left:number;right:number}){
  const p=drawing.points,P=(i:number)=>({x:xt(p[i].t),y:y(p[i].p)});
  if(drawing.type==="hline")return <g><line x1={left} x2={right} y1={P(0).y} y2={P(0).y} stroke="#facc15" strokeWidth="1.4" strokeDasharray="5 4"/><text x={right-90} y={P(0).y-4} fill="#fde047" fontSize="9">{fmt(p[0].p)}</text></g>;
  if(drawing.type==="trend")return <line x1={P(0).x} y1={P(0).y} x2={P(1).x} y2={P(1).y} stroke="#e879f9" strokeWidth="2"/>;
  if(drawing.type==="triangle")return <g><line x1={P(0).x} y1={P(0).y} x2={P(1).x} y2={P(1).y} stroke="#f59e0b" strokeWidth="2"/><line x1={P(2).x} y1={P(2).y} x2={P(3).x} y2={P(3).y} stroke="#38bdf8" strokeWidth="2"/></g>;
  if(drawing.type==="rect"){const a=P(0),b=P(1);return <rect x={Math.min(a.x,b.x)} y={Math.min(a.y,b.y)} width={Math.abs(a.x-b.x)} height={Math.abs(a.y-b.y)} fill="rgba(56,189,248,.07)" stroke="#38bdf8" strokeWidth="1.5"/>}
  if(drawing.type==="channel"){const a=P(0),b=P(1),c=P(2),dx=b.x-a.x,dy=b.y-a.y;return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#22d3ee" strokeWidth="1.8"/><line x1={c.x} y1={c.y} x2={c.x+dx} y2={c.y+dy} stroke="#22d3ee" strokeWidth="1.8"/><line x1={a.x} y1={a.y} x2={c.x} y2={c.y} stroke="#22d3ee" opacity=".25"/><line x1={b.x} y1={b.y} x2={c.x+dx} y2={c.y+dy} stroke="#22d3ee" opacity=".25"/></g>}
  if(drawing.type==="fib"){const a=p[0].p,b=p[1].p,d=b-a,levels=[0,.236,.382,.5,.618,.786,1,1.272,1.618];return <g>{levels.map(l=>{const v=a+d*l;return <g key={l}><line x1={Math.min(P(0).x,P(1).x)} x2={right} y1={y(v)} y2={y(v)} stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 4" opacity=".72"/><text x={right-105} y={y(v)-3} fill="#c4b5fd" fontSize="8">{String(l)+" · "+fmt(v)}</text></g>})}</g>}
  if(drawing.type==="ruler"){const a=P(0),b=P(1),change=(p[1].p-p[0].p)/p[0].p*100;return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f8fafc" strokeDasharray="3 3"/><rect x={(a.x+b.x)/2-48} y={(a.y+b.y)/2-12} width="96" height="20" rx="5" fill="rgba(2,6,23,.9)" stroke="#64748b"/><text x={(a.x+b.x)/2-40} y={(a.y+b.y)/2+2} fill="#e2e8f0" fontSize="9">{(change>=0?"+":"")+change.toFixed(2)+"%"}</text></g>}
  if(drawing.type==="abcd"||drawing.type==="xabcd"||drawing.type==="hch"){const labels=drawing.type==="abcd"?["A","B","C","D"]:drawing.type==="xabcd"?["X","A","B","C","D"]:["H1","N1","CABEZA","N2","H2"];const pts=p.map((q,i)=>P(i));return <g><polyline points={pts.map(q=>q.x+","+q.y).join(" ")} fill="none" stroke={drawing.type==="hch"?"#fb7185":"#fbbf24"} strokeWidth="2"/>{pts.map((q,i)=><g key={i}><circle cx={q.x} cy={q.y} r="3" fill="#0f172a" stroke="#fbbf24"/><text x={q.x+5} y={q.y-6} fill="#fde68a" fontSize="9" fontWeight="800">{labels[i]}</text></g>)}{drawing.type==="hch"&&<line x1={pts[1].x} y1={pts[1].y} x2={pts[3].x} y2={pts[3].y} stroke="#c084fc" strokeDasharray="5 4"/>}</g>}
  if(drawing.type==="longpos"||drawing.type==="shortpos"){const entry=p[0].p,stop=p[1].p,target=p[2].p,x1=Math.min(P(0).x,P(1).x,P(2).x),x2=Math.max(P(0).x,P(1).x,P(2).x),rr=Math.abs(target-entry)/Math.max(1e-12,Math.abs(entry-stop));const targetTop=Math.min(y(entry),y(target)),targetH=Math.abs(y(entry)-y(target)),stopTop=Math.min(y(entry),y(stop)),stopH=Math.abs(y(entry)-y(stop));return <g><rect x={x1} y={targetTop} width={Math.max(50,x2-x1)} height={targetH} fill="rgba(52,211,153,.12)" stroke="#34d399"/><rect x={x1} y={stopTop} width={Math.max(50,x2-x1)} height={stopH} fill="rgba(251,113,133,.12)" stroke="#fb7185"/><line x1={x1} x2={Math.max(x1+50,x2)} y1={y(entry)} y2={y(entry)} stroke="#f8fafc"/><text x={x1+5} y={y(entry)-5} fill="#f8fafc" fontSize="9">R:R 1:{rr.toFixed(2)}</text></g>}
  return null;
}

function RsiPanel({values}:{values:(number|null)[]}){const width=1120,height=115,left=54,right=18,top=10,bottom=15,plotRight=width-right,slot=(plotRight-left)/Math.max(1,values.length),x=(i:number)=>left+slot*i+slot/2,y=(v:number)=>top+((100-v)/100)*(height-top-bottom);return <div className="mt-3 rounded-xl border border-slate-800 bg-black/15 p-2"><div className="mb-1 text-[9px] font-black text-slate-500">RSI 14 · 70/30 son referencias, no órdenes automáticas</div><svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full"><line x1={left} x2={plotRight} y1={y(70)} y2={y(70)} stroke="#f59e0b" strokeDasharray="5 5" opacity=".45"/><line x1={left} x2={plotRight} y1={y(30)} y2={y(30)} stroke="#22d3ee" strokeDasharray="5 5" opacity=".45"/><line x1={left} x2={plotRight} y1={y(50)} y2={y(50)} stroke="#64748b" opacity=".22"/><path d={pathFrom(values,x,y)} fill="none" stroke="#a78bfa" strokeWidth="2"/></svg></div>}
function MacdPanel({line,signal,hist}:{line:number[];signal:number[];hist:number[]}){const width=1120,height=125,left=54,right=18,top=10,bottom=15,plotRight=width-right,all=line.concat(signal).concat(hist),mx=Math.max(...all.map(Math.abs),1e-9),slot=(plotRight-left)/Math.max(1,line.length),x=(i:number)=>left+slot*i+slot/2,y=(v:number)=>top+((mx-v)/(mx*2))*(height-top-bottom),zero=y(0);return <div className="mt-3 rounded-xl border border-slate-800 bg-black/15 p-2"><div className="mb-1 text-[9px] font-black text-slate-500">MACD 12/26/9 · momentum y cambio de ritmo</div><svg viewBox={"0 0 "+width+" "+height} className="h-auto w-full"><line x1={left} x2={plotRight} y1={zero} y2={zero} stroke="#64748b" opacity=".3"/>{hist.map((v,i)=><rect key={i} x={x(i)-2} y={Math.min(zero,y(v))} width="4" height={Math.max(1,Math.abs(zero-y(v)))} fill={v>=0?"#34d399":"#fb7185"} opacity=".45"/>)}<path d={pathFrom(line,x,y)} fill="none" stroke="#22d3ee" strokeWidth="1.7"/><path d={pathFrom(signal,x,y)} fill="none" stroke="#f59e0b" strokeWidth="1.5"/></svg></div>}
function ToolButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon?:React.ReactNode;label:string}){return <button onClick={onClick} className={"inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[9px] font-black "+(active?"border-cyan-400/35 bg-cyan-400/10 text-cyan-200":"border-slate-800 text-slate-500 hover:text-white")}>{icon}{label}</button>}
function Toggle({active,onClick,label}:{active:boolean;onClick:()=>void;label:string}){return <button onClick={onClick} className={"rounded-lg border px-2 py-1 "+(active?"border-violet-400/25 bg-violet-400/[.06] text-violet-200":"border-slate-800 text-slate-600")}>{label}</button>}
