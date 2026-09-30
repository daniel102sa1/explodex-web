"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Brush,
  ChevronDown,
  CircleDollarSign,
  Eraser,
  Gauge,
  Layers3,
  LineChart,
  Minus,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Triangle,
  X,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Side = "LONG" | "SHORT";
type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

type PracticePosition = {
  id: number;
  symbol: string;
  side: Side;
  leverage: number;
  entry_price: number;
  mark_price: number;
  stop_loss: number;
  take_profit: number;
  tp2?: number | null;
  tp3?: number | null;
  margin_used: number;
  quantity: number;
  notional: number;
  risk_usdt: number;
  unrealized_pnl: number;
  roi_on_margin_pct: number;
  timeframe?: string | null;
  pattern?: string | null;
  opened_at?: string | null;
};

type PracticeSummary = {
  starting_balance: number;
  cash_balance: number;
  reserved_margin: number;
  available_margin: number;
  unrealized_pnl: number;
  equity: number;
  realized_pnl: number;
  total_costs: number;
  open_positions: PracticePosition[];
  closed_trades: number;
  winners: number;
  losers: number;
  win_rate_pct?: number | null;
};

type OrderForm = {
  side: Side;
  margin: string;
  leverage: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  pattern: string;
  note: string;
};

const INTERVALS: Interval[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
const INDICATORS = ["EMA20/50", "VWAP", "RSI", "MACD", "VOL", "BOLL", "SAR", "OBV"] as const;
type IndicatorName = typeof INDICATORS[number];

const PATTERNS = [
  "PULLBACK",
  "BREAKOUT_RETEST",
  "TRIANGULO_SIMETRICO",
  "TRIANGULO_ASCENDENTE",
  "TRIANGULO_DESCENDENTE",
  "HCH",
  "HCH_INVERTIDO",
  "DOBLE_TECHO",
  "DOBLE_SUELO",
  "BANDERA",
  "CUNA",
  "ABCD",
  "XABCD_ARMONICO",
  "CYPHER",
  "THREE_DRIVES",
  "ELLIOTT",
  "BARRIDO_LIQUIDEZ",
  "OTRO",
];

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function money(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "$0.00";
  return `${Number(value) >= 0 ? "" : "-"}$${Math.abs(Number(value)).toFixed(2)}`;
}

function normalizeSymbol(value: string) {
  let next = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!next) return "BTCUSDT";
  if (!next.endsWith("USDT")) next += "USDT";
  return next;
}

