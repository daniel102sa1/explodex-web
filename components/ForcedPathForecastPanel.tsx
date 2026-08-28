"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, GitBranch, RefreshCw, Route, ShieldAlert } from "lucide-react";
import { getLiveAnalysis } from "@/lib/api";

type PathForecast = {
  available?: boolean;
  primary_path?: string;
  label?: string;
  primary_score?: number;
  secondary_path?: string;
  secondary_label?: string;
  secondary_score?: number;
  edge_gap?: number;
  clarity?: string;
  first_move?: "UP" | "DOWN" | string;
  final_bias?: "LONG" | "SHORT" | string;
  contains_pullback?: boolean;
  trade_posture?: string;
  pullback_zone_low?: number | null;
  pullback_zone_high?: number | null;
  reasons?: string[];
  score_is_probability?: boolean;
};

type CandidateState = {
  path: string;
  count: number;
  startedAt: number;
};

const POLL_MS = 8_000;
const NORMAL_CONFIRMATIONS = 3;
const STRONG_CONFIRMATIONS = 2;
const STRONG_EDGE_GAP = 18;

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const x = Number(value);
  if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(x) >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return x.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function postureEs(value?: string) {
  const map: Record<string, string> = {
    WAIT_PULLBACK_CONFIRMATION: "ESPERAR RETROCESO + CONFIRMACIÓN",
    FOLLOW_BIAS_IF_ENTRY_ZONE: "SEGUIR SESGO SOLO EN ZONA",
    CONFLICT_WITH_CURRENT_PLAN: "CONFLICTO CON PLAN ACTUAL",
    OBSERVE: "OBSERVAR",
  };
  return map[String(value ?? "")] ?? String(value ?? "OBSERVAR");
}

function clarityEs(value?: string) {
  const map: Record<string, string> = { CLEAR: "CLARO", USABLE: "UTILIZABLE", TIGHT_RACE: "COMPETIDO" };
  return map[String(value ?? "")] ?? String(value ?? "—");
}

