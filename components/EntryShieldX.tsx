"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Layers3,
  ShieldCheck,
  ShieldX,
  Target,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";

type Direction = "LONG" | "SHORT";
type EntryMode = "NO_TRADE" | "WAIT" | "PROBE_PAPER" | "CORE_PAPER" | "WAIT_RETEST";

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

function atr(candles: Candle[], period = 14) {
  if (candles.length < 2) return 0;
  const rows = candles.slice(-Math.max(period + 1, 20));
  const tr: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i];
    const prev = rows[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  const sample = tr.slice(-period);
  return sample.length ? sample.reduce((a, b) => a + b, 0) / sample.length : 0;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const rows = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i] - rows[i - 1];
    gains += Math.max(d, 0);
    losses += Math.max(-d, 0);
  }
  if (losses <= 1e-12) return 100;
  const rs = gains / Math.max(losses, 1e-12);
  return 100 - 100 / (1 + rs);
}

function volumeRatio(candles: Candle[]) {
  if (candles.length < 22) return 1;
  const last = candles.at(-1)!;
  const base = candles.slice(-21, -1).map((x) => x.volume);
  const avg = base.reduce((a, b) => a + b, 0) / base.length || 1;
  return last.volume / avg;
}

function wickAgainst(candles: Candle[], direction: Direction) {
  const rows = candles.slice(-3);
  if (!rows.length) return 0;
  let wick = 0;
  let range = 0;
  for (const c of rows) {
    const r = Math.max(c.high - c.low, 1e-12);
    range += r;
    wick += direction === "LONG"
      ? Math.max(0, c.high - Math.max(c.open, c.close))
      : Math.max(0, Math.min(c.open, c.close) - c.low);
  }
  return range > 0 ? wick / range : 0;
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

export default function EntryShieldX({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [c5, setC5] = useState<Candle[]>([]);
  const [c15, setC15] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, m5, m15] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "5m", 100),
          getCandles(safeSymbol, "15m", 100),
        ]);
        if (!cancelled) { setAnalysis(a); setC5(m5); setC15(m15); }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis || c5.length < 30 || c15.length < 30) return null;
    const direction = (analysis.prediction?.direction ?? analysis.direction) as Direction;
    const phase = String(analysis.prediction?.phase ?? "SIN_SETUP");
    const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
    const directionMatch = analysis.ready_checks?.direction_match !== false;
    const chase = Boolean(analysis.ready_checks?.chase_risk ?? analysis.prediction?.sequence?.chase_risk);
    const activated = phase === "ACTIVADO";

    const closes5 = c5.map((x) => x.close);
    const closes15 = c15.map((x) => x.close);
    const price = num(analysis.current_price, closes5.at(-1) || 0);
    const e9 = ema(closes5, 9);
    const e21 = ema(closes5, 21);
    const e21_15 = ema(closes15, 21);
    const atr5 = atr(c5, 14);
    const atr15 = atr(c15, 14) || atr5;
    const rsi5 = rsi(closes5, 14);
    const rsi15 = rsi(closes15, 14);
    const rvol = volumeRatio(c5);
    const wick = wickAgainst(c5, direction);

    const entryLow = Math.min(num(analysis.entry_low), num(analysis.entry_high));
    const entryHigh = Math.max(num(analysis.entry_low), num(analysis.entry_high));
    const entryMid = (entryLow + entryHigh) / 2;
    const stop = num(analysis.stop_loss);
    const invalidation = num(analysis.invalidation_price, stop);
    const tp1 = num(analysis.tp1);
    const stopDistance = Math.abs(entryMid - stop);
    const stopAtr = atr15 > 0 ? stopDistance / atr15 : 0;

    const metrics = analysis.metrics ?? {};
    const seq = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
    const oi = num(metrics.oi_change_pct, num(seq.oi_change_pct));
    const side = direction === "LONG" ? 1 : -1;

    let falseBreakRisk = 10;
    if (!directionMatch) falseBreakRisk += 35;
    if (!riskGuardPass) falseBreakRisk += 35;
    if (spot * side < -0.03) falseBreakRisk += 16;
    if (futures * side < -0.03) falseBreakRisk += 14;
    if (oi < -0.25 && (spot * side <= 0 || futures * side <= 0)) falseBreakRisk += 12;
    if (rvol < 0.8) falseBreakRisk += 10;
    if (wick > 0.34) falseBreakRisk += 12;
    if (chase) falseBreakRisk += 18;
    falseBreakRisk = clamp(falseBreakRisk);

    const trendAligned5 = direction === "LONG" ? price > e9 && e9 > e21 : price < e9 && e9 < e21;
    const trendAligned15 = direction === "LONG" ? price > e21_15 : price < e21_15;
    const edge = Math.abs(num(analysis.long_score) - num(analysis.short_score));
    let continuation = 30;
    if (trendAligned5) continuation += 18;
    if (trendAligned15) continuation += 14;
    if (edge >= 10) continuation += 15; else if (edge >= 6) continuation += 8;
    if (rvol >= 1.1) continuation += 8;
    if (spot * side > 0.03) continuation += 7;
    if (futures * side > 0.03) continuation += 6;
    if (direction === "LONG" && rsi15 >= 45 && rsi15 <= 72) continuation += 5;
    if (direction === "SHORT" && rsi15 >= 28 && rsi15 <= 55) continuation += 5;
    continuation = clamp(continuation);

    const distanceFromEmaAtr = atr5 > 0 ? Math.abs(price - e21) / atr5 : 0;
    let retestRisk = 15;
    if (distanceFromEmaAtr >= 0.8) retestRisk += 28;
    if (distanceFromEmaAtr >= 1.3) retestRisk += 18;
    if (direction === "LONG" && rsi5 >= 70) retestRisk += 15;
    if (direction === "SHORT" && rsi5 <= 30) retestRisk += 15;
    if (rvol >= 1.5) retestRisk += 8;
    retestRisk = clamp(retestRisk);

    // Noise Budget: part of the stop distance is intentionally reserved for normal market noise.
    // It never changes or widens the original stop.
    const noiseDistance = Math.min(stopDistance * 0.48, Math.max(atr15 * 0.75, atr5 * 1.15));
    const normalNoiseEdge = direction === "LONG" ? entryMid - noiseDistance : entryMid + noiseDistance;
    const warningEdge = direction === "LONG"
      ? normalNoiseEdge - Math.max(0, (normalNoiseEdge - invalidation) * 0.45)
      : normalNoiseEdge + Math.max(0, (invalidation - normalNoiseEdge) * 0.45);

    const currentBeyondNormalNoise = direction === "LONG" ? price < normalNoiseEdge : price > normalNoiseEdge;
    const currentBeyondWarning = direction === "LONG" ? price < warningEdge : price > warningEdge;
    const latestClose = closes5.at(-1) || price;
    const closeInvalidated = direction === "LONG" ? latestClose <= invalidation : latestClose >= invalidation;

    let mode: EntryMode = "WAIT";
    let title = "ESPERAR";
    let detail = "Todavía no hay una entrada suficientemente defendible.";
    let probeShare = 0;
    let coreShare = 0;

    if (!riskGuardPass || !directionMatch || falseBreakRisk >= 72) {
      mode = "NO_TRADE";
      title = "NO TRADE";
      detail = "La confirmación tiene demasiadas contradicciones para habilitar entrada.";
    } else if (closeInvalidated) {
      mode = "NO_TRADE";
      title = "INVALIDADO";
      detail = "El cierre ya cruzó la invalidación estructural; no se rescata ampliando el stop.";
    } else if (!activated) {
      mode = "WAIT";
      title = "ESPERAR ACTIVACIÓN";
      detail = "El setup puede ser bueno, pero todavía no ha pasado el trigger de activación.";
    } else if (chase) {
      mode = "WAIT_RETEST";
      title = "ESPERAR RETEST";
      detail = "La dirección puede ser correcta, pero el precio actual está demasiado extendido para perseguirlo.";
    } else if (continuation >= 76 && falseBreakRisk <= 30 && retestRisk < 58 && stopAtr >= 1.0) {
      mode = "CORE_PAPER";
      title = "CORE HABILITADO · PAPER";
      detail = "Continuación fuerte, falsa ruptura baja y stop con espacio suficiente para ruido normal.";
      coreShare = 100;
    } else if (continuation >= 68 && falseBreakRisk <= 48 && stopAtr >= 1.0) {
      mode = "PROBE_PAPER";
      title = "PROBE HABILITADO · PAPER";
      detail = "Hay confirmación, pero aún existe riesgo de retest. Se prueba una fracción pequeña y el resto espera reclaim/retest.";
      probeShare = continuation >= 78 && falseBreakRisk <= 35 ? 30 : 20;
      coreShare = 100 - probeShare;
    } else {
      mode = "WAIT_RETEST";
      title = "ESPERAR RETEST / RECLAIM";
      detail = "La dirección aún puede funcionar, pero falta una entrada con mejor asimetría.";
    }

    let liveState = "DENTRO DE RUIDO NORMAL";
    if (currentBeyondWarning) liveState = "DETERIORO · VIGILAR";
    else if (currentBeyondNormalNoise) liveState = "FUERA DE RUIDO NORMAL";
    if (closeInvalidated) liveState = "INVALIDADO";

    const riskUnit = Math.abs(entryMid - stop);
    const rr1 = riskUnit > 0 ? Math.abs(tp1 - entryMid) / riskUnit : 0;

    return {
      direction, phase, price, entryLow, entryHigh, entryMid, stop, invalidation, tp1, rr1,
      falseBreakRisk, continuation, retestRisk, stopAtr, normalNoiseEdge, warningEdge, liveState,
      mode, title, detail, probeShare, coreShare, rsi5, rsi15, rvol,
    };
  }, [analysis, c5, c15]);

  if (!view) return null;

  const tone = view.mode === "NO_TRADE"
    ? "border-rose-500/25 bg-rose-500/[.045] text-rose-300"
    : view.mode === "CORE_PAPER"
      ? "border-emerald-500/25 bg-emerald-500/[.045] text-emerald-300"
      : view.mode === "PROBE_PAPER"
        ? "border-cyan-500/25 bg-cyan-500/[.045] text-cyan-300"
        : "border-amber-500/25 bg-amber-500/[.04] text-amber-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[.02] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><ShieldCheck size={17}/> Entry Shield X</div>
          <h2 className="mt-2 text-2xl font-black text-white">No confundir retroceso normal con fallo</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">El stop sigue protegiendo la invalidación final. Esta capa calcula cuánto movimiento adverso puede tolerarse como ruido normal y decide si conviene <b className="text-white">PROBE, CORE o esperar</b>.</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${tone}`}><div className="text-[9px] font-black uppercase tracking-[.12em] opacity-70">Decisión de entrada</div><div className="mt-1 text-xl font-black">{view.title}</div><div className="mt-1 max-w-md text-xs leading-5 opacity-80">{view.detail}</div></div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Waves size={14}/>} label="Falsa ruptura" value={`${view.falseBreakRisk.toFixed(0)}/100`} tone={view.falseBreakRisk >= 65 ? "bad" : view.falseBreakRisk >= 40 ? "warn" : "good"} />
        <Metric icon={<Target size={14}/>} label="Continuación" value={`${view.continuation.toFixed(0)}/100`} tone={view.continuation >= 72 ? "good" : view.continuation >= 55 ? "warn" : "neutral"} />
        <Metric icon={<Crosshair size={14}/>} label="Retest primero" value={`${view.retestRisk.toFixed(0)}/100`} tone={view.retestRisk >= 65 ? "warn" : "neutral"} />
        <Metric icon={<Layers3 size={14}/>} label="Stop en ATR" value={`${view.stopAtr.toFixed(2)} ATR`} tone={view.stopAtr >= 1 && view.stopAtr <= 2.8 ? "good" : "warn"} />
      </div>

      {(view.mode === "PROBE_PAPER" || view.mode === "CORE_PAPER") && <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.025] p-4"><div className="text-xs font-black text-cyan-200">DUAL ENTRY · SOLO PAPER</div><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-[9px] uppercase text-slate-500">PROBE</div><div className="mt-1 font-mono text-lg font-black text-white">{view.mode === "CORE_PAPER" ? "0%" : `${view.probeShare}%`}</div><div className="mt-1 text-[10px] text-slate-500">Evita perder por completo un impulso que nunca retestea.</div></div><div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="text-[9px] uppercase text-slate-500">CORE</div><div className="mt-1 font-mono text-lg font-black text-white">{view.mode === "CORE_PAPER" ? "100%" : `${view.coreShare}%`}</div><div className="mt-1 text-[10px] text-slate-500">Se completa solo cuando el mercado conserva aceptación/reclaim.</div></div></div></div>
        <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[.02] p-4"><div className="flex items-center gap-2 text-xs font-black text-emerald-200"><CheckCircle2 size={14}/> El stop NO cambia</div><div className="mt-2 text-sm leading-6 text-slate-400">Entrada media {formatPrice(view.entryMid)} · Stop {formatPrice(view.stop)} · TP1 {formatPrice(view.tp1)} · TP1 ≈ {view.rr1.toFixed(2)}R. El PROBE reduce exposición inicial; no amplía la invalidación.</div></div>
      </div>}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Zone title="Ruido normal hasta" value={formatPrice(view.normalNoiseEdge)} text="Llegar aquí no cancela automáticamente el plan." tone="good" />
        <Zone title="Zona de deterioro" value={formatPrice(view.warningEdge)} text="Aquí ya debe exigirse recuperación de estructura/flujo." tone="warn" />
        <Zone title="Invalidación" value={formatPrice(view.invalidation)} text="Cruzar y cerrar más allá de este nivel mata la tesis; nunca se ensancha el stop." tone="bad" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><span className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Estado del precio</span><span className={`rounded-full border px-3 py-1 text-[10px] font-black ${view.liveState === "INVALIDADO" ? "border-rose-500/25 text-rose-300" : view.liveState.includes("DETERIORO") || view.liveState.includes("FUERA") ? "border-amber-500/25 text-amber-300" : "border-emerald-500/25 text-emerald-300"}`}>{view.liveState}</span><span className="font-mono text-xs text-white">Precio {formatPrice(view.price)}</span></div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/[.025] p-3 text-[11px] leading-5 text-slate-500"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-300"/>PROBE/CORE no garantiza beneficio. Está diseñado para comparar en PAPER si dividir la entrada reduce falsos positivos sin perder demasiados movimientos directos. Si no mejora expectancy y drawdown, se elimina.</div>
    </div>
  </section>;
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const cls = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-rose-300" : "text-slate-200";
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-2 font-mono text-xl font-black ${cls}`}>{value}</div></div>;
}

function Zone({ title, value, text, tone }: { title: string; value: string; text: string; tone: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : "text-rose-300";
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{title}</div><div className={`mt-2 font-mono text-lg font-black ${cls}`}>{value}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">{text}</div></div>;
}
