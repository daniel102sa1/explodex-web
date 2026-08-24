import { BarChart3, ShieldCheck } from "lucide-react";
import { getCalibration, getPerformance } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [performance, calibration] = await Promise.all([
    getPerformance().catch(() => null),
    getCalibration().catch(() => null),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-300"><BarChart3 size={16}/> Estadísticas</div>
      <h1 className="mt-2 text-3xl font-black text-white">Validación del sistema</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-400">Aquí medimos si los niveles realmente funcionan con suficiente muestra de paper trading.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trades cerrados" value={String(performance?.closed_trades ?? 0)} />
        <Stat label="Win rate" value={performance?.win_rate_pct == null ? "Sin muestra" : `${performance.win_rate_pct}%`} />
        <Stat label="Profit factor" value={performance?.profit_factor == null ? "—" : performance.profit_factor.toFixed(2)} />
        <Stat label="Drawdown máx." value={performance ? `${performance.max_drawdown_pct.toFixed(2)}%` : "—"} />
        <Stat label="Expectancy/trade" value={performance?.expectancy_usdt_per_trade == null ? "—" : `${performance.expectancy_usdt_per_trade.toFixed(2)} USDT`} />
        <Stat label="Promedio R" value={performance?.average_r == null ? "—" : performance.average_r.toFixed(2)} />
        <Stat label="Equity virtual" value={performance ? `${performance.current_equity_usdt.toFixed(2)} USDT` : "—"} />
        <Stat label="PnL neto" value={performance ? `${performance.net_pnl_usdt.toFixed(2)} USDT` : "—"} />
      </section>

      <section className="mt-10">
        <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-emerald-400"/><h2 className="text-xl font-black text-white">Calibración por score</h2></div>
        <p className="mt-2 text-sm text-slate-500">La tasa observada no se muestra como estimación usable hasta reunir al menos 30 operaciones cerradas en el rango.</p>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-800 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Score</th><th className="px-4 py-3">Muestra</th><th className="px-4 py-3">Wins</th><th className="px-4 py-3">Win rate observado</th><th className="px-4 py-3">PnL</th><th className="px-4 py-3">Avg R</th><th className="px-4 py-3">Estado</th></tr></thead><tbody>{(calibration?.buckets ?? []).map((bucket) => <tr key={bucket.score_bucket} className="border-b border-slate-900 last:border-0"><td className="px-4 py-4 font-black text-white">{bucket.score_bucket}</td><td className="px-4 py-4 text-slate-300">{bucket.closed_trades}</td><td className="px-4 py-4 text-slate-300">{bucket.wins}</td><td className="px-4 py-4 font-bold text-slate-100">{bucket.observed_win_rate_pct == null ? "—" : `${bucket.observed_win_rate_pct}%`}</td><td className={`px-4 py-4 font-bold ${bucket.net_pnl_usdt >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{bucket.net_pnl_usdt.toFixed(2)} USDT</td><td className="px-4 py-4 text-slate-300">{bucket.average_r?.toFixed(2) ?? "—"}</td><td className="px-4 py-4 text-slate-400">{bucket.calibration_status}</td></tr>)}</tbody></table></div>
          {!calibration && <div className="p-8 text-center text-slate-500">No se pudo leer la calibración.</div>}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>; }