export default function ForcedPathForecastPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [forecast, setForecast] = useState<PathForecast | null>(null);
  const [rawForecast, setRawForecast] = useState<PathForecast | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingRequired, setPendingRequired] = useState(NORMAL_CONFIRMATIONS);
  const candidate = useRef<CandidateState | null>(null);

  useEffect(() => {
    let dead = false;
    setForecast(null);
    setRawForecast(null);
    candidate.current = null;
    setPendingCount(0);
    setPendingRequired(NORMAL_CONFIRMATIONS);

    async function load() {
      try {
        const analysis = await getLiveAnalysis(safeSymbol, true);
        const raw = (analysis.prediction as any)?.path_forecast as PathForecast | undefined;
        if (dead) return;
        const next = raw ?? null;
        setRawForecast(next);
        setError(null);
        setUpdatedAt(Date.now());
        if (!next?.primary_path) return;

        setForecast((current) => {
          if (!current?.primary_path) {
            candidate.current = null;
            setPendingCount(0);
            return next;
          }
          if (current.primary_path === next.primary_path) {
            candidate.current = null;
            setPendingCount(0);
            return { ...next, primary_path: current.primary_path };
          }

          const now = Date.now();
          const existingCandidate = candidate.current;
          if (existingCandidate?.path === next.primary_path) {
            existingCandidate.count += 1;
            candidate.current = existingCandidate;
          } else {
            candidate.current = { path: next.primary_path, count: 1, startedAt: now };
          }
          const required = Number(next.edge_gap ?? 0) >= STRONG_EDGE_GAP ? STRONG_CONFIRMATIONS : NORMAL_CONFIRMATIONS;
          const currentCount = candidate.current?.count ?? 0;
          setPendingRequired(required);
          setPendingCount(currentCount);
          if (currentCount >= required) {
            candidate.current = null;
            setPendingCount(0);
            return next;
          }
          return current;
        });
      } catch (exc) {
        if (!dead) setError(exc instanceof Error ? exc.message : String(exc));
      }
    }

    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { dead = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  if (!forecast && !error) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500"><RefreshCw size={13} className="mr-2 inline animate-spin"/>Calculando Path Forecast estable…</div></section>;
  }

  if (error) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-3xl border border-rose-500/25 bg-rose-500/[.04] p-4 text-xs text-rose-200">Path Forecast temporalmente no disponible: {error}</div></section>;
  }

  const f = forecast!;
  const rawDifferent = rawForecast?.primary_path && rawForecast.primary_path !== f.primary_path;
  const up = f.first_move === "UP";
  const longBias = f.final_bias === "LONG";
  const pullback = Boolean(f.contains_pullback);
  const score = Number(f.primary_score ?? 0);
  const secondary = Number(f.secondary_score ?? 0);

  return (
    <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-3xl border border-violet-400/20 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.10),transparent_38%),linear-gradient(135deg,rgba(7,17,29,.98),rgba(2,8,18,.98))] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-300"><Route size={14}/> Path Forecast · predicción estable</div>
            <div className="mt-1 text-xs text-slate-500">El precio puede moverse cada tick; el escenario visible no cambia por un solo movimiento. Exige persistencia antes de girar.</div>
          </div>
          <div className="flex items-center gap-2">
            {rawDifferent && <span className="rounded-full border border-amber-400/25 bg-amber-400/[.06] px-3 py-1.5 text-[10px] font-black text-amber-200">NUEVO ESCENARIO {pendingCount}/{pendingRequired}</span>}
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[10px] font-black text-slate-300">CLARIDAD {clarityEs(f.clarity)}</span>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[.05] px-3 py-1.5 text-[10px] font-black text-cyan-200">{updatedAt ? new Date(updatedAt).toLocaleTimeString() : "LIVE"}</span>
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1.25fr_.75fr]">
          <div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <div className="rounded-2xl border border-violet-400/25 bg-violet-400/[.06] p-4">
                <div className="text-[9px] font-black uppercase tracking-[.14em] text-violet-300">Escenario estable #1</div>
                <div className="mt-2 text-2xl font-black text-white">{f.label ?? f.primary_path ?? "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                  <span className="rounded-lg border border-slate-800 bg-black/15 px-2 py-1">fuerza relativa <b className="text-white">{score.toFixed(0)}/100</b></span>
                  <span className="rounded-lg border border-slate-800 bg-black/15 px-2 py-1">primero {up ? "↑ ARRIBA" : "↓ ABAJO"}</span>
                  <span className="rounded-lg border border-slate-800 bg-black/15 px-2 py-1">sesgo final <b className={longBias ? "text-emerald-300" : "text-rose-300"}>{f.final_bias ?? "—"}</b></span>
                </div>
              </div>

              <div className="hidden text-slate-600 md:block"><GitBranch size={25}/></div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                <div className="text-[9px] font-black uppercase tracking-[.14em] text-slate-500">Escenario #2</div>
                <div className="mt-2 text-lg font-black text-slate-200">{f.secondary_label ?? f.secondary_path ?? "—"}</div>
                <div className="mt-2 text-[10px] text-slate-500">fuerza relativa {secondary.toFixed(0)}/100 · diferencia {Number(f.edge_gap ?? 0).toFixed(0)} puntos</div>
              </div>
            </div>

            {pullback && <div className="mt-3 rounded-2xl border border-amber-400/25 bg-amber-400/[.05] p-4">
              <div className="flex items-center gap-2 text-sm font-black text-amber-100">{longBias ? <ArrowDown size={15}/> : <ArrowUp size={15}/>} ExplodeX espera movimiento contrario antes de continuar</div>
              <div className="mt-2 text-xs leading-5 text-slate-400">Zona estimada de retroceso/retest: <b className="font-mono text-white">{fmt(f.pullback_zone_low)} – {fmt(f.pullback_zone_high)}</b>. La idea es esperar reacción/confirmación allí, no asumir que el rebote ocurrirá automáticamente.</div>
            </div>}

            <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.13em] text-cyan-300"><Activity size={13}/> Qué haría con esta predicción</div>
              <div className="mt-2 text-sm font-black text-white">{postureEs(f.trade_posture)}</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">El escenario se revisa cada 8 s, pero no gira visualmente hasta repetirse 3 veces; si la diferencia técnica es muy fuerte, exige 2 lecturas. Así evitamos “sube/baja/sube/baja” por ruido.</div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-black/15 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Por qué eligió esa ruta</div>
            <div className="mt-3 space-y-2">{(f.reasons ?? []).length ? (f.reasons ?? []).map((reason, i) => <div key={i} className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs leading-5 text-slate-400">• {reason}</div>) : <div className="text-xs text-slate-600">Aún reuniendo razones técnicas.</div>}</div>
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[.04] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldAlert size={14} className="mt-0.5 shrink-0"/>El número /100 compara escenarios técnicos. No significa “80% de probabilidad” ni “subirá sí o sí”.</div>
          </aside>
        </div>
      </div>
    </section>
  );
}
