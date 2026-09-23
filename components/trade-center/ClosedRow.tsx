import{dt,dur,money,move,n,px,roe}from"./fmt";

export default function R({r}:{r:any}){
  const m=r.exit_price?move(r.side,r.entry_price,r.exit_price):0;
  const q=roe(n(r.net_pnl),r.margin_used),z=n(r.actual_stop_risk_usdt||r.risk_usdt);
  const lane=r.trade_profile||r.strategy_mode||r.phase||"—";
  const mfe=r.mfe_pct==null?"—":Number(r.mfe_pct).toFixed(2)+"%";
  const mae=r.mae_pct==null?"—":Number(r.mae_pct).toFixed(2)+"%";
  return <tr className="border-t border-slate-900">
    <td className="p-3 font-black">{r.symbol}</td><td>{r.side}</td><td>{px(r.entry_price)}</td><td>{px(r.exit_price)}</td><td>{m.toFixed(2)}%</td>
    <td className={n(r.net_pnl)>=0?"text-emerald-300":"text-rose-300"}>{money(r.net_pnl)}</td>
    <td>{q==null?"—":q.toFixed(2)+"%"}</td><td>{z?(n(r.net_pnl)/z).toFixed(2)+"R":"—"}</td>
    <td className="text-emerald-300">{mfe}</td><td className="text-rose-300">{mae}</td>
    <td>{dt(r.opened_at)}</td><td>{dt(r.closed_at)}</td><td>{dur(r.opened_at,r.closed_at)}</td>
    <td>{String(r.exit_reason||"—").replaceAll("_"," ")}</td><td>{lane}</td><td>{r.evaluation_generation||"—"}</td>
  </tr>
}