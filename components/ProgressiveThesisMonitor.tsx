"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";
import {
  LOCKED_PLANS_EVENT,
  readLockedPlan,
  writeLockedPlan,
  type LockedPlan,
  type ThesisHealthSnapshot,
} from "@/lib/lockedPlans";

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const alpha = 2 / (period + 1);
  let current = values[0];
  for (let i = 1; i < values.length; i++) current = values[i] * alpha + current * (1 - alpha);
  return current;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss <= 1e-12) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function structure(candles: Candle[]) {
  if (candles.length < 12) return "MIXED";
  const older = candles.slice(-12, -6);
  const recent = candles.slice(-6);
  const oldHigh = Math.max(...older.map((x) => x.high));
  const oldLow = Math.min(...older.map((x) => x.low));
  const newHigh = Math.max(...recent.map((x) => x.high));
  const newLow = Math.min(...recent.map((x) => x.low));
  if (newHigh > oldHigh && newLow > oldLow) return "HH_HL";
  if (newHigh < oldHigh && newLow < oldLow) return "LH_LL";
  return "MIXED";
}

function volumeRatio(candles: Candle[], period = 20) {
  if (candles.length < 2) return 1;
  const prior = candles.slice(-period - 1, -1).map((x) => x.volume);
  const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 1;
  return avg > 0 ? (candles.at(-1)?.volume || 0) / avg : 1;
}

