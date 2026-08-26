"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Gauge, Sparkles, TrendingDown, TrendingUp, Waves } from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";

type Direction = "LONG" | "SHORT";
type DecayState = "HEALTHY" | "EARLY_FATIGUE" | "PERSISTENT_DECAY" | "EXHAUSTED" | "NEUTRAL";

type Sample = {
  at: number;
  direction: Direction;
  decay: number;
  lateRisk: number;
};

const PREFIX = "explodex:momentum-decay:";

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
  if (candles.length < period + 1) return 0;
  const rows = candles.slice(-(period + 1));
  const tr: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i];
    const p = rows[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return tr.reduce((a, b) => a + b, 0) / Math.max(tr.length, 1);
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const rows = values.slice(-(period + 1));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < rows.length; i++) {
    const d = rows[i] - rows[i - 1];
    gain += Math.max(d, 0);
    loss += Math.max(-d, 0);
  }
  if (loss <= 1e-12) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function bodyEfficiency(rows: Candle[], direction: Direction) {
  if (!rows.length) return 0;
  return avg(rows.map((c) => {
    const range = Math.max(c.high - c.low, 1e-12);
    const signedBody = direction === "LONG" ? c.close - c.open : c.open - c.close;
    return clamp(signedBody / range * 100, -100, 100);
  }));
}

function opposingWick(rows: Candle[], direction: Direction) {
  if (!rows.length) return 0;
  return avg(rows.map((c) => {
    const range = Math.max(c.high - c.low, 1e-12);
    const wick = direction === "LONG"
      ? c.high - Math.max(c.open, c.close)
      : Math.min(c.open, c.close) - c.low;
    return clamp(wick / range * 100, 0, 100);
  }));
}

function windowVelocity(rows: Candle[], direction: Direction, unit: number) {
  if (rows.length < 2 || unit <= 0) return 0;
  const start = rows[0].open;
  const end = rows.at(-1)!.close;
  return direction === "LONG" ? (end - start) / unit : (start - end) / unit;
}

function volumeWindowRatio(candles: Candle[]) {
  if (candles.length < 14) return 1;
  const prior = avg(candles.slice(-12, -6).map((x) => x.volume)) || 1;
  const recent = avg(candles.slice(-6).map((x) => x.volume));
  return recent / prior;
}

function divergence(candles: Candle[], direction: Direction) {
  if (candles.length < 32) return false;
  const a = candles.slice(-28, -14);
  const b = candles.slice(-14);
  const ra = rsi(a.map((x) => x.close), 10);
  const rb = rsi(b.map((x) => x.close), 10);
  if (direction === "LONG") {
    return Math.max(...b.map((x) => x.high)) > Math.max(...a.map((x) => x.high)) && rb + 4 < ra;
  }
  return Math.min(...b.map((x) => x.low)) < Math.min(...a.map((x) => x.low)) && rb > ra + 4;
}

function readMemory(symbol: string): Sample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${PREFIX}${symbol}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-10) : [];
  } catch {
    return [];
  }
}