function sessionId() {
  if (typeof window === "undefined") return "";
  const key = "explodex:practice-session";
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `practice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, value);
  return value;
}

function intervalFromPeriod(period: any): Interval {
  const span = Number(period?.span || 1);
  const type = String(period?.type || "minute");
  if (type === "day") return "1d";
  if (type === "hour") return span >= 4 ? "4h" : "1h";
  if (span >= 30) return "30m";
  if (span >= 15) return "15m";
  if (span >= 5) return "5m";
  if (span >= 3) return "3m";
  return "1m";
}

function periodFromInterval(interval: Interval) {
  if (interval.endsWith("d")) return { type: "day" as const, span: Number(interval.slice(0, -1)) };
  if (interval.endsWith("h")) return { type: "hour" as const, span: Number(interval.slice(0, -1)) };
  return { type: "minute" as const, span: Number(interval.slice(0, -1)) };
}

export default function PracticeTradingTerminal() {
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const [symbolInput, setSymbolInput] = useState("BTCUSDT");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [livePrice, setLivePrice] = useState(0);
  const [indicatorSet, setIndicatorSet] = useState<Set<IndicatorName>>(
    new Set(["EMA20/50", "VWAP", "RSI", "VOL"])
  );
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [sid, setSid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chartReady, setChartReady] = useState(false);
  const [showOrder, setShowOrder] = useState(true);
  const [form, setForm] = useState<OrderForm>({
    side: "LONG",
    margin: "25",
    leverage: "3",
    stop: "",
    tp1: "",
    tp2: "",
    tp3: "",
    pattern: "PULLBACK",
    note: "",
  });

  useEffect(() => setSid(sessionId()), []);

  const loadPractice = useCallback(async () => {
    if (!BASE_URL || !sid) return;
    try {
      const [s, h] = await Promise.all([
        fetch(`${BASE_URL}/api/v1/practice/summary?session_id=${encodeURIComponent(sid)}`, { cache: "no-store" }),
        fetch(`${BASE_URL}/api/v1/practice/history?session_id=${encodeURIComponent(sid)}&limit=30`, { cache: "no-store" }),
      ]);
      if (s.ok) setSummary(await s.json());
      if (h.ok) setHistory((await h.json()).rows ?? []);
    } catch {}
  }, [sid]);

  useEffect(() => {
    loadPractice();
    const timer = window.setInterval(loadPractice, 5000);
    return () => window.clearInterval(timer);
  }, [loadPractice]);

  useEffect(() => {
    let disposed = false;
    let localChart: any = null;

    async function boot() {
      if (!chartElRef.current) return;
      const kc = await import("klinecharts");
      if (disposed || !chartElRef.current) return;

      try {
        kc.registerIndicator({
          name: "EXPLODEX_VWAP",
          shortName: "VWAP",
          series: "price",
          figures: [{ key: "vwap", title: "VWAP: ", type: "line" }],
          calc: (rows: any[]) => {
            let cumulativePv = 0;
            let cumulativeVolume = 0;
            const output: Record<number, { vwap: number }> = {};
            for (const row of rows) {
              const volume = Number(row.volume || 0);
              const typical = (Number(row.high) + Number(row.low) + Number(row.close)) / 3;
              cumulativePv += typical * volume;
              cumulativeVolume += volume;
              output[Number(row.timestamp)] = {
                vwap: cumulativeVolume > 0 ? cumulativePv / cumulativeVolume : Number(row.close),
              };
            }
            return output;
          },
        } as any);
      } catch {}

      localChart = kc.init(chartElRef.current, {
        locale: "en-US",
        timezone: "America/Guatemala",
        layout: {
          pane: { minHeight: 70, dragEnabled: true },
          yAxis: { position: "right", inside: false, scrollZoomEnabled: true },
        },
      } as any);
      chartRef.current = localChart;
      if (!localChart) return;

      localChart.setDataLoader({
        getBars: async ({ type, symbol: chartSymbol, period, callback }: any) => {
          try {
            const ticker = normalizeSymbol(chartSymbol?.ticker || symbol);
            const requestedInterval = intervalFromPeriod(period);
            const response = await fetch(
              `${BASE_URL}/api/v1/market/candles/${ticker}?interval=${requestedInterval}&limit=300`,
              { cache: "no-store" }
            );
            if (!response.ok) throw new Error("candles");
            const payload = await response.json();
            const bars = (payload.candles ?? []).map((row: any) => ({
              timestamp: Number(row.time),
              open: Number(row.open),
              high: Number(row.high),
              low: Number(row.low),
              close: Number(row.close),
              volume: Number(row.volume || 0),
            })).sort((a: any, b: any) => a.timestamp - b.timestamp);
            if (bars.length) setLivePrice(Number(bars[bars.length - 1].close || 0));
            callback(bars, { forward: false, backward: false });
          } catch {
            callback([], { forward: false, backward: false });
          }
        },
        subscribeBar: ({ symbol: chartSymbol, period, callback }: any) => {
          wsCleanupRef.current?.();
          const ticker = normalizeSymbol(chartSymbol?.ticker || symbol);
          const requestedInterval = intervalFromPeriod(period);
          let disposedWs = false;
          let gotBinance = false;
          let ws: WebSocket | null = null;
          let fallbackTimer: number | null = null;

          const push = (bar: any) => {
            if (disposedWs) return;
            setLivePrice(Number(bar.close || 0));
            callback(bar);
          };

          const connectOkx = () => {
            if (disposedWs) return;
            try { ws?.close(); } catch {}
            const base = ticker.replace(/USDT$/, "");
            const channel = requestedInterval === "1d"
              ? "candle1D"
              : requestedInterval.endsWith("h")
                ? `candle${requestedInterval.replace("h", "H")}`
                : `candle${requestedInterval}`;
            ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/business");
            ws.onopen = () => ws?.send(JSON.stringify({
              op: "subscribe",
              args: [{ channel, instId: `${base}-USDT-SWAP` }],
            }));
            ws.onmessage = (event) => {
              try {
                const row = JSON.parse(event.data)?.data?.[0];
                if (!Array.isArray(row) || row.length < 6) return;
                push({
                  timestamp: Number(row[0]),
                  open: Number(row[1]),
                  high: Number(row[2]),
                  low: Number(row[3]),
                  close: Number(row[4]),
                  volume: Number(row[7] ?? row[6] ?? row[5] ?? 0),
                });
              } catch {}
            };
          };

          try {
            ws = new WebSocket(`wss://fstream.binance.com/ws/${ticker.toLowerCase()}@kline_${requestedInterval}`);
            ws.onmessage = (event) => {
              gotBinance = true;
              try {
                const k = JSON.parse(event.data)?.k;
                if (!k) return;
                push({
                  timestamp: Number(k.t),
                  open: Number(k.o),
                  high: Number(k.h),
                  low: Number(k.l),
                  close: Number(k.c),
                  volume: Number(k.q ?? k.v ?? 0),
                });
              } catch {}
            };
            ws.onerror = () => { if (!gotBinance) connectOkx(); };
            ws.onclose = () => { if (!disposedWs && !gotBinance) connectOkx(); };
            fallbackTimer = window.setTimeout(() => { if (!gotBinance) connectOkx(); }, 5000);
          } catch {
            connectOkx();
          }

          const cleanup = () => {
            disposedWs = true;
            if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
            try { ws?.close(); } catch {}
          };
          wsCleanupRef.current = cleanup;
        },
        unsubscribeBar: () => {
          wsCleanupRef.current?.();
          wsCleanupRef.current = null;
        },
      });

      localChart.setSymbol({ ticker: symbol, pricePrecision: 8, volumePrecision: 4 });
      localChart.setPeriod(periodFromInterval(interval));
      setChartReady(true);
    }

    boot();
    return () => {
      disposed = true;
      wsCleanupRef.current?.();
      wsCleanupRef.current = null;
      if (localChart) {
        try { localChart.dispose?.(); } catch {}
      }
      chartRef.current = null;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol, pricePrecision: 8, volumePrecision: 4 });
    chart.setPeriod(periodFromInterval(interval));
    chart.resetData?.();
    window.setTimeout(() => restoreDrawings(false), 700);
  }, [symbol, interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const name of ["EMA", "EXPLODEX_VWAP", "RSI", "MACD", "VOL", "BOLL", "SAR", "OBV"]) {
      try { chart.removeIndicator({ name }); } catch {}
    }
    if (indicatorSet.has("EMA20/50")) {
      try { chart.createIndicator({ name: "EMA", paneId: "candle_pane", calcParams: [20, 50] }, true); } catch {}
    }
    if (indicatorSet.has("VWAP")) {
      try { chart.createIndicator({ name: "EXPLODEX_VWAP", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("BOLL")) {
      try { chart.createIndicator({ name: "BOLL", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("SAR")) {
      try { chart.createIndicator({ name: "SAR", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("VOL")) {
      try { chart.createIndicator({ name: "VOL", paneId: "volume_pane" }); } catch {}
    }
    if (indicatorSet.has("RSI")) {
      try { chart.createIndicator({ name: "RSI", paneId: "rsi_pane", calcParams: [14] }); } catch {}
    }
    if (indicatorSet.has("MACD")) {
      try { chart.createIndicator({ name: "MACD", paneId: "macd_pane", calcParams: [12, 26, 9] }); } catch {}
    }
    if (indicatorSet.has("OBV")) {
      try { chart.createIndicator({ name: "OBV", paneId: "obv_pane" }); } catch {}
    }
  }, [indicatorSet, chartReady]);

  function toggleIndicator(name: IndicatorName) {
    setIndicatorSet((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function draw(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.createOverlay({ name, groupId: "practice-user", mode: "weak_magnet", modeSensitivity: 8 });
    } catch {}
  }

  function drawTriangle() {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.createOverlay({
        name: "segment",
        groupId: "practice-user",
        mode: "weak_magnet",
        modeSensitivity: 8,
        onDrawEnd: () => {
          window.setTimeout(() => {
            try {
              chart.createOverlay({ name: "segment", groupId: "practice-user", mode: "weak_magnet", modeSensitivity: 8 });
            } catch {}
          }, 120);
          return false;
        },
      });
      setMessage("Triángulo: dibuja la línea superior; al terminar se activa la segunda línea.");
    } catch {}
  }

  function drawingKey() {
    return `explodex:practice-drawings:${symbol}:${interval}`;
  }

  function saveDrawings() {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      const rows = (chart.getOverlays({ groupId: "practice-user" }) ?? []).map((item: any) => ({
        name: item.name,
        points: item.points,
        groupId: "practice-user",
        mode: item.mode || "weak_magnet",
      }));
      window.localStorage.setItem(drawingKey(), JSON.stringify(rows));
      setMessage(`${rows.length} dibujo(s) guardados para ${symbol} ${interval}.`);
    } catch {
      setMessage("No pude guardar los dibujos.");
    }
  }

  function restoreDrawings(showMessage = true) {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.removeOverlay({ groupId: "practice-user" });
      const raw = window.localStorage.getItem(drawingKey());
      const rows = raw ? JSON.parse(raw) : [];
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row?.name || !Array.isArray(row.points)) continue;
        chart.createOverlay({
          name: row.name,
          points: row.points,
          groupId: "practice-user",
          mode: row.mode || "weak_magnet",
        });
      }
      if (showMessage) setMessage(`${rows.length || 0} dibujo(s) restaurados.`);
    } catch {
      if (showMessage) setMessage("No pude restaurar los dibujos.");
    }
  }

  function clearDrawings() {
    try { chartRef.current?.removeOverlay({ groupId: "practice-user" }); } catch {}
    window.localStorage.removeItem(drawingKey());
    setMessage("Dibujos borrados para esta moneda y temporalidad.");
  }

  const riskPreview = useMemo(() => {
    const margin = Number(form.margin || 0);
    const leverage = Number(form.leverage || 0);
    const stop = Number(form.stop || 0);
    if (!(livePrice > 0 && margin > 0 && leverage > 0 && stop > 0)) return null;
    const notional = margin * leverage;
    const qty = notional / livePrice;
    const risk = Math.abs(livePrice - stop) * qty;
    const equity = Number(summary?.equity || 1000);
    return {
      notional,
      qty,
      risk,
      riskPct: equity > 0 ? risk / equity * 100 : 0,
    };
  }, [form.margin, form.leverage, form.stop, livePrice, summary?.equity]);

  async function openTrade() {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          symbol,
          side: form.side,
          margin: Number(form.margin),
          leverage: Number(form.leverage),
          stop_loss: Number(form.stop),
          take_profit: Number(form.tp1),
          tp2: form.tp2 ? Number(form.tp2) : null,
          tp3: form.tp3 ? Number(form.tp3) : null,
          timeframe: interval,
          pattern: form.pattern,
          note: form.note || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo abrir");
      const warning = Array.isArray(payload.warnings) && payload.warnings.length
        ? " · Ojo: riesgo/apalancamiento alto para práctica."
        : "";
      setMessage(`Demo ${payload.side} abierta a ${fmt(payload.entry_price)}${warning}`);
      await loadPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir la operación demo.");
    } finally {
      setBusy(false);
    }
  }

  async function closeTrade(id: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, reason: "USER_CLOSE" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo cerrar");
      setMessage(`Operación cerrada. PnL neto ${money(payload.net_pnl)}.`);
      await loadPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar.");
    } finally {
      setBusy(false);
    }
  }

  async function resetAccount() {
    if (!BASE_URL || !sid || !window.confirm("¿Reiniciar tu cuenta de práctica a 1,000 USDT y borrar su historial?")) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!response.ok) throw new Error("No se pudo reiniciar");
      setMessage("Cuenta de práctica reiniciada a 1,000 USDT.");
      await loadPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reiniciar.");
    } finally {
      setBusy(false);
    }
  }

  const selectedOpen = (summary?.open_positions ?? []).filter((p) => p.symbol === symbol);

  return (
    <div className="space-y-3">
      <section className="terminal-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 p-3">
          <form
            className="flex min-w-[250px] flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = normalizeSymbol(symbolInput);
              setSymbolInput(next);
              setSymbol(next);
            }}
          >
            <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
              <Search size={15} className="text-slate-500"/>
              <input
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="w-full bg-transparent text-sm font-black uppercase text-white outline-none"
                placeholder="BTC, SOL, PENGU..."
              />
            </label>
            <button className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950">Cargar</button>
          </form>

          <div className="flex flex-wrap gap-1">
            {INTERVALS.map((value) => (
              <button
                key={value}
                onClick={() => setIntervalValue(value)}
                className={`rounded-lg border px-2.5 py-2 text-[10px] font-black ${interval === value ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-slate-800 text-slate-500"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="ml-auto text-right">
            <div className="mono-number text-xl font-black text-white">{fmt(livePrice)}</div>
            <div className="text-[9px] uppercase tracking-[.12em] text-slate-600">{symbol} · mercado vivo</div>
          </div>
        </div>

        <div className="grid border-b border-slate-800 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-wrap gap-1 border-b border-slate-800 p-2 lg:max-w-[220px] lg:flex-col lg:border-b-0 lg:border-r">
            <Tool icon={<LineChart size={14}/>} label="Línea" onClick={() => draw("segment")}/>
            <Tool icon={<Minus size={14}/>} label="Soporte / resistencia" onClick={() => draw("horizontalStraightLine")}/>
            <Tool icon={<Triangle size={14}/>} label="Triángulo (2 líneas)" onClick={drawTriangle}/>
            <Tool icon={<Activity size={14}/>} label="Fibonacci" onClick={() => draw("fibonacciLine")}/>
            <Tool icon={<Layers3 size={14}/>} label="Canal paralelo" onClick={() => draw("parallelStraightLine")}/>
            <Tool icon={<Brush size={14}/>} label="Dibujo libre" onClick={() => draw("brush")}/>
            <div className="my-1 border-t border-slate-800"/>
            <Tool icon={<Save size={14}/>} label="Guardar dibujos" onClick={saveDrawings}/>
            <Tool icon={<RefreshCcw size={14}/>} label="Cargar dibujos" onClick={() => restoreDrawings(true)}/>
            <Tool icon={<Eraser size={14}/>} label="Borrar dibujos" onClick={clearDrawings} danger/>
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-950/40 p-2">
              <span className="mr-1 text-[9px] font-black uppercase tracking-[.13em] text-slate-600">Indicadores</span>
              {INDICATORS.map((name) => (
                <button
                  key={name}
                  onClick={() => toggleIndicator(name)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${indicatorSet.has(name) ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : "border-slate-800 text-slate-600"}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <div ref={chartElRef} className="h-[620px] w-full bg-[#07111d]"/>
          </div>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="grid gap-3 md:grid-cols-3">
          <Stat title="Cuenta ficticia" value={money(summary?.equity ?? 1000)} detail={`Cash ${money(summary?.cash_balance ?? 1000)}`} icon={<CircleDollarSign size={17}/>}/>
          <Stat title="Margen disponible" value={money(summary?.available_margin ?? 1000)} detail={`Reservado ${money(summary?.reserved_margin ?? 0)}`} icon={<Gauge size={17}/>}/>
          <Stat title="Resultado demo" value={money(summary?.realized_pnl ?? 0)} detail={`${summary?.closed_trades ?? 0} cerradas · WR ${summary?.win_rate_pct == null ? "—" : `${summary.win_rate_pct}%`}`} icon={<BarChart3 size={17}/>}/>

          <div className="terminal-panel p-4 md:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-white">Ruta de práctica</div>
                <div className="mt-1 text-xs text-slate-500">No adivines velas: contexto → setup → gatillo → riesgo → ejecución demo.</div>
              </div>
              <button onClick={resetAccount} disabled={busy} className="rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-bold text-rose-300">
                <RotateCcw size={13} className="mr-1 inline"/> Reiniciar $1,000
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <PracticeStep n="1" title="1H / 15m · Contexto" text="Marca tendencia/rango, soportes, resistencias y swings."/>
              <PracticeStep n="2" title="5m · Setup" text="Busca pullback, triángulo, breakout/retest, Fib o barrido."/>
              <PracticeStep n="3" title="1m / 3m · Gatillo" text="Espera rechazo + BOS/CHOCH o cierre confirmado antes de simular."/>
            </div>
          </div>

          <div className="terminal-panel p-4 md:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-black text-white">Posiciones demo abiertas</div>
              <div className="text-[10px] text-slate-600">{selectedOpen.length} en {symbol} · {(summary?.open_positions ?? []).length} total</div>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              {(summary?.open_positions ?? []).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-black ${p.side === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{p.side}</span>
                        <span className="font-black text-white">{p.symbol}</span>
                        <span className="text-[10px] text-slate-500">{p.leverage}x</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-600">{p.pattern || "MANUAL"} · {p.timeframe || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className={`mono-number font-black ${p.unrealized_pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(p.unrealized_pnl)}</div>
                      <div className="text-[10px] text-slate-500">{p.roi_on_margin_pct >= 0 ? "+" : ""}{p.roi_on_margin_pct.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-[10px]">
                    <Mini label="Entrada" value={fmt(p.entry_price)}/>
                    <Mini label="Ahora" value={fmt(p.mark_price)}/>
                    <Mini label="SL" value={fmt(p.stop_loss)} bad/>
                    <Mini label="TP1" value={fmt(p.take_profit)} good/>
                  </div>
                  <button onClick={() => closeTrade(p.id)} disabled={busy} className="mt-3 w-full rounded-xl border border-slate-700 py-2 text-xs font-black text-slate-200 hover:border-rose-500/30 hover:text-rose-200">
                    Cerrar al mercado (demo)
                  </button>
                </div>
              ))}
              {!summary?.open_positions?.length && <div className="col-span-full py-8 text-center text-xs text-slate-600">Todavía no has abierto ninguna operación de práctica.</div>}
            </div>
          </div>

          <div className="terminal-panel p-4 md:col-span-3">
            <div className="text-sm font-black text-white">Últimas operaciones cerradas</div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="text-[9px] uppercase tracking-[.1em] text-slate-600">
                  <tr><th className="py-2 text-left">Par</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th>SL</th><th>TP</th><th>PnL neto</th><th>Motivo</th></tr>
                </thead>
                <tbody>
                  {history.slice(0, 12).map((row) => (
                    <tr key={row.id} className="border-t border-slate-900 text-center">
                      <td className="py-2 text-left font-black text-white">{row.symbol}</td>
                      <td className={row.side === "LONG" ? "text-emerald-300" : "text-rose-300"}>{row.side}</td>
                      <td>{fmt(row.entry_price)}</td>
                      <td>{fmt(row.exit_price)}</td>
                      <td className="text-rose-300">{fmt(row.stop_loss)}</td>
                      <td className="text-emerald-300">{fmt(row.take_profit)}</td>
                      <td className={Number(row.net_pnl) >= 0 ? "text-emerald-300" : "text-rose-300"}>{money(row.net_pnl)}</td>
                      <td className="text-slate-500">{row.close_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length && <div className="py-6 text-center text-xs text-slate-600">Sin operaciones cerradas todavía.</div>}
            </div>
          </div>
        </div>

        <aside className="terminal-panel h-fit p-4 xl:sticky xl:top-20">
          <button onClick={() => setShowOrder((v) => !v)} className="flex w-full items-center justify-between text-left">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-300">Ejecutar demo</div>
              <div className="mt-1 text-lg font-black text-white">Orden manual</div>
            </div>
            <ChevronDown size={18} className={`text-slate-500 transition ${showOrder ? "rotate-180" : ""}`}/>
          </button>

          {showOrder && <>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setForm((x) => ({ ...x, side: "LONG" }))} className={`rounded-xl border p-3 font-black ${form.side === "LONG" ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300" : "border-slate-800 text-slate-500"}`}>
                <TrendingUp size={16} className="mr-1 inline"/> LONG
              </button>
              <button onClick={() => setForm((x) => ({ ...x, side: "SHORT" }))} className={`rounded-xl border p-3 font-black ${form.side === "SHORT" ? "border-rose-500/35 bg-rose-500/10 text-rose-300" : "border-slate-800 text-slate-500"}`}>
                <TrendingDown size={16} className="mr-1 inline"/> SHORT
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Input label="Margen USDT" value={form.margin} onChange={(v) => setForm((x) => ({ ...x, margin: v }))}/>
              <Input label="Apalancamiento" value={form.leverage} onChange={(v) => setForm((x) => ({ ...x, leverage: v }))}/>
              <Input label="Stop loss" value={form.stop} onChange={(v) => setForm((x) => ({ ...x, stop: v }))}/>
              <Input label="TP1" value={form.tp1} onChange={(v) => setForm((x) => ({ ...x, tp1: v }))}/>
              <Input label="TP2 (opcional)" value={form.tp2} onChange={(v) => setForm((x) => ({ ...x, tp2: v }))}/>
              <Input label="TP3 (opcional)" value={form.tp3} onChange={(v) => setForm((x) => ({ ...x, tp3: v }))}/>
            </div>

            <label className="mt-3 block rounded-xl border border-slate-800 bg-slate-950/45 p-3">
              <span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">Patrón / setup practicado</span>
              <select value={form.pattern} onChange={(e) => setForm((x) => ({ ...x, pattern: e.target.value }))} className="mt-2 w-full bg-transparent text-xs font-bold text-white outline-none">
                {PATTERNS.map((name) => <option key={name} value={name} className="bg-slate-950">{name.replaceAll("_", " ")}</option>)}
              </select>
            </label>

            <label className="mt-3 block rounded-xl border border-slate-800 bg-slate-950/45 p-3">
              <span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">Nota del ejercicio</span>
              <textarea value={form.note} onChange={(e) => setForm((x) => ({ ...x, note: e.target.value }))} rows={2} className="mt-2 w-full resize-none bg-transparent text-xs text-white outline-none" placeholder="Ej. ruptura + retest confirmado; no perseguí la vela..."/>
            </label>

            <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <Mini label="Entrada" value={fmt(livePrice)}/>
                <Mini label="Notional" value={riskPreview ? money(riskPreview.notional) : "—"}/>
                <Mini label="Riesgo al SL" value={riskPreview ? money(riskPreview.risk) : "—"} bad/>
                <Mini label="% de equity" value={riskPreview ? `${riskPreview.riskPct.toFixed(3)}%` : "—"} bad={Boolean(riskPreview && riskPreview.riskPct > 0.5)}/>
              </div>
              {riskPreview && riskPreview.riskPct > 0.5 && <div className="mt-2 text-[10px] font-bold text-amber-300">Para práctica de principiante estás superando 0.5% de riesgo por trade.</div>}
            </div>

            <button onClick={openTrade} disabled={busy || !form.stop || !form.tp1} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-black text-slate-950 disabled:opacity-40 ${form.side === "LONG" ? "bg-emerald-400" : "bg-rose-400"}`}>
              <Play size={16}/> Abrir {form.side} ficticio
            </button>
            <div className="mt-2 text-center text-[9px] text-slate-600">Solo práctica. No envía órdenes a Binance ni usa dinero real.</div>
          </>}
        </aside>
      </section>

      {message && <div className="fixed bottom-5 left-1/2 z-[90] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-cyan-500/30 bg-slate-950/95 px-4 py-3 text-xs font-bold text-cyan-100 shadow-2xl">
        <Target size={14}/>{message}<button onClick={() => setMessage("")}><X size={14} className="text-slate-500"/></button>
      </div>}
    </div>
  );
}

function Tool({ icon, label, onClick, danger=false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[10px] font-bold ${danger ? "border-rose-500/20 text-rose-300" : "border-slate-800 text-slate-400 hover:border-cyan-500/25 hover:text-cyan-200"}`}>{icon}<span>{label}</span></button>;
}

function Stat({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="terminal-panel p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">{icon}{title}</div><div className="mt-2 text-2xl font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{detail}</div></div>;
}

function PracticeStep({ n, title, text }: { n: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-400/10 text-[10px] font-black text-cyan-300">{n}</span><span className="text-xs font-black text-white">{title}</span></div><div className="mt-2 text-[10px] leading-5 text-slate-500">{text}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">{label}</span><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full bg-transparent font-mono text-sm font-black text-white outline-none" placeholder="0"/></label>;
}

function Mini({ label, value, good=false, bad=false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2"><div className="text-[8px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-[11px] font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
