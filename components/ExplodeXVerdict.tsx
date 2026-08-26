"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Clock3, ShieldX, Target, TrendingDown, TrendingUp } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type Verdict = "ENTER" | "WAIT" | "NO_TRADE";

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

export default function ExplodeXVerdict({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const previousVerdict = useRef<Verdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(force = false) {
      try {
        const value = await getLiveAnalysis(safeSymbol, force);
        if (!cancelled) setAnalysis(value);
      } catch {}
    }
    load(true);
    const timer = window.setInterval(() => load(true), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis) return null;
    const direction = analysis.prediction?.direction ?? analysis.direction;
    const phase = String(analysis.prediction?.phase ?? "SIN_SETUP");
    const price = num(analysis.current_price);
    const entryLow = Math.min(num(analysis.entry_low), num(analysis.entry_high));
    const entryHigh = Math.max(num(analysis.entry_low), num(analysis.entry_high));
    const stop = num(analysis.stop_loss);
    const tp1 = num(analysis.tp1);
    const setup = num(analysis.setup_score);
    const prep = num(analysis.prediction?.preactivation_score);
    const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
    const directionMatch = analysis.ready_checks?.direction_match !== false;
    const chase = Boolean(analysis.ready_checks?.chase_risk ?? analysis.prediction?.sequence?.chase_risk);
    const inZone = entryLow > 0 && entryHigh > 0 && price >= entryLow && price <= entryHigh;
    const invalidation = num(analysis.invalidation_price, stop);
    const invalidated = direction === "LONG" ? price <= invalidation : price >= invalidation;
    const dataLimited = analysis.data_quality === "LIMITED";

    let verdict: Verdict = "WAIT";
    let title = "ESPERAR";
    let reason = "Todavía falta completar la confirmación.";
    let next = "No entrar hasta que el sistema habilite la zona.";

    if (invalidated) {
      verdict = "NO_TRADE";
      title = "NO TRADE";
      reason = "La tesis actual ya cruzó su invalidación.";
      next = "Esperar un setup nuevo; no rescatar este plan ampliando el stop.";
    } else if (!riskGuardPass) {
      verdict = "NO_TRADE";
      title = "NO TRADE";
      reason = "Risk Guard bloquea esta operación.";
      next = "No entrar aunque el precio siga moviéndose en la dirección esperada.";
    } else if (!directionMatch) {
      verdict = "NO_TRADE";
      title = "NO TRADE";
      reason = "La dirección principal y el predictor están en conflicto.";
      next = "Esperar a que la dirección vuelva a estabilizarse.";
    } else if (dataLimited) {
      verdict = "WAIT";
      title = "ESPERAR";
      reason = "Los datos están limitados; no hay suficiente calidad para llamar una entrada limpia.";
      next = "Esperar una lectura completa antes de actuar.";
    } else if (chase || phase === "ESPERAR_RETEST") {
      verdict = "WAIT";
      title = "ESPERAR RETEST";
      reason = "La dirección puede ser correcta, pero entrar ahora sería perseguir el precio.";
      next = `Zona válida: ${formatPrice(entryLow)}–${formatPrice(entryHigh)}.`;
    } else if (analysis.state === "READY" && phase === "ACTIVADO" && inZone) {
      verdict = "ENTER";
      title = "ENTRAR AHORA · PAPER";
      reason = "READY + activación + zona válida + Risk Guard alineados.";
      next = "Plan habilitado; respetar el stop original y no ampliar riesgo.";
    } else if (analysis.state === "READY" && phase === "ACTIVADO" && !inZone) {
      verdict = "WAIT";
      title = "ESPERAR ZONA";
      reason = "El setup está activado, pero el precio actual no está dentro de la zona de entrada.";
      next = `Esperar ${formatPrice(entryLow)}–${formatPrice(entryHigh)}; no perseguir.`;
    } else if (["PREACTIVACION", "VIGILAR_CONFIRMACION"].includes(phase) && prep >= 75) {
      verdict = "WAIT";
      title = "CASI LISTO · ESPERAR";
      reason = "El setup está avanzado, pero todavía no está activado.";
      next = `Preparación ${prep.toFixed(0)}/100. Vigilar trigger y zona.`;
    } else {
      verdict = "WAIT";
      title = "ESPERAR";
      reason = phase === "SIN_SETUP" ? "No existe un setup operativo ahora mismo." : "La señal todavía no reúne todos los requisitos de entrada.";
      next = `Setup ${setup.toFixed(0)}/100 · preparación ${prep.toFixed(0)}/100.`;
    }

    return { verdict, title, reason, next, direction, price, entryLow, entryHigh, stop, tp1, setup, phase };
  }, [analysis]);

  useEffect(() => {
    if (!view) return;
    const previous = previousVerdict.current;
    if (view.verdict === "ENTER" && previous && previous !== "ENTER") {
      try {
        document.title = `🟢 ENTRAR ${safeSymbol} · ExplodeX`;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`ExplodeX · ${safeSymbol}`, {
            body: `${view.direction} habilitado · entrada ${formatPrice(view.entryLow)}–${formatPrice(view.entryHigh)}`,
          });
        }
      } catch {}
    }
    previousVerdict.current = view.verdict;
  }, [view, safeSymbol]);

  if (!view) return null;

  const frame = view.verdict === "ENTER"
    ? "border-emerald-400/45 bg-emerald-500/[.10] shadow-emerald-950/30"
    : view.verdict === "NO_TRADE"
      ? "border-rose-400/45 bg-rose-500/[.09] shadow-rose-950/30"
      : "border-amber-400/35 bg-amber-500/[.075] shadow-amber-950/25";
  const titleTone = view.verdict === "ENTER" ? "text-emerald-200" : view.verdict === "NO_TRADE" ? "text-rose-200" : "text-amber-200";
  const Icon = view.verdict === "ENTER" ? CheckCircle2 : view.verdict === "NO_TRADE" ? ShieldX : Clock3;
  const DirIcon = view.direction === "LONG" ? TrendingUp : TrendingDown;

  return <section className="sticky top-[68px] z-30 mx-auto max-w-[1500px] px-4 pt-3">
    <div className={`rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${frame}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 ${titleTone}`}><Icon size={22}/></div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-slate-400">ExplodeX VERDICT · decisión principal</div>
            <div className={`mt-1 text-2xl font-black sm:text-3xl ${titleTone}`}>{view.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200"><span className={`inline-flex items-center gap-1 font-black ${view.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}><DirIcon size={15}/>{view.direction}</span><span>·</span><span>{view.reason}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[690px]">
          <Mini label="AHORA" value={formatPrice(view.price)} />
          <Mini label="ENTRADA" value={`${formatPrice(view.entryLow)}–${formatPrice(view.entryHigh)}`} />
          <Mini label="STOP" value={formatPrice(view.stop)} bad />
          <Mini label="TP1" value={formatPrice(view.tp1)} good />
          <Mini label="SETUP" value={`${view.setup.toFixed(0)}/100`} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px]">
        <span className="font-semibold text-slate-300"><Target size={13} className="mr-1.5 inline"/>{view.next}</span>
        <span className="inline-flex items-center gap-1.5 text-slate-500"><Bell size={12}/>Actualiza cada ~10 s. ENTER significa reglas alineadas, no beneficio garantizado.</span>
      </div>
    </div>
  </section>;
}

function Mini({ label, value, good=false, bad=false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><div className="text-[8px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
