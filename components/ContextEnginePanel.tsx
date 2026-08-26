"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge, Layers3, Radar, ShieldAlert } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type ContextEngine = {
  version?: string;
  early_context_score?: number;
  context_guard_pass?: boolean;
  certainty_note?: string;
  regime?: {
    regime?: string;
    confidence?: number;
    directional_bias?: string;
    trend_scores?: Record<string, number>;
    atr_pct?: number;
    compression_ratio?: number;
    relative_volume?: number;
    notes?: string[];
  };
  microstructure?: {
    score?: number;
    aligned?: boolean;
    strong_conflict?: boolean;
    available_inputs?: number;
    order_book_imbalance?: number | null;
    microprice_bias_pct?: number | null;
    spread_bps?: number | null;
    futures_delta_ratio?: number | null;
    spot_delta_ratio?: number | null;
    oi_change_15m_pct?: number | null;
    absorption_proxy?: string;
    confirmations?: string[];
    conflicts?: string[];
    ofi?: number | null;
    replenishment?: number | null;
    liquidity_speed?: number | null;
    sequential_absorption?: number | null;
    data_note?: string;
  };
};

export default function ContextEnginePanel({ symbol }: { symbol: string }) {
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
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [safeSymbol]);

  const context = ((analysis?.prediction as any)?.context_engine ?? null) as ContextEngine | null;
  if (!context) return null;

  const regime = context.regime ?? {};
  const micro = context.microstructure ?? {};
  const guard = context.context_guard_pass !== false;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-cyan-500/15 bg-cyan-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-cyan-300"><Radar size={16}/> Context Engine</div>
          <div className="mt-2 text-xl font-black text-white">Régimen + microestructura antes de perseguir el movimiento</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Este motor puede frenar una activación si el contexto es peligroso. No puede convertir una fase débil en ACTIVADO.</div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-black ${guard ? "border-emerald-500/20 bg-emerald-500/[.04] text-emerald-300" : "border-amber-500/25 bg-amber-500/[.05] text-amber-200"}`}>
          {guard ? "CONTEXT GUARD OK" : "ESPERAR CONTEXTO"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={<Layers3 size={14}/>} label="Régimen" value={regime.regime ?? "—"} sub={`bias ${regime.directional_bias ?? "NEUTRAL"} · conf ${fmt(regime.confidence)}`} />
        <Card icon={<Gauge size={14}/>} label="Early context" value={fmt(context.early_context_score)} sub="Confluencia contextual, no probabilidad" />
        <Card icon={<Activity size={14}/>} label="Microestructura" value={fmt(micro.score)} sub={`${micro.available_inputs ?? 0} entradas reales disponibles`} />
        <Card icon={<ShieldAlert size={14}/>} label="Absorción proxy" value={micro.absorption_proxy ?? "NONE"} sub={`spread ${micro.spread_bps == null ? "N/D" : `${Number(micro.spread_bps).toFixed(2)} bps`}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Lecturas de flujo</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
            <Datum label="Book imbalance" value={signed(micro.order_book_imbalance)} />
            <Datum label="Microprice bias" value={micro.microprice_bias_pct == null ? "N/D" : `${signed(micro.microprice_bias_pct)}%`} />
            <Datum label="Futures delta" value={signed(micro.futures_delta_ratio)} />
            <Datum label="Spot delta" value={signed(micro.spot_delta_ratio)} />
            <Datum label="OI 15m" value={micro.oi_change_15m_pct == null ? "N/D" : `${signed(micro.oi_change_15m_pct)}%`} />
            <Datum label="ATR" value={regime.atr_pct == null ? "N/D" : `${Number(regime.atr_pct).toFixed(2)}%`} />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Datos todavía N/D</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">OFI, replenishment, liquidity speed y absorción secuencial requieren snapshots L2 consecutivos. ExplodeX los deja como N/D en vez de inventarlos.</div>
          {(micro.conflicts?.length ?? 0) > 0 && <div className="mt-3 text-[10px] text-amber-300">Conflictos: {micro.conflicts!.join(" · ")}</div>}
          {(micro.confirmations?.length ?? 0) > 0 && <div className="mt-2 text-[10px] text-emerald-300">A favor: {micro.confirmations!.join(" · ")}</div>}
        </div>
      </div>

      <div className="mt-3 text-[9px] text-slate-600">{context.certainty_note ?? "Contexto técnico; no garantiza el siguiente movimiento."}</div>
    </div>
  </section>;
}

function fmt(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(0)}/100`;
}

function signed(value: number | null | undefined) {
  if (value == null) return "N/D";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(4)}`;
}

function Card({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div>
    <div className="mt-2 font-mono text-lg font-black text-white">{value}</div>
    <div className="mt-1 text-[10px] text-slate-600">{sub}</div>
  </div>;
}

function Datum({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800/80 bg-black/15 p-2.5"><div>{label}</div><div className="mt-1 font-mono font-black text-slate-300">{value}</div></div>;
}
