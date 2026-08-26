"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlan, type LockedPlan } from "@/lib/lockedPlans";

type RecoveryState = "NORMAL" | "SHAKEOUT" | "RECLAIMING" | "RECLAIM_CONFIRMED" | "DETERIORATING" | "INVALIDATED";

function clamp(value: number, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * alpha + value * (1 - alpha);
  return value;
}

function relativeVolume(candles: Candle[], period = 20) {
  if (candles.length < period + 2) return 1;
  const baseline = candles.slice(-period - 1, -1).map((x) => x.volume);
  const avg = baseline.reduce((a, b) => a + b, 0) / baseline.length || 1;
  return candles.at(-1)!.volume / avg;
}

function structure(candles: Candle[]) {
  if (candles.length < 12) return "MIXED";
  const older = candles.slice(-10, -5);
  const recent = candles.slice(-5);
  const oh = Math.max(...older.map((x) => x.high));
  const ol = Math.min(...older.map((x) => x.low));
  const rh = Math.max(...recent.map((x) => x.high));
  const rl = Math.min(...recent.map((x) => x.low));
  if (rh > oh && rl > ol) return "HH_HL";
  if (rh < oh && rl < ol) return "LH_LL";
  return "MIXED";
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function minutesSince(ts?: number) {
  return ts ? Math.max(0, (Date.now() - ts) / 60000) : null;
}

export default function RecoveryReclaimEngine({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [m1, setM1] = useState<Candle[]>([]);
  const [m5, setM5] = useState<Candle[]>([]);

  useEffect(() => {
    const refresh = () => setPlan(readLockedPlan(safeSymbol));
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    };
  }, [safeSymbol]);

  useEffect(() => {
    if (!plan?.enteredAt || !plan.actualEntryPrice) return;
    let cancelled = false;
    async function load() {
      try {
        const [a, c1, c5] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "1m", 120),
          getCandles(safeSymbol, "5m", 100),
        ]);
        if (!cancelled) { setAnalysis(a); setM1(c1); setM5(c5); }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol, plan?.enteredAt, plan?.actualEntryPrice]);

  const view = useMemo(() => {
    if (!plan?.enteredAt || !plan.actualEntryPrice || !analysis || m1.length < 20 || m5.length < 20) return null;
    const direction = plan.direction;
    const side = direction === "LONG" ? 1 : -1;
    const entry = plan.actualEntryPrice;
    const stop = plan.stop;
    const riskUnit = Math.abs(entry - stop);
    if (riskUnit <= 0) return null;

    const recent1 = m1.slice(-20);
    const recent5 = m5.slice(-12);
    const closes1 = m1.map((x) => x.close);
    const closes5 = m5.map((x) => x.close);
    const price = num(analysis.current_price, closes1.at(-1) || entry);
    const e9 = ema(closes1, 9);
    const e21 = ema(closes1, 21);
    const e9_5 = ema(closes5, 9);
    const e21_5 = ema(closes5, 21);
    const rvol1 = relativeVolume(m1);
    const rvol5 = relativeVolume(m5);
    const s5 = structure(m5);

    const adverseExtreme = direction === "LONG"
      ? Math.min(...recent1.map((x) => x.low))
      : Math.max(...recent1.map((x) => x.high));
    const favorableExtreme = direction === "LONG"
      ? Math.max(...recent1.map((x) => x.high))
      : Math.min(...recent1.map((x) => x.low));
    const adverseR = direction === "LONG" ? (entry - adverseExtreme) / riskUnit : (adverseExtreme - entry) / riskUnit;
    const currentR = direction === "LONG" ? (price - entry) / riskUnit : (entry - price) / riskUnit;
    const favorableR = direction === "LONG" ? (favorableExtreme - entry) / riskUnit : (entry - favorableExtreme) / riskUnit;

    const invalidation = plan.invalidation || stop;
    const stopHit = direction === "LONG" ? price <= stop : price >= stop;
    const invalidationClose = direction === "LONG"
      ? recent1.slice(-2).every((x) => x.close <= invalidation)
      : recent1.slice(-2).every((x) => x.close >= invalidation);

    const planRiskSpan = Math.abs(entry - invalidation) || riskUnit;
    const reclaimBase = direction === "LONG"
      ? Math.max(plan.entryLow, Math.min(entry, e21_5))
      : Math.min(plan.entryHigh, Math.max(entry, e21_5));

    const dippedBeyondEntry = direction === "LONG"
      ? adverseExtreme < Math.min(entry, plan.entryLow)
      : adverseExtreme > Math.max(entry, plan.entryHigh);
    const sweptReclaim = direction === "LONG"
      ? adverseExtreme < reclaimBase
      : adverseExtreme > reclaimBase;
    const backAboveReclaim = direction === "LONG" ? price > reclaimBase : price < reclaimBase;
    const fastEmaRecovered = direction === "LONG" ? price > e9 && e9 >= e21 : price < e9 && e9 <= e21;
    const fiveMinuteRecovered = direction === "LONG" ? price > e9_5 : price < e9_5;
    const structureAligned = direction === "LONG" ? s5 !== "LH_LL" : s5 !== "HH_HL";

    const last3 = recent1.slice(-3);
    const acceptedCloses = last3.filter((x) => direction === "LONG" ? x.close > reclaimBase : x.close < reclaimBase).length;
    const positiveBodies = last3.filter((x) => direction === "LONG" ? x.close > x.open : x.close < x.open).length;

    const metrics = analysis.metrics ?? {};
    const seq = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
    const oi = num(metrics.oi_change_pct, num(seq.oi_change_pct));
    const flowAligned = (spot * side > 0.02 ? 1 : 0) + (futures * side > 0.02 ? 1 : 0);
    const flowAgainst = (spot * side < -0.03 ? 1 : 0) + (futures * side < -0.03 ? 1 : 0);
    const directionConflict = analysis.ready_checks?.direction_match === false;
    const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;

    let reclaimScore = 0;
    reclaimScore += backAboveReclaim ? 22 : 0;
    reclaimScore += fastEmaRecovered ? 18 : 0;
    reclaimScore += fiveMinuteRecovered ? 12 : 0;
    reclaimScore += acceptedCloses >= 2 ? 16 : acceptedCloses === 1 ? 7 : 0;
    reclaimScore += positiveBodies >= 2 ? 10 : 0;
    reclaimScore += flowAligned * 7;
    reclaimScore += rvol1 >= 1.05 ? 5 : 2;
    reclaimScore += structureAligned ? 7 : 0;
    reclaimScore = clamp(reclaimScore);

    let failureScore = 0;
    failureScore += currentR <= -0.75 ? 22 : currentR <= -0.50 ? 12 : 0;
    failureScore += adverseR >= 0.85 ? 16 : adverseR >= 0.60 ? 8 : 0;
    failureScore += flowAgainst * 12;
    failureScore += directionConflict ? 18 : 0;
    failureScore += !riskGuardPass ? 18 : 0;
    failureScore += !structureAligned ? 14 : 0;
    failureScore += invalidationClose ? 35 : 0;
    failureScore = clamp(failureScore);

    const shakeoutDepthPct = planRiskSpan > 0 ? Math.abs(adverseExtreme - reclaimBase) / planRiskSpan * 100 : 0;
    const shakeoutCandidate = sweptReclaim && !invalidationClose && adverseR < 0.90;
    const recovered = shakeoutCandidate && backAboveReclaim;

    let state: RecoveryState = "NORMAL";
    let title = "RETROCESO NORMAL";
    let action = "MANTENER SEGÚN PLAN";
    let detail = "El precio sigue dentro del comportamiento tolerable del plan; no hay razón técnica para cancelar solo por ruido.";

    if (stopHit || invalidationClose) {
      state = "INVALIDATED";
      title = "PLAN INVALIDADO";
      action = "RESPETAR STOP / SALIDA DEL PLAN";
      detail = "El precio alcanzó el stop o confirmó cierres más allá de la invalidación. No se amplía el stop para rescatar la tesis.";
    } else if (failureScore >= 70 && reclaimScore < 55) {
      state = "DETERIORATING";
      title = "DETERIORO REAL";
      action = "REDUCIR RIESGO / REEVALUAR";
      detail = "El retroceso ya viene acompañado de pérdida de estructura, flujo o dirección; no parece una simple sacudida.";
    } else if (recovered && reclaimScore >= 72) {
      state = "RECLAIM_CONFIRMED";
      title = "RECLAIM CONFIRMADO";
      action = "TESIS RECUPERADA";
      detail = "Hubo barrida/retest, pero el precio recuperó el nivel con aceptación suficiente. La caída previa se parece más a shakeout que a invalidación.";
    } else if (recovered && reclaimScore >= 48) {
      state = "RECLAIMING";
      title = "RECUPERANDO NIVEL";
      action = "MANTENER CON CAUTELA";
      detail = "El precio está recuperando el nivel perdido, pero todavía falta aceptación más limpia para considerar el reclaim confirmado.";
    } else if (shakeoutCandidate) {
      state = "SHAKEOUT";
      title = "SACUDIDA / RETEST";
      action = "NO CANCELAR POR RUIDO";
      detail = "El precio barrió la zona de entrada/reclaim sin romper todavía la invalidación. Ahora importa si recupera y acepta el nivel.";
    }

    const enteredMinutes = minutesSince(plan.enteredAt);
    const latestSweep = [...recent1].reverse().find((x) => direction === "LONG" ? x.low < reclaimBase : x.high > reclaimBase);
    const reclaimMinutes = latestSweep && backAboveReclaim ? Math.max(0, (Date.now() - latestSweep.time) / 60000) : null;
    const recoverySpeed = reclaimMinutes == null ? "—" : reclaimMinutes <= 5 ? "RÁPIDA" : reclaimMinutes <= 15 ? "NORMAL" : "LENTA";

    return {
      state, title, action, detail, direction, price, entry, stop, reclaimBase,
      reclaimScore, failureScore, currentR, adverseR, favorableR, shakeoutDepthPct,
      acceptedCloses, rvol1, rvol5, flowAligned, flowAgainst, recoverySpeed,
      reclaimMinutes, enteredMinutes, structure: s5,
    };
  }, [plan, analysis, m1, m5]);

  if (!plan?.enteredAt || !plan.actualEntryPrice || !view) return null;

  const tone = view.state === "INVALIDATED" || view.state === "DETERIORATING"
    ? "border-rose-500/25 bg-rose-500/[.04] text-rose-300"
    : view.state === "RECLAIM_CONFIRMED"
      ? "border-emerald-500/25 bg-emerald-500/[.04] text-emerald-300"
      : view.state === "SHAKEOUT" || view.state === "RECLAIMING"
        ? "border-amber-500/25 bg-amber-500/[.04] text-amber-300"
        : "border-cyan-500/20 bg-cyan-500/[.03] text-cyan-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[.018] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-emerald-300"><RotateCcw size={17}/> Recovery / Reclaim Engine</div>
          <h2 className="mt-2 text-2xl font-black text-white">¿Sacudida normal o deterioro real?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Después de entrar, compara barrida, recuperación, cierres, estructura y flujo. La meta es no cancelar un buen plan por una caída normal, sin ignorar una invalidación real.</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${tone}`}><div className="text-[9px] font-black uppercase tracking-[.12em] opacity-70">Estado post-entrada</div><div className="mt-1 text-xl font-black">{view.title}</div><div className="mt-1 text-sm font-black">{view.action}</div><div className="mt-1 max-w-md text-xs leading-5 opacity-80">{view.detail}</div></div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<CheckCircle2 size={14}/>} label="Reclaim" value={`${view.reclaimScore.toFixed(0)}/100`} good={view.reclaimScore >= 70} warn={view.reclaimScore >= 45 && view.reclaimScore < 70} />
        <Metric icon={<ShieldX size={14}/>} label="Fallo real" value={`${view.failureScore.toFixed(0)}/100`} bad={view.failureScore >= 65} warn={view.failureScore >= 40 && view.failureScore < 65} />
        <Metric icon={<Waves size={14}/>} label="Adverso máx." value={`${view.adverseR.toFixed(2)}R`} bad={view.adverseR >= 0.8} warn={view.adverseR >= 0.5 && view.adverseR < 0.8} />
        <Metric icon={<Activity size={14}/>} label="R actual" value={`${view.currentR >= 0 ? "+" : ""}${view.currentR.toFixed(2)}R`} good={view.currentR > 0} warn={view.currentR <= 0 && view.currentR > -0.5} bad={view.currentR <= -0.5} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Box title="Nivel de reclaim" value={formatPrice(view.reclaimBase)} text={`Se exigen cierres aceptados alrededor de este nivel. Últimos 3: ${view.acceptedCloses}/3 aceptados.`} />
        <Box title="Velocidad de recuperación" value={view.recoverySpeed} text={view.reclaimMinutes == null ? "Todavía no hay reclaim medible después de la última barrida." : `Recuperación aproximada en ${Math.round(view.reclaimMinutes)} min.`} />
        <Box title="Stop original" value={formatPrice(view.stop)} text="Sigue siendo la protección final del plan. Este motor nunca lo mueve más lejos." />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Small label="Entrada real" value={formatPrice(view.entry)} />
        <Small label="Precio" value={formatPrice(view.price)} />
        <Small label="Estructura 5m" value={view.structure} />
        <Small label="Volumen 1m / 5m" value={`${view.rvol1.toFixed(2)}x / ${view.rvol5.toFixed(2)}x`} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-950/35 p-3 text-[11px] leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300"/>Un reclaim confirmado no garantiza que el trade termine ganador. Sirve para distinguir mejor entre ruido normal y deterioro. El stop fijado sigue siendo el límite final y esta lógica debe validarse primero en PAPER.</div>
    </div>
  </section>;
}

function Metric({ icon, label, value, good=false, warn=false, bad=false }: { icon: React.ReactNode; label: string; value: string; good?: boolean; warn?: boolean; bad?: boolean }) {
  const tone = good ? "text-emerald-300" : bad ? "text-rose-300" : warn ? "text-amber-300" : "text-slate-200";
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-2 font-mono text-xl font-black ${tone}`}>{value}</div></div>;
}

function Box({ title, value, text }: { title: string; value: string; text: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{title}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">{text}</div></div>;
}

function Small({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-1 font-mono text-xs font-black text-white">{value}</div></div>;
}
