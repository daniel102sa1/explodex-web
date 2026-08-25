"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock3,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";

type Bias = "LONG" | "SHORT" | "RANGE";
type PathKind = "DIRECT_EXPANSION" | "RETEST_THEN_CONTINUE" | "FALSE_BREAK_RISK" | "EXHAUSTION_TURN" | "WAIT_CONFIRMATION" | "RANGE";

type TemporalSample = {
  at: number;
  direction: Bias;
  score: number;
  turningRisk: number;
  falseBreakRisk: number;
  path: PathKind;
};

const MEMORY_PREFIX = "explodex:temporal-path:";

function clamp(value: number, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function emaSeries(values: number[], period: number) {
  if (!values.length) return [] as number[];
  const alpha = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * alpha + out[i - 1] * (1 - alpha));
  return out;
}

function atr(candles: Candle[], period = 14) {
  if (candles.length < 2) return 0;
  const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)));
  let value = tr.slice(0, Math.min(period, tr.length)).reduce((a, b) => a + b, 0) / Math.min(period, tr.length);
  for (let i = period; i < tr.length; i++) value = (value * (period - 1) + tr[i]) / period;
  return value;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
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
  if (candles.length < 14) return "MIXED";
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
  if (candles.length < 3) return 1;
  const base = candles.slice(-period - 1, -1).map((x) => x.volume);
  if (!base.length) return 1;
  const avg = base.reduce((a, b) => a + b, 0) / base.length || 1;
  return candles.at(-1)!.volume / avg;
}

function wickPressure(candles: Candle[]) {
  const rows = candles.slice(-4);
  if (!rows.length) return { upper: 0, lower: 0 };
  let upper = 0;
  let lower = 0;
  let range = 0;
  for (const c of rows) {
    const r = Math.max(c.high - c.low, 1e-12);
    upper += Math.max(0, c.high - Math.max(c.open, c.close));
    lower += Math.max(0, Math.min(c.open, c.close) - c.low);
    range += r;
  }
  return { upper: upper / range, lower: lower / range };
}

function trendScore(candles: Candle[]) {
  if (candles.length < 30) return { score: 0, structure: "MIXED", rsi: 50, atr: 0, ema9: 0, ema21: 0, volumeRatio: 1, price: 0 };
  const closes = candles.map((x) => x.close);
  const e9s = emaSeries(closes, 9);
  const e21s = emaSeries(closes, 21);
  const price = closes.at(-1)!;
  const e9 = e9s.at(-1)!;
  const e21 = e21s.at(-1)!;
  const slope21 = e21s.length > 5 && e21s.at(-6)! !== 0 ? (e21 - e21s.at(-6)!) / Math.abs(e21s.at(-6)!) * 100 : 0;
  const s = structure(candles);
  const recent = closes.slice(-4);
  const impulse = recent.length >= 4 && recent[0] !== 0 ? (recent.at(-1)! - recent[0]) / Math.abs(recent[0]) * 100 : 0;
  let score = 0;
  score += price > e9 ? 15 : -15;
  score += e9 > e21 ? 20 : -20;
  score += slope21 > 0.02 ? 20 : slope21 < -0.02 ? -20 : 0;
  score += s === "HH_HL" ? 25 : s === "LH_LL" ? -25 : 0;
  score += impulse > 0.08 ? 20 : impulse < -0.08 ? -20 : 0;
  return { score: Math.max(-100, Math.min(100, score)), structure: s, rsi: rsi(closes), atr: atr(candles), ema9: e9, ema21: e21, volumeRatio: volumeRatio(candles), price };
}

