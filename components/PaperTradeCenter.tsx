"use client";
import{useEffect,useMemo,useState}from"react";
import{TradeScope,useTradeCenter}from"./trade-center/useTradeCenter";
import{useF}from"./trade-center/useFilters";
import Tabs from"./trade-center/Tabs";
import TradeFilters from"./trade-center/TradeFilters";
import SummaryView from"./trade-center/SummaryView";
import OpenTrades from"./trade-center/OpenTrades";
import ClosedTrades from"./trade-center/ClosedTrades";
import AllTrades from"./trade-center/AllTrades";
import Signals from"./trade-center/Signals";

export default function X(){
  const[scope,setScope]=useState<TradeScope>("arsenal");
  const{ s,h,g,c,e}=useTradeCenter(scope);
  const[tab,setTab]=useState("summary"),[p,setP]=useState<any>(null);

  useEffect(()=>{setP(null)},[scope]);
  useEffect(()=>{if(!p&&s?.open_positions?.[0])setP(s.open_positions[0])},[s,p]);

  const{f,setF,o,c:cl,q}=useF(s,h,g),
    gens=useMemo(()=>[...new Set([...h,...(s?.open_positions||[])].map((x:any)=>x.evaluation_generation).filter(Boolean))] as string[],[h,s]);

  return <div className="space-y-4">
    <div className="terminal-panel flex flex-wrap items-center justify-between gap-3 p-3">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.12em] text-cyan-300">
          {scope==="arsenal"?"Prueba limpia · arsenal nuevo":"Historial completo"}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {scope==="arsenal"
            ?"Solo se muestran operaciones desde que entró el arsenal 1/2/3 + AMD. Las anteriores siguen guardadas y no cuentan en estas estadísticas."
            :"Vista de auditoría: incluye también las operaciones anteriores al arsenal."}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={()=>setScope("arsenal")} className={`rounded-xl border px-3 py-2 text-xs font-black ${scope==="arsenal"?"border-cyan-400/40 bg-cyan-400/10 text-cyan-200":"border-slate-800 text-slate-500"}`}>Arsenal nuevo</button>
        <button onClick={()=>setScope("all")} className={`rounded-xl border px-3 py-2 text-xs font-black ${scope==="all"?"border-cyan-400/40 bg-cyan-400/10 text-cyan-200":"border-slate-800 text-slate-500"}`}>Ver anteriores</button>
      </div>
    </div>

    {!s?<div className="terminal-panel p-6">{e||"Cargando..."}</div>:<>
      <Tabs tab={tab} setTab={setTab} s={s} h={h} g={g}/>
      <TradeFilters f={f} setF={setF} gens={gens}/>
      {tab==="summary"?<SummaryView s={s} h={h} c={c} p={p} setP={setP}/>
        :tab==="open"?<OpenTrades rows={o} onChart={setP}/>
        :tab==="closed"?<ClosedTrades rows={cl}/>
        :tab==="all"?<AllTrades o={o} c={cl}/>
        :<Signals rows={q}/>}
    </>}
  </div>
}
