"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Gauge,
  Network,
  RadioTower,
  ShieldAlert,
  Sparkles,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Waves,
  XCircle,
  Zap,
} from "lucide-react";
import LiveCandleChart from "@/components/LiveCandleChart";
import { getLiveAnalysis, type LiveAnalysis, type PreMovePrediction } from "@/lib/api";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function money(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(value?: number | null, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function phaseEs(value?: string) {
  const map: Record<string, string> = {
    SIN_DATOS: "SIN DATOS",
    SIN_SETUP: "SIN SETUP",
    VIGILAR: "VIGILAR",
    PREACTIVACION: "PREACTIVACIÓN",
    VIGILAR_CONFIRMACION: "FALTA CONFIRMACIÓN",
    ACTIVADO: "ACTIVADO",
    ESPERAR_RETEST: "ESPERAR RETEST",
    VIGILAR_CONFLICTOS: "CONFLICTOS",
  };
  return map[String(value ?? "").toUpperCase()] ?? String(value ?? "—");
}

function typeEs(value?: string) {
  const map: Record<string, string> = {
    IMPULSO_LONG: "IMPULSO LONG",
    IMPULSO_SHORT: "IMPULSO SHORT",
    REBOTE_LONG: "REBOTE LONG",
    RECHAZO_SHORT: "RECHAZO SHORT",
    SIN_SETUP: "SIN SETUP",
  };
  return map[String(value ?? "").toUpperCase()] ?? String(value ?? "—");
}

function duration(min?: number, max?: number) {
  const unit = (v: number) => v >= 60 ? `${(v / 60).toFixed(v % 60 === 0 ? 0 : 1)} h` : `${v} min`;
  return min && max ? `${unit(min)} – ${unit(max)}` : "—";
}

function triggerHit(direction: "LONG" | "SHORT", price: number, trigger?: number) {
  if (!trigger || !price) return false;
  return direction === "LONG" ? price >= trigger : price <= trigger;
}

function conditionList(analysis: LiveAnalysis, prediction: PreMovePrediction, price: number) {
  const m = analysis.metrics ?? {};
  const seq = prediction.sequence ?? {};
  const direction = prediction.direction;
  const liveTrigger = triggerHit(direction, price, prediction.trigger_price);
  const ema9 = Number(m.ema9 ?? 0);
  const ema21 = Number(m.ema21 ?? 0);
  const emaKnown = ema9 > 0 && ema21 > 0;
  const emaAligned = emaKnown && (direction === "LONG" ? ema9 > ema21 : ema9 < ema21);
  return [
    { label: "Volatilidad comprimida", ready: Boolean(seq.compressed), detail: `rVol ${Number(seq.relative_volume ?? m.relative_volume ?? 0).toFixed(2)}x` },
    { label: direction === "LONG" ? "Mínimos crecientes" : "Máximos decrecientes", ready: direction === "LONG" ? Boolean(seq.higher_lows) : Boolean(seq.lower_highs), detail: "presión estructural" },
    { label: "EMA 9/21 alineadas", ready: emaAligned, detail: emaKnown ? `EMA9 ${fmt(ema9)} · EMA21 ${fmt(ema21)}` : "dato no disponible" },
    { label: "Volumen acelerando", ready: Number(seq.volume_acceleration ?? m.volume_acceleration ?? 0) >= 1.15, detail: `${Number(seq.volume_acceleration ?? m.volume_acceleration ?? 0).toFixed(2)}x` },
    { label: "Interés abierto acompaña", ready: Math.abs(Number(m.oi_change_pct ?? 0)) >= 0.2 || Math.abs(Number(analysis.coinglass?.open_interest?.change_15m_pct ?? 0)) >= 0.2, detail: `CG 15m ${pct(analysis.coinglass?.open_interest?.change_15m_pct)}` },
    { label: "Futuros alineados", ready: direction === "LONG" ? Number(m.futures_delta_ratio ?? 0) > 0.04 : Number(m.futures_delta_ratio ?? 0) < -0.04, detail: pct(Number(m.futures_delta_ratio ?? 0) * 100) },
    { label: "Spot confirma", ready: direction === "LONG" ? Number(m.spot_delta_ratio ?? 0) > 0.03 : Number(m.spot_delta_ratio ?? 0) < -0.03, detail: pct(Number(m.spot_delta_ratio ?? 0) * 100) },
    { label: "Libro inclinado", ready: direction === "LONG" ? Number(m.order_book_imbalance ?? 0) > 0.04 : Number(m.order_book_imbalance ?? 0) < -0.04, detail: pct(Number(m.order_book_imbalance ?? 0) * 100) },
    { label: "BTC compatible", ready: direction === "LONG" ? m.btc_trend !== "BEARISH" : m.btc_trend !== "BULLISH", detail: String(m.btc_trend ?? "NEUTRAL") },
    { label: "Trigger en vivo", ready: liveTrigger && !Boolean(seq.chase_risk), detail: liveTrigger ? "precio tocó el nivel" : `esperar ${fmt(prediction.trigger_price)}` },
  ];
}

type MicroTrade = { at: number; price: number; side: "BUY" | "SELL" | "UNKNOWN" };
type Pulse = {
  momentum5: number;
  momentum15: number;
  buyPct: number;
  sellPct: number;
  trades: number;
  classifiedTrades: number;
  aggressionAvailable: boolean;
};

function microPulse(rows: MicroTrade[], current: number): Pulse {
  const now = Date.now();
  const recent = rows.filter((x) => now - x.at <= 20_000);
  const p5 = [...recent].reverse().find((x) => now - x.at >= 5_000)?.price ?? recent[0]?.price ?? current;
  const p15 = [...recent].reverse().find((x) => now - x.at >= 15_000)?.price ?? recent[0]?.price ?? current;
  const momentum5 = p5 ? ((current - p5) / p5) * 100 : 0;
  const momentum15 = p15 ? ((current - p15) / p15) * 100 : 0;
  const sided = recent.filter((x) => x.side !== "UNKNOWN");
  const buys = sided.filter((x) => x.side === "BUY").length;
  const sells = sided.filter((x) => x.side === "SELL").length;
  const total = buys + sells;
  const aggressionAvailable = total > 0;
  return {
    momentum5,
    momentum15,
    buyPct: aggressionAvailable ? (buys / total) * 100 : 0,
    sellPct: aggressionAvailable ? (sells / total) * 100 : 0,
    trades: recent.length,
    classifiedTrades: total,
    aggressionAvailable,
  };
}

export default function ProfessionalCoinWorkspace({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | "flat">("flat");
  const [pulse, setPulse] = useState<Pulse>({ momentum5: 0, momentum15: 0, buyPct: 0, sellPct: 0, trades: 0, classifiedTrades: 0, aggressionAvailable: false });
  const [lastAnalysisAt, setLastAnalysisAt] = useState<number>(0);
  const [clock, setClock] = useState(Date.now());
  const lastPrice = useRef<number | null>(null);
  const trades = useRef<MicroTrade[]>([]);
  const lastPulsePaint = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (!cancelled) {
          setAnalysis(value);
          setError(null);
          setLastAnalysisAt(Date.now());
          setLivePrice((current) => current ?? value.current_price);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar el análisis");
      }
    }
    load();
    const timer = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let socket: WebSocket | null = null;

    function apply(price: number, side: MicroTrade["side"] = "UNKNOWN") {
      if (!price || disposed) return;
      if (lastPrice.current != null) setFlash(price > lastPrice.current ? "up" : price < lastPrice.current ? "down" : "flat");
      lastPrice.current = price;
      setLivePrice(price);
      const now = Date.now();
      trades.current.push({ at: now, price, side });
      trades.current = trades.current.filter((x) => now - x.at <= 25_000).slice(-600);
      if (now - lastPulsePaint.current >= 250) {
        lastPulsePaint.current = now;
        setPulse(microPulse(trades.current, price));
      }
      setTimeout(() => !disposed && setFlash("flat"), 450);
    }

    function connectOkx() {
      try { socket?.close(); } catch {}
      const base = safeSymbol.replace(/USDT$/, "");
      socket = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      socket.onopen = () => socket?.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: `${base}-USDT-SWAP` }] }));
      socket.onmessage = (event) => {
        try { const data = JSON.parse(event.data); const p = Number(data?.data?.[0]?.last ?? 0); apply(p); } catch {}
      };
    }

    socket = new WebSocket(`wss://fstream.binance.com/ws/${safeSymbol.toLowerCase()}@aggTrade`);
    socket.onmessage = (event) => {
      gotBinance = true;
      try {
        const trade = JSON.parse(event.data);
        const price = Number(trade?.p ?? 0);
        const side: MicroTrade["side"] = trade?.m === true ? "SELL" : trade?.m === false ? "BUY" : "UNKNOWN";
        apply(price, side);
      } catch {}
    };
    socket.onerror = () => { if (!gotBinance) connectOkx(); };
    const fallback = setTimeout(() => { if (!gotBinance) connectOkx(); }, 4500);
    return () => { disposed = true; clearTimeout(fallback); try { socket?.close(); } catch {} };
  }, [safeSymbol]);

  const prediction = analysis?.prediction;
  const price = Number(livePrice ?? analysis?.current_price ?? 0);
  const conditions = useMemo(() => analysis && prediction ? conditionList(analysis, prediction, price) : [], [analysis, prediction, price]);
  const readyCount = conditions.filter((x) => x.ready).length;
  const phase = prediction?.phase ?? "SIN_SETUP";
  const isLong = prediction?.direction === "LONG";
  const directionMatch = Boolean(analysis && prediction && analysis.direction === prediction.direction);
  const liveTriggerHit = prediction ? triggerHit(prediction.direction, price, prediction.trigger_price) : false;
  const low = Math.min(Number(prediction?.entry_low || 0), Number(prediction?.entry_high || 0));
  const high = Math.max(Number(prediction?.entry_low || 0), Number(prediction?.entry_high || 0));
  const inEntryZone = Boolean(price && low && high && price >= low && price <= high);
  const invalidation = Number(prediction?.invalidation_price || 0);
  const invalidated = Boolean(prediction && invalidation && (isLong ? price <= invalidation : price >= invalidation));
  const chased = Boolean(prediction && liveTriggerHit && !inEntryZone && low && high && (isLong ? price > high : price < low));
  const backendReady = analysis?.state === "READY" && phase === "ACTIVADO" && directionMatch;
  const isReady = Boolean(backendReady && liveTriggerHit && inEntryZone && !invalidated && !chased);
  const triggerDistancePct = prediction?.trigger_price && price
    ? Math.abs((Number(prediction.trigger_price) - price) / price) * 100
    : null;

  const alignedMomentum = isLong ? pulse.momentum5 : -pulse.momentum5;
  const aggressionImbalance = pulse.aggressionAvailable
    ? (isLong ? pulse.buyPct - pulse.sellPct : pulse.sellPct - pulse.buyPct)
    : 0;
  const aggressionAdjustment = pulse.aggressionAvailable ? aggressionImbalance * 0.08 : 0;
  const pulseAdjustment = Math.max(-10, Math.min(10, alignedMomentum * 80 + aggressionAdjustment));
  const livePreparation = prediction ? Math.max(0, Math.min(100, prediction.preactivation_score + pulseAdjustment)) : 0;
  const aggressionSupports = !pulse.aggressionAvailable || aggressionImbalance > 8;
  const aggressionOpposes = pulse.aggressionAvailable && aggressionImbalance < -16;
  const weakening = alignedMomentum < -0.025 || aggressionOpposes;
  const strengthening = alignedMomentum > 0.025 && aggressionSupports;

  let liveDecision = "VIGILAR";
  let liveDecisionTone: "green" | "amber" | "red" | "violet" = "amber";
  let liveDecisionText = "Esperando que la secuencia gane fuerza.";
  if (!directionMatch && analysis && prediction) {
    liveDecision = "CONFLICTO · NO TRADE";
    liveDecisionTone = "red";
    liveDecisionText = "El setup técnico y el predictor apuntan a direcciones diferentes.";
  } else if (invalidated) {
    liveDecision = "INVALIDADO EN VIVO";
    liveDecisionTone = "red";
    liveDecisionText = "El precio cruzó la invalidación estructural. No entrar.";
  } else if (isReady) {
    liveDecision = "READY · EN ZONA";
    liveDecisionTone = "green";
    liveDecisionText = "Backend READY, trigger tocado y precio todavía dentro de la zona planificada.";
  } else if (chased) {
    liveDecision = "ESPERAR RETEST";
    liveDecisionTone = "violet";
    liveDecisionText = "El precio ya salió de la zona después del trigger. No perseguir la vela.";
  } else if (liveTriggerHit && inEntryZone) {
    liveDecision = "TRIGGER TOCADO · CONFIRMANDO";
    liveDecisionTone = "violet";
    liveDecisionText = backendReady ? "Esperando estabilidad dentro de zona." : "El precio activó el nivel; falta confirmación profunda para READY.";
  } else if (strengthening && triggerDistancePct != null && triggerDistancePct <= 0.35) {
    liveDecision = "FORTALECIÉNDOSE CERCA DEL TRIGGER";
    liveDecisionTone = "green";
    liveDecisionText = pulse.aggressionAvailable
      ? "Momentum y agresión reciente acompañan la dirección prevista. Todavía no es entrada."
      : "Momentum reciente acompaña la dirección; la agresión BUY/SELL no está disponible en la fuente actual. Todavía no es entrada.";
  } else if (weakening) {
    liveDecision = "PERDIENDO FUERZA";
    liveDecisionTone = "red";
    liveDecisionText = "El pulso de trades recientes se está moviendo contra la predicción. Esperar.";
  } else if (phase === "PREACTIVACION") {
    liveDecision = "PREACTIVACIÓN · NO ENTRAR";
    liveDecisionTone = "amber";
    liveDecisionText = prediction?.management?.before_trigger ?? "Esperar el trigger y las confirmaciones faltantes.";
  }

  const plan = prediction ? {
    direction: prediction.direction,
    trigger: prediction.trigger_price,
    entryLow: prediction.entry_low,
    entryHigh: prediction.entry_high,
    invalidation: prediction.invalidation_price,
    stop: prediction.stop_loss,
    tp1: prediction.tp1,
    tp2: prediction.tp2,
    tp3: prediction.tp3,
    ready: isReady,
  } : undefined;

  const analysisAge = lastAnalysisAt ? Math.max(0, Math.floor((clock - lastAnalysisAt) / 1000)) : null;
  const decisionClasses = liveDecisionTone === "green"
    ? "border-emerald-500/35 bg-emerald-500/[.08] text-emerald-200"
    : liveDecisionTone === "red"
      ? "border-rose-500/35 bg-rose-500/[.07] text-rose-200"
      : liveDecisionTone === "violet"
        ? "border-violet-500/30 bg-violet-500/[.07] text-violet-200"
        : "border-amber-500/30 bg-amber-500/[.06] text-amber-100";

  return (
    <main className="mx-auto min-h-screen max-w-[1680px] px-3 py-4 sm:px-5 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/scanner" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white"><ArrowLeft size={15}/> Volver</Link>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><RadioTower size={14} className="text-emerald-400"/> precio + trades en tiempo real</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 size={13}/>{analysisAge == null ? "calculando análisis" : `análisis profundo hace ${analysisAge}s`}</span>
        </div>
      </div>

      <section className="terminal-panel mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-gradient-to-r from-emerald-500/[.06] via-transparent to-violet-500/[.05] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white">{safeSymbol}</h1>
            <span className={`status-pill ${isLong ? "status-long" : "status-short"}`}>{isLong ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {prediction ? typeEs(prediction.type) : analysis?.direction ?? "—"}</span>
            <span className={`status-pill ${isReady ? "status-ready" : phase === "PREACTIVACION" ? "status-watch" : "status-neutral"}`}>{phaseEs(phase)}</span>
            <span className="status-pill status-neutral">{analysis?.source ?? "CARGANDO"}</span>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <div className={`rounded-2xl border px-4 py-3 transition ${flash === "up" ? "border-emerald-400/50 bg-emerald-500/10" : flash === "down" ? "border-rose-400/50 bg-rose-500/10" : "border-slate-800 bg-slate-950/70"}`}>
              <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">Precio en vivo</div>
              <div className="mt-1 font-mono text-2xl font-black text-white">{fmt(price)}</div>
            </div>
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.035] px-4 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">Distancia trigger</div>
              <div className={`mt-1 font-mono text-lg font-black ${liveTriggerHit ? "text-emerald-300" : "text-violet-300"}`}>{liveTriggerHit ? "TOCADO" : triggerDistancePct == null ? "—" : `${triggerDistancePct.toFixed(3)}%`}</div>
            </div>
          </div>
        </div>

        {analysis && prediction ? (
          <div className="grid xl:grid-cols-[1.65fr_.85fr]">
            <div className="border-r border-slate-800/80 p-4">
              <LiveCandleChart symbol={safeSymbol} plan={plan} livePrice={price} />

              <section className="mb-3 mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <LivePulse label="Pulso vivo" value={`${livePreparation.toFixed(1)}/100`} status={strengthening ? "FORTALECE" : weakening ? "DEBILITA" : "ESTABLE"} tone={strengthening ? "green" : weakening ? "red" : "neutral"} icon={<Gauge size={15}/>} />
                <LivePulse label="Momentum 5s" value={pct(pulse.momentum5, 3)} status={isLong ? "LONG +" : "SHORT +"} tone={(isLong ? pulse.momentum5 : -pulse.momentum5) > .02 ? "green" : (isLong ? pulse.momentum5 : -pulse.momentum5) < -.02 ? "red" : "neutral"} icon={pulse.momentum5 >= 0 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>} />
                <LivePulse label="Momentum 15s" value={pct(pulse.momentum15, 3)} status={`${pulse.trades} ticks`} tone="neutral" icon={<Waves size={15}/>} />
                <LivePulse label="Agresión compra" value={pulse.aggressionAvailable ? `${pulse.buyPct.toFixed(0)}%` : "N/D"} status={pulse.aggressionAvailable ? `venta ${pulse.sellPct.toFixed(0)}% · ${pulse.classifiedTrades} clasif.` : "fuente sin BUY/SELL"} tone={!pulse.aggressionAvailable ? "neutral" : pulse.buyPct > 58 ? "green" : pulse.sellPct > 58 ? "red" : "neutral"} icon={<ArrowUpRight size={15}/>} />
                <LivePulse label="Estado trigger" value={liveTriggerHit ? "TOCADO" : "PENDIENTE"} status={inEntryZone ? "EN ZONA" : chased ? "FUERA / RETEST" : "VIGILAR"} tone={isReady ? "green" : chased || invalidated ? "red" : liveTriggerHit ? "green" : "neutral"} icon={<Zap size={15}/>} />
              </section>

              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Setup técnico" value={`${analysis.setup_score.toFixed(1)}/100`} />
                <Metric label="Preparación profunda" value={`${prediction.preactivation_score.toFixed(1)}/100`} accent />
                <Metric label="Riesgo" value={`${analysis.risk_score.toFixed(1)}/100`} />
                <Metric label="Condiciones" value={`${readyCount}/${conditions.length}`} />
              </div>

              <section className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-[#07111d]/80 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-black text-white">Checklist de activación</h2><span className="text-xs font-bold text-emerald-300">{readyCount}/{conditions.length}</span></div>
                  <div className="space-y-2">
                    {conditions.map((item) => <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-950/45 px-3 py-2.5"><div className="flex items-center gap-2 text-sm">{item.ready ? <CheckCircle2 size={16} className="text-emerald-400"/> : <CircleDashed size={16} className="text-amber-300"/>}<span className={item.ready ? "text-slate-200" : "text-amber-100"}>{item.label}</span></div><span className="text-[11px] text-slate-500">{item.detail}</span></div>)}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-[#07111d]/80 p-4">
                  <div className="mb-3 flex items-center gap-2"><Network size={17} className="text-cyan-300"/><h2 className="font-black text-white">Confirmación multi-exchange</h2></div>
                  <div className="grid grid-cols-2 gap-2">
                    <Small label="OI agregado" value={money(analysis.coinglass?.open_interest?.open_interest_usd)} />
                    <Small label="OI 15m" value={pct(analysis.coinglass?.open_interest?.change_15m_pct)} />
                    <Small label="Taker agregado" value={analysis.coinglass?.taker?.available ? `${Number(analysis.coinglass.taker.buy_sell_ratio ?? 1).toFixed(2)}x` : "No disponible"} />
                    <Small label="Funding" value={pct(analysis.coinglass?.funding?.median_rate_pct)} />
                    <Small label="Liq. LONG 1h" value={money(analysis.coinglass?.liquidations?.long_1h)} />
                    <Small label="Liq. SHORT 1h" value={money(analysis.coinglass?.liquidations?.short_1h)} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Flow label="Futuros" value={Number(analysis.metrics?.futures_delta_ratio ?? 0) * 100} />
                    <Flow label="Spot" value={Number(analysis.metrics?.spot_delta_ratio ?? 0) * 100} />
                    <Flow label="Libro" value={Number(analysis.metrics?.order_book_imbalance ?? 0) * 100} />
                  </div>
                </div>
              </section>
            </div>

            <aside className="bg-[#050b13]/65 p-4">
              <div className={`rounded-2xl border p-4 ${decisionClasses}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-black uppercase tracking-[.18em] opacity-60">Decisión dinámica</div>
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold opacity-70"><Activity size={11}/> LIVE</span>
                </div>
                <div className="mt-2 text-xl font-black">{liveDecision}</div>
                <p className="mt-2 text-xs leading-5 opacity-75">{liveDecisionText}</p>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
                <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Ruta al trigger</span><span className="font-mono text-[10px] text-violet-300">{triggerDistancePct == null ? "—" : `${triggerDistancePct.toFixed(3)}%`}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className={`h-full rounded-full transition-all duration-300 ${invalidated || weakening ? "bg-rose-400" : strengthening ? "bg-emerald-400" : "bg-violet-400"}`} style={{ width: `${Math.max(3, Math.min(100, 100 - (triggerDistancePct ?? 1) * 120))}%` }} /></div>
                <div className="mt-2 flex justify-between text-[9px] text-slate-600"><span>precio {fmt(price)}</span><span>trigger {fmt(prediction.trigger_price)}</span></div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Level label="Trigger" value={prediction.trigger_price} icon={<Zap size={14}/>} liveState={liveTriggerHit ? "TOCADO" : triggerDistancePct == null ? undefined : `${triggerDistancePct.toFixed(3)}%`} />
                <Level label="Invalidación" value={prediction.invalidation_price} danger icon={<ShieldAlert size={14}/>} liveState={invalidated ? "CRUZADA" : "VIGENTE"} />
                <Level label="Entrada baja" value={prediction.entry_low} icon={<Target size={14}/>} />
                <Level label="Entrada alta" value={prediction.entry_high} icon={<Target size={14}/>} liveState={inEntryZone ? "PRECIO EN ZONA" : undefined} />
                <Level label="Stop loss" value={prediction.stop_loss} danger icon={<XCircle size={14}/>} />
                <Level label="TP1" value={prediction.tp1} good icon={<Target size={14}/>} />
                <Level label="TP2" value={prediction.tp2} good icon={<Target size={14}/>} />
                <Level label="TP3 / runner" value={prediction.tp3} good icon={<Target size={14}/>} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Small label="Duración esperada" value={duration(prediction.expected_duration_min_minutes, prediction.expected_duration_max_minutes)} />
                <Small label="Time stop" value={prediction.time_stop_minutes ? `${prediction.time_stop_minutes} min` : "—"} />
              </div>

              <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center gap-2"><TimerReset size={16} className="text-cyan-300"/><h3 className="font-black text-white">Gestión automática</h3></div>
                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                  <p><b className="text-slate-200">Entrada:</b> solo después del trigger y dentro de la zona.</p>
                  <p><b className="text-slate-200">TP1:</b> proteger y mover stop a break-even si la estructura sigue válida.</p>
                  <p><b className="text-slate-200">TP2:</b> beneficio principal en paper.</p>
                  <p><b className="text-slate-200">TP3:</b> runner de investigación, sin ampliar stop.</p>
                  <p><b className="text-slate-200">Tiempo:</b> si no logra seguimiento suficiente antes del time-stop, el paper manager puede cerrar.</p>
                </div>
              </section>

              {!!prediction.confirmations?.length && <section className="mt-4"><div className="mb-2 text-xs font-black uppercase tracking-[.14em] text-emerald-300">A favor</div><div className="flex flex-wrap gap-1.5">{prediction.confirmations.map((x) => <span key={x} className="rounded-full border border-emerald-500/20 bg-emerald-500/[.06] px-2.5 py-1 text-[11px] text-emerald-200">{x}</span>)}</div></section>}
              {!!prediction.conflicts?.length && <section className="mt-4"><div className="mb-2 text-xs font-black uppercase tracking-[.14em] text-rose-300">Conflictos</div><div className="flex flex-wrap gap-1.5">{prediction.conflicts.map((x) => <span key={x} className="rounded-full border border-rose-500/20 bg-rose-500/[.06] px-2.5 py-1 text-[11px] text-rose-200">{x}</span>)}</div></section>}
            </aside>
          </div>
        ) : <div className="p-10 text-center text-slate-500">{error ?? "Calculando predicción, flujo, OI y estructura..."}</div>}
      </section>

      {analysis?.provider_warning && <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[.05] p-3 text-xs text-amber-100"><AlertTriangle size={14} className="mr-2 inline"/>Proveedor principal limitado; el sistema usa fallback y marca las métricas faltantes en vez de inventarlas.</div>}
    </main>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3"><div className="text-[10px] font-bold uppercase tracking-[.13em] text-slate-500">{label}</div><div className={`mt-1 text-lg font-black ${accent ? "text-cyan-300" : "text-white"}`}>{value}</div></div>; }
function Small({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-2.5"><div className="text-[10px] text-slate-500">{label}</div><div className="mt-1 text-xs font-black text-slate-100">{value}</div></div>; }
function Flow({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-2.5 text-center"><div className="text-[10px] text-slate-500">{label}</div><div className={`mt-1 text-xs font-black ${value > 3 ? "text-emerald-300" : value < -3 ? "text-rose-300" : "text-slate-300"}`}>{pct(value)}</div></div>; }
function Level({ label, value, danger = false, good = false, icon, liveState }: { label: string; value?: number; danger?: boolean; good?: boolean; icon: React.ReactNode; liveState?: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-[10px] text-slate-500">{icon}{label}</div>{liveState && <span className={`text-[8px] font-black ${danger && liveState === "CRUZADA" ? "text-rose-300" : "text-cyan-300"}`}>{liveState}</span>}</div><div className={`mt-1 font-mono text-sm font-black ${danger ? "text-rose-300" : good ? "text-emerald-300" : "text-white"}`}>{fmt(value)}</div></div>; }
function LivePulse({ label, value, status, tone, icon }: { label: string; value: string; status: string; tone: "green" | "red" | "neutral"; icon: React.ReactNode }) { const cls = tone === "green" ? "border-emerald-500/20 bg-emerald-500/[.045] text-emerald-300" : tone === "red" ? "border-rose-500/20 bg-rose-500/[.045] text-rose-300" : "border-slate-800 bg-slate-950/45 text-slate-300"; return <div className={`rounded-xl border p-3 ${cls}`}><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] opacity-65">{icon}{label}</div><div className="mt-1 font-mono text-sm font-black">{value}</div><div className="mt-1 text-[8px] font-black uppercase tracking-[.08em] opacity-70">{status}</div></div>; }
