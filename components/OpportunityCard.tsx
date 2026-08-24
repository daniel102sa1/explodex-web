import { Activity, ArrowDownRight, ArrowUpRight, ShieldAlert } from "lucide-react";
import type { Opportunity } from "@/lib/api";

function fmt(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function duration(min?: number, max?: number) {
  if (!min || !max) return "—";
  const toText = (m: number) => (m >= 1440 ? `${(m / 1440).toFixed(1)}d` : m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
  return `${toText(min)} – ${toText(max)}`;
}

export default function OpportunityCard({ item, featured = false }: { item: Opportunity; featured?: boolean }) {
  const isLong = item.direction === "LONG";
  const score = item.contextual_score ?? item.setup_score;
  const risk = item.contextual_risk_score ?? item.risk_score;

  return (
    <article className={`rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 ${featured ? "lg:p-7" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span className="rounded-full border border-slate-700 px-2.5 py-1">{item.tier || "SCANNER"}</span>
            <span>{item.label || "—"}</span>
          </div>
          <h2 className={`${featured ? "text-3xl" : "text-2xl"} mt-3 font-black tracking-tight text-white`}>{item.symbol}</h2>
          <div className={`mt-1 inline-flex items-center gap-1.5 font-bold ${isLong ? "text-emerald-400" : "text-rose-400"}`}>
            {isLong ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
            {item.direction}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Score</div>
          <div className="text-4xl font-black text-white">{score.toFixed(1)}</div>
          <div className="text-xs text-slate-500">/ 100</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Riesgo" value={`${risk.toFixed(1)}/100`} />
        <Metric label="Estado" value={item.state} />
        <Metric label="Movimiento" value={`${item.expected_move_min_pct ?? "—"}% – ${item.expected_move_max_pct ?? "—"}%`} />
        <Metric label="Duración" value={duration(item.expected_duration_min_minutes, item.expected_duration_max_minutes)} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Price label="Entrada baja" value={item.entry_low} />
        <Price label="Entrada alta" value={item.entry_high} />
        <Price label="Stop" value={item.stop_loss} danger />
        <Price label="TP1" value={item.tp1} />
        <Price label="TP2" value={item.tp2} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 text-slate-300"><Activity size={16} /> Mercado: {item.market_regime || "—"}</span>
        <span className="inline-flex items-center gap-1.5 text-slate-300"><ShieldAlert size={16} /> Prob. histórica: {item.historical_win_rate_pct ?? "sin muestra"}{item.historical_win_rate_pct != null ? "%" : ""}</span>
        <span className="text-slate-500">No es certeza para la siguiente operación.</span>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold text-slate-100">{value}</div></div>;
}

function Price({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 font-mono text-sm font-bold ${danger ? "text-rose-300" : "text-slate-100"}`}>{fmt(value)}</div></div>;
}
