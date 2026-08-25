"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Crosshair,
  Gauge,
  Layers3,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from "lucide-react";
import { getCandles, type Candle } from "@/lib/api";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function pct(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function sma(values: number[], period: number) {
  if (!values.length) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function rma(values: number[], period: number) {
  if (!values.length) return [] as number[];
  const alpha = 1 / period;
  const out: number[] = [];
  let value = values.slice(0, Math.min(period, values.length)).reduce((a, b) => a + b, 0) / Math.min(period, values.length);
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) out.push(value);
    else {
      value = value + alpha * (values[i] - value);
      out.push(value);
    }
  }
  return out;
}

function supertrend(candles: Candle[], period = 10, multiplier = 3) {
  if (candles.length < period + 2) return { value: 0, bullish: false };
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const atr = rma(trs, period);
  let finalUpper = 0;
  let finalLower = 0;
  let st = 0;
  let bullish = true;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const mid = (c.high + c.low) / 2;
    const basicUpper = mid + multiplier * (atr[i] || 0);
    const basicLower = mid - multiplier * (atr[i] || 0);
    if (i === 0) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      st = finalLower;
      bullish = c.close >= st;
      continue;
    }
    const prev = candles[i - 1];
    finalUpper = basicUpper < finalUpper || prev.close > finalUpper ? basicUpper : finalUpper;
    finalLower = basicLower > finalLower || prev.close < finalLower ? basicLower : finalLower;
    if (st === finalUpper) st = c.close <= finalUpper ? finalUpper : finalLower;
    else st = c.close >= finalLower ? finalLower : finalUpper;
    bullish = c.close >= st;
  }
  return { value: st, bullish };
}

type Step = { label: string; done: boolean; detail: string };

type Read = {
  price: number;
  ma7: number;
  ma25: number;
  ma99: number;
  supertrend: number;
  superBull: boolean;
  pumpPct: number;
  retracePct: number;
  volumeRatio: number;
  support: number;
  reclaim: number;
  longTrigger: number;
  shortTrigger: number;
  longInvalidation: number;
  shortInvalidation: number;
  bounce: boolean;
  reclaimHit: boolean;
  liquidityTrap: boolean;
  exhaustion: boolean;
  breakdown: boolean;
  longSteps: Step[];
  shortSteps: Step[];
  verdict: string;
  tone: "green" | "red" | "amber" | "violet";
  explanation: string;
  next: string;
};

