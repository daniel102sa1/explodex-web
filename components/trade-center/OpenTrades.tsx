"use client";
import{dur,money,move,px,roe}from"./fmt";

export default function X({rows,onChart}:{rows:any[];onChart:(x:any)=>void}){
  return <div className="grid gap-3 xl:grid-cols-2">{rows.map(p=>{
    const m=move(p.side,p.entry_price,p.mark_price),r=roe(p.unrealized_pnl,p.margin_used);
    const lane=p.trade_profile||p.strategy_mode||"—";
    const setup=p.phase||"—";
    return <article key={p.id} className="terminal-panel p-4">
      <div className="flex justify-between"><b>{p.symbol} <i className={p.side==="LONG"?"text-emerald-300":"text-rose-300"}>{p.side}</i></b><b>{p.leverage}x</b></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <span>Entrada {px(p.entry_price)}</span><span>Ahora {px(p.mark_price)}</span><span className="text-rose-300">SL {px(p.hard_stop||p.stop_loss)}</span>
        <span>TP1 {px(p.tp1||p.take_profit)}</span><span>TP2 {px(p.tp2)}</span><span>TP3 {px(p.tp3)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span>Lane <b className="text-slate-300">{lane}</b></span>
        <span>Setup <b className="text-slate-300">{setup}{p.pattern_score!=null?` · ${Number(p.pattern_score).toFixed(1)}`:""}</b></span>
        <span>Generación <b className="text-slate-300">{p.evaluation_generation||"—"}</b></span>
      </div>
      <div className="mt-3 text-xs">Precio {m.toFixed(2)}% · ROE {r==null?"—":r.toFixed(2)+"%"} · PnL {money(p.unrealized_pnl)} · {dur(p.opened_at,null)}</div>
      <button onClick={()=>onChart(p)} className="mt-3 rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-black text-cyan-200">Ver gráfico</button>
    </article>
  })}</div>
}