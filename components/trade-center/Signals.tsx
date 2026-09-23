import{parseReason,px}from"./fmt";

export default function X({rows}:{rows:any[]}){
  return <div className="grid gap-2">{rows.map(s=>{
    const r=parseReason(s.reason),p=parseReason(r.prediction),a=parseReason(p.technical_arsenal);
    const heart=parseReason(p.explodex_heart),decision=parseReason(heart.action_decision),event=parseReason(heart.market_event);
    const action=decision.action||heart.action||"—",marketEvent=event.event||"—",bias=a.aggregate_bias||"—";
    return <div key={s.id} className="terminal-panel p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <b>{s.symbol} · {s.direction}</b>
        <i className="text-cyan-300">{p.phase||s.state}</i>
        <span className={s.was_executed?"text-emerald-300":"text-slate-500"}>{s.was_executed?"EJECUTADA":"SOLO SEÑAL"}</span>
      </div>
      <div className="mt-1 text-slate-500">setup {s.setup_score} · risk {s.risk_score} · arsenal {bias} · Heart {action} · evento {marketEvent}</div>
      <div className="mt-1">Entrada {px(s.entry_low)}–{px(s.entry_high)} · SL {px(s.stop_loss)} · TP1 {px(s.tp1)} · TP2 {px(s.tp2)} · TP3 {px(s.tp3)}</div>
      {s.was_executed&&<div className="mt-1 text-slate-500">PAPER {s.paper_trade_status||"—"}{s.paper_exit_reason?` · ${String(s.paper_exit_reason).replaceAll("_"," ")}`:""}</div>}
    </div>
  })}</div>
}