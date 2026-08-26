"use client";

import { useEffect, useState } from "react";
import { Flame, Gauge, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type Cascade = {
  available?: boolean;
  status?: string;
  cascade_score?: number | null;
  cascade_bias?: string;
  risk_to_direction?: boolean;
  supports_direction?: boolean;
  burst_ratio_vs_4h_hourly?: number;
  short_minus_long_imbalance_1h?: number;
  long_liquidations_1h_usd?: number;
  short_liquidations_1h_usd?: number;
  total_liquidations_1h_usd?: number;
  oi_change_5m_pct?: number;
  oi_change_15m_pct?: number;
  taker_buy_ratio_pct?: number;
  taker_sell_ratio_pct?: number;
  deleveraging?: boolean;
  fresh_leverage?: boolean;
  notes?: string[];
  certainty_note?: string;
};

export default function LiquidationCascadePanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol, true);
        if (!cancelled) setAnalysis(value);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const cascade = (((analysis?.prediction as any)?.context_engine?.liquidation_cascade) ?? null) as Cascade | null;
  if (!cascade) return null;

  const active = cascade.status === "CASCADE_ACTIVE";
  const building = cascade.status === "CASCADE_BUILDING";
  const risk = cascade.risk_to_direction === true;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 ${risk ? "border-rose-500/20 bg-rose-500/[.025]" : active || building ? "border-amber-500/20 bg-amber-500/[.025]" : "border-slate-800 bg-slate-950/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-amber-300"><Flame size={16}/> Liquidation Cascade Engine</div>
          <div className="mt-2 text-xl font-black text-white">Presión de liquidaciones y deleveraging</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Combina liquidaciones 1h/4h, OI, taker flow y reacción de precio. Es contexto observado, no una predicción garantizada.</div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-black ${risk ? "border-rose-500/25 text-rose-300" : cascade.supports_direction ? "border-emerald-500/25 text-emerald-300" : "border-slate-700 text-slate-300"}`}>
          {cascade.status ?? "N/D"} · {cascade.cascade_bias ?? "NEUTRAL"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={<Gauge size={14}/>} label="Cascade score" value={cascade.cascade_score == null ? "N/D" : `${Number(cascade.cascade_score).toFixed(0)}/100`} sub={`bias ${cascade.cascade_bias ?? "NEUTRAL"}`} />
        <Card icon={<Flame size={14}/>} label="Burst vs baseline" value={cascade.burst_ratio_vs_4h_hourly == null ? "N/D" : `${Number(cascade.burst_ratio_vs_4h_hourly).toFixed(2)}x`} sub="1h actual vs promedio horario 4h" />
        <Card icon={<TrendingUp size={14}/>} label="Short liq 1h" value={money(cascade.short_liquidations_1h_usd)} sub="shorts forzados a cerrar" />
        <Card icon={<TrendingDown size={14}/>} label="Long liq 1h" value={money(cascade.long_liquidations_1h_usd)} sub="longs forzados a cerrar" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-black/15 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Confirmaciones</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-3">
            <Datum label="Imbalance liq 1h" value={signed(cascade.short_minus_long_imbalance_1h)} />
            <Datum label="OI 5m" value={pct(cascade.oi_change_5m_pct)} />
            <Datum label="OI 15m" value={pct(cascade.oi_change_15m_pct)} />
            <Datum label="Taker buy" value={pct(cascade.taker_buy_ratio_pct, false)} />
            <Datum label="Taker sell" value={pct(cascade.taker_sell_ratio_pct, false)} />
            <Datum label="Total liq 1h" value={money(cascade.total_liquidations_1h_usd)} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-black/15 p-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><ShieldAlert size={13}/> Estado</div>
          <div className="mt-3 text-xs text-slate-400">
            {cascade.deleveraging ? "OI contrayéndose: deleveraging forzado detectable." : cascade.fresh_leverage ? "OI creciendo: todavía entra leverage nuevo; el movimiento puede seguir inestable." : "OI sin señal extrema de deleveraging/leverage nuevo."}
          </div>
          {(cascade.notes?.length ?? 0) > 0 && <div className="mt-3 text-[10px] leading-5 text-slate-500">{cascade.notes!.join(" · ")}</div>}
          {risk && <div className="mt-3 text-[10px] font-black text-rose-300">La cascada fuerte va contra la dirección del setup: ExplodeX puede degradar ACTIVADO a vigilancia.</div>}
          {cascade.supports_direction && <div className="mt-3 text-[10px] font-black text-emerald-300">La presión de liquidaciones acompaña la dirección, pero no autoriza una entrada por sí sola.</div>}
        </div>
      </div>

      <div className="mt-3 text-[9px] text-slate-600">{cascade.certainty_note ?? "Liquidaciones observadas; no representan probabilidad matemática."}</div>
    </div>
  </section>;
}

function money(value: number | null | undefined) {
  if (value == null) return "N/D";
  const n = Number(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function signed(value: number | null | undefined) {
  if (value == null) return "N/D";
  const n = Number(value); return `${n > 0 ? "+" : ""}${n.toFixed(3)}`;
}
function pct(value: number | null | undefined, signedValue = true) {
  if (value == null) return "N/D";
  const n = Number(value); return `${signedValue && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-black/15 p-4"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{sub}</div></div>;
}
function Datum({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800/80 p-2.5"><div className="text-slate-600">{label}</div><div className="mt-1 font-mono font-black text-slate-300">{value}</div></div>;
}