function buildRead(candles: Candle[]): Read | null {
  if (candles.length < 35) return null;
  const rows = candles.slice(-120);
  const closes = rows.map((x) => x.close);
  const volumes = rows.map((x) => x.volume);
  const price = closes.at(-1) || 0;
  const ma7 = sma(closes, 7);
  const ma25 = sma(closes, 25);
  const ma99 = sma(closes, 99);
  const st = supertrend(rows, 10, 3);
  const avgVol20 = sma(volumes.slice(0, -1), 20) || 1;
  const volumeRatio = (volumes.at(-1) || 0) / avgVol20;

  const lookback = rows.slice(-60);
  let lowIndex = 0;
  let highIndex = 0;
  lookback.forEach((c, i) => {
    if (c.low < lookback[lowIndex].low) lowIndex = i;
    if (c.high > lookback[highIndex].high) highIndex = i;
  });
  const swingLow = lookback[lowIndex].low;
  const swingHigh = lookback[highIndex].high;
  const pumpPct = swingLow > 0 ? ((swingHigh - swingLow) / swingLow) * 100 : 0;
  const retracePct = swingHigh > 0 ? ((swingHigh - price) / swingHigh) * 100 : 0;

  const recent = rows.slice(-12);
  const previous = rows.slice(-32, -12);
  const support = Math.min(...recent.slice(-8).map((x) => x.low));
  const recentResistance = Math.max(...recent.slice(-8, -1).map((x) => x.high));
  const reclaim = Math.max(ma25, ma99 > 0 ? ma99 : 0, recentResistance);
  const last = recent.at(-1)!;
  const prev = recent.at(-2)!;
  const body = Math.abs(last.close - last.open);
  const lowerWick = Math.max(0, Math.min(last.open, last.close) - last.low);
  const upperWick = Math.max(0, last.high - Math.max(last.open, last.close));
  const nearSupport = support > 0 && (price - support) / price <= 0.018;
  const bounce = nearSupport && last.close > prev.close && lowerWick >= body * 0.5;
  const reclaimHit = price > reclaim && last.close > last.open;

  const priorHigh = previous.length ? Math.max(...previous.map((x) => x.high)) : swingHigh;
  const sweptHigh = last.high > priorHigh || recent.some((x) => x.high > priorHigh * 1.002);
  const failedHigh = sweptHigh && price < priorHigh;
  const liquidityTrap = failedHigh && (upperWick > body * 0.8 || retracePct >= 2.5);
  const maLoss = price < ma7 && price < ma25;
  const exhaustion = pumpPct >= 6 && retracePct >= 2 && (maLoss || liquidityTrap || volumeRatio >= 1.8);
  const shortTrigger = Math.min(...recent.slice(-4).map((x) => x.low));
  const breakdown = price < shortTrigger || (last.close < prev.low && maLoss);
  const longTrigger = Math.max(reclaim, recentResistance);
  const longInvalidation = support * 0.995;
  const shortInvalidation = Math.max(priorHigh, swingHigh) * 1.005;

  const healthyPullback = pumpPct >= 3 && retracePct >= 1 && retracePct <= Math.max(8, pumpPct * 0.62);
  const volumeClimax = Math.max(...volumes.slice(-30)) / (sma(volumes.slice(-60, -30), 20) || 1) >= 2.0;
  const maReclaim = price > ma7 && (price > ma25 || Math.abs(price - ma25) / price < 0.006);

  const longSteps: Step[] = [
    { label: "Pump / impulso previo", done: pumpPct >= 3, detail: `${pumpPct.toFixed(2)}% del swing bajo al alto` },
    { label: "Pullback controlado", done: healthyPullback, detail: `retroceso ${retracePct.toFixed(2)}% desde el máximo` },
    { label: "Soporte defendido", done: nearSupport, detail: `zona ${fmt(support)}` },
    { label: "Bounce", done: bounce, detail: bounce ? "vela responde desde soporte" : "falta reacción clara" },
    { label: "Reclaim", done: reclaimHit || maReclaim, detail: `recuperar ${fmt(reclaim)}` },
    { label: "Volumen acompaña", done: volumeRatio >= 1.15, detail: `${volumeRatio.toFixed(2)}x vs promedio` },
  ];

  const shortSteps: Step[] = [
    { label: "Pump extendido", done: pumpPct >= 6, detail: `${pumpPct.toFixed(2)}% de expansión` },
    { label: "Clímax de volumen", done: volumeClimax, detail: volumeClimax ? "hubo volumen extremo" : "sin clímax claro" },
    { label: "Trampa de liquidez", done: liquidityTrap, detail: liquidityTrap ? "barrió máximo y perdió nivel" : "máximo todavía no falló" },
    { label: "Pérdida MA7/MA25", done: maLoss, detail: `MA7 ${fmt(ma7)} · MA25 ${fmt(ma25)}` },
    { label: "Breakdown", done: breakdown, detail: `perder ${fmt(shortTrigger)}` },
    { label: "Agotamiento", done: exhaustion, detail: exhaustion ? "impulso alcista perdiendo estructura" : "sin agotamiento suficiente" },
  ];

  const longCount = longSteps.filter((x) => x.done).length;
  const shortCount = shortSteps.filter((x) => x.done).length;
  let verdict = "SIN LECTURA CLARA";
  let tone: Read["tone"] = "amber";
  let explanation = "El gráfico todavía no completa una secuencia parecida a las de las capturas.";
  let next = "Esperar que soporte/reclaim o agotamiento/breakdown definan el escenario.";

  if (longCount >= 5 && reclaimHit && !liquidityTrap) {
    verdict = "BOUNCE + RECLAIM · LONG TÉCNICAMENTE CONFIRMADO";
    tone = "green";
    explanation = "La lectura se parece al escenario PIEVERSE: impulso previo, retroceso hacia soporte, reacción y recuperación del nivel de reclaim.";
    next = `No perseguir. La idea LONG solo sigue válida mientras respete ${fmt(longInvalidation)}; buscar retest/aceptación por encima de ${fmt(longTrigger)} con volumen.`;
  } else if (longCount >= 4 && !reclaimHit) {
    verdict = "POSIBLE LONG · ESPERAR RECLAIM";
    tone = "violet";
    explanation = "Hay pump/pullback y soporte, pero todavía falta recuperar la zona que separa un simple rebote de una continuación real.";
    next = `Esperar cierre 5m y aceptación por encima de ${fmt(longTrigger)}; sin reclaim no asumir continuación.`;
  } else if (shortCount >= 5 && breakdown) {
    verdict = "AGOTAMIENTO + BREAKDOWN · SHORT DE REVERSA";
    tone = "red";
    explanation = "La lectura se parece al escenario VELVET: pump extendido, pérdida de fuerza/liquidez y ruptura de estructura antes de buscar la reversa.";
    next = `Evitar short solo porque subió mucho. La confirmación es perder ${fmt(shortTrigger)} y fallar el reclaim; invalidación aproximada ${fmt(shortInvalidation)}.`;
  } else if (shortCount >= 4) {
    verdict = "VIGILAR SHORT DE REVERSA";
    tone = "red";
    explanation = "Hay señales de agotamiento, pero todavía falta una pérdida de estructura suficientemente limpia.";
    next = `Esperar breakdown de ${fmt(shortTrigger)} y, preferiblemente, un reclaim fallido antes de considerar la reversa.`;
  }

  return {
    price, ma7, ma25, ma99, supertrend: st.value, superBull: st.bullish,
    pumpPct, retracePct, volumeRatio, support, reclaim, longTrigger, shortTrigger,
    longInvalidation, shortInvalidation, bounce, reclaimHit, liquidityTrap, exhaustion,
    breakdown, longSteps, shortSteps, verdict, tone, explanation, next,
  };
}

