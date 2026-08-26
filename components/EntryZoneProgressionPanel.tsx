"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Gauge, Target } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type Zone = {
  available?: boolean;
  state?: string;
  action?: string;
  current_price?: number;
  optimal_low?: number;
  optimal_high?: number;
  acceptable_low?: number;
  acceptable_high?: number;
  chase_low?: number;
  chase_high?: number;
  rr1_midpoint?: number;
  quality_score?: number;
  quality_label?: string;
  quality_reasons?: string[];
  quality_conflicts?: string[];
  structure?: {
    available?: boolean;
    recent_support?: number;
    recent_resistance?: number;
    retest_level?: number;
    retest_confirmed?: boolean;
  };
  microstructure?: {
    sequential_ready?: boolean;
    absorption_aligned?: boolean;
    ofi_aligned?: boolean;
  };
};

type Progression = {
  trend?: string;
  samples?: number;
  scores?: number[];
  latest_score?: number;
  delta_last?: number;
  delta_window?: number;
  crossed_90_score?: boolean;
  sustained_90_score?: boolean;
};

function price(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function trendLabel(value?: string) {
  switch (value) {
    case "STRENGTHENING_FAST": return "FORTALECIÉNDOSE RÁPIDO";
    case "STRENGTHENING": return "FORTALECIÉNDOSE";
    case "WEAKENING_FAST": return "DEBILITÁNDOSE RÁPIDO";
    case "WEAKENING": return "DEBILITÁNDOSE";
    case "STABLE": return "ESTABLE";
    default: return "CALENTANDO";
  }
}

export default function EntryZoneProgressionPanel({ symbol }: { symbol: string }) {
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
    const timer = window.setInterval(load, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const prediction = analysis?.prediction as any;
  const zone = (prediction?.entry_zone_engine ?? null) as Zone | null;
  const progression = (prediction?.confidence_progression ?? null) as Progression | null;
  if (!zone?.available && !progression) return null;

  const strengthening = String(progression?.trend ?? "").startsWith("STRENGTHENING");
  const weakening = String(progression?.trend ?? "").startsWith("WEAKENING");

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-cyan-500/15 bg-cyan-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-cyan-300"><Target size={16}/> Entry Zone Engine</div>
          <div className="mt-2 text-xl font-black text-white">Dónde entrar sin perseguir el precio</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">La zona óptima ahora se refina con estructura reciente, retest y microestructura secuencial, sin ampliar nunca el plan original.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {zone?.quality_score != null && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[.04] px-3 py-2 text-[10px] font-black text-cyan-200">CALIDAD {Number(zone.quality_score).toFixed(0)}/100 · {zone.quality_label ?? "N/D"}</div>}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-black text-slate-300">{zone?.state ?? "WAITING"}</div>
        </div>
      </div>

      {zone?.available && <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Zona óptima" value={`${price(zone.optimal_low)} – ${price(zone.optimal_high)}`} sub="Mejor precio-calidad" />
          <Metric label="Zona aceptable" value={`${price(zone.acceptable_low)} – ${price(zone.acceptable_high)}`} sub="Plan todavía válido" />
          <Metric label="CHASE" value={`${price(zone.chase_low)} – ${price(zone.chase_high)}`} sub="No perseguir · esperar retest" />
          <Metric label="R:R TP1" value={zone.rr1_midpoint == null ? "—" : `${Number(zone.rr1_midpoint).toFixed(2)}R`} sub={`Precio actual ${price(zone.current_price)}`} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Estructura y retest</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Mini label="Soporte reciente" value={price(zone.structure?.recent_support)} />
              <Mini label="Resistencia reciente" value={price(zone.structure?.recent_resistance)} />
              <Mini label="Nivel de retest" value={price(zone.structure?.retest_level)} />
              <Mini label="Retest" value={zone.structure?.retest_confirmed ? "CONFIRMADO" : "NO CONFIRMADO"} />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Microestructura de entrada</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Mini label="Secuencial" value={zone.microstructure?.sequential_ready ? "LISTO" : "CALENTANDO"} />
              <Mini label="Absorción" value={zone.microstructure?.absorption_aligned ? "A FAVOR" : "SIN APOYO"} />
              <Mini label="OFI" value={zone.microstructure?.ofi_aligned ? "A FAVOR" : "SIN APOYO"} />
            </div>
            {!!zone.quality_reasons?.length && <div className="mt-3 text-[10px] leading-5 text-emerald-300/80">✓ {zone.quality_reasons.join(" · ")}</div>}
            {!!zone.quality_conflicts?.length && <div className="mt-2 text-[10px] leading-5 text-rose-300/80">⚠ {zone.quality_conflicts.join(" · ")}</div>}
          </div>
        </div>
      </>}

      {progression && <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><Gauge size={14}/> Evolución del setup</div>
          <div className={`flex items-center gap-1 text-xs font-black ${strengthening ? "text-emerald-300" : weakening ? "text-rose-300" : "text-slate-300"}`}>{strengthening ? <ArrowUpRight size={14}/> : weakening ? <ArrowDownRight size={14}/> : null}{trendLabel(progression.trend)}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(progression.scores ?? []).map((score, index) => <span key={`${score}-${index}`} className="rounded-lg border border-slate-800 bg-black/20 px-2 py-1 font-mono text-[11px] font-black text-slate-300">{Number(score).toFixed(0)}</span>)}
          {(progression.scores?.length ?? 0) > 1 && <span className="text-[10px] text-slate-500">Δ ventana {Number(progression.delta_window ?? 0) >= 0 ? "+" : ""}{Number(progression.delta_window ?? 0).toFixed(1)}</span>}
        </div>
        <div className="mt-3 text-[10px] leading-5 text-slate-500">Un score 90/100 es confluencia técnica, no 90% de probabilidad. {progression.sustained_90_score ? "El setup lleva al menos dos lecturas consecutivas ≥90." : progression.crossed_90_score ? "El setup acaba de cruzar 90/100 y necesita persistencia." : "La dirección del score ayuda a distinguir fuerza creciente de una lectura alta aislada."}</div>
      </div>}
    </div>
  </section>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-base font-black text-white">{value}</div><div className="mt-1 text-[9px] text-slate-600">{sub}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800/80 bg-black/15 p-3"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-600">{label}</div><div className="mt-1 text-[11px] font-black text-slate-300">{value}</div></div>;
}
