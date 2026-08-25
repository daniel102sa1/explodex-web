"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Database,
  ShieldAlert,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type EdgeStats = {
  sample: number;
  decided: number;
  wins: number;
  losses: number;
  unresolved: number;
  observed_win_rate_pct: number | null;
  avg_r: number | null;
  avg_mfe_pct: number | null;
  avg_mae_pct: number | null;
  calibration_status: "CALIBRATED" | "INSUFFICIENT_SAMPLE" | string;
  minimum_decided_for_probability: number;
  cohorts?: Array<Record<string, unknown>>;
};

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function labelReason(value: string) {
  const map: Record<string, string> = {
    aggressive_flow_absorbed: "La presión agresiva no está logrando mover el precio.",
    btc_conflict: "BTC está empujando en dirección contraria.",
    multi_timeframe_conflict: "15m y 1h todavía no acompañan la idea.",
    futures_flow_conflict: "El flujo de futuros está en contra.",
    spot_flow_conflict: "El mercado spot está en contra.",
    already_extended: "El movimiento ya está demasiado extendido para perseguirlo.",
    insufficient_confirmations: "Todavía faltan confirmaciones independientes.",
    pre_move_direction_conflict: "El predictor previo y el setup técnico no coinciden en dirección.",
    pre_move_chase_risk: "El precio ya salió de la zona de entrada; perseguirlo empeora el riesgo.",
    pre_move_not_activated: "El patrón parece prepararse, pero aún no activó su trigger.",
    coinglass_unavailable_for_ready: "CoinGlass no pudo confirmar el setup multi-exchange.",
    coinglass_not_checked: "Todavía no se ha completado la confirmación CoinGlass.",
  };
  return map[value] ?? value.replaceAll("_", " ");
}

