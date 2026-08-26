"use client";

import { useEffect, useState } from "react";
import { GitCompareArrows, RadioTower } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type LeadLag = {
  mode?: string;
  available?: boolean;
  status?: string;
  leader?: string | null;
  leader_bias?: string;
  aggregate_bias?: string;
  agreement?: number | null;
  dispersion?: number | null;
  support_direction?: boolean;
  conflict_direction?: boolean;
  exchanges?: Array<{ exchange?: string; pressure_score?: number; bias?: string; inputs?: number }>;
  data_note?: string;
};

export default function ExchangeLeadLagPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const value = await getLiveAnalysis(safeSymbol, true);
        if (!cancelled) setAnalysis(value);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 20_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  const model = ((analysis?.prediction as any)?.exchange_lead_lag ?? null) as LeadLag | null;
  if (!model) return null;

  const status = model.status ?? "N/D";
  const tone = model.conflict_direction ? "text-amber-300 border-amber-500/25 bg-amber-500/[.05]" : model.support_direction ? "text-emerald-300 border-emerald-500/20 bg-emerald-500/[.04]" : "text-slate-300 border-slate-700 bg-slate-900/60";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-violet-500/15 bg-violet-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-violet-300"><GitCompareArrows size={16}/> Exchange Lead/Lag · shadow</div>
          <div className="mt-2 text-xl font-black text-white">Comparación de presión entre exchanges</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Compara OI, taker flow y liquidaciones por venue cuando CoinGlass entrega detalle suficiente. No asume causalidad si faltan datos.</div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-black ${tone}`}>{status}</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Leader" value={model.leader ?? "N/D"} sub={`bias ${model.leader_bias ?? "NEUTRAL"}`} />
        <Card label="Bias agregado" value={model.aggregate_bias ?? "NEUTRAL"} sub={model.support_direction ? "acompaña la dirección" : model.conflict_direction ? "conflicto con la dirección" : "sin ventaja clara"} />
        <Card label="Agreement" value={model.agreement == null ? "N/D" : `${(model.agreement * 100).toFixed(0)}%`} sub="acuerdo entre venues comparables" />
        <Card label="Dispersion" value={model.dispersion == null ? "N/D" : model.dispersion.toFixed(1)} sub="separación de pressure score" />
      </div>

      {(model.exchanges?.length ?? 0) > 0 && <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><RadioTower size={13}/> Venues observados</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {model.exchanges!.slice(0, 8).map((row, index) => <div key={`${row.exchange}-${index}`} className="rounded-xl border border-slate-800 bg-black/15 p-3">
            <div className="text-xs font-black text-slate-200">{row.exchange ?? "N/D"}</div>
            <div className="mt-1 font-mono text-sm text-white">{row.pressure_score == null ? "N/D" : `${row.pressure_score.toFixed(0)}/100`}</div>
            <div className="mt-1 text-[9px] text-slate-500">{row.bias ?? "NEUTRAL"} · inputs {row.inputs ?? 0}</div>
          </div>)}
        </div>
      </div>}

      <div className="mt-3 text-[9px] text-slate-600">{model.data_note ?? "Shadow context; no garantiza el siguiente movimiento."}</div>
    </div>
  </section>;
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{sub}</div></div>;
}