export default function TraderReadPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getCandles(safeSymbol, "5m", 120);
        if (!cancelled) { setCandles(value); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar la lectura");
      }
    }
    load();
    const timer = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const read = useMemo(() => buildRead(candles), [candles]);
  if (error) return <section className="mx-auto mt-5 max-w-[1500px] px-4"><div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-200">Lectura tipo trader no disponible: {error}</div></section>;
  if (!read) return null;

  const frame = read.tone === "green" ? "border-emerald-500/30 bg-emerald-500/[.045]" : read.tone === "red" ? "border-rose-500/30 bg-rose-500/[.045]" : read.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.045]" : "border-amber-500/25 bg-amber-500/[.035]";
  const titleTone = read.tone === "green" ? "text-emerald-300" : read.tone === "red" ? "text-rose-300" : read.tone === "violet" ? "text-violet-300" : "text-amber-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${frame}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Sparkles size={17}/> Lectura tipo trader · 5m</div>
          <div className={`mt-2 text-2xl font-black ${titleTone}`}>{read.verdict}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300/80">{read.explanation}</p>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-500">Qué espero ahora</div><div className="mt-1 text-sm text-slate-300">{read.next}</div></div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[560px]">
          <Metric icon={<Activity size={13}/>} label="Precio" value={fmt(read.price)} />
          <Metric icon={<TrendingUp size={13}/>} label="Pump swing" value={pct(read.pumpPct)} good={read.pumpPct >= 3} />
          <Metric icon={<TrendingDown size={13}/>} label="Retroceso" value={`${read.retracePct.toFixed(2)}%`} />
          <Metric icon={<Waves size={13}/>} label="Volumen" value={`${read.volumeRatio.toFixed(2)}x`} good={read.volumeRatio >= 1.15} />
          <Metric icon={<Layers3 size={13}/>} label="MA7" value={fmt(read.ma7)} />
          <Metric icon={<Layers3 size={13}/>} label="MA25" value={fmt(read.ma25)} />
          <Metric icon={<Layers3 size={13}/>} label="MA99" value={fmt(read.ma99)} />
          <Metric icon={<Gauge size={13}/>} label="Supertrend 10,3" value={`${fmt(read.supertrend)} · ${read.superBull ? "ALCISTA" : "BAJISTA"}`} good={read.superBull} bad={!read.superBull} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Scenario title="Escenario LONG · pump → pullback → bounce → reclaim" direction="LONG" steps={read.longSteps} />
        <Scenario title="Escenario SHORT · pump → agotamiento → trampa → breakdown" direction="SHORT" steps={read.shortSteps} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Level label="Soporte / bounce" value={read.support} icon={<ShieldAlert size={13}/>} />
        <Level label="Reclaim" value={read.reclaim} icon={<Zap size={13}/>} />
        <Level label="Trigger LONG" value={read.longTrigger} icon={<ArrowUpRight size={13}/>} good />
        <Level label="Trigger SHORT" value={read.shortTrigger} icon={<ArrowDownRight size={13}/>} bad />
        <Level label="Trampa liquidez" value={read.liquidityTrap ? "DETECTADA" : "NO"} icon={<Crosshair size={13}/>} bad={read.liquidityTrap} />
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><AlertTriangle size={13} className="mt-1 shrink-0"/>Esta lectura reproduce de forma cuantificable la lógica visual de las capturas. No sabemos todas las reglas privadas del trader y una similitud de patrón no garantiza el mismo resultado.</div>
    </div>
  </section>;
}

function Scenario({ title, direction, steps }: { title:string; direction:"LONG"|"SHORT"; steps:Step[] }) {
  const count = steps.filter((x) => x.done).length;
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
    <div className="flex items-center justify-between gap-2"><div className={`text-sm font-black ${direction === "LONG" ? "text-emerald-200" : "text-rose-200"}`}>{title}</div><span className="font-mono text-xs font-black text-white">{count}/{steps.length}</span></div>
    <div className="mt-3 space-y-2">{steps.map((s) => <div key={s.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/35 px-3 py-2.5"><div className="flex items-center gap-2 text-xs text-slate-200">{s.done ? <CheckCircle2 size={14} className="text-emerald-400"/> : <CircleDashed size={14} className="text-slate-600"/>}{s.label}</div><span className="text-right text-[10px] text-slate-500">{s.detail}</span></div>)}</div>
  </div>;
}

function Metric({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}

function Level({ label, value, icon, good=false, bad=false }: { label:string; value:number|string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  const display = typeof value === "number" ? fmt(value) : value;
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{display}</div></div>;
}