function divergenceRisk(candles: Candle[], direction: Bias) {
  if (direction === "RANGE" || candles.length < 35) return 0;
  const a = candles.slice(-28, -14);
  const b = candles.slice(-14);
  const aClose = a.map((x) => x.close);
  const bClose = b.map((x) => x.close);
  if (direction === "LONG") {
    const higherHigh = Math.max(...b.map((x) => x.high)) > Math.max(...a.map((x) => x.high));
    const weakerRsi = rsi(bClose) + 4 < rsi(aClose);
    return higherHigh && weakerRsi ? 18 : 0;
  }
  const lowerLow = Math.min(...b.map((x) => x.low)) < Math.min(...a.map((x) => x.low));
  const strongerRsi = rsi(bClose) > rsi(aClose) + 4;
  return lowerLow && strongerRsi ? 18 : 0;
}

function memoryKey(symbol: string) {
  return `${MEMORY_PREFIX}${symbol.toUpperCase()}`;
}

function readMemory(symbol: string): TemporalSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(memoryKey(symbol));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-12) : [];
  } catch {
    return [];
  }
}

function writeMemory(symbol: string, rows: TemporalSample[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(memoryKey(symbol), JSON.stringify(rows.slice(-12))); } catch {}
}

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 7 });
}

function BiasIcon({ bias }: { bias: Bias }) {
  return bias === "LONG" ? <ArrowUp size={14}/> : bias === "SHORT" ? <ArrowDown size={14}/> : <ArrowRight size={14}/>;
}

