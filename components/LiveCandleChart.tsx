"use client";

import { useEffect, useRef, useState } from "react";
import { RadioTower } from "lucide-react";
import PriceChart, { type ChartPlan } from "@/components/PriceChart";
import { getCandles, type Candle } from "@/lib/api";

type Interval = "1m" | "5m" | "15m";

const BINANCE_INTERVAL: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m" };
const OKX_INTERVAL: Record<Interval, string> = { "1m": "candle1m", "5m": "candle5m", "15m": "candle15m" };

function okxId(symbol: string) {
  const value = symbol.toUpperCase();
  return `${value.endsWith("USDT") ? value.slice(0, -4) : value}-USDT-SWAP`;
}

export default function LiveCandleChart({ symbol, plan }: { symbol: string; plan?: ChartPlan }) {
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("CARGANDO");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    function merge(next: Candle) {
      setCandles((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (last && last.time === next.time) copy[copy.length - 1] = next;
        else if (!last || next.time > last.time) copy.push(next);
        return copy.slice(-96);
      });
    }

    function connectOkx() {
      if (disposed) return;
      try { socketRef.current?.close(); } catch {}
      const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/business");
      socketRef.current = ws;
      setSource("OKX WS");
      ws.onopen = () => {
        ws.send(JSON.stringify({
          op: "subscribe",
          args: [{ channel: OKX_INTERVAL[interval], instId: okxId(symbol) }],
        }));
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          for (const row of payload?.data ?? []) {
            if (!Array.isArray(row) || row.length < 6) continue;
            merge({
              time: Number(row[0]),
              open: Number(row[1]),
              high: Number(row[2]),
              low: Number(row[3]),
              close: Number(row[4]),
              volume: Number(row[7] ?? row[6] ?? row[5] ?? 0),
            });
          }
        } catch {}
      };
    }

    async function start() {
      try {
        const initial = await getCandles(symbol, interval, 96);
        if (!disposed) setCandles(initial);
      } catch {
        if (!disposed) setCandles([]);
      }
      if (disposed) return;

      const stream = `${symbol.toLowerCase()}@kline_${BINANCE_INTERVAL[interval]}`;
      const ws = new WebSocket(`wss://fstream.binance.com/ws/${stream}`);
      socketRef.current = ws;
      setSource("BINANCE WS");
      ws.onmessage = (event) => {
        gotBinance = true;
        try {
          const payload = JSON.parse(event.data);
          const k = payload?.k;
          if (!k) return;
          merge({
            time: Number(k.t),
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.q ?? k.v ?? 0),
          });
        } catch {}
      };
      ws.onerror = () => { if (!gotBinance) connectOkx(); };
      ws.onclose = () => { if (!disposed && !gotBinance) connectOkx(); };
      fallbackTimer = setTimeout(() => { if (!gotBinance) connectOkx(); }, 6000);
    }

    start();
    return () => {
      disposed = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      try { socketRef.current?.close(); } catch {}
    };
  }, [symbol, interval]);

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-white"><RadioTower size={14} className="text-emerald-400"/> {symbol} · vela viva</div>
          <div className="mt-1 text-[10px] text-slate-600">Actualización WebSocket · {source}</div>
        </div>
        <div className="flex gap-1">
          {(["1m", "5m", "15m"] as Interval[]).map((value) => (
            <button key={value} onClick={() => setIntervalValue(value)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${interval === value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-500"}`}>{value}</button>
          ))}
        </div>
      </div>
      <PriceChart candles={candles} plan={plan} />
    </section>
  );
}
