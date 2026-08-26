"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, ShieldCheck } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

const CAPITAL_KEY = "explodex:risk-capital-usdt";
const RISK_KEY = "explodex:risk-pct";

function finite(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function PositionSizingPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [capital, setCapital] = useState(1000);
  const [riskPct, setRiskPct] = useState(0.75);

  useEffect(() => {
    try {
      const savedCapital = Number(localStorage.getItem(CAPITAL_KEY));
      const savedRisk = Number(localStorage.getItem(RISK_KEY));
      if (Number.isFinite(savedCapital) && savedCapital > 0) setCapital(savedCapital);
      if (Number.isFinite(savedRisk) && savedRisk > 0 && savedRisk <= 3) setRiskPct(savedRisk);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CAPITAL_KEY, String(capital));
      localStorage.setItem(RISK_KEY, String(riskPct));
    } catch {}
  }, [capital, riskPct]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol, true);
        if (!cancelled) setAnalysis(value);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [safeSymbol]);

  const sizing = useMemo(() => {
    if (!analysis) return null;
    const entryLow = finite(analysis.entry_low);
    const entryHigh = finite(analysis.entry_high);
    const entry = entryLow > 0 && entryHigh > 0 ? (entryLow + entryHigh) / 2 : finite(analysis.current_price);
    const stop = finite(analysis.stop_loss);
    if (entry <= 0 || stop <= 0 || capital <= 0 || riskPct <= 0) return null;

    const stopDistance = Math.abs(entry - stop);
    const stopPct = stopDistance / entry * 100;
    if (stopDistance <= 0) return null;

    const riskUsdt = capital * riskPct / 100;
    const quantity = riskUsdt / stopDistance;
    const notional = quantity * entry;
    const unleveredCapitalPct = notional / capital * 100;
    const maxLeverage10 = Math.max(1, Math.min(20, 10 / stopPct));
    const maxLeverage5 = Math.max(1, Math.min(10, 5 / stopPct));
    const tp1 = finite(analysis.tp1);
    const rr1 = tp1 > 0 ? Math.abs(tp1 - entry) / stopDistance : null;

    return { entry, stop, stopDistance, stopPct, riskUsdt, quantity, notional, unleveredCapitalPct, maxLeverage10, maxLeverage5, rr1 };
  }, [analysis, capital, riskPct]);

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-emerald-300"><Calculator size={16}/> Position Sizing</div>
          <div className="mt-2 text-xl font-black text-white">El stop decide el tamaño; el leverage no decide la pérdida</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Calcula cantidad desde capital × riesgo permitido ÷ distancia al stop estructural. No mueve el stop y no abre órdenes.</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[.04] px-3 py-2 text-[10px] text-emerald-300"><ShieldCheck size={12}/> PAPER / calculadora</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <span className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">Capital USDT</span>
          <input type="number" min="1" step="10" value={capital} onChange={(e) => setCapital(Math.max(1, finite(e.target.value, 1)))} className="mt-2 w-full bg-transparent font-mono text-lg font-black text-white outline-none" />
        </label>
        <label className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <span className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">Riesgo por trade %</span>
          <input type="number" min="0.1" max="3" step="0.05" value={riskPct} onChange={(e) => setRiskPct(Math.max(0.1, Math.min(3, finite(e.target.value, 0.75))))} className="mt-2 w-full bg-transparent font-mono text-lg font-black text-white outline-none" />
        </label>
        <Metric label="Riesgo máximo" value={sizing ? `$${sizing.riskUsdt.toFixed(2)}` : "—"} sub="Si el precio llega al stop, antes de fees/slippage" />
        <Metric label="Distancia al stop" value={sizing ? `${sizing.stopPct.toFixed(2)}%` : "—"} sub={sizing ? `${fmtPrice(sizing.entry)} → ${fmtPrice(sizing.stop)}` : "Sin plan válido"} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Cantidad" value={sizing ? sizing.quantity.toLocaleString(undefined, { maximumSignificantDigits: 7 }) : "—"} sub={safeSymbol.replace("USDT", "")} />
        <Metric label="Notional" value={sizing ? `$${sizing.notional.toFixed(2)}` : "—"} sub={sizing ? `${sizing.unleveredCapitalPct.toFixed(0)}% del capital sin leverage` : ""} />
        <Metric label="R:R TP1" value={sizing?.rr1 == null ? "—" : `${sizing.rr1.toFixed(2)}R`} sub="Objetivo contra riesgo estructural" />
        <Metric label="Leverage ref. 5%" value={sizing ? `${sizing.maxLeverage5.toFixed(1)}x` : "—"} sub="Referencia de pérdida de margen, no recomendación" />
        <Metric label="Leverage ref. 10%" value={sizing ? `${sizing.maxLeverage10.toFixed(1)}x` : "—"} sub="Referencia aproximada, no liquidación" />
      </div>

      <div className="mt-3 text-[9px] leading-4 text-slate-600">Fees, slippage, funding y gaps pueden aumentar la pérdida real. La cantidad se calcula con el stop actual; nunca se amplía el stop para acomodar una posición.</div>
    </div>
  </section>;
}

function fmtPrice(value: number) {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(5);
  return value.toPrecision(7);
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[9px] text-slate-600">{sub}</div></div>;
}