export default function TemporalPathEngine({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [c5, setC5] = useState<Candle[]>([]);
  const [c15, setC15] = useState<Candle[]>([]);
  const [c1h, setC1h] = useState<Candle[]>([]);
  const [memory, setMemory] = useState<TemporalSample[]>([]);

  useEffect(() => setMemory(readMemory(safeSymbol)), [safeSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, m5, m15, h1] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "5m", 120),
          getCandles(safeSymbol, "15m", 120),
          getCandles(safeSymbol, "1h", 100),
        ]);
        if (!cancelled) { setAnalysis(a); setC5(m5); setC15(m15); setC1h(h1); }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis || c5.length < 30 || c15.length < 30 || c1h.length < 30) return null;
    const h5 = trendScore(c5);
    const h15 = trendScore(c15);
    const h1 = trendScore(c1h);
    const modelEdge = clamp((num(analysis.long_score) - num(analysis.short_score)) * 3, -25, 25);
    const weighted = h5.score * 0.42 + h15.score * 0.33 + h1.score * 0.20 + modelEdge * 0.20;
    const direction: Bias = weighted >= 18 ? "LONG" : weighted <= -18 ? "SHORT" : "RANGE";
    const strength = clamp(Math.abs(weighted));

    const w = wickPressure(c5);
    const currentAtr = h5.atr || Math.max(h5.price * 0.002, 1e-12);
    const distanceAtr = currentAtr > 0 ? Math.abs(h5.price - h5.ema21) / currentAtr : 0;
    const recent = c5.slice(-4);
    const recentMove = recent.length > 1 ? Math.abs(recent.at(-1)!.close - recent[0].open) / currentAtr : 0;

    let turningRisk = direction === "RANGE" ? 45 : 8;
    if (direction === "LONG") {
      if (h5.rsi >= 78) turningRisk += 18; else if (h5.rsi >= 70) turningRisk += 9;
      if (h15.rsi >= 75) turningRisk += 14;
      if (distanceAtr >= 1.5) turningRisk += 18; else if (distanceAtr >= 0.9) turningRisk += 9;
      if (w.upper >= 0.32) turningRisk += 14;
      if (h5.structure === "LH_LL") turningRisk += 20;
    } else if (direction === "SHORT") {
      if (h5.rsi <= 22) turningRisk += 18; else if (h5.rsi <= 30) turningRisk += 9;
      if (h15.rsi <= 25) turningRisk += 14;
      if (distanceAtr >= 1.5) turningRisk += 18; else if (distanceAtr >= 0.9) turningRisk += 9;
      if (w.lower >= 0.32) turningRisk += 14;
      if (h5.structure === "HH_HL") turningRisk += 20;
    }
    if (h5.volumeRatio >= 2.0 && recentMove >= 1.4) turningRisk += 10;
    turningRisk += divergenceRisk(c15, direction);
    turningRisk = clamp(turningRisk);

    const metrics = analysis.metrics ?? {};
    const seq = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
    const oi = num(metrics.oi_change_pct, num(seq.oi_change_pct));
    const rvol = num(metrics.relative_volume, num(seq.relative_volume, h5.volumeRatio));
    const desired = direction === "LONG" ? 1 : direction === "SHORT" ? -1 : 0;
    let falseBreakRisk = direction === "RANGE" ? 55 : 12;
    if (desired && spot * desired < -0.03) falseBreakRisk += 20;
    if (desired && futures * desired < -0.03) falseBreakRisk += 16;
    if (desired && oi < -0.25 && (spot * desired <= 0 || futures * desired <= 0)) falseBreakRisk += 15;
    if (rvol < 0.75) falseBreakRisk += 12;
    if (direction === "LONG" && w.upper >= 0.30) falseBreakRisk += 10;
    if (direction === "SHORT" && w.lower >= 0.30) falseBreakRisk += 10;
    if (analysis.ready_checks?.direction_match === false) falseBreakRisk += 25;
    falseBreakRisk = clamp(falseBreakRisk);

    let retestLikelihood = 12;
    if (distanceAtr >= 0.65) retestLikelihood += 25;
    if (recentMove >= 0.9) retestLikelihood += 20;
    if (direction === "LONG" && h5.rsi >= 68) retestLikelihood += 15;
    if (direction === "SHORT" && h5.rsi <= 32) retestLikelihood += 15;
    if (h5.volumeRatio >= 1.6) retestLikelihood += 10;
    retestLikelihood = clamp(retestLikelihood);

    const alignedFrames = [h5.score, h15.score, h1.score].filter((x) => direction === "LONG" ? x > 18 : direction === "SHORT" ? x < -18 : Math.abs(x) < 18).length;
    let continuation = clamp(strength * 0.55 + alignedFrames * 10 + (rvol >= 1.05 ? 8 : 0) + (analysis.ready_checks?.risk_guard_pass === false ? -25 : 8));
    if (turningRisk >= 70) continuation = Math.min(continuation, 55);
    if (falseBreakRisk >= 65) continuation = Math.min(continuation, 50);

    let path: PathKind = "WAIT_CONFIRMATION";
    if (direction === "RANGE") path = "RANGE";
    else if (falseBreakRisk >= 68) path = "FALSE_BREAK_RISK";
    else if (turningRisk >= 74) path = "EXHAUSTION_TURN";
    else if (retestLikelihood >= 62) path = "RETEST_THEN_CONTINUE";
    else if (continuation >= 70) path = "DIRECT_EXPANSION";

    const existing = memory.slice(-6);
    const combined = [...existing, { at: Date.now(), direction, score: strength, turningRisk, falseBreakRisk, path } as TemporalSample].slice(-6);
    const directional = combined.filter((x) => x.direction !== "RANGE").slice(-5);
    const longCount = directional.filter((x) => x.direction === "LONG").length;
    const shortCount = directional.filter((x) => x.direction === "SHORT").length;
    const lockedDirection: Bias | null = directional.length >= 3 && longCount / directional.length >= 0.8 ? "LONG" : directional.length >= 3 && shortCount / directional.length >= 0.8 ? "SHORT" : null;
    const stability = directional.length ? Math.max(longCount, shortCount) / directional.length * 100 : 0;
    const last3 = directional.slice(-3);
    const oppositeStreak = lockedDirection ? last3.every((x) => x.direction !== lockedDirection && x.direction !== "RANGE") : false;

    const price = num(analysis.current_price, h5.price);
    const normalPullback = direction === "LONG"
      ? Math.max(num(analysis.entry_low, 0), h5.ema21 - currentAtr * 0.20)
      : direction === "SHORT"
        ? Math.min(num(analysis.entry_high, Number.POSITIVE_INFINITY), h5.ema21 + currentAtr * 0.20)
        : h5.ema21;
    const invalidation = num(analysis.invalidation_price, num(analysis.stop_loss));

    const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
    const directionMatch = analysis.ready_checks?.direction_match !== false;
    const chase = Boolean(analysis.ready_checks?.chase_risk ?? seq.chase_risk);
    let action = "ESPERAR";
    let reason = "Todavía no hay ventaja temporal suficientemente limpia.";
    if (!riskGuardPass) { action = "NO TRADE"; reason = "Risk Guard bloquea la operación."; }
    else if (!directionMatch) { action = "NO TRADE"; reason = "El predictor principal y el camino temporal no están alineados."; }
    else if (lockedDirection && direction !== "RANGE" && lockedDirection !== direction && !oppositeStreak) { action = "ESPERAR"; reason = `Direction Lock conserva ${lockedDirection}; una lectura contraria no basta para voltearlo.`; }
    else if (falseBreakRisk >= 68) { action = "ESPERAR"; reason = "Riesgo alto de falsa confirmación; falta aceptación del movimiento."; }
    else if (turningRisk >= 74) { action = "ESPERAR GIRO/RETEST"; reason = "El impulso parece demasiado extendido para perseguirlo ahora."; }
    else if (chase) { action = "ESPERAR RETEST"; reason = "La dirección puede ser correcta, pero la entrada actual está perseguida."; }
    else if (path === "RETEST_THEN_CONTINUE") { action = "ESPERAR RETEST"; reason = "El camino más coherente es retroceso normal antes de otra expansión."; }
    else if (analysis.state === "READY" && analysis.prediction?.phase === "ACTIVADO" && lockedDirection === direction && continuation >= 70) { action = "HABILITADO · PAPER"; reason = "Dirección estable, activación, Risk Guard y camino temporal coinciden."; }
    else if (continuation >= 68) { action = "VIGILAR ACTIVACIÓN"; reason = "La dirección tiene ventaja, pero todavía falta completar el protocolo de entrada."; }

    return {
      direction, strength, h5, h15, h1, turningRisk, falseBreakRisk, retestLikelihood, continuation, path,
      lockedDirection, stability, price, normalPullback, invalidation, action, reason,
    };
  }, [analysis, c5, c15, c1h, memory]);

  useEffect(() => {
    if (!view) return;
    const last = memory.at(-1);
    if (last && Date.now() - last.at < 60_000) return;
    const next: TemporalSample = { at: Date.now(), direction: view.direction, score: view.strength, turningRisk: view.turningRisk, falseBreakRisk: view.falseBreakRisk, path: view.path };
    const updated = [...memory, next].slice(-12);
    setMemory(updated);
    writeMemory(safeSymbol, updated);
  }, [view, memory, safeSymbol]);

  if (!view) return null;

  const pathLabel: Record<PathKind, string> = {
    DIRECT_EXPANSION: "IMPULSO DIRECTO",
    RETEST_THEN_CONTINUE: "RETEST → CONTINUACIÓN",
    FALSE_BREAK_RISK: "RIESGO DE FALSA RUPTURA",
    EXHAUSTION_TURN: "AGOTAMIENTO → GIRO/RETEST",
    WAIT_CONFIRMATION: "ESPERAR CONFIRMACIÓN",
    RANGE: "RANGO / SIN VENTAJA",
  };

  const actionTone = view.action.startsWith("HABILITADO") ? "text-emerald-300 border-emerald-500/25 bg-emerald-500/[.05]" : view.action === "NO TRADE" ? "text-rose-300 border-rose-500/25 bg-rose-500/[.05]" : "text-amber-300 border-amber-500/25 bg-amber-500/[.045]";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[.025] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-violet-300"><Sparkles size={17}/> Temporal Path Engine</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 text-2xl font-black ${view.direction === "LONG" ? "text-emerald-300" : view.direction === "SHORT" ? "text-rose-300" : "text-slate-300"}`}><BiasIcon bias={view.direction}/>{view.direction}</span>
            <span className="font-mono text-sm font-black text-white">fuerza {view.strength.toFixed(0)}/100</span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black text-slate-300">{pathLabel[view.path]}</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Intenta responder <b className="text-white">qué debería ocurrir primero</b>: expansión, retroceso, falsa ruptura o giro. Son scores técnicos, no certeza del futuro.</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${actionTone}`}><div className="text-[9px] font-black uppercase tracking-[.12em] opacity-70">Acción ahora</div><div className="mt-1 text-xl font-black">{view.action}</div><div className="mt-1 max-w-md text-xs leading-5 opacity-80">{view.reason}</div></div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Horizon title="AHORA" window="5–15 min" data={view.h5} />
        <Horizon title="DESPUÉS" window="15–60 min" data={view.h15} />
        <Horizon title="MARCO" window="1–4 h" data={view.h1} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Meter icon={<RotateCcw size={14}/>} label="Riesgo de giro" value={view.turningRisk} inverse />
        <Meter icon={<Waves size={14}/>} label="Falsa confirmación" value={view.falseBreakRisk} inverse />
        <Meter icon={<Activity size={14}/>} label="Retest primero" value={view.retestLikelihood} />
        <Meter icon={<Gauge size={14}/>} label="Continuación" value={view.continuation} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-xs font-black text-white"><ShieldCheck size={14} className="text-cyan-300"/> Direction Lock</div><div className="mt-2 text-lg font-black text-white">{view.lockedDirection ?? "CREANDO ESTABILIDAD"}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">Estabilidad temporal {view.stability.toFixed(0)}%. Una sola lectura contraria no cambia la dirección bloqueada.</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-xs font-black text-white"><Clock3 size={14} className="text-amber-300"/> Retroceso normal estimado</div><div className="mt-2 font-mono text-lg font-black text-amber-200">{formatPrice(view.normalPullback)}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">Llegar a esta zona no cancela automáticamente la tesis; se compara con estructura y flujo.</div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-xs font-black text-white"><AlertTriangle size={14} className="text-rose-300"/> Invalidación estructural</div><div className="mt-2 font-mono text-lg font-black text-rose-200">{formatPrice(view.invalidation)}</div><div className="mt-1 text-[10px] leading-5 text-slate-500">La cancelación debería venir de pérdida estructural real, no de una simple mecha o retroceso normal.</div></div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/35 p-3 text-[11px] leading-5 text-slate-500">ExplodeX no puede saber con seguridad exacta cuándo subirá o bajará. Este motor está diseñado para <b className="text-slate-300">rechazar más falsas confirmaciones y describir el camino esperado antes de habilitar una entrada</b>.</div>
    </div>
  </section>;
}

