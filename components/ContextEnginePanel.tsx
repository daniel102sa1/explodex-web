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
    atr_pct?: number;
  };
  microstructure?: {
    score?: number;
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
    replenishment_side?: string;
    liquidity_speed?: number | null;
    imbalance_speed_per_sec?: number | null;
    sequential_absorption?: number | null;
    sequential_absorption_label?: string;
    sequential_ready?: boolean;
    sequential_snapshot_count?: number;
    sequential_window_seconds?: number;
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
  const sequentialReady = micro.sequential_ready === true;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-cyan-500/15 bg-cyan-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-cyan-300"><Radar size={16}/> Context Engine</div>
          <div className="mt-2 text-xl font-black text-white">Régimen + microestructura secuencial</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Usa snapshots reales del libro. Puede frenar contexto peligroso, pero no convierte una fase débil en ACTIVADO.</div>
        </div>
        <div className="flex gap-2">
          <div className={`rounded-xl border px-3 py-2 text-[10px] font-black ${sequentialReady ? "border-cyan-500/20 bg-cyan-500/[.04] text-cyan-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{sequentialReady ? "L2 SECUENCIAL OK" : "L2 WARMING UP"}</div>
          <div className={`rounded-xl border px-3 py-2 text-[10px] font-black ${guard ? "border-emerald-500/20 bg-emerald-500/[.04] text-emerald-300" : "border-amber-500/25 bg-amber-500/[.05] text-amber-200"}`}>{guard ? "CONTEXT GUARD OK" : "ESPERAR CONTEXTO"}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={<Layers3 size={14}/>} label="Régimen" value={regime.regime ?? "—"} sub={`bias ${regime.directional_bias ?? "NEUTRAL"} · conf ${fmt(regime.confidence)}`} />
        <Card icon={<Gauge size={14}/>} label="Early context" value={fmt(context.early_context_score)} sub="Confluencia contextual, no probabilidad" />
        <Card icon={<Activity size={14}/>} label="Microestructura" value={fmt(micro.score)} sub={`${micro.available_inputs ?? 0} inputs + ${micro.sequential_snapshot_count ?? 0} snapshots`} />
        <Card icon={<ShieldAlert size={14}/>} label="Absorción secuencial" value={micro.sequential_absorption_label ?? "WARMING_UP"} sub={`ventana ${micro.sequential_window_seconds == null ? "N/D" : `${Number(micro.sequential_window_seconds).toFixed(0)}s`}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Flujo actual</div>
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
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Microestructura secuencial real</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
            <Datum label="OFI" value={signed(micro.ofi)} />
            <Datum label="Replenishment" value={micro.replenishment == null ? "N/D" : `${signed(micro.replenishment)} · ${micro.replenishment_side ?? "NONE"}`} />
            <Datum label="Liquidity speed" value={micro.liquidity_speed == null ? "N/D" : `${Number(micro.liquidity_speed).toFixed(4)} bps/s`} />
            <Datum label="Imbalance speed" value={signed(micro.imbalance_speed_per_sec)} />
            <Datum label="Absorption" value={micro.sequential_absorption == null ? "N/D" : `${signed(micro.sequential_absorption)} · ${micro.sequential_absorption_label ?? "NONE"}`} />
            <Datum label="Snapshots" value={`${micro.sequential_snapshot_count ?? 0}`} />
          </div>
          <div className="mt-3 text-[10px] leading-5 text-slate-600">{micro.data_note ?? "Esperando snapshots reales."}</div>
          {(micro.conflicts?.length ?? 0) > 0 && <div className="mt-2 text-[10px] text-amber-300">Conflictos: {micro.conflicts!.join(" · ")}</div>}
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
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{sub}</div></div>;
}

function Datum({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800/80 bg-black/15 p-2.5"><div>{label}</div><div className="mt-1 font-mono font-black text-slate-300">{value}</div></div>;
}
