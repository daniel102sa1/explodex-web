"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, ShieldAlert, Zap } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

const human: Record<string,string> = {
  fingerprint_trade_now: "Confirmación final del patrón",
  master_yes: "Dirección maestra",
  timing_enter: "Timing de entrada",
  veto_clear: "Quitar veto",
  not_chasing: "Precio sin persecución",
  not_invalidated: "Tesis vigente",
  risk_guard_pass: "Risk Guard",
  ignition_fast_path: "Ignición suficiente",
  price_in_entry_zone: "Precio dentro de la zona",
  positive_net_expectancy_geometry: "R/R neto suficiente",
};

export default function HeartDecisionBanner({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [canonicalHeart, setCanonicalHeart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [value, radar] = await Promise.all([
          getLiveAnalysis(safeSymbol, true),
          BASE_URL
            ? fetch(`${BASE_URL}/api/v1/predictions/live?limit=100`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setAnalysis(value);
        const items = Array.isArray(radar?.items) ? radar.items : [];
        const match = items.find((item:any) => String(item?.symbol ?? "").toUpperCase() === safeSymbol);
        setCanonicalHeart(match?.explodex_heart ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el Heart");
      }
    }
    load();
    const timer = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const liveHeart = (analysis as any)?.explodex_heart ?? (analysis?.prediction as any)?.explodex_heart;
  const heart = canonicalHeart ?? liveHeart;
  const contract = heart?.execution_contract ?? {};
  const decision = heart?.action_decision ?? {};
  const plan = heart?.plan ?? {};
  const forecast = contract?.forecast ?? heart?.primary_prediction ?? {};
  const lanes = contract?.lanes ?? {};
  const permittedLane = String(contract?.permitted_paper_lane ?? "").toUpperCase();
  const event = heart?.market_event ?? liveHeart?.market_event ?? {};
  const ignition = heart?.ignition ?? {};

  const action = String(contract?.primary_action ?? decision?.action ?? "ESPERAR").toUpperCase();
  const enter = Boolean(decision?.should_enter) || action === "ENTRAR_LONG" || action === "ENTRAR_SHORT";
  const holding = action === "MANTENER_LONG" || action === "MANTENER_SHORT";
  const completed = action === "PLAN_COMPLETADO";
  const retest = action === "ESPERAR_RETEST";
  const noEnter = action === "NO_ENTRAR";
  const direction = String(contract?.primary_direction ?? decision?.direction ?? heart?.direction ?? analysis?.direction ?? "").toUpperCase();
  const prep = Number(ignition?.score ?? event?.pressure_index ?? (analysis?.prediction as any)?.preactivation_score ?? 0);
  const missing = Array.isArray(decision?.advanced_stack_missing) ? decision.advanced_stack_missing : [];
  const sourceLabel = canonicalHeart ? "HEART CANÓNICO · MISMA FUENTE QUE PAPER" : "ANÁLISIS EN VIVO";

  const tacticalLane = lanes?.tactical ?? {};
  const aggressiveLane = lanes?.aggressive_paper ?? {};
  const swingLane = lanes?.swing_paper ?? {};
  const activeLane = permittedLane === "TACTICAL" ? tacticalLane : permittedLane === "AGGRESSIVE_PAPER" ? aggressiveLane : permittedLane === "SWING_PAPER" ? swingLane : null;
  const displayPlan = activeLane && activeLane.entry_low ? activeLane : plan;

  const tone = enter ? "border-emerald-400/60 bg-emerald-500/[.12]" : holding ? "border-cyan-400/55 bg-cyan-500/[.10]" : completed ? "border-blue-400/45 bg-blue-500/[.08]" : noEnter ? "border-rose-400/45 bg-rose-500/[.08]" : retest ? "border-violet-400/45 bg-violet-500/[.08]" : "border-amber-400/45 bg-amber-500/[.08]";
  const title = enter ? `ENTRAR ${direction} AHORA` : holding ? `MANTENER ${direction}` : completed ? "PLAN COMPLETADO" : noEnter ? "NO ENTRAR" : retest ? "ESPERAR RETEST" : "ESPERAR";
  const titleClass = enter ? "text-emerald-300" : holding ? "text-cyan-300" : completed ? "text-blue-300" : noEnter ? "text-rose-300" : retest ? "text-violet-300" : "text-amber-200";

  const nextText = useMemo(() => {
    if (holding) {
      if (decision?.price_in_entry_zone === false) return "ExplodeX ya activó esta entrada. Si ya entraste, conserva el plan original; si no entraste, no persigas fuera de la zona.";
      return "La entrada ya fue activada. Si ya entraste, mantén stop y objetivos originales; el Heart no vuelve a pedir confirmación por un recálculo débil.";
    }
    if (completed) return "La entrada había sido activada y el movimiento completó TP3. No abras una entrada nueva sobre el mismo plan.";
    if (enter) return "La entrada táctica está habilitada ahora. Respeta la zona y el stop; no persigas si el precio se escapa.";
    if (noEnter) return "No abras esta operación. Espera una tesis nueva o que desaparezca el bloqueo.";
    if (retest) return "La idea puede seguir viva, pero la entrada táctica ya pasó. Espera que vuelva a la zona.";
    if (permittedLane === "AGGRESSIVE_PAPER") return "La recomendación principal sigue en ESPERAR, pero PAPER tiene permiso para probar una entrada temprana experimental de riesgo reducido.";
    if (permittedLane === "SWING_PAPER") return "No hay entrada táctica, pero el mismo Heart detecta una trayectoria 4h–48h suficientemente clara para que PAPER pruebe un swing reducido.";
    if (missing.length) return `Falta: ${missing.slice(0,3).map((x:string)=>human[x] ?? x.replaceAll("_"," ")).join(" · ")}.`;
    return "Todavía no hay autorización completa de entrada.";
  }, [holding,completed,enter,noEnter,retest,missing,decision?.price_in_entry_zone,permittedLane]);

  const forecastDirection = String(forecast?.direction ?? direction ?? "").toUpperCase();
  const horizon = String(forecast?.horizon ?? "—");
  const forecastZoneLow = forecast?.target_zone_low;
  const forecastZoneHigh = forecast?.target_zone_high;

  return (
    <section className="mx-auto max-w-[1680px] px-3 pt-4 sm:px-5 lg:px-6">
      <div className={`overflow-hidden rounded-3xl border shadow-2xl ${tone}`}>
        <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">
              <Zap size={14} className={enter ? "text-emerald-300" : holding ? "text-cyan-300" : "text-amber-300"}/>
              ExplodeX · corazón unificado
              <span className="rounded-full border border-slate-700/70 px-2 py-0.5 text-slate-500">{safeSymbol}</span>
              <span className="text-slate-600">{sourceLabel}</span>
            </div>
            <div className={`mt-3 flex items-center gap-2 text-3xl font-black sm:text-4xl ${titleClass}`}>
              {direction === "SHORT" ? <ArrowDownRight size={34}/> : direction === "LONG" ? <ArrowUpRight size={34}/> : <ShieldAlert size={30}/>} 
              {error ? "SIN DATOS" : analysis ? title : "CALCULANDO..."}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{error ?? decision?.reason ?? "Evaluando dirección, timing, trayectoria y riesgo desde una sola fuente."}</p>
            <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
              <div className="flex items-start gap-2 text-xs text-slate-300">
                {enter || holding ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300"/> : <Clock3 size={15} className="mt-0.5 shrink-0 text-amber-300"/>}
                <span><b className="text-white">Qué hacer:</b> {nextText}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">
              <span className="rounded-full border border-slate-700/70 bg-slate-950/40 px-2.5 py-1">PAPER: {permittedLane || "SIN PERMISO"}</span>
              {contract?.single_source_of_truth && <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-200">Single source of truth</span>}
            </div>
          </div>

          <div className="border-t border-slate-700/60 bg-slate-950/30 p-4 xl:border-l xl:border-t-0 sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Preparación / ignición" value={Number.isFinite(prep) ? `${Math.round(prep)}/100` : "—"} strong />
              <Metric label="Dirección principal" value={direction || "—"}/>
              <Metric label="Estado" value={holding ? String(decision?.entry_latch_status ?? "ACTIVADO").replaceAll("_"," ") : String(ignition?.stage ?? event?.event ?? action).replaceAll("_"," ")}/>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Entrada" value={`${fmt(displayPlan?.entry_low)} – ${fmt(displayPlan?.entry_high)}`}/>
              <Metric label="Stop" value={fmt(displayPlan?.stop_loss)} bad/>
              <Metric label="Objetivo" value={fmt(displayPlan?.target_price ?? displayPlan?.tp1)} good/>
              <Metric label="Horizonte" value={String(displayPlan?.max_hold_minutes ? `${displayPlan.max_hold_minutes}m` : horizon)}/>
            </div>
            <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-950/35 px-3 py-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">Predicción de recorrido</div>
              <div className="mt-1 text-xs font-bold text-slate-200">{forecastDirection || "—"} · {horizon}</div>
              <div className="mt-1 text-xs text-slate-400">Zona estimada: {fmt(forecastZoneLow)} – {fmt(forecastZoneHigh)}</div>
            </div>
            <div className="mt-3 text-[10px] leading-5 text-slate-500">La acción visible, la trayectoria y el permiso PAPER salen del mismo contrato del Heart. PAPER puede rechazar un fill que ya quedó viejo, pero no inventar otra dirección ni otra estrategia.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({label,value,strong=false,good=false,bad=false}:{label:string;value:string;strong?:boolean;good?:boolean;bad?:boolean}) {
  return <div className="rounded-xl border border-slate-700/65 bg-slate-950/50 px-3 py-2.5"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</div><div className={`mt-1 text-sm font-black ${strong?"text-cyan-200":good?"text-emerald-300":bad?"text-rose-300":"text-white"}`}>{value}</div></div>;
}