function Horizon({ title, window, data }: { title: string; window: string; data: ReturnType<typeof trendScore> }) {
  const bias: Bias = data.score >= 18 ? "LONG" : data.score <= -18 ? "SHORT" : "RANGE";
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">{title}</span><span className="text-[10px] text-slate-600">{window}</span></div><div className={`mt-2 inline-flex items-center gap-1 text-lg font-black ${bias === "LONG" ? "text-emerald-300" : bias === "SHORT" ? "text-rose-300" : "text-slate-300"}`}><BiasIcon bias={bias}/>{bias}</div><div className="mt-2 text-[10px] text-slate-500">estructura {data.structure} · RSI {data.rsi.toFixed(1)} · vol {data.volumeRatio.toFixed(2)}x</div></div>;
}

function Meter({ icon, label, value, inverse = false }: { icon: React.ReactNode; label: string; value: number; inverse?: boolean }) {
  const tone = inverse ? (value >= 70 ? "text-rose-300" : value >= 45 ? "text-amber-300" : "text-emerald-300") : (value >= 70 ? "text-emerald-300" : value >= 45 ? "text-amber-300" : "text-slate-300");
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-2 font-mono text-xl font-black ${tone}`}>{value.toFixed(0)}/100</div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-current" style={{ width: `${clamp(value)}%` }}/></div></div>;
}
