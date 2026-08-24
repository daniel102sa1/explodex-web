"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, RadioTower, Search, ShieldAlert, TimerReset, Zap } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type LiveTicker = {
  symbol: string;
  price: number;
  change24h: number;
  quoteVolume: number;
  bid: number;
  ask: number;
  flash: "up" | "down" | "flat";
  flashAt: number;
};

const OKX_FALLBACK_SYMBOLS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "SUI",
  "LTC", "BCH", "TRX", "DOT", "NEAR", "APT", "ARB", "OP", "ATOM", "FIL",
  "ZEC", "PEPE", "WLD", "AAVE", "ENA", "PENGU", "FET", "ICP", "TON", "ETC",
];

function fmtPrice(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 7 });
}

function fmtMoney(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtLevel(value?: number) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return fmtPrice(Number(value));
}

function durationText(min?: number, max?: number) {
  if (!min || !max) return "—";
  const unit = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m % 60 === 0 ? 0 : 1)} h` : `${m} min`);
  return `${unit(min)} – ${unit(max)}`;
}

function phaseText(value?: string) {
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

function typeText(value?: string) {
  const map: Record<string, string> = {
    IMPULSO_LONG: "IMPULSO LONG",
    IMPULSO_SHORT: "IMPULSO SHORT",
    REBOTE_LONG: "REBOTE LONG",
    RECHAZO_SHORT: "RECHAZO / SHORT",
    SIN_SETUP: "SIN SETUP",
  };
  return map[String(value ?? "").toUpperCase()] ?? String(value ?? "—");
}

export default function LiveMarketTerminal() {
  const [rows, setRows] = useState<LiveTicker[]>([]);
  const [source, setSource] = useState<"BINANCE_WS" | "OKX_WS" | "CONECTANDO">("CONECTANDO");
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("BTCUSDT");
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [sort, setSort] = useState<"volume" | "gainers" | "losers">("volume");
  const dataRef = useRef<Map<string, LiveTicker>>(new Map());
  const socketRef = useRef<WebSocket | null>(null);
  const receivedBinanceRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const renderTimer = setInterval(() => {
      if (!disposed) setRows(Array.from(dataRef.current.values()));
    }, 300);

    function updateTicker(next: Omit<LiveTicker, "flash" | "flashAt">) {
      const prev = dataRef.current.get(next.symbol);
      const now = Date.now();
      const flash = !prev ? "flat" : next.price > prev.price ? "up" : next.price < prev.price ? "down" : prev.flash;
      dataRef.current.set(next.symbol, {
        ...next,
        flash,
        flashAt: flash === "flat" ? prev?.flashAt ?? 0 : now,
      });
    }

    function connectOkx() {
      if (disposed) return;
      try { socketRef.current?.close(); } catch {}
      setSource("OKX_WS");
      setConnected(false);
      const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      socketRef.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        ws.send(JSON.stringify({
          op: "subscribe",
          args: OKX_FALLBACK_SYMBOLS.map((coin) => ({ channel: "tickers", instId: `${coin}-USDT-SWAP` })),
        }));
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          for (const item of payload?.data ?? []) {
            const instId = String(item.instId ?? "");
            if (!instId.endsWith("-USDT-SWAP")) continue;
            const symbol = instId.replace("-USDT-SWAP", "USDT").replaceAll("-", "");
            const price = Number(item.last ?? 0);
            const open24h = Number(item.open24h ?? 0);
            const bid = Number(item.bidPx ?? 0);
            const ask = Number(item.askPx ?? 0);
            const quoteVolume = Number(item.volCcy24h ?? 0) * price;
            if (!price) continue;
            updateTicker({
              symbol,
              price,
              change24h: open24h ? ((price - open24h) / open24h) * 100 : 0,
              quoteVolume,
              bid,
              ask,
            });
          }
        } catch {}
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => setConnected(false);
    }

    function connectBinance() {
      setSource("CONECTANDO");
      const ws = new WebSocket("wss://fstream.binance.com/ws/!ticker@arr");
      socketRef.current = ws;
      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setSource("BINANCE_WS");
      };
      ws.onmessage = (event) => {
        receivedBinanceRef.current = true;
        try {
          const payload = JSON.parse(event.data);
          if (!Array.isArray(payload)) return;
          for (const item of payload) {
            const symbol = String(item.s ?? "");
            if (!symbol.endsWith("USDT") || symbol.includes("_")) continue;
            const price = Number(item.c ?? 0);
            if (!price) continue;
            updateTicker({
              symbol,
              price,
              change24h: Number(item.P ?? 0),
              quoteVolume: Number(item.q ?? 0),
              bid: Number(item.b ?? 0),
              ask: Number(item.a ?? 0),
            });
          }
        } catch {}
      };
      ws.onerror = () => {
        if (!receivedBinanceRef.current) connectOkx();
      };
      ws.onclose = () => {
        setConnected(false);
        if (!disposed && !receivedBinanceRef.current) connectOkx();
      };
      fallbackTimer = setTimeout(() => {
        if (!receivedBinanceRef.current) connectOkx();
      }, 6000);
    }

    connectBinance();

    return () => {
      disposed = true;
      clearInterval(renderTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { socketRef.current?.close(); } catch {}
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadPrediction(showLoading = false) {
      if (showLoading) setAnalysisLoading(true);
      try {
        const value = await getLiveAnalysis(selected);
        if (!cancelled) {
          setAnalysis(value);
          setAnalysisError(null);
        }
      } catch (error) {
        if (!cancelled) setAnalysisError(error instanceof Error ? error.message : "No se pudo cargar la predicción");
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    }
    loadPrediction(true);
    const timer = setInterval(() => loadPrediction(false), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selected]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = rows.filter((row) => !q || row.symbol.includes(q));
    const copy = [...filtered];
    if (sort === "gainers") copy.sort((a, b) => b.change24h - a.change24h);
    else if (sort === "losers") copy.sort((a, b) => a.change24h - b.change24h);
    else copy.sort((a, b) => b.quoteVolume - a.quoteVolume);
    return copy.slice(0, 100);
  }, [rows, query, sort]);

  const prediction = analysis?.prediction;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70">
        <div className="border-b border-slate-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-black text-white"><RadioTower size={18} className="text-emerald-400"/> Mercado en tiempo real</div>
              <div className="mt-1 text-xs text-slate-500">Los precios cambian por WebSocket; no necesitas recargar la página.</div>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`}/>
              {connected ? `${source} CONECTADO` : "CONECTANDO"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
              <Search size={15} className="text-slate-500"/>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar BTC, ENA, PENGU..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"/>
            </label>
            {(["volume", "gainers", "losers"] as const).map((value) => (
              <button key={value} onClick={() => setSort(value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${sort === value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-400"}`}>
                {value === "volume" ? "Mayor volumen" : value === "gainers" ? "Más suben" : "Más bajan"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[720px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Moneda</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">24h</th>
                <th className="px-4 py-3 text-right">Volumen</th>
                <th className="px-4 py-3 text-right">Spread</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const spreadBps = row.bid > 0 && row.ask > 0 ? ((row.ask - row.bid) / ((row.ask + row.bid) / 2)) * 10_000 : 0;
                const freshFlash = Date.now() - row.flashAt < 700;
                return (
                  <tr key={row.symbol} onClick={() => setSelected(row.symbol)} className={`cursor-pointer border-b border-slate-900 transition ${selected === row.symbol ? "bg-emerald-500/8" : "hover:bg-slate-900/60"}`}>
                    <td className="px-4 py-3 font-black text-white">{row.symbol}</td>
                    <td className={`px-4 py-3 text-right font-mono font-black transition ${freshFlash && row.flash === "up" ? "bg-emerald-500/15 text-emerald-300" : freshFlash && row.flash === "down" ? "bg-rose-500/15 text-rose-300" : "text-slate-100"}`}>{fmtPrice(row.price)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${row.change24h >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{row.change24h >= 0 ? "+" : ""}{row.change24h.toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right text-slate-400">{fmtMoney(row.quoteVolume)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{spreadBps ? `${spreadBps.toFixed(2)} bps` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && <div className="p-10 text-center text-sm text-slate-500">Esperando datos del mercado...</div>}
        </div>
      </section>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Predictor previo</div>
              <h2 className="mt-1 text-2xl font-black text-white">{selected}</h2>
            </div>
            <Link href={`/coin/${selected}`} className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:text-white">Detalle</Link>
          </div>

          {analysisLoading && !analysis ? <div className="mt-6 text-sm text-slate-400">Calculando estructura, flujo, OI y CoinGlass...</div> : analysisError && !analysis ? <div className="mt-6 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-200">{analysisError}</div> : analysis && prediction ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Info label="Patrón" value={typeText(prediction.type)} />
                <Info label="Fase" value={phaseText(prediction.phase)} strong={prediction.phase === "ACTIVADO"} />
                <Info label="Preparación" value={`${prediction.preactivation_score.toFixed(1)}/100`} />
                <Info label="Magnitud" value={prediction.magnitude ?? "—"} />
              </div>

              <div className={`mt-4 rounded-2xl border p-4 ${prediction.phase === "ACTIVADO" ? "border-emerald-500/30 bg-emerald-500/8" : prediction.phase === "PREACTIVACION" ? "border-amber-500/30 bg-amber-500/8" : "border-slate-800 bg-slate-950/40"}`}>
                <div className="flex items-center gap-2 font-black text-white"><Zap size={17}/> {prediction.title ?? typeText(prediction.type)}</div>
                <div className="mt-2 text-xs leading-5 text-slate-400">El score de preparación no es una probabilidad de ganar. La entrada solo se habilita cuando la secuencia se activa y el precio no está perseguido.</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Level label="Trigger" value={prediction.trigger_price} />
                <Level label="Invalidación" value={prediction.invalidation_price} danger />
                <Level label="Entrada baja" value={prediction.entry_low} />
                <Level label="Entrada alta" value={prediction.entry_high} />
                <Level label="Stop loss" value={prediction.stop_loss} danger />
                <Level label="TP1" value={prediction.tp1} good />
                <Level label="TP2" value={prediction.tp2} good />
                <Level label="TP3 / runner" value={prediction.tp3} good />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Info label="Duración estimada" value={durationText(prediction.expected_duration_min_minutes, prediction.expected_duration_max_minutes)} />
                <Info label="Time stop" value={prediction.time_stop_minutes ? `${prediction.time_stop_minutes} min` : "—"} />
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-300"><Activity size={16}/> Confirmaciones</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(prediction.confirmations ?? []).length ? prediction.confirmations!.map((item) => <span key={item} className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[11px] text-emerald-200">{item}</span>) : <span className="text-xs text-slate-500">Aún no hay suficientes confirmaciones.</span>}
                </div>
              </div>

              {!!(prediction.conflicts ?? []).length && <div className="mt-5">
                <div className="flex items-center gap-2 text-sm font-black text-rose-300"><ShieldAlert size={16}/> Conflictos</div>
                <div className="mt-2 flex flex-wrap gap-2">{prediction.conflicts!.map((item) => <span key={item} className="rounded-full border border-rose-500/20 bg-rose-500/5 px-2.5 py-1 text-[11px] text-rose-200">{item}</span>)}</div>
              </div>}

              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-white"><TimerReset size={16}/> Plan de gestión</div>
                <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                  <p><b className="text-slate-200">Antes del trigger:</b> {prediction.management?.before_trigger ?? "No entrar."}</p>
                  <p><b className="text-slate-200">Después:</b> {prediction.management?.after_trigger ?? "Esperar confirmación."}</p>
                  <p><b className="text-slate-200">TP1:</b> {prediction.management?.tp1 ?? "Proteger."}</p>
                  <p><b className="text-slate-200">TP2:</b> {prediction.management?.tp2 ?? "Tomar beneficio principal."}</p>
                  <p><b className="text-slate-200">TP3:</b> {prediction.management?.tp3 ?? "Runner opcional."}</p>
                  <p><b className="text-slate-200">Tiempo:</b> {prediction.management?.time_stop ?? "Reevaluar si no hay seguimiento."}</p>
                </div>
              </div>
            </>
          ) : <div className="mt-6 text-sm text-slate-500">Selecciona una moneda para calcular el plan.</div>}
        </section>
      </aside>
    </div>
  );
}

function Info({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div><div className={`mt-1 text-sm font-black ${strong ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}

function Level({ label, value, danger = false, good = false }: { label: string; value?: number; danger?: boolean; good?: boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-[11px] text-slate-500">{label}</div><div className={`mt-1 font-mono text-sm font-black ${danger ? "text-rose-300" : good ? "text-emerald-300" : "text-white"}`}>{fmtLevel(value)}</div></div>;
}
