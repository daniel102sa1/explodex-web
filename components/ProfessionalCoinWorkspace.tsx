"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, CheckCircle2, CircleDashed, Clock3, Database, Gauge, Network, RadioTower, ShieldAlert, Target, TimerReset, Waves, XCircle, Zap } from "lucide-react";
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

function pct(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
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

function conditionList(analysis: LiveAnalysis, prediction: PreMovePrediction) {
  const m = analysis.metrics ?? {};
  const seq = prediction.sequence ?? {};
  const direction = prediction.direction;
  return [
    { label: "Volatilidad comprimida", ready: Boolean(seq.compressed), detail: `rVol ${Number(seq.relative_volume ?? m.relative_volume ?? 0).toFixed(2)}x` },
    { label: direction === "LONG" ? "Mínimos crecientes" : "Máximos decrecientes", ready: direction === "LONG" ? Boolean(seq.higher_lows) : Boolean(seq.lower_highs), detail: "presión estructural" },
    { label: "Volumen acelerando", ready: Number(seq.volume_acceleration ?? m.volume_acceleration ?? 0) >= 1.15, detail: `${Number(seq.volume_acceleration ?? m.volume_acceleration ?? 0).toFixed(2)}x` },
    { label: "Interés abierto acompaña", ready: Math.abs(Number(m.oi_change_pct ?? 0)) >= 0.2 || Math.abs(Number(analysis.coinglass?.open_interest?.change_15m_pct ?? 0)) >= 0.2, detail: `CG 15m ${pct(analysis.coinglass?.open_interest?.change_15m_pct)}` },
    { label: "Futuros alineados", ready: direction === "LONG" ? Number(m.futures_delta_ratio ?? 0) > 0.04 : Number(m.futures_delta_ratio ?? 0) < -0.04, detail: pct(Number(m.futures_delta_ratio ?? 0) * 100) },
    { label: "Spot confirma", ready: direction === "LONG" ? Number(m.spot_delta_ratio ?? 0) > 0.03 : Number(m.spot_delta_ratio ?? 0) < -0.03, detail: pct(Number(m.spot_delta_ratio ?? 0) * 100) },
    { label: "Libro inclinado", ready: direction === "LONG" ? Number(m.order_book_imbalance ?? 0) > 0.04 : Number(m.order_book_imbalance ?? 0) < -0.04, detail: pct(Number(m.order_book_imbalance ?? 0) * 100) },
    { label: "BTC compatible", ready: direction === "LONG" ? m.btc_trend !== "BEARISH" : m.btc_trend !== "BULLISH", detail: String(m.btc_trend ?? "NEUTRAL") },
    { label: "Trigger alcanzado", ready: Boolean(prediction.trigger_hit) && !Boolean(seq.chase_risk), detail: prediction.trigger_hit ? (seq.chase_risk ? "demasiado lejos" : "activado") : `esperar ${fmt(prediction.trigger_price)}` },
  ];
}

export default function ProfessionalCoinWorkspace({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | "flat">("flat");
  const lastPrice = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (!cancelled) {
          setAnalysis(value);
          setError(null);
          if (!livePrice) setLivePrice(value.current_price);
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
    function apply(price: number) {
      if (!price || disposed) return;
      if (lastPrice.current != null) setFlash(price > lastPrice.current ? "up" : price < lastPrice.current ? "down" : "flat");
      lastPrice.current = price;
      setLivePrice(price);
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
    socket.onmessage = (event) => { gotBinance = true; try { apply(Number(JSON.parse(event.data)?.p ?? 0)); } catch {} };
    socket.onerror = () => { if (!gotBinance) connectOkx(); };
    const fallback = setTimeout(() => { if (!gotBinance) connectOkx(); }, 4500);
    return () => { disposed = true; clearTimeout(fallback); try { socket?.close(); } catch {} };
  }, [safeSymbol]);

  const prediction = analysis?.prediction;
  const conditions = useMemo(() => analysis && prediction ? conditionList(analysis, prediction) : [], [analysis, prediction]);
  const readyCount = conditions.filter((x) => x.ready).length;
  const phase = prediction?.phase ?? "SIN_SETUP";
  const isReady = analysis?.state === "READY" && phase === "ACTIVADO";
  const isLong = prediction?.direction === "LONG";

  return (
    <main className="mx-auto min-h-screen max-w-[1680px] px-3 py-4 sm:px-5 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/scanner" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-white"><ArrowLeft size={15}/> Volver</Link>
        <div className="flex items-center gap-2 text-[11px] text-slate-500"><RadioTower size={14} className="text-emerald-400"/> precio vivo · análisis cada 20 s</div>
      </div>

      <section className="terminal-panel mb-4 overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 bg-gradient-to-r from-emerald-500/[.06] via-transparent to-violet-500/[.05] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black tracking-tight text-white">{safeSymbol}</h1>
            <span className={`status-pill ${isLong ? "status-long" : "status-short"}`}>{isLong ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {prediction ? typeEs(prediction.type) : analysis?.direction ?? "—"}</span>
            <span className={`status-pill ${isReady ? "status-ready" : phase === "PREACTIVACION" ? "status-watch" : "status-neutral"}`}>{phaseEs(phase)}</span>
            <span className="status-pill status-neutral">{analysis?.source ?? "CARGANDO"}</span>
          </div>
          <div className={`rounded-2xl border px-5 py-3 transition ${flash === "up" ? "border-emerald-400/50 bg-emerald-500/10" : flash === "down" ? "border-rose-400/50 bg-rose-500/10" : "border-slate-800 bg-slate-950/70"}`}>
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Precio en vivo</div>
            <div className="mt-1 font-mono text-3xl font-black text-white">{fmt(livePrice ?? analysis?.current_price)}</div>
          </div>
        </div>

        {analysis && prediction ? (
          <div className="grid xl:grid-cols-[1.65fr_.85fr]">
            <div className="border-r border-slate-800/80 p-4">
              <LiveCandleChart symbol={safeSymbol} />

              <div className="grid gap-3 md:grid-cols-4">
                <Metric label="Setup técnico" value={`${analysis.setup_score.toFixed(1)}/100`} />
                <Metric label="Preparación previa" value={`${prediction.preactivation_score.toFixed(1)}/100`} accent />
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
              <div className={`rounded-2xl border p-4 ${isReady ? "border-emerald-500/35 bg-emerald-500/[.08]" : phase === "PREACTIVACION" ? "border-amber-500/30 bg-amber-500/[.06]" : "border-slate-800 bg-slate-950/60"}`}>
                <div className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">Decisión actual</div>
                <div className={`mt-2 text-2xl font-black ${isReady ? "text-emerald-300" : phase === "PREACTIVACION" ? "text-amber-200" : "text-white"}`}>{isReady ? "READY · PLAN ACTIVO" : phase === "PREACTIVACION" ? "NO ENTRAR TODAVÍA" : phaseEs(phase)}</div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{isReady ? "Trigger activado, dirección alineada y precio aún dentro del plan." : prediction.management?.before_trigger ?? "Esperar confirmación. No perseguir el precio."}</p>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Level label="Trigger" value={prediction.trigger_price} icon={<Zap size={14}/>} />
                <Level label="Invalidación" value={prediction.invalidation_price} danger icon={<ShieldAlert size={14}/>} />
                <Level label="Entrada baja" value={prediction.entry_low} icon={<Target size={14}/>} />
                <Level label="Entrada alta" value={prediction.entry_high} icon={<Target size={14}/>} />
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
function Level({ label, value, danger = false, good = false, icon }: { label: string; value?: number; danger?: boolean; good?: boolean; icon: React.ReactNode }) { return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="flex items-center gap-1.5 text-[10px] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-sm font-black ${danger ? "text-rose-300" : good ? "text-emerald-300" : "text-white"}`}>{fmt(value)}</div></div>; }