export default function ExplodeXMentor({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [edge, setEdge] = useState<EdgeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const analysisPromise = getLiveAnalysis(safeSymbol);
        const edgePromise = BASE_URL
          ? fetch(`${BASE_URL}/api/v1/predictions/${encodeURIComponent(safeSymbol)}/history?limit=12`, { cache: "no-store" })
              .then(async (r) => r.ok ? r.json() : null)
          : Promise.resolve(null);
        const [value, history] = await Promise.all([analysisPromise, edgePromise]);
        if (!cancelled) {
          setAnalysis(value);
          setEdge(history?.edge ?? null);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar el mentor");
      }
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis?.prediction) return null;
    const p = analysis.prediction;
    const metrics = analysis.metrics ?? {};
    const rejects = Array.isArray(metrics.reject_reasons) ? metrics.reject_reasons.map(String) : [];
    const directionMatch = analysis.direction === p.direction;
    const activated = p.phase === "ACTIVADO";
    const chase = Boolean(p.sequence?.chase_risk);
    const ready = analysis.state === "READY" && directionMatch && activated && !chase;
    const conflicts = [...(p.conflicts ?? []), ...rejects];
    const confirmations = p.confirmations ?? [];

    let action = "ESPERAR";
    let tone: "green" | "amber" | "red" | "violet" = "amber";
    let headline = "Todavía no hay una entrada habilitada";
    let explanation = "El sistema ve una idea, pero quiere que el mercado confirme antes de arriesgar capital.";

    if (!directionMatch) {
      action = "NO ENTRAR"; tone = "red";
      headline = "Hay conflicto de dirección";
      explanation = `El scoring apunta ${analysis.direction}, pero el predictor previo apunta ${p.direction}. Mientras no coincidan, ExplodeX debe abstenerse.`;
    } else if (chase || p.phase === "ESPERAR_RETEST") {
      action = "ESPERAR RETEST"; tone = "violet";
      headline = "La oportunidad inicial ya se alejó";
      explanation = "El precio salió de la zona calculada. Entrar tarde empeora el stop y la relación riesgo/beneficio.";
    } else if (ready) {
      action = "ENTRADA HABILITADA"; tone = "green";
      headline = `${p.direction} confirmado por las reglas actuales`;
      explanation = "Trigger activado, dirección alineada y sin riesgo de persecución. El stop sigue siendo obligatorio porque ninguna predicción es certeza.";
    } else if (p.phase === "PREACTIVACION" || p.phase === "VIGILAR_CONFIRMACION") {
      action = "VIGILAR DE CERCA"; tone = "amber";
      headline = "El movimiento podría estar preparándose";
      explanation = "Hay presión previa suficiente para vigilar, pero todavía falta activación o confirmaciones. No anticipar la entrada solo por el score.";
    } else if (p.phase === "ACTIVADO") {
      action = "CONFIRMANDO"; tone = "violet";
      headline = "El trigger fue activado, pero aún falta calidad para READY";
      explanation = "El precio tocó la zona crítica. ExplodeX espera que estructura, flujo y riesgo sigan alineados antes de habilitar entrada.";
    } else if (analysis.state === "NO_TRADE") {
      action = "NO ENTRAR"; tone = "red";
      headline = "La evidencia actual no justifica una operación";
      explanation = "No hay suficiente ventaja técnica/estadística para asumir riesgo ahora.";
    }

    const evidence = [
      { label: `Dirección ${p.direction}`, ok: directionMatch },
      { label: `Preparación ${Number(p.preactivation_score || 0).toFixed(1)}/100`, ok: Number(p.preactivation_score || 0) >= 72 },
      { label: "Trigger activado", ok: activated },
      { label: "Sin persecución de vela", ok: !chase },
      { label: `Riesgo ${Number(analysis.risk_score || 0).toFixed(1)}/100`, ok: Number(analysis.risk_score || 100) <= 35 },
      { label: `Confirmaciones ${confirmations.length}`, ok: confirmations.length >= 5 },
    ];

    return { action, tone, headline, explanation, conflicts, evidence, p, ready };
  }, [analysis]);

  if (error) return <section className="mx-auto mt-6 max-w-[1500px] px-4"><div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200"><ShieldAlert size={16} className="mr-2 inline"/>Mentor temporalmente no disponible: {error}</div></section>;
  if (!analysis || !view) return <section className="mx-auto mt-6 max-w-[1500px] px-4"><div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-500">Cargando Mentor ExplodeX…</div></section>;

  const calibrated = edge?.calibration_status === "CALIBRATED" && edge.observed_win_rate_pct != null;
  const toneClass = view.tone === "green" ? "border-emerald-500/30 bg-emerald-500/[.06]" : view.tone === "red" ? "border-rose-500/30 bg-rose-500/[.06]" : view.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.06]" : "border-amber-500/30 bg-amber-500/[.06]";
  const actionClass = view.tone === "green" ? "text-emerald-300" : view.tone === "red" ? "text-rose-300" : view.tone === "violet" ? "text-violet-300" : "text-amber-300";

  return (
    <section className="mx-auto mt-6 max-w-[1500px] px-4 pb-6">
      <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${toneClass}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-cyan-300"><BrainCircuit size={17}/> Mentor ExplodeX</div>
            <div className={`mt-2 text-3xl font-black ${actionClass}`}>{view.action}</div>
            <h3 className="mt-2 text-xl font-black text-white">{view.headline}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">{view.explanation}</p>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Qué tendría que pasar para cambiar de opinión</div>
              <div className="mt-2 text-sm text-slate-300">
                {view.ready
                  ? `La idea deja de ser válida si el precio rompe la invalidación/stop ${fmt(view.p.invalidation_price || view.p.stop_loss)} o aparecen conflictos fuertes de flujo.`
                  : `Para habilitar entrada quiero dirección alineada, trigger ${fmt(view.p.trigger_price)} activado, precio aún cerca de ${fmt(view.p.entry_low)} – ${fmt(view.p.entry_high)}, confirmaciones suficientes y sin chase.`}
              </div>
            </div>
          </div>

          <div className="grid min-w-[320px] grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            <Box label="Entrada" value={`${fmt(view.p.entry_low)} – ${fmt(view.p.entry_high)}`} icon={<Target size={14}/>} />
            <Box label="Stop" value={fmt(view.p.stop_loss)} icon={<ShieldAlert size={14}/>} bad />
            <Box label="TP1" value={fmt(view.p.tp1)} icon={<Zap size={14}/>} good />
            <Box label="Tiempo" value={`${view.p.expected_duration_min_minutes ?? "—"}–${view.p.expected_duration_max_minutes ?? "—"} min`} icon={<Clock3 size={14}/>} />
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/[.035] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><Database size={16} className="text-cyan-300"/><div><div className="text-sm font-black text-white">Evidencia aprendida · Edge Engine V2</div><div className="text-[10px] text-slate-500">Casos de esta moneda comprobados después del horizonte del setup</div></div></div>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${calibrated ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-200"}`}>{calibrated ? "CALIBRADO" : "NO CALIBRADO"}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-6">
            <Stat label="Muestra" value={String(edge?.sample ?? 0)} />
            <Stat label="Decididos" value={`${edge?.decided ?? 0}/${edge?.minimum_decided_for_probability ?? 30}`} />
            <Stat label="Wins / Loss" value={`${edge?.wins ?? 0} / ${edge?.losses ?? 0}`} />
            <Stat label="Tasa observada" value={calibrated ? `${Number(edge?.observed_win_rate_pct).toFixed(1)}%` : "—"} good={calibrated && Number(edge?.observed_win_rate_pct) >= 55} />
            <Stat label="R promedio" value={edge?.avg_r == null ? "—" : `${edge.avg_r >= 0 ? "+" : ""}${edge.avg_r.toFixed(2)}R`} good={Number(edge?.avg_r) > 0} />
            <Stat label="MFE medio" value={edge?.avg_mfe_pct == null ? "—" : `${edge.avg_mfe_pct.toFixed(2)}%`} />
          </div>
          <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-400"><BarChart3 size={14} className="mt-0.5 shrink-0 text-cyan-300"/>{calibrated ? `Ya hay ${edge?.decided} resultados decididos. Esta tasa es observada en datos propios, no una garantía del siguiente trade.` : `Todavía no hay suficiente muestra para mostrar una probabilidad. Faltan ${Math.max(0, (edge?.minimum_decided_for_probability ?? 30) - (edge?.decided ?? 0))} resultados decididos para la primera calibración.`}</div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4">
            <div className="text-sm font-black text-white">Lo que estoy comprobando</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {view.evidence.map((item) => <div key={item.label} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/45 p-2.5 text-xs text-slate-300">{item.ok ? <CheckCircle2 size={14} className="text-emerald-400"/> : <XCircle size={14} className="text-amber-400"/>}{item.label}</div>)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4">
            <div className="text-sm font-black text-white">Qué me preocupa</div>
            <div className="mt-3 space-y-2">
              {view.conflicts.length ? view.conflicts.slice(0, 6).map((item, index) => <div key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-amber-200/80"><AlertTriangle size={13} className="mt-1 shrink-0"/>{labelReason(String(item))}</div>) : <div className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={14}/>No hay conflictos fuertes reportados en este momento.</div>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500"><TrendingUp size={13} className="mt-0.5 shrink-0"/>El Mentor explica la decisión del sistema y la confronta con resultados propios. Verde significa mejor evidencia según reglas y muestra, nunca certeza.</div>
      </div>
    </section>
  );
}

function Box({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
function Stat({ label, value, good=false }: { label:string; value:string; good?:boolean }) { return <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-2.5"><div className="text-[9px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-sm font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</div></div>; }
