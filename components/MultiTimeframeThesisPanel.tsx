"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Layers3,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function sma(values: number[], period: number) {
  if (!values.length) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function smaSeries(values: number[], period: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function slopePct(series: number[], lookback = 5) {
  if (series.length <= lookback) return 0;
  const old = series[series.length - lookback - 1];
  if (!old) return 0;
  return ((series.at(-1)! - old) / Math.abs(old)) * 100;
}

function rsi(values: number[], period = 14) {
  if (values.length < period + 1) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss <= 1e-12) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function atr(candles: Candle[], period = 14) {
  if (!candles.length) return 0;
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  if (trs.length <= period) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const tr of trs.slice(period)) value = (value * (period - 1) + tr) / period;
  return value;
}

function atrPercentile(candles: Candle[], period = 14, sample = 60) {
  if (candles.length < period + 5) return 50;
  const values: number[] = [];
  const start = Math.max(period + 1, candles.length - sample);
  for (let end = start; end <= candles.length; end++) {
    const a = atr(candles.slice(0, end), period);
    const close = candles[end - 1]?.close || 0;
    if (close > 0) values.push((a / close) * 100);
  }
  if (!values.length) return 50;
  const current = values.at(-1)!;
  return (values.filter((v) => v <= current).length / values.length) * 100;
}

function structure(candles: Candle[], window = 6) {
  if (candles.length < window * 2 + 2) return "NEUTRAL";
  const older = candles.slice(-window * 2, -window);
  const recent = candles.slice(-window);
  const olderHigh = Math.max(...older.map((x) => x.high));
  const olderLow = Math.min(...older.map((x) => x.low));
  const recentHigh = Math.max(...recent.map((x) => x.high));
  const recentLow = Math.min(...recent.map((x) => x.low));
  if (recentHigh > olderHigh && recentLow > olderLow) return "HH_HL";
  if (recentHigh < olderHigh && recentLow < olderLow) return "LH_LL";
  return "MIXED";
}

function trend(candles: Candle[]) {
  const closes = candles.map((x) => x.close);
  const ma7s = smaSeries(closes, 7);
  const ma25s = smaSeries(closes, 25);
  const ma99s = smaSeries(closes, 99);
  const price = closes.at(-1) || 0;
  const ma7 = ma7s.at(-1) || 0;
  const ma25 = ma25s.at(-1) || 0;
  const ma99 = ma99s.at(-1) || 0;
  const slope25 = slopePct(ma25s, 5);
  const s = structure(candles);
  const bull = Number(price > ma25) + Number(ma7 > ma25) + Number(ma25 > ma99) + Number(slope25 > 0) + Number(s === "HH_HL");
  const bear = Number(price < ma25) + Number(ma7 < ma25) + Number(ma25 < ma99) + Number(slope25 < 0) + Number(s === "LH_LL");
  const label = bull >= 4 && bull >= bear + 2 ? "BULLISH" : bear >= 4 && bear >= bull + 2 ? "BEARISH" : "NEUTRAL";
  return { label, price, ma7, ma25, ma99, slope25, structure: s, bull, bear };
}

function dailyRegime(candles: Candle[]) {
  const t = trend(candles);
  const recent = candles.slice(-30);
  const high = Math.max(...recent.map((x) => x.high));
  const low = Math.min(...recent.map((x) => x.low));
  const position = high > low ? ((t.price - low) / (high - low)) * 100 : 50;
  const flat = Math.abs(t.slope25) < 1.2;
  const regime = flat && t.structure === "MIXED" ? "RANGE" : t.label === "BULLISH" ? "BULLISH" : t.label === "BEARISH" ? "BEARISH" : "TRANSITION";
  return { ...t, regime, high, low, position };
}

function volumeRatio(candles: Candle[], period = 20) {
  if (candles.length < 2) return 1;
  const vols = candles.map((x) => x.volume);
  const base = sma(vols.slice(0, -1), period) || 1;
  return (vols.at(-1) || 0) / base;
}

type Thesis = {
  direction: "LONG" | "SHORT" | "NO_TRADE";
  score: number;
  style: string;
  verdict: string;
  daily: ReturnType<typeof dailyRegime>;
  h4: ReturnType<typeof trend>;
  rsi15: number;
  atr15: number;
  atr15Pct: number;
  atrPctile: number;
  volRatio: number;
  positives: string[];
  warnings: string[];
};

