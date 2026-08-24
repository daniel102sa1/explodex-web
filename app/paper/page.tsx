import { ArrowDownRight, ArrowUpRight, WalletCards } from "lucide-react";
import { getPaperHistory, getPaperOpen, getPerformance } from "@/lib/api";

export const dynamic = "force-dynamic";

function fmt(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

export default async function PaperPage() {
  const [open, history, performance] = await Promise.all([
    getPaperOpen().catch(() => []),
    getPaperHistory().catch(() => []),
    getPerformance().catch(() => null),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300"><WalletCards size={16}/> Paper trading</div>
      <h1 className="mt-2 text-3xl font-black text-white">Operaciones simuladas</h1>
      <p className="mt-2 text-sm text-slate-400">Registro para validar la estrategia antes de cualquier uso con capital real.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Abiertas" value={String(open.length)} />
        <Stat label="Trades cerrados" value={String(performance?.closed_trades ?? 0)} />
        <Stat label="PnL neto" value={performance ? `${performance.net_pnl_usdt.toFixed(2)} USDT` : "—"} />
        <Stat label="Win rate" value={performance?.win_rate_pct == null ? "Sin muestra" : `${performance.win_rate_pct}%`} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black text-white">Abiertas</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {open.map((trade) => (
            <article key={trade.id} className="rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
              <div className="flex items-start justify-between gap-4">
                <div><div className="text-2xl font-black text-white">{trade.symbol}</div><div className={`mt-1 inline-flex items-center gap-1 font-bold ${trade.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>{trade.direction === "LONG" ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} {trade.direction}</div></div>
                <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">{trade.status}</div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Cell label="Entrada" value={fmt(trade.entry_price)}/><Cell label="Stop" value={fmt(trade.stop_loss)}/><Cell label="TP1" value={fmt(trade.tp1)}/><Cell label="TP2" value={fmt(trade.tp2)}/></div>
              <div className="mt-4 text-xs text-slate-500">Riesgo: {trade.risk_pct ?? "—"}% · Apalancamiento virtual: {trade.leverage?.toFixed(2) ?? "—"}x</div>
            </article>
          ))}
          {!open.length && <Empty text="No hay operaciones paper abiertas en este momento." />}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-black text-white">Historial</h2>
        <div className="mt-4 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-800 text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-4 py-3">Moneda</th><th className="px-4 py-3">Dir.</th><th className="px-4 py-3">Entrada</th><th className="px-4 py-3">Salida</th><th className="px-4 py-3">PnL</th><th className="px-4 py-3">R</th><th className="px-4 py-3">Motivo</th></tr></thead><tbody>{history.map((trade) => <tr key={trade.id} className="border-b border-slate-900 last:border-0"><td className="px-4 py-4 font-bold text-white">{trade.symbol}</td><td className="px-4 py-4 text-slate-300">{trade.direction}</td><td className="px-4 py-4 font-mono text-slate-300">{fmt(trade.entry_price)}</td><td className="px-4 py-4 font-mono text-slate-300">{fmt(trade.exit_price)}</td><td className={`px-4 py-4 font-bold ${(trade.pnl_usdt ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{trade.pnl_usdt?.toFixed(2) ?? "—"}</td><td className="px-4 py-4 text-slate-300">{trade.r_multiple?.toFixed(2) ?? "—"}</td><td className="px-4 py-4 text-slate-400">{trade.close_reason ?? "—"}</td></tr>)}</tbody></table></div>
          {!history.length && <div className="p-8 text-center text-slate-500">Todavía no hay trades cerrados.</div>}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>; }
function Cell({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-mono text-sm font-bold text-slate-100">{value}</div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-sm text-slate-500">{text}</div>; }
