"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  Gauge,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
  Waves,
} from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlan, writeLockedPlan, type LockedPlan } from "@/lib/lockedPlans";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function ema(values: number[], period: number) {
  if (!values.length) return [] as number[];
  const alpha = 2 / (period + 1);
  const out: number[] = [];
  let current = values[0];
  out.push(current);
  for (let i = 1; i < values.length; i++) {
    current = values[i] * alpha + current * (1 - alpha);
    out.push(current);
  }
  return out;
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

function volumeRatio(candles: Candle[], period = 20) {
  if (candles.length < 2) return 1;
  const prior = candles.slice(-period - 1, -1).map((x) => x.volume);
  const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 1;
  return avg > 0 ? (candles.at(-1)?.volume || 0) / avg : 1;
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

function crossed(direction: "LONG" | "SHORT", price: number, level: number, profit: boolean) {
  if (!(price > 0 && level > 0)) return false;
  if (direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

function okxId(symbol: string) {
  return `${symbol.replace(/USDT$/, "")}-USDT-SWAP`;
}

export default function PostEntryWatchdog({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const lastPersist = useRef(0);

  useEffect(() => {
    const refresh = () => setPlan(readLockedPlan(safeSymbol));
    refresh();
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    const timer = setInterval(refresh, 2500);
    return () => {
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
      clearInterval(timer);
    };
  }, [safeSymbol]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
          setLivePrice((old) => old || Number(a.current_price || 0));
        }
      } catch {}
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let ws: WebSocket | null = null;
    const apply = (price: number) => { if (!disposed && price > 0) setLivePrice(price); };
    const connectOkx = () => {
      try { ws?.close(); } catch {}
      ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      ws.onopen = () => ws?.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: okxId(safeSymbol) }] }));
      ws.onmessage = (event) => {
        try { apply(Number(JSON.parse(event.data)?.data?.[0]?.last ?? 0)); } catch {}
      };
    };
    ws = new WebSocket(`wss://fstream.binance.com/ws/${safeSymbol.toLowerCase()}@aggTrade`);
    ws.onmessage = (event) => {
      gotBinance = true;
      try { apply(Number(JSON.parse(event.data)?.p ?? 0)); } catch {}
    };
    ws.onerror = () => { if (!gotBinance) connectOkx(); };
    const fallback = setTimeout(() => { if (!gotBinance) connectOkx(); }, 4500);
    return () => { disposed = true; clearTimeout(fallback); try { ws?.close(); } catch {} };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!plan?.enteredAt || !plan.actualEntryPrice || !livePrice) return null;
    const direction = plan.direction;
    const entry = plan.actualEntryPrice;
    const risk = Math.abs(entry - plan.stop);
    const favorable = direction === "LONG" ? livePrice - entry : entry - livePrice;
    const r = risk > 0 ? favorable / risk : 0;
    const minutes = Math.max(0, (clock - plan.enteredAt) / 60000);

    const closes = candles.map((x) => x.close);
    const ema9 = ema(closes, 9).at(-1) || 0;
    const ema21 = ema(closes, 21).at(-1) || 0;
    const rsi14 = rsi(closes, 14);
    const vol = volumeRatio(candles, 20);
    const marketStructure = structure(candles);
    const emaAligned = direction === "LONG" ? ema9 > ema21 : ema9 < ema21;
    const structureAligned = direction === "LONG" ? marketStructure === "HH_HL" : marketStructure === "LH_LL";
    const currentDirection = analysis?.prediction?.direction ?? analysis?.direction;
    const directionConflict = Boolean(currentDirection && currentDirection !== direction);
    const riskGuardPass = analysis?.ready_checks?.risk_guard_pass !== false;
    const stopHit = crossed(direction, livePrice, plan.stop, false);
    const invalidHit = crossed(direction, livePrice, plan.invalidation, false);
    const tp1Hit = crossed(direction, livePrice, plan.tp1, true);
    const tp2Hit = crossed(direction, livePrice, plan.tp2, true);

    const bestR = Math.max(Number(plan.maxRSeen ?? r), r);
    const worstR = Math.min(Number(plan.minRSeen ?? r), r);
    const givebackR = Math.max(0, bestR - r);
    const bestPrice = plan.bestPriceSeen == null
      ? livePrice
      : direction === "LONG" ? Math.max(plan.bestPriceSeen, livePrice) : Math.min(plan.bestPriceSeen, livePrice);
    const worstPrice = plan.worstPriceSeen == null
      ? livePrice
      : direction === "LONG" ? Math.min(plan.worstPriceSeen, livePrice) : Math.max(plan.worstPriceSeen, livePrice);

    const warnings: string[] = [];
    const positives: string[] = [];
    if (emaAligned) positives.push("EMA 9/21 sigue alineada con el plan."); else warnings.push("EMA 9/21 perdió alineación.");
    if (structureAligned) positives.push(`Estructura 5m ${marketStructure} acompaña.`); else if (marketStructure !== "MIXED") warnings.push(`Estructura 5m cambió a ${marketStructure}.`);
    if (!directionConflict) positives.push("El análisis actual mantiene la dirección original."); else warnings.push(`El análisis actual cambió a ${currentDirection}.`);
    if (!riskGuardPass) warnings.push("Risk Guard actual ya no aprueba el contexto.");
    if (givebackR >= 0.6 && bestR >= 0.8) warnings.push(`Se devolvieron ${givebackR.toFixed(2)}R desde el mejor punto.`);
    if (vol < 0.65 && r < 0.5) warnings.push("Volumen débil y poco seguimiento después de la entrada.");
    if (direction === "LONG" && rsi14 < 42) warnings.push(`RSI 5m ${rsi14.toFixed(1)} perdió momentum LONG.`);
    if (direction === "SHORT" && rsi14 > 58) warnings.push(`RSI 5m ${rsi14.toFixed(1)} perdió momentum SHORT.`);

    const health = Math.max(0, Math.min(100,
      55
      + (emaAligned ? 10 : -12)
      + (structureAligned ? 10 : marketStructure === "MIXED" ? 0 : -10)
      + (!directionConflict ? 10 : -15)
      + (riskGuardPass ? 5 : -10)
      + (vol >= 0.9 ? 5 : -4)
      + (r >= 0.5 ? 5 : 0)
      - (givebackR >= 0.6 ? 10 : 0)
    ));

    let action = "MANTENER / VIGILAR";
    let tone: "green" | "amber" | "red" | "violet" = "amber";
    let explanation = "La tesis original sigue abierta, pero todavía necesita seguimiento.";

    if (stopHit || invalidHit) {
      action = "PLAN INVALIDADO";
      tone = "red";
      explanation = "Se cruzó stop o invalidación. No ampliar el stop para salvar la operación.";
    } else if (tp2Hit) {
      action = "TP2 ALCANZADO · PROTEGER BENEFICIO";
      tone = "green";
      explanation = "El objetivo principal fue alcanzado. Si queda runner, debe estar protegido por estructura.";
    } else if (tp1Hit && givebackR >= 0.55) {
      action = "PROTEGER GANANCIA";
      tone = "violet";
      explanation = `La operación llegó a +${bestR.toFixed(2)}R y devolvió ${givebackR.toFixed(2)}R. Evitar que una ganancia clara vuelva a pérdida completa.`;
    } else if (minutes >= plan.maxDurationMinutes) {
      action = "DURACIÓN MÁXIMA · REEVALUAR SALIDA";
      tone = "red";
      explanation = "El plan excedió su horizonte máximo sin completar la tesis.";
    } else if (minutes >= plan.timeStopMinutes && r < 0.5) {
      action = "TIME STOP · REEVALUAR SALIDA";
      tone = "red";
      explanation = `Pasaron ${Math.floor(minutes)} min y el avance sigue por debajo de 0.5R.`;
    } else if (health < 38 || (directionConflict && !emaAligned && !structureAligned && r < 0)) {
      action = "DETERIORO FUERTE · REEVALUAR SALIDA";
      tone = "red";
      explanation = "Dirección, estructura y momentum se deterioraron a la vez. La tesis original está bajo presión fuerte.";
    } else if (health < 55 || (givebackR >= 0.45 && bestR >= 0.7)) {
      action = "REDUCIR RIESGO / PROTEGER";
      tone = "violet";
      explanation = "La operación no está invalidada, pero la calidad bajó o está devolviendo demasiado avance.";
    } else if (r >= 0.5 && health >= 65) {
      action = "MANTENER SEGÚN PLAN";
      tone = "green";
      explanation = "La operación avanza y la estructura actual todavía acompaña la tesis original.";
    }

    return {
      direction, entry, risk, r, bestR, worstR, givebackR, bestPrice, worstPrice,
      minutes, ema9, ema21, rsi14, vol, marketStructure, emaAligned,
      structureAligned, directionConflict, currentDirection, health, warnings,
      positives, action, tone, explanation,
    };
  }, [plan, analysis, candles, livePrice, clock]);

  useEffect(() => {
    if (!plan || !view || Date.now() - lastPersist.current < 2500) return;
    const changed =
      plan.bestPriceSeen !== view.bestPrice ||
      plan.worstPriceSeen !== view.worstPrice ||
      plan.maxRSeen !== view.bestR ||
      plan.minRSeen !== view.worstR;
    if (!changed) return;
    lastPersist.current = Date.now();
    const next: LockedPlan = {
      ...plan,
      bestPriceSeen: view.bestPrice,
      worstPriceSeen: view.worstPrice,
      maxRSeen: view.bestR,
      minRSeen: view.worstR,
      watchdogUpdatedAt: Date.now(),
    };
    setPlan(next);
    writeLockedPlan(next);
  }, [plan, view]);

  if (!plan?.enteredAt || !plan.actualEntryPrice || !view) return null;

  const frame = view.tone === "green" ? "border-emerald-500/30 bg-emerald-500/[.05]" : view.tone === "red" ? "border-rose-500/30 bg-rose-500/[.05]" : view.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.05]" : "border-amber-500/25 bg-amber-500/[.04]";
  const actionTone = view.tone === "green" ? "text-emerald-300" : view.tone === "red" ? "text-rose-300" : view.tone === "violet" ? "text-violet-300" : "text-amber-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${frame}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Activity size={17}/> Watchdog post-entrada</div>
          <div className={`mt-2 text-2xl font-black ${actionTone}`}>{view.action}</div>
          <p className="mt-2 text-sm leading-6 text-slate-300/80">{view.explanation}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[680px]">
          <Metric label="R actual" value={`${view.r >= 0 ? "+" : ""}${view.r.toFixed(2)}R`} icon={<Target size={13}/>} good={view.r > 0} bad={view.r < 0} />
          <Metric label="Mejor R" value={`+${view.bestR.toFixed(2)}R`} icon={<TrendingUp size={13}/>} good />
          <Metric label="Devuelto" value={`${view.givebackR.toFixed(2)}R`} icon={<TrendingDown size={13}/>} bad={view.givebackR >= 0.5} />
          <Metric label="Salud tesis" value={`${view.health.toFixed(0)}/100`} icon={<Gauge size={13}/>} good={view.health >= 65} bad={view.health < 45} />
          <Metric label="EMA 9 / 21" value={`${fmt(view.ema9)} / ${fmt(view.ema21)}`} icon={<Waves size={13}/>} good={view.emaAligned} bad={!view.emaAligned} />
          <Metric label="RSI 5m" value={view.rsi14.toFixed(1)} icon={<Activity size={13}/>} />
          <Metric label="Estructura" value={view.marketStructure} icon={<Crosshair size={13}/>} good={view.structureAligned} />
          <Metric label="Tiempo abierta" value={`${Math.floor(view.minutes)} min`} icon={<Clock3 size={13}/>} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white"><CheckCircle2 size={15} className="text-emerald-300"/> A favor de mantener</div>
          <div className="mt-3 space-y-2">{view.positives.length ? view.positives.map((x) => <div key={x} className="text-xs leading-5 text-slate-300">• {x}</div>) : <div className="text-xs text-slate-500">Sin confirmaciones fuertes nuevas.</div>}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-white"><AlertTriangle size={15} className="text-amber-300"/> Riesgos actuales</div>
          <div className="mt-3 space-y-2">{view.warnings.length ? view.warnings.map((x) => <div key={x} className="text-xs leading-5 text-amber-200/85">• {x}</div>) : <div className="text-xs text-emerald-300">No hay deterioro fuerte detectado ahora.</div>}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Level label="Mi entrada" value={plan.actualEntryPrice} />
        <Level label="STOP" value={plan.stop} bad />
        <Level label="TP1" value={plan.tp1} good />
        <Level label="TP2" value={plan.tp2} good />
        <Level label="Mejor precio visto" value={view.bestPrice} good />
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><ShieldAlert size={13} className="mt-1 shrink-0"/>El Watchdog es una capa de gestión y aprendizaje. No ejecuta órdenes, no garantiza beneficios y nunca recomienda ampliar el stop original para evitar una pérdida.</div>
    </div>
  </section>;
}

function Metric({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}

function Level({ label, value, good=false, bad=false }: { label:string; value:number; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{fmt(value)}</div></div>;
}
