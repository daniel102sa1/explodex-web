"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  ShieldAlert,
  Sparkles,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";

type Direction = "LONG" | "SHORT";
type Verdict = "FAVORABLE_TRAP" | "CLEAN_BREAK" | "TRAP_RISK" | "NO_EVENT";

function clamp(value: number, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function atr(candles: Candle[], period = 14) {
  if (candles.length < period + 1) return 0;
  const rows = candles.slice(-(period + 1));
  const values: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i];
    const prev = rows[i - 1];
    values.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}

function volumeRatio(candles: Candle[], period = 20) {
  if (candles.length < period + 2) return 1;
  const base = candles.slice(-period - 1, -1).map((x) => x.volume);
  const avg = base.reduce((a, b) => a + b, 0) / base.length || 1;
  return candles.at(-1)!.volume / avg;
}

function rangeLevels(candles: Candle[], lookback = 24, exclude = 3) {
  if (candles.length < lookback + exclude) return null;
  const rows = candles.slice(-(lookback + exclude), -exclude);
  return {
    high: Math.max(...rows.map((x) => x.high)),
    low: Math.min(...rows.map((x) => x.low)),
  };
}

function wickStats(candle: Candle) {
  const range = Math.max(candle.high - candle.low, 1e-12);
  const upper = Math.max(0, candle.high - Math.max(candle.open, candle.close)) / range;
  const lower = Math.max(0, Math.min(candle.open, candle.close) - candle.low) / range;
  const body = Math.abs(candle.close - candle.open) / range;
  return { upper, lower, body };
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

export default function TrapDetectorX({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [m1, setM1] = useState<Candle[]>([]);
  const [m5, setM5] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, c1, c5] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "1m", 120),
          getCandles(safeSymbol, "5m", 100),
        ]);
        if (!cancelled) {
          setAnalysis(a);
          setM1(c1);
          setM5(c5);
        }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis || m1.length < 35 || m5.length < 35) return null;

    const direction = (analysis.prediction?.direction ?? analysis.direction) as Direction;
    const side = direction === "LONG" ? 1 : -1;
    const levels1 = rangeLevels(m1, 24, 3);
    const levels5 = rangeLevels(m5, 20, 2);
    if (!levels1 || !levels5) return null;

    const recent1 = m1.slice(-3);
    const latest1 = recent1.at(-1)!;
    const prev1 = recent1.at(-2)!;
    const latest5 = m5.at(-1)!;
    const a1 = atr(m1, 14) || Math.max(latest1.close * 0.001, 1e-12);
    const rvol1 = volumeRatio(m1);
    const rvol5 = volumeRatio(m5);
    const wick1 = wickStats(latest1);
    const wickPrev = wickStats(prev1);

    const sweepDown = recent1.some((c) => c.low < levels1.low - a1 * 0.08 && c.close > levels1.low);
    const sweepUp = recent1.some((c) => c.high > levels1.high + a1 * 0.08 && c.close < levels1.high);
    const breakoutUp = recent1.some((c) => c.close > levels1.high + a1 * 0.05);
    const breakoutDown = recent1.some((c) => c.close < levels1.low - a1 * 0.05);
    const backInsideAfterUp = breakoutUp && latest1.close < levels1.high;
    const backInsideAfterDown = breakoutDown && latest1.close > levels1.low;

    const acceptedUp = recent1.slice(-2).every((c) => c.close > levels1.high) && latest5.close >= levels5.high * 0.999;
    const acceptedDown = recent1.slice(-2).every((c) => c.close < levels1.low) && latest5.close <= levels5.low * 1.001;

    const metrics = analysis.metrics ?? {};
    const seq = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
    const oi = num(metrics.oi_change_pct, num(seq.oi_change_pct));
    const flowFor = (spot * side > 0.025 ? 1 : 0) + (futures * side > 0.025 ? 1 : 0);
    const flowAgainst = (spot * side < -0.03 ? 1 : 0) + (futures * side < -0.03 ? 1 : 0);

    const absorptionLike = rvol1 >= 1.5 && (wick1.body <= 0.28 || wickPrev.body <= 0.28) && (
      direction === "LONG" ? Math.max(wick1.upper, wickPrev.upper) >= 0.38 : Math.max(wick1.lower, wickPrev.lower) >= 0.38
    );

    const favorableSweep = direction === "LONG" ? sweepDown : sweepUp;
    const adverseSweep = direction === "LONG" ? sweepUp : sweepDown;
    const favorableAcceptance = direction === "LONG" ? acceptedUp : acceptedDown;
    const adverseFakeBreak = direction === "LONG" ? backInsideAfterUp : backInsideAfterDown;

    let trapRisk = 12;
    if (adverseFakeBreak) trapRisk += 34;
    if (adverseSweep) trapRisk += 16;
    if (flowAgainst >= 1) trapRisk += 12 * flowAgainst;
    if (absorptionLike) trapRisk += 16;
    if (rvol1 < 0.75) trapRisk += 10;
    if (analysis.ready_checks?.direction_match === false) trapRisk += 20;
    if (analysis.ready_checks?.risk_guard_pass === false) trapRisk += 25;
    if (oi > 0.4 && flowAgainst >= 1) trapRisk += 8;
    trapRisk = clamp(trapRisk);

    let favorableTrapScore = 0;
    if (favorableSweep) favorableTrapScore += 35;
    if (flowFor >= 1) favorableTrapScore += 13 * flowFor;
    if (rvol1 >= 1.1) favorableTrapScore += 10;
    if (direction === "LONG" && wick1.lower >= 0.30) favorableTrapScore += 12;
    if (direction === "SHORT" && wick1.upper >= 0.30) favorableTrapScore += 12;
    if (latest1.close * side > prev1.close * side) favorableTrapScore += 8;
    favorableTrapScore = clamp(favorableTrapScore);

    let breakoutQuality = 0;
    if (favorableAcceptance) breakoutQuality += 38;
    if (flowFor >= 1) breakoutQuality += 14 * flowFor;
    if (rvol1 >= 1.0) breakoutQuality += 10;
    if (rvol5 >= 0.9) breakoutQuality += 10;
    if (!absorptionLike) breakoutQuality += 10;
    if (trapRisk <= 35) breakoutQuality += 10;
    breakoutQuality = clamp(breakoutQuality);

    let verdict: Verdict = "NO_EVENT";
    let title = "SIN EVENTO DE TRAMPA";
    let action = "SEGUIR PROTOCOLO NORMAL";
    let detail = "No aparece una barrida o falsa ruptura suficientemente clara en las últimas velas.";

    if (trapRisk >= 68) {
      verdict = "TRAP_RISK";
      title = "RIESGO DE TRAMPA";
      action = "NO CONFIRMAR TODAVÍA";
      detail = "Hay regreso al rango, flujo contrario, absorción compatible o falta de aceptación. Esperar cierres limpios antes de habilitar entrada.";
    } else if (favorableTrapScore >= 62 && favorableSweep) {
      verdict = "FAVORABLE_TRAP";
      title = "BARRIDA A FAVOR";
      action = "VIGILAR RECLAIM";
      detail = `Se barrió liquidez contra el ${direction} y el precio volvió al rango. Puede favorecer la tesis si el reclaim se mantiene.`;
    } else if (breakoutQuality >= 68 && favorableAcceptance) {
      verdict = "CLEAN_BREAK";
      title = "RUPTURA ACEPTADA";
      action = "CONFIRMACIÓN MÁS LIMPIA";
      detail = "Dos cierres aceptan el nivel y el flujo/volumen no muestran una contradicción fuerte. Sigue faltando respetar Risk Guard y el plan.";
    }

    const watchedLevel = direction === "LONG" ? levels1.high : levels1.low;
    const oppositeLevel = direction === "LONG" ? levels1.low : levels1.high;

    return {
      direction,
      verdict,
      title,
      action,
      detail,
      trapRisk,
      favorableTrapScore,
      breakoutQuality,
      favorableSweep,
      adverseSweep,
      acceptedUp,
      acceptedDown,
      backInsideAfterUp,
      backInsideAfterDown,
      absorptionLike,
      rvol1,
      rvol5,
      spot,
      futures,
      oi,
      watchedLevel,
      oppositeLevel,
      price: num(analysis.current_price, latest1.close),
    };
  }, [analysis, m1, m5]);

  if (!view) return null;

  const tone = view.verdict === "TRAP_RISK"
    ? "border-rose-500/25 bg-rose-500/[.04] text-rose-300"
    : view.verdict === "FAVORABLE_TRAP"
      ? "border-amber-500/25 bg-amber-500/[.04] text-amber-300"
      : view.verdict === "CLEAN_BREAK"
        ? "border-emerald-500/25 bg-emerald-500/[.04] text-emerald-300"
        : "border-slate-700 bg-slate-900/40 text-slate-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-fuchsia-500/15 bg-fuchsia-500/[.018] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-fuchsia-300"><Sparkles size={17}/> Trap Detector X</div>
          <h2 className="mt-2 text-2xl font-black text-white">¿Ruptura real o barrida?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Busca barridas, regreso al rango, aceptación de cierres, volumen y contradicción del flujo. Detecta patrones compatibles con una trampa; no afirma manipulación.</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${tone}`}>
          <div className="text-[9px] font-black uppercase tracking-[.12em] opacity-70">Veredicto</div>
          <div className="mt-1 text-xl font-black">{view.title}</div>
          <div className="mt-1 text-sm font-black">{view.action}</div>
          <div className="mt-1 max-w-md text-xs leading-5 opacity-80">{view.detail}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Meter label="Riesgo de trampa" value={view.trapRisk} inverse />
        <Meter label="Barrida favorable" value={view.favorableTrapScore} />
        <Meter label="Calidad ruptura" value={view.breakoutQuality} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Mini label="Nivel a aceptar" value={formatPrice(view.watchedLevel)} />
        <Mini label="Límite opuesto" value={formatPrice(view.oppositeLevel)} />
        <Mini label="Volumen 1m / 5m" value={`${view.rvol1.toFixed(2)}x / ${view.rvol5.toFixed(2)}x`} />
        <Mini label="Precio" value={formatPrice(view.price)} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Check label="Barrida favorable" ok={view.favorableSweep} />
        <Check label="Barrida adversa" ok={!view.adverseSweep} inverseText="Detectada" />
        <Check label="Sin absorción fuerte" ok={!view.absorptionLike} inverseText="Absorción compatible" />
        <Check label="Sin falsa ruptura" ok={!(view.backInsideAfterUp || view.backInsideAfterDown)} inverseText="Regresó al rango" />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-950/35 p-3 text-[11px] leading-5 text-slate-500"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-300"/>Este detector es un veto adicional, no un permiso automático para entrar. Una barrida favorable todavía necesita reclaim, dirección estable, Risk Guard y una entrada válida.</div>
    </div>
  </section>;
}

function Meter({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  const tone = inverse
    ? value >= 68 ? "text-rose-300" : value >= 42 ? "text-amber-300" : "text-emerald-300"
    : value >= 68 ? "text-emerald-300" : value >= 42 ? "text-amber-300" : "text-slate-300";
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-500"><Waves size={13}/>{label}</div><div className={`mt-2 font-mono text-xl font-black ${tone}`}>{value.toFixed(0)}/100</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-current" style={{ width: `${clamp(value)}%` }}/></div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-1 font-mono text-xs font-black text-white">{value}</div></div>;
}

function Check({ label, ok, inverseText }: { label: string; ok: boolean; inverseText?: string }) {
  return <div className={`flex items-center gap-2 rounded-xl border p-3 text-[10px] font-black ${ok ? "border-emerald-500/15 bg-emerald-500/[.025] text-emerald-300" : "border-rose-500/15 bg-rose-500/[.025] text-rose-300"}`}>{ok ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>} {ok ? label : (inverseText || label)}</div>;
}
