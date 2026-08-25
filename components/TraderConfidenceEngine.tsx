"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Crosshair,
  Database,
  Gauge,
  Layers3,
  ShieldAlert,
  Sparkles,
  Target,
  Waves,
} from "lucide-react";
import {
  getCalibration,
  getCandles,
  getLiveAnalysis,
  type CalibrationBucket,
  type Candle,
  type LiveAnalysis,
} from "@/lib/api";

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
  let current = values[0];
  for (let i = 1; i < values.length; i++) current = values[i] * alpha + current * (1 - alpha);
  return current;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
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

function trend(candles: Candle[]) {
  const closes = candles.map((x) => x.close);
  const price = closes.at(-1) || 0;
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const s = structure(candles);
  const bullish = Number(price > e20) + Number(e20 > e50) + Number(s === "HH_HL");
  const bearish = Number(price < e20) + Number(e20 < e50) + Number(s === "LH_LL");
  const direction = bullish >= 2 && bullish > bearish ? "BULLISH" : bearish >= 2 && bearish > bullish ? "BEARISH" : "NEUTRAL";
  return { direction, structure: s, price, ema20: e20, ema50: e50 };
}

function dailyRegime(candles: Candle[]) {
  const t = trend(candles);
  const gap = t.price > 0 ? Math.abs(t.ema20 - t.ema50) / t.price * 100 : 0;
  if (t.structure === "MIXED" && gap < 1.2) return "RANGE";
  return t.direction;
}

function bucketName(score: number) {
  if (score >= 95) return "95-100";
  if (score >= 90) return "90-94";
  if (score >= 80) return "80-89";
  if (score >= 70) return "70-79";
  return "0-69";
}

function aligned(direction: "LONG" | "SHORT", value: number, threshold = 0.03) {
  if (Math.abs(value) < threshold) return 0;
  return direction === "LONG" ? (value > 0 ? 1 : -1) : (value < 0 ? 1 : -1);
}

