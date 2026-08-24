"use client";

import { useEffect, useRef, useState } from "react";
import { RadioTower } from "lucide-react";
import PriceChart, { type ChartPlan } from "@/components/PriceChart";
import { getCandles, type Candle } from "@/lib/api";

type Interval = "1m" | "5m" | "15m";

const BINANCE_INTERVAL: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m" };
const OKX_INTERVAL: Record<Interval, string> = { "1m": "candle1m", "5m": "candle5m", "15m": "candle15m" };
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function okxId(symbol: string) {
  const value = symbol.toUpperCase();
  return `${value.endsWith("USDT") ? value.slice(0, -4) : value}-USDT-SWAP`;
}

function parseReason(value: unknown): Record<string, any> {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

export default function LiveCandleChart({ symbol, plan }: { symbol: string; plan?: ChartPlan }) {
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("CARGANDO");
  const [savedPlan, setSavedPlan] = useState<ChartPlan | undefined>(plan);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => { if (plan) setSavedPlan(plan); }, [plan]);

  useEffect(() => {
    if (plan || !BASE_URL) return;
    let cancelled = false;
    async function loadPlan() {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/signals/active?limit=100`, { cache: "no-store" });
        if (!response.ok) return;
        const rows = await response.json() as Array<Record<string, any>>;
        const row = rows.filter((item) => String(item.symbol).toUpperCase() === symbol.toUpperCase()).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (!row || cancelled) return;
        const reason = parseReason(row.reason);
        const prediction = parseReason(reason.prediction);
        setSavedPlan({
          direction: String(row.direction) === "SHORT" ? "SHORT" : "LONG",
          trigger: Number(prediction.trigger_price || 0) || undefined,
          entryLow: Number(prediction.entry_low || row.entry_low || 0) || undefined,
          entryHigh: Number(prediction.entry_high || row.entry_high || 0) || undefined,
          invalidation: Number(prediction.invalidation_price || 0) || undefined,
          stop: Number(prediction.stop_loss || row.stop_loss || 0) || undefined,
          tp1: Number(prediction.tp1 || row.tp1 || 0) || undefined,
          tp2: Number(prediction.tp2 || row.tp2 || 0) || undefined,
          tp3: Number(prediction.tp3 || row.tp3 || 0) || undefined,
        });
      } catch {}
    }
    loadPlan();
    const timer = setInterval(loadPlan, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol, plan]);

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
      ws.onopen = () => ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: OKX_INTERVAL[interval], instId: okxId(symbol) }] }));
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          for (const row of payload?.data ?? []) {
            if (!Array.isArray(row) || row.length < 6) continue;
            merge({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[7] ?? row[6] ?? row[5] ?? 0) });
          }
        } catch {}
      };
    }

    async function start() {
      try { const initial = await getCandles(symbol, interval, 96); if (!disposed) setCandles(initial); }
      catch { if (!disposed) setCandles([]); }
      if (disposed) return;
      const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${BINANCE_INTERVAL[interval]}`);
      socketRef.current = ws;
      setSource("BINANCE WS");
      ws.onmessage = (event) => {
        gotBinance = true;
        try {
          const k = JSON.parse(event.data)?.k;
          if (!k) return;
          merge({ time: Number(k.t), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.q ?? k.v ?? 0) });
        } catch {}
      };
      ws.onerror = () => { if (!gotBinance) connectOkx(); };
      ws.onclose = () => { if (!disposed && !gotBinance) connectOkx(); };
      fallbackTimer = setTimeout(() => { if (!gotBinance) connectOkx(); }, 6000);
    }

    start();
    return () => { disposed = true; if (fallbackTimer) clearTimeout(fallbackTimer); try { socketRef.current?.close(); } catch {} };
  }, [symbol, interval]);

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-white"><RadioTower size={14} className="text-emerald-400"/> {symbol} · vela viva</div>
          <div className="mt-1 text-[10px] text-slate-600">WebSocket · {source} {savedPlan ? "· plan del scanner superpuesto" : ""}</div>
        </div>
        <div className="flex gap-1">{(["1m", "5m", "15m"] as Interval[]).map((value) => <button key={value} onClick={() => setIntervalValue(value)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${interval === value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-500"}`}>{value}</button>)}</div>
      </div>
      <PriceChart candles={candles} plan={plan ?? savedPlan} />
    </section>
  );
}