function writeMemory(symbol: string, rows: Sample[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${PREFIX}${symbol}`, JSON.stringify(rows.slice(-10))); } catch {}
}

export default function MomentumDecayEngine({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [m1, setM1] = useState<Candle[]>([]);
  const [m5, setM5] = useState<Candle[]>([]);
  const [m15, setM15] = useState<Candle[]>([]);
  const [memory, setMemory] = useState<Sample[]>([]);

  useEffect(() => setMemory(readMemory(safeSymbol)), [safeSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, c1, c5, c15] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "1m", 120),
          getCandles(safeSymbol, "5m", 100),
          getCandles(safeSymbol, "15m", 100),
        ]);
        if (!cancelled) { setAnalysis(a); setM1(c1); setM5(c5); setM15(c15); }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis || m1.length < 35 || m5.length < 35 || m15.length < 35) return null;
    const direction = (analysis.prediction?.direction ?? analysis.direction) as Direction;
    const side = direction === "LONG" ? 1 : -1;
    const unit1 = atr(m1, 14) || Math.max(num(analysis.current_price) * 0.001, 1e-12);
    const unit5 = atr(m5, 14) || unit1 * 2;
    const recent1 = m1.slice(-6);
    const prior1 = m1.slice(-12, -6);
    const recent5 = m5.slice(-5);
    const prior5 = m5.slice(-10, -5);

    const velNow = windowVelocity(recent1, direction, unit1);
    const velPrev = windowVelocity(prior1, direction, unit1);
    const vel5Now = windowVelocity(recent5, direction, unit5);
    const vel5Prev = windowVelocity(prior5, direction, unit5);
    const velocityRatio = Math.abs(velPrev) > 0.08 ? velNow / Math.abs(velPrev) : 1;
    const velocityRatio5 = Math.abs(vel5Prev) > 0.08 ? vel5Now / Math.abs(vel5Prev) : 1;

    const bodyNow = bodyEfficiency(recent1, direction);
    const bodyPrev = bodyEfficiency(prior1, direction);
    const wick = opposingWick(recent1, direction);
    const volRatio = volumeWindowRatio(m1);

    const closes5 = m5.map((x) => x.close);
    const e9 = emaSeries(closes5, 9);
    const e21 = emaSeries(closes5, 21);
    const spreadNow = Math.abs((e9.at(-1) ?? 0) - (e21.at(-1) ?? 0));
    const spreadPrev = Math.abs((e9.at(-5) ?? 0) - (e21.at(-5) ?? 0));
    const spreadRatio = spreadPrev > 0 ? spreadNow / spreadPrev : 1;

    const div = divergence(m5, direction);
    const rsi5 = rsi(closes5, 14);
    const rsi15 = rsi(m15.map((x) => x.close), 14);
    const price = num(analysis.current_price, m1.at(-1)!.close);
    const ema21 = e21.at(-1) ?? price;
    const extensionAtr = unit5 > 0 ? Math.abs(price - ema21) / unit5 : 0;

    const madeFreshExtreme = direction === "LONG"
      ? Math.max(...recent1.map((x) => x.high)) >= Math.max(...m1.slice(-24, -6).map((x) => x.high))
      : Math.min(...recent1.map((x) => x.low)) <= Math.min(...m1.slice(-24, -6).map((x) => x.low));

    let decay = 8;
    if (madeFreshExtreme && velocityRatio < 0.65) decay += 18;
    if (velocityRatio5 < 0.70) decay += 14;
    if (volRatio < 0.78) decay += 14;
    if (bodyNow < Math.max(8, bodyPrev * 0.55)) decay += 12;
    if (wick >= 32) decay += 12;
    if (spreadRatio < 0.78) decay += 12;
    if (div) decay += 18;
    if (direction === "LONG" && rsi5 >= 78) decay += 8;
    if (direction === "SHORT" && rsi5 <= 22) decay += 8;
    if (direction === "LONG" && rsi15 >= 76) decay += 8;
    if (direction === "SHORT" && rsi15 <= 24) decay += 8;
    decay = clamp(decay);

    const metrics = analysis.metrics ?? {};
    const seq = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
    if (spot * side < -0.03) decay = clamp(decay + 10);
    if (futures * side < -0.03) decay = clamp(decay + 8);

    let lateRisk = decay * 0.58;
    if (extensionAtr >= 1.25) lateRisk += 18; else if (extensionAtr >= 0.8) lateRisk += 10;
    if (Boolean(analysis.ready_checks?.chase_risk ?? seq.chase_risk)) lateRisk += 22;
    lateRisk = clamp(lateRisk);

    const recentMemory = [...memory, { at: Date.now(), direction, decay, lateRisk }].slice(-5);
    const sameDirection = recentMemory.filter((x) => x.direction === direction);
    const last3 = sameDirection.slice(-3);
    const persistent = last3.length >= 3 && last3.every((x) => x.decay >= 52);
    const persistentSevere = last3.length >= 3 && last3.every((x) => x.decay >= 68);

    let state: DecayState = "NEUTRAL";
    let title = "MOMENTUM NEUTRAL";
    let action = "SEGUIR PROTOCOLO NORMAL";
    let detail = "No hay evidencia persistente de aceleración limpia ni de agotamiento fuerte.";

    if (persistentSevere || (decay >= 82 && lateRisk >= 78)) {
      state = "EXHAUSTED";
      title = "IMPULSO AGOTÁNDOSE";
      action = "NO PERSEGUIR · ESPERAR RETEST/GIRO";
      detail = "La pérdida de velocidad, volumen, expansión o aceptación ya es demasiado fuerte para tratar la vela actual como una entrada limpia.";
    } else if (persistent) {
      state = "PERSISTENT_DECAY";
      title = "DECAIMIENTO PERSISTENTE";
      action = "ESPERAR MEJOR ENTRADA";
      detail = "La fatiga se repitió en varias lecturas. Una sola vela no causó este veto.";
    } else if (decay >= 52) {
      state = "EARLY_FATIGUE";
      title = "FATIGA TEMPRANA";
      action = "VIGILAR · NO CANCELAR TODAVÍA";
      detail = "Hay señales iniciales de cansancio, pero todavía no son persistentes. No se cancela una tesis solo por esta lectura.";
    } else if (decay <= 32 && lateRisk <= 38 && velNow > 0.20 && vel5Now > 0.10) {
      state = "HEALTHY";
      title = "IMPULSO SANO";
      action = "SIN VETO POR FATIGA";
      detail = "Velocidad, cuerpo y expansión todavía sostienen la dirección sin evidencia clara de agotamiento.";
    }

    return {
      direction, decay, lateRisk, state, title, action, detail,
      velocityRatio, velocityRatio5, volRatio, bodyNow, wick, spreadRatio,
      rsi5, rsi15, extensionAtr, persistent, price,
    };
  }, [analysis, m1, m5, m15, memory]);

  useEffect(() => {
    if (!view) return;
    const last = memory.at(-1);
    if (last && Date.now() - last.at < 60_000) return;
    const next = [...memory, { at: Date.now(), direction: view.direction, decay: view.decay, lateRisk: view.lateRisk }].slice(-10);
    setMemory(next);
    writeMemory(safeSymbol, next);
  }, [view, memory, safeSymbol]);

  if (!view) return null;

  const tone = view.state === "EXHAUSTED" || view.state === "PERSISTENT_DECAY"
    ? "border-rose-500/25 bg-rose-500/[.04] text-rose-300"
    : view.state === "EARLY_FATIGUE"
      ? "border-amber-500/25 bg-amber-500/[.04] text-amber-300"
      : view.state === "HEALTHY"
        ? "border-emerald-500/25 bg-emerald-500/[.04] text-emerald-300"
        : "border-slate-700 bg-slate-900/40 text-slate-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-orange-500/15 bg-orange-500/[.018] p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-orange-300"><Sparkles size={17}/> Momentum Decay Engine</div>
          <h2 className="mt-2 text-2xl font-black text-white">¿Sigue fuerte o solo sigue avanzando?</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Compara velocidad, cuerpo, volumen, expansión EMA, mechas y divergencia. La fatiga debe persistir para convertirse en veto.</p>
        </div>
        <div className={`rounded-2xl border px-5 py-4 ${tone}`}>
          <div className="text-[9px] font-black uppercase tracking-[.12em] opacity-70">Estado del impulso</div>
          <div className="mt-1 text-xl font-black">{view.title}</div>
          <div className="mt-1 text-sm font-black">{view.action}</div>
          <div className="mt-1 max-w-md text-xs leading-5 opacity-80">{view.detail}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Waves size={14}/>} label="Decay" value={`${view.decay.toFixed(0)}/100`} inverse />
        <Metric icon={<AlertTriangle size={14}/>} label="Riesgo entrada tarde" value={`${view.lateRisk.toFixed(0)}/100`} inverse />
        <Metric icon={<Activity size={14}/>} label="Velocidad 1m" value={`${view.velocityRatio.toFixed(2)}x`} inverse={view.velocityRatio < 0.65} />
        <Metric icon={<Gauge size={14}/>} label="Volumen reciente" value={`${view.volRatio.toFixed(2)}x`} inverse={view.volRatio < 0.8} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Mini label="Cuerpo direccional" value={`${view.bodyNow.toFixed(0)}%`} />
        <Mini label="Mecha en contra" value={`${view.wick.toFixed(0)}%`} />
        <Mini label="Expansión EMA" value={`${view.spreadRatio.toFixed(2)}x`} />
        <Mini label="Extensión" value={`${view.extensionAtr.toFixed(2)} ATR`} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/35 p-3 text-[11px] leading-5 text-slate-500">Una lectura cansada solo marca <b className="text-slate-300">fatiga temprana</b>. El veto fuerte requiere persistencia o agotamiento extremo. Los scores no son probabilidades ni garantizan un giro.</div>
    </div>
  </section>;
}

function Metric({ icon, label, value, inverse = false }: { icon: ReactNode; label: string; value: string; inverse?: boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-2 font-mono text-xl font-black ${inverse ? "text-amber-300" : "text-white"}`}>{value}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-1 font-mono text-xs font-black text-white">{value}</div></div>;
}
