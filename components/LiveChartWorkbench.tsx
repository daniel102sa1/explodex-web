"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import LiveCandleChart from "@/components/LiveCandleChart";

export default function LiveChartWorkbench() {
  const [input, setInput] = useState("BTCUSDT");
  const [symbol, setSymbol] = useState("BTCUSDT");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    let value = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!value) return;
    if (!value.endsWith("USDT")) value += "USDT";
    setInput(value);
    setSymbol(value);
  }

  return (
    <section className="mb-6">
      <form onSubmit={submit} className="mb-3 flex max-w-md gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
          <Search size={15} className="text-slate-500"/>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="BTC, ENA, PENGU..." className="w-full bg-transparent text-sm font-bold uppercase text-white outline-none placeholder:font-normal placeholder:normal-case placeholder:text-slate-600"/>
        </label>
        <button type="submit" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-200">Ver gráfico</button>
      </form>
      <LiveCandleChart symbol={symbol}/>
    </section>
  );
}