function healthSnapshot(plan: LockedPlan, analysis: LiveAnalysis, candles: Candle[], price: number): ThesisHealthSnapshot {
  const closes = candles.map((x) => x.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const currentStructure = structure(candles);
  const rsi14 = rsi(closes, 14);
  const vol = volumeRatio(candles, 20);
  const currentDirection = analysis.prediction?.direction ?? analysis.direction;
  const directionConflict = currentDirection !== plan.direction;
  const emaAligned = plan.direction === "LONG" ? ema9 > ema21 : ema9 < ema21;
  const structureAligned = plan.direction === "LONG" ? currentStructure === "HH_HL" : currentStructure === "LH_LL";
  const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
  const entry = Number(plan.actualEntryPrice || 0);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const invalidated = plan.direction === "LONG" ? price <= Math.max(plan.stop, plan.invalidation) : price >= Math.min(plan.stop || Infinity, plan.invalidation || Infinity);

  let health = 55;
  health += emaAligned ? 10 : -12;
  health += structureAligned ? 10 : currentStructure === "MIXED" ? 0 : -10;
  health += directionConflict ? -15 : 10;
  health += riskGuardPass ? 5 : -10;
  health += vol >= 0.9 ? 5 : vol < 0.6 ? -6 : 0;
  health += r >= 0.5 ? 5 : r <= -0.5 ? -8 : 0;
  if (plan.direction === "LONG" && rsi14 < 42) health -= 8;
  if (plan.direction === "SHORT" && rsi14 > 58) health -= 8;
  health = Math.max(0, Math.min(100, health));

  let state: ThesisHealthSnapshot["state"] = "STABLE";
  if (invalidated) state = "INVALIDATED";
  else if (health >= 75) state = "STRONG";
  else if (health >= 58) state = "STABLE";
  else if (health >= 42) state = "WEAKENING";
  else state = "DETERIORATING";

  return {
    at: Date.now(),
    price,
    r,
    health,
    currentDirection,
    directionConflict,
    emaAligned,
    structure: currentStructure,
    structureAligned,
    rsi14,
    volumeRatio: vol,
    riskGuardPass,
    state,
  };
}

function fmt(value: number, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export default function ProgressiveThesisMonitor({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const lastSnapshotAt = useRef(0);

  useEffect(() => {
    const refresh = () => setPlan(readLockedPlan(safeSymbol));
    refresh();
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    const timer = setInterval(refresh, 3000);
    return () => {
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
      clearInterval(timer);
    };
  }, [safeSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, c] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "5m", 96),
        ]);
        if (!cancelled) {
          setAnalysis(a);
          setCandles(c);
        }
      } catch {}
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    if (!plan?.enteredAt || !plan.actualEntryPrice || !analysis || !candles.length) return;
    const latest = plan.thesisSnapshots?.at(-1);
    const now = Date.now();
    const due = !latest || now - latest.at >= 5 * 60_000;
    if (!due || now - lastSnapshotAt.current < 30_000) return;

    const price = Number(analysis.current_price || candles.at(-1)?.close || 0);
    if (!(price > 0)) return;
    const snapshot = healthSnapshot(plan, analysis, candles, price);
    const history = [...(plan.thesisSnapshots ?? []), snapshot].slice(-36);
    const next: LockedPlan = {
      ...plan,
      thesisSnapshots: history,
      thesisSnapshotUpdatedAt: now,
    };
    lastSnapshotAt.current = now;
    setPlan(next);
    writeLockedPlan(next);
  }, [plan, analysis, candles]);

  const view = useMemo(() => {
    const rows = plan?.thesisSnapshots ?? [];
    if (!plan?.enteredAt || rows.length === 0) return null;
    const last = rows.at(-1)!;
    const last3 = rows.slice(-3);
    const healths = last3.map((x) => x.health);
    const falling3 = healths.length >= 3 && healths[0] > healths[1] && healths[1] > healths[2];
    const falling2 = healths.length >= 2 && healths.at(-2)! - healths.at(-1)! >= 8;
    const conflicts3 = last3.filter((x) => x.directionConflict).length;
    const guardFails3 = last3.filter((x) => !x.riskGuardPass).length;
    const weak3 = last3.filter((x) => x.state === "WEAKENING" || x.state === "DETERIORATING" || x.state === "INVALIDATED").length;
    const healthDelta = rows.length >= 2 ? last.health - rows[Math.max(0, rows.length - 3)].health : 0;

    let state = "ESTABLE";
    let tone: "green" | "amber" | "red" | "violet" = "green";
    let action = "MANTENER SEGÚN PLAN";
    let explanation = "La salud de la tesis no muestra deterioro persistente en los snapshots recientes.";

    if (last.state === "INVALIDATED") {
      state = "INVALIDADO";
      tone = "red";
      action = "SALIDA / PLAN INVALIDADO";
      explanation = "El snapshot más reciente muestra ruptura del nivel de invalidación o stop.";
    } else if (rows.length >= 3 && (weak3 >= 3 || (falling3 && last.health < 45) || (conflicts3 >= 2 && guardFails3 >= 2))) {
      state = "DETERIORO PERSISTENTE";
      tone = "red";
      action = "REEVALUAR SALIDA ANTES DEL STOP";
      explanation = "La tesis no solo tuvo un mal tick: lleva varias lecturas consecutivas deteriorándose.";
    } else if (falling2 || last.state === "DETERIORATING") {
      state = "DEBILITÁNDOSE RÁPIDO";
      tone = "violet";
      action = "REDUCIR RIESGO / PROTEGER";
      explanation = "La salud cayó con fuerza entre las últimas lecturas. Conviene vigilar si se confirma otro deterioro.";
    } else if (last.state === "WEAKENING" || weak3 >= 2) {
      state = "DEBILITÁNDOSE";
      tone = "amber";
      action = "MANTENER CON CAUTELA";
      explanation = "Hay señales de pérdida de calidad, aunque todavía no existe deterioro persistente suficiente para invalidar por sí solo.";
    } else if (last.state === "STRONG" && healthDelta > 0) {
      state = "FORTALECIÉNDOSE";
      tone = "green";
      action = "MANTENER SEGÚN PLAN";
      explanation = "La salud de la tesis mejoró frente a lecturas anteriores y mantiene alineación suficiente.";
    }

    return { rows, last, last3, state, tone, action, explanation, falling3, conflicts3, guardFails3, healthDelta };
  }, [plan]);

  if (!view || !plan) return null;

  const frame = view.tone === "green" ? "border-emerald-500/25 bg-emerald-500/[.04]" : view.tone === "red" ? "border-rose-500/30 bg-rose-500/[.05]" : view.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.05]" : "border-amber-500/25 bg-amber-500/[.04]";
  const accent = view.tone === "green" ? "text-emerald-300" : view.tone === "red" ? "text-rose-300" : view.tone === "violet" ? "text-violet-300" : "text-amber-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 ${frame}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Waves size={16}/> Memoria progresiva de tesis</div>
          <div className={`mt-2 text-2xl font-black ${accent}`}>{view.state}</div>
          <div className="mt-1 text-lg font-black text-white">{view.action}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300/80">{view.explanation}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[600px]">
          <Metric label="Salud actual" value={`${view.last.health.toFixed(0)}/100`} good={view.last.health >= 65} bad={view.last.health < 45} />
          <Metric label="R snapshot" value={`${view.last.r >= 0 ? "+" : ""}${view.last.r.toFixed(2)}R`} good={view.last.r >= 0} bad={view.last.r < 0} />
          <Metric label="Dirección actual" value={view.last.currentDirection || "—"} bad={view.last.directionConflict} />
          <Metric label="Risk Guard" value={view.last.riskGuardPass ? "OK" : "FALLA"} good={view.last.riskGuardPass} bad={!view.last.riskGuardPass} />
        </div>
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        {view.rows.slice(-6).map((row, index) => <div key={`${row.at}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
          <div className="flex items-center justify-between gap-2"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">{new Date(row.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span className={`text-[9px] font-black ${row.state === "STRONG" ? "text-emerald-300" : row.state === "STABLE" ? "text-cyan-300" : row.state === "WEAKENING" ? "text-amber-300" : "text-rose-300"}`}>{row.state}</span></div>
          <div className="mt-2 font-mono text-lg font-black text-white">{row.health.toFixed(0)}</div>
          <div className="mt-1 text-[10px] text-slate-500">{row.r >= 0 ? "+" : ""}{row.r.toFixed(2)}R · RSI {fmt(row.rsi14 ?? 0, 0)}</div>
        </div>)}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white"><Activity size={14} className="text-cyan-300"/> Qué estoy buscando</div>
          <div className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
            <p>• Caída de salud en 2–3 snapshots consecutivos.</p>
            <p>• Dirección nueva contra el plan en varias lecturas.</p>
            <p>• Risk Guard fallando repetidamente.</p>
            <p>• EMA/estructura/RSI perdiendo alineación a la vez.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white">{view.state.includes("DETERIORO") ? <AlertTriangle size={14} className="text-rose-300"/> : <CheckCircle2 size={14} className="text-emerald-300"/>} Persistencia</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">Snapshots guardados: <b className="text-white">{view.rows.length}</b>. Conflictos de dirección en últimas 3: <b className="text-white">{view.conflicts3}</b>. Fallos de Risk Guard: <b className="text-white">{view.guardFails3}</b>. Cambio de salud: <b className={view.healthDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>{view.healthDelta >= 0 ? "+" : ""}{view.healthDelta.toFixed(0)}</b>.</div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Clock3 size={13} className="mt-1 shrink-0"/>Se guarda aproximadamente un snapshot cada 5 minutos mientras ExplodeX está abierto. Deterioro persistente es una advertencia de gestión; no sustituye el stop ni garantiza que cerrar antes mejore cada operación.</div>
    </div>
  </section>;
}

function Metric({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-sm font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