function buildThesis(c15: Candle[], c4h: Candle[], c1d: Candle[]): Thesis | null {
  if (c15.length < 30 || c4h.length < 30 || c1d.length < 30) return null;
  const daily = dailyRegime(c1d);
  const h4 = trend(c4h);
  const rsi15 = rsi(c15.map((x) => x.close), 14);
  const atr15 = atr(c15, 14);
  const price = c15.at(-1)?.close || 0;
  const atr15Pct = price > 0 ? (atr15 / price) * 100 : 0;
  const atrPctile = atrPercentile(c15, 14, 60);
  const volRatio = volumeRatio(c15, 20);
  const direction: Thesis["direction"] = h4.label === "BULLISH" ? "LONG" : h4.label === "BEARISH" ? "SHORT" : "NO_TRADE";

  let score = 45;
  const positives: string[] = [];
  const warnings: string[] = [];
  let style = "NO_TRADE";

  if (direction === "NO_TRADE") {
    score = 35;
    warnings.push("4H no tiene una dirección limpia; no conviene forzar LONG ni SHORT.");
  } else {
    const h4StructureOk = direction === "LONG" ? h4.structure === "HH_HL" : h4.structure === "LH_LL";
    const dailySame = direction === "LONG" ? daily.regime === "BULLISH" : daily.regime === "BEARISH";
    const dailyOpposite = direction === "LONG" ? daily.regime === "BEARISH" : daily.regime === "BULLISH";

    score += 22;
    positives.push(`El sesgo de 4H es ${direction}; este marco manda la tesis local.`);
    if (h4StructureOk) { score += 10; positives.push(`La estructura 4H es ${h4.structure}, alineada con ${direction}.`); }
    if (dailySame) { score += 10; positives.push("El marco 1D acompaña la dirección de 4H."); style = "SEGUIMIENTO DE TENDENCIA"; }
    else if (daily.regime === "RANGE") { score += 5; positives.push("1D está en rango: 4H puede dirigir el tramo dentro de la jaula diaria."); style = "4H DENTRO DE RANGO 1D"; }
    else if (dailyOpposite) { score -= 12; warnings.push("La tesis va contra 1D: tratarla como scalp, no como reversión de largo plazo."); style = "SCALP CONTRA 1D"; }
    else style = "TRANSICIÓN MTF";

    if (direction === "LONG") {
      if (rsi15 >= 45 && rsi15 <= 68) { score += 8; positives.push(`RSI 15m ${rsi15.toFixed(1)}: todavía hay margen antes de sobrecompra.`); }
      else if (rsi15 > 75) { score -= 10; warnings.push(`RSI 15m ${rsi15.toFixed(1)}: LONG extendido; peor zona para perseguir.`); }
      else if (rsi15 < 35) { score -= 4; warnings.push(`RSI 15m ${rsi15.toFixed(1)}: momentum LONG todavía débil.`); }
    } else {
      if (rsi15 >= 32 && rsi15 <= 55) { score += 8; positives.push(`RSI 15m ${rsi15.toFixed(1)}: presión bajista sin agotamiento extremo.`); }
      else if (rsi15 < 25) { score -= 10; warnings.push(`RSI 15m ${rsi15.toFixed(1)}: SHORT demasiado extendido.`); }
      else if (rsi15 > 65) { score -= 4; warnings.push(`RSI 15m ${rsi15.toFixed(1)}: momentum bajista aún no domina.`); }
    }

    if (atrPctile <= 35) { score += 6; positives.push(`ATR 15m comprimido (percentil ${atrPctile.toFixed(0)}): posible expansión si llega confirmación.`); }
    else if (atrPctile >= 85) { score -= 5; warnings.push(`ATR 15m percentil ${atrPctile.toFixed(0)}: el movimiento ya está expandido.`); }

    if (volRatio >= 1.15) { score += 5; positives.push(`Volumen 15m ${volRatio.toFixed(2)}x sobre su promedio.`); }
    else if (volRatio < 0.65) { score -= 4; warnings.push("Volumen 15m débil para confirmar continuación."); }

    if (dailyOpposite) score = Math.min(score, 74);
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = score < 60 ? "NO TRADE" : score < 72 ? "VIGILAR" : score < 82 ? "SETUP BUENO" : "SETUP FUERTE";
  return { direction, score, style, verdict, daily, h4, rsi15, atr15, atr15Pct, atrPctile, volRatio, positives, warnings };
}

function tone(verdict: string, blocked: boolean) {
  if (blocked || verdict === "NO TRADE") return "border-rose-500/30 bg-rose-500/[.05]";
  if (verdict === "SETUP FUERTE") return "border-emerald-500/30 bg-emerald-500/[.05]";
  if (verdict === "SETUP BUENO") return "border-cyan-500/25 bg-cyan-500/[.04]";
  return "border-amber-500/25 bg-amber-500/[.04]";
}

export default function MultiTimeframeThesisPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [c15, setC15] = useState<Candle[]>([]);
  const [c4h, setC4h] = useState<Candle[]>([]);
  const [c1d, setC1d] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, m15, h4, d1] = await Promise.all([
          getLiveAnalysis(safeSymbol),
          getCandles(safeSymbol, "15m", 140),
          getCandles(safeSymbol, "4h", 120),
          getCandles(safeSymbol, "1d", 120),
        ]);
        if (!cancelled) { setAnalysis(a); setC15(m15); setC4h(h4); setC1d(d1); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo calcular la tesis MTF");
      }
    }
    load();
    const timer = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const thesis = useMemo(() => buildThesis(c15, c4h, c1d), [c15, c4h, c1d]);
  if (error) return <section className="mx-auto mt-5 max-w-[1500px] px-4"><div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-200">Tesis MTF no disponible: {error}</div></section>;
  if (!thesis || !analysis) return null;

  const planDirection = analysis.prediction?.direction || analysis.direction;
  const directionConflict = thesis.direction !== "NO_TRADE" && planDirection !== thesis.direction;
  const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
  const blocked = thesis.direction === "NO_TRADE" || directionConflict || !riskGuardPass;
  const effectiveVerdict = blocked ? "NO TRADE / CONFLICTO" : thesis.verdict;
  const p = analysis.prediction;
  const entryLow = p?.entry_low ?? analysis.entry_low;
  const entryHigh = p?.entry_high ?? analysis.entry_high;
  const stop = p?.stop_loss ?? analysis.stop_loss;
  const tp1 = p?.tp1 ?? analysis.tp1;
  const tp2 = p?.tp2 ?? analysis.tp2;
  const tp3 = p?.tp3 ?? analysis.tp3;

  const whyNow = thesis.direction === "LONG"
    ? `El reloj de 4H favorece LONG. RSI 15m está en ${thesis.rsi15.toFixed(1)} y ATR 15m en percentil ${thesis.atrPctile.toFixed(0)}. La tesis solo se ejecuta si el trigger y Risk Guard del plan actual también confirman.`
    : thesis.direction === "SHORT"
      ? `El reloj de 4H favorece SHORT. RSI 15m está en ${thesis.rsi15.toFixed(1)} y ATR 15m en percentil ${thesis.atrPctile.toFixed(0)}. Si 1D va al alza, esto se trata como scalp y se respeta el stop sin convertirlo en reversión mayor.`
      : "4H está mezclado. No hay una dirección suficientemente limpia para justificar una operación.";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${tone(thesis.verdict, blocked)}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Layers3 size={17}/> Tesis MTF · estilo 1D → 4H → 15m</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className={`text-2xl font-black ${blocked ? "text-rose-300" : thesis.direction === "LONG" ? "text-emerald-300" : thesis.direction === "SHORT" ? "text-rose-300" : "text-amber-300"}`}>{safeSymbol} · {thesis.direction}</div>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-black text-white">Confianza técnica {thesis.score.toFixed(0)}/100</span>
            <span className="rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-[10px] font-black text-violet-200">{thesis.style}</span>
          </div>
          <div className={`mt-3 text-xl font-black ${blocked ? "text-rose-300" : "text-white"}`}>{effectiveVerdict}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300/80">{whyNow}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[650px]">
          <Metric label="1D" value={thesis.daily.regime} icon={<BarChart3 size={13}/>} />
          <Metric label="4H" value={`${thesis.h4.label} · ${thesis.h4.structure}`} icon={thesis.h4.label === "BULLISH" ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} />
          <Metric label="RSI 15m" value={thesis.rsi15.toFixed(1)} icon={<Activity size={13}/>} />
          <Metric label="ATR 15m" value={`${fmt(thesis.atr15)} · p${thesis.atrPctile.toFixed(0)}`} icon={<Waves size={13}/>} />
          <Metric label="Volumen" value={`${thesis.volRatio.toFixed(2)}x`} icon={<Waves size={13}/>} />
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="text-base font-black text-white">Plan de trading protegido</div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <Plan label="Entrada" value={`${fmt(Math.min(entryLow, entryHigh))} – ${fmt(Math.max(entryLow, entryHigh))}`} />
          <Plan label="SL" value={fmt(stop)} bad />
          <Plan label="TP1" value={fmt(tp1)} good />
          <Plan label="TP2" value={fmt(tp2)} good />
          <Plan label="TP3" value={fmt(tp3)} good />
        </div>
        <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldAlert size={13} className="mt-1 shrink-0"/>Estos niveles vienen del plan actual protegido de ExplodeX. La Tesis MTF explica la dirección; no sustituye Risk Guard, trigger ni stop.</div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-base font-black text-white">¿Por qué este setup?</div>
          <div className="mt-3 space-y-2">
            {thesis.positives.map((item) => <div key={item} className="flex items-start gap-2 text-sm leading-5 text-slate-300"><CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-400"/>{item}</div>)}
            {thesis.warnings.map((item) => <div key={item} className="flex items-start gap-2 text-sm leading-5 text-amber-200/85"><AlertTriangle size={14} className="mt-1 shrink-0"/>{item}</div>)}
            {directionConflict && <div className="flex items-start gap-2 text-sm leading-5 text-rose-300"><AlertTriangle size={14} className="mt-1 shrink-0"/>4H dice {thesis.direction}, pero el predictor actual dice {planDirection}. No entrar hasta que coincidan.</div>}
            {!riskGuardPass && <div className="flex items-start gap-2 text-sm leading-5 text-rose-300"><ShieldAlert size={14} className="mt-1 shrink-0"/>Risk Guard V2 bloqueó la entrada aunque la tesis MTF se vea atractiva.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-base font-black text-white">Lectura de marcos</div>
          <div className="mt-3 space-y-3 text-xs leading-5 text-slate-400">
            <p><b className="text-white">1D:</b> contexto mayor. Régimen {thesis.daily.regime}, posición dentro del rango reciente {thesis.daily.position.toFixed(0)}%.</p>
            <p><b className="text-white">4H:</b> decide la tesis local. MA7 {fmt(thesis.h4.ma7)} · MA25 {fmt(thesis.h4.ma25)} · MA99 {fmt(thesis.h4.ma99)}.</p>
            <p><b className="text-white">15m:</b> decide el timing. RSI {thesis.rsi15.toFixed(1)}, ATR {thesis.atr15Pct.toFixed(2)}% del precio y volumen {thesis.volRatio.toFixed(2)}x.</p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/[.04] p-4">
        <div className="text-xs font-black uppercase tracking-[.12em] text-violet-300">Debate que debe resolver el mercado</div>
        <div className="mt-2 text-sm text-slate-300">{thesis.direction === "LONG" ? "¿La ruptura tendrá aceptación y volumen, o primero barrerá a los longs tardíos antes de continuar?" : thesis.direction === "SHORT" ? "¿La pérdida de estructura 4H tendrá continuación, o solo será un barrido antes de recuperar el nivel?" : "¿Qué lado consigue primero estructura 4H limpia y aceptación real?"}</div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Clock3 size={13} className="mt-1 shrink-0"/>“Confianza técnica” mide alineación de reglas observables. No equivale a 80%, 88% o 91% de probabilidad de ganar; la probabilidad empírica solo la mostrará Edge Engine cuando haya muestra suficiente.</div>
    </div>
  </section>;
}

function Metric({ label, value, icon }: { label:string; value:string; icon:React.ReactNode }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className="mt-1 font-mono text-xs font-black text-white">{value}</div></div>;
}

function Plan({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500"><Target size={12}/>{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