function fmt(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

type ScorePart = { label: string; score: number; max: number; detail: string };

export default function TraderConfidenceEngine({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [h4, setH4] = useState<Candle[]>([]);
  const [d1, setD1] = useState<Candle[]>([]);
  const [m15, setM15] = useState<Candle[]>([]);
  const [calibration, setCalibration] = useState<CalibrationBucket[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadFast() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (!cancelled) setAnalysis(value);
      } catch {}
    }
    loadFast();
    const timer = setInterval(loadFast, 20_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function loadDeep() {
      try {
        const [c15, c4, cD, cal] = await Promise.all([
          getCandles(safeSymbol, "15m", 100),
          getCandles(safeSymbol, "4h", 100),
          getCandles(safeSymbol, "1d", 100),
          getCalibration(),
        ]);
        if (!cancelled) {
          setM15(c15);
          setH4(c4);
          setD1(cD);
          setCalibration(cal.buckets ?? []);
        }
      } catch {}
    }
    loadDeep();
    const timer = setInterval(loadDeep, 120_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis || h4.length < 30 || d1.length < 30 || m15.length < 30) return null;
    const direction = analysis.prediction?.direction ?? analysis.direction;
    const h4Trend = trend(h4);
    const d1Regime = dailyRegime(d1);
    const rsi15 = rsi(m15.map((x) => x.close), 14);
    const expectedH4 = direction === "LONG" ? "BULLISH" : "BEARISH";
    const expectedStructure = direction === "LONG" ? "HH_HL" : "LH_LL";
    const oppositeDaily = direction === "LONG" ? "BEARISH" : "BULLISH";

    let mtf = 0;
    const mtfNotes: string[] = [];
    if (h4Trend.direction === expectedH4) { mtf += 16; mtfNotes.push("4H alineado"); }
    else if (h4Trend.direction === "NEUTRAL") { mtf += 6; mtfNotes.push("4H neutral"); }
    else mtfNotes.push("4H en contra");
    if (h4Trend.structure === expectedStructure) { mtf += 7; mtfNotes.push("estructura 4H confirma"); }
    else if (h4Trend.structure === "MIXED") mtf += 3;
    if (d1Regime === expectedH4) { mtf += 7; mtfNotes.push("1D acompaña"); }
    else if (d1Regime === "RANGE" || d1Regime === "NEUTRAL") { mtf += 5; mtfNotes.push("1D en rango/neutral"); }
    else if (d1Regime === oppositeDaily) { mtf += 2; mtfNotes.push("scalp contra 1D"); }
    const rsiGood = direction === "LONG" ? rsi15 >= 43 && rsi15 <= 70 : rsi15 >= 28 && rsi15 <= 57;
    const rsiExtreme = direction === "LONG" ? rsi15 > 80 : rsi15 < 20;
    mtf += rsiGood ? 5 : rsiExtreme ? 1 : 3;
    mtf = clamp(mtf, 0, 35);

    const pre = num(analysis.prediction?.preactivation_score);
    const phase = String(analysis.prediction?.phase ?? "SIN_SETUP");
    const directionMatch = analysis.ready_checks?.direction_match !== false;
    let setup = clamp(num(analysis.setup_score) / 100 * 10, 0, 10);
    setup += clamp(pre / 100 * 8, 0, 8);
    setup += phase === "ACTIVADO" ? 4 : phase === "PREACTIVACION" ? 3 : phase === "VIGILAR_CONFIRMACION" ? 2 : phase === "ESPERAR_RETEST" ? 1 : 0;
    setup += directionMatch ? 3 : 0;
    setup = clamp(setup, 0, 25);

    const metrics = analysis.metrics ?? {};
    const sequence = analysis.prediction?.sequence ?? {};
    const spot = num(metrics.spot_delta_ratio, num(sequence.spot_delta_ratio));
    const futures = num(metrics.futures_delta_ratio, num(sequence.futures_delta_ratio));
    const book = num(metrics.order_book_imbalance, num(sequence.order_book_imbalance));
    const oi = num(metrics.oi_change_pct, num(sequence.oi_change_pct));
    const rvol = num(metrics.relative_volume, num(sequence.relative_volume, 1));
    const cgTaker = num(analysis.coinglass?.taker?.buy_sell_ratio, 1);
    let flow = 0;
    const flowSpot = aligned(direction, spot);
    const flowFutures = aligned(direction, futures);
    const flowBook = aligned(direction, book);
    flow += flowSpot > 0 ? 4 : flowSpot === 0 ? 2 : 0;
    flow += flowFutures > 0 ? 4 : flowFutures === 0 ? 2 : 0;
    flow += flowBook > 0 ? 3 : flowBook === 0 ? 1.5 : 0;
    const directionalFlow = flowSpot + flowFutures;
    flow += oi > 0 && directionalFlow > 0 ? 3 : oi >= -0.15 ? 1.5 : 0;
    flow += rvol >= 1.15 ? 3 : rvol >= 0.8 ? 2 : 0.5;
    const cgAligned = direction === "LONG" ? cgTaker >= 1.02 : cgTaker <= 0.98;
    flow += analysis.coinglass?.taker?.available ? (cgAligned ? 3 : 0) : 1.5;
    flow = clamp(flow, 0, 20);

    const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
    const chase = Boolean(analysis.ready_checks?.chase_risk ?? sequence.chase_risk);
    const risk = num(analysis.risk_score, 100);
    const entry = (num(analysis.entry_low) + num(analysis.entry_high)) / 2;
    const stop = num(analysis.stop_loss);
    const tp1 = num(analysis.tp1);
    const riskUnit = Math.abs(entry - stop);
    const rr1 = riskUnit > 0 ? Math.abs(tp1 - entry) / riskUnit : 0;
    const price = num(analysis.current_price);
    const trigger = num(analysis.prediction?.trigger_price);
    const inZone = price >= Math.min(num(analysis.entry_low), num(analysis.entry_high)) && price <= Math.max(num(analysis.entry_low), num(analysis.entry_high));
    const triggerDistancePct = trigger > 0 ? Math.abs(price - trigger) / price * 100 : 999;
    let safety = clamp((100 - risk) / 100 * 6, 0, 6);
    safety += riskGuardPass ? 5 : 0;
    safety += chase ? 0 : 4;
    safety += rr1 >= 1.3 ? 3 : rr1 >= 1 ? 2 : rr1 >= 0.8 ? 1 : 0;
    safety += inZone ? 2 : triggerDistancePct <= 0.35 ? 1 : 0;
    safety = clamp(safety, 0, 20);

    let technical = Math.round(clamp(mtf + setup + flow + safety));
    const hardWarnings: string[] = [];
    if (!directionMatch) { technical = Math.min(technical, 54); hardWarnings.push("predictor y dirección principal no coinciden"); }
    if (!riskGuardPass) { technical = Math.min(technical, 49); hardWarnings.push("Risk Guard bloquea la entrada"); }
    if (chase) { technical = Math.min(technical, 59); hardWarnings.push("precio perseguido / chase"); }
    if (analysis.data_quality === "LIMITED") { technical = Math.max(0, technical - 5); hardWarnings.push("datos limitados"); }

    const bucket = calibration.find((x) => x.score_bucket === bucketName(num(analysis.setup_score)));
    const empirical = bucket?.can_show_as_probability_estimate ? bucket.observed_win_rate_pct : null;

    let readiness = "VIGILAR";
    let readinessTone: "green" | "amber" | "red" | "violet" = "amber";
    if (!riskGuardPass || !directionMatch) { readiness = "BLOQUEADO · NO ENTRAR"; readinessTone = "red"; }
    else if (chase || phase === "ESPERAR_RETEST") { readiness = "ESPERAR RETEST"; readinessTone = "violet"; }
    else if (analysis.state === "READY" && phase === "ACTIVADO") { readiness = "ENTRADA HABILITADA · PAPER"; readinessTone = "green"; }
    else if (technical >= 82 && ["PREACTIVACION", "VIGILAR_CONFIRMACION"].includes(phase)) { readiness = "TEMPRANO · ESPERAR ACTIVACIÓN"; readinessTone = "amber"; }
    else if (phase === "ACTIVADO") { readiness = "ACTIVADO · FALTAN FILTROS"; readinessTone = "amber"; }

    const band = technical >= 90 ? "EXCEPCIONAL" : technical >= 85 ? "MUY FUERTE" : technical >= 78 ? "FUERTE" : technical >= 68 ? "MEDIA" : "DÉBIL";
    const parts: ScorePart[] = [
      { label: "MTF 1D/4H/15m", score: mtf, max: 35, detail: `${h4Trend.direction}/${h4Trend.structure} · 1D ${d1Regime} · RSI15 ${rsi15.toFixed(1)}` },
      { label: "Setup + trigger", score: setup, max: 25, detail: `setup ${num(analysis.setup_score).toFixed(1)} · preparación ${pre.toFixed(1)} · ${phase}` },
      { label: "Flujo + derivados", score: flow, max: 20, detail: `spot ${spot.toFixed(2)} · fut ${futures.toFixed(2)} · OI ${oi.toFixed(2)}% · rVol ${rvol.toFixed(2)}x` },
      { label: "Riesgo + entrada", score: safety, max: 20, detail: `riesgo ${risk.toFixed(1)} · TP1 ${rr1.toFixed(2)}R · ${riskGuardPass ? "guard OK" : "guard falla"}` },
    ];

    return {
      direction, technical, band, readiness, readinessTone, parts, hardWarnings, mtfNotes,
      empirical, bucket, rr1, rsi15, phase, d1Regime, h4Trend,
    };
  }, [analysis, h4, d1, m15, calibration]);

  if (!view || !analysis) return null;
  const frame = view.readinessTone === "green" ? "border-emerald-500/30 bg-emerald-500/[.045]" : view.readinessTone === "red" ? "border-rose-500/30 bg-rose-500/[.05]" : view.readinessTone === "violet" ? "border-violet-500/30 bg-violet-500/[.045]" : "border-amber-500/25 bg-amber-500/[.04]";
  const scoreTone = view.technical >= 85 ? "text-emerald-300" : view.technical >= 70 ? "text-amber-300" : "text-rose-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${frame}`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Sparkles size={17}/> Confidence Engine V2</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className={`font-mono text-4xl font-black ${scoreTone}`}>{view.technical}/100</span>
            <span className="text-lg font-black text-white">CONFIANZA TÉCNICA · {view.band}</span>
          </div>
          <div className={`mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-black ${view.readinessTone === "green" ? "text-emerald-300" : view.readinessTone === "red" ? "text-rose-300" : view.readinessTone === "violet" ? "text-violet-300" : "text-amber-300"}`}>{view.readiness}</div>
          <p className="mt-3 text-sm leading-6 text-slate-300/80">Este número replica la idea de un “Conf 89”, pero como puntuación transparente. <b className="text-white">89/100 no significa 89% de probabilidad de ganar.</b></p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[650px]">
          <Mini icon={<Layers3 size={13}/>} label="Dirección" value={view.direction} />
          <Mini icon={<BarChart3 size={13}/>} label="4H / 1D" value={`${view.h4Trend.direction} / ${view.d1Regime}`} />
          <Mini icon={<Activity size={13}/>} label="RSI 15m" value={view.rsi15.toFixed(1)} />
          <Mini icon={<Target size={13}/>} label="R:R TP1" value={`${view.rr1.toFixed(2)}R`} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {view.parts.map((part) => <div key={part.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.09em] text-slate-500">{part.label}</span><span className="font-mono text-sm font-black text-white">{part.score.toFixed(1)}/{part.max}</span></div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${clamp(part.score / part.max * 100)}%` }} /></div>
          <div className="mt-2 text-[10px] leading-4 text-slate-500">{part.detail}</div>
        </div>)}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white"><Database size={15} className="text-violet-300"/> Probabilidad empírica separada</div>
          {view.empirical != null ? <>
            <div className="mt-2 font-mono text-2xl font-black text-violet-200">{fmt(view.empirical, 1)}%</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Bucket {view.bucket?.score_bucket} · {view.bucket?.closed_trades ?? 0} trades cerrados · {view.bucket?.calibration_status}. Es una tasa histórica del bucket, no certeza de esta operación.</div>
          </> : <>
            <div className="mt-2 text-lg font-black text-amber-300">APRENDIENDO · SIN % REAL TODAVÍA</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">Bucket {view.bucket?.score_bucket ?? bucketName(num(analysis.setup_score))} · {view.bucket?.closed_trades ?? 0} operaciones cerradas. ExplodeX necesita al menos 30 para mostrar una estimación histórica y 100 para considerarla calibrada.</div>
          </>}
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white"><Gauge size={15} className="text-cyan-300"/> ¿Qué está elevando o bajando el score?</div>
          <div className="mt-3 flex flex-wrap gap-2">{view.mtfNotes.map((x) => <span key={x} className="rounded-full border border-emerald-500/15 bg-emerald-500/5 px-2.5 py-1 text-[10px] font-bold text-emerald-200">{x}</span>)}</div>
          {view.hardWarnings.length ? <div className="mt-3 space-y-2">{view.hardWarnings.map((x) => <div key={x} className="flex items-start gap-2 text-xs text-rose-300"><AlertTriangle size={13} className="mt-0.5 shrink-0"/>{x}</div>)}</div> : <div className="mt-3 flex items-start gap-2 text-xs text-emerald-300"><CheckCircle2 size={13} className="mt-0.5 shrink-0"/>Sin bloqueos duros en esta lectura.</div>}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/15 bg-amber-500/[.025] p-3 text-[11px] leading-5 text-slate-500"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-300"/>Para buscar movimientos tempranos, un score alto puede aparecer en PREACTIVACIÓN. Eso significa “setup interesante”, no “entrar ya”. La entrada sigue necesitando trigger, dirección alineada, Risk Guard y ausencia de chase.</div>
    </div>
  </section>;
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className="mt-1 font-mono text-xs font-black text-white">{value}</div></div>;
}
