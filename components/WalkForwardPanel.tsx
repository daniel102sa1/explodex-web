"use client";

import { useEffect, useState } from "react";
import { FlaskConical, SplitSquareVertical } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Summary = {
  sample?: number;
  wins?: number;
  losses?: number;
  win_rate_pct?: number | null;
  wilson_low_pct?: number | null;
  observed_ev_r?: number | null;
  conservative_ev_r?: number | null;
};

type WalkForward = {
  mode?: string;
  status?: string;
  total_sample?: number;
  minimum_required?: number;
  split_policy?: string;
  train?: Summary;
  test?: Summary;
  holding_cohorts?: Array<Record<string, any>>;
  failed_cohorts?: Array<Record<string, any>>;
  rule?: string;
  probability_note?: string;
};

export default function WalkForwardPanel() {
  const [model, setModel] = useState<WalkForward | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.walk_forward ?? null;
        if (!cancelled) setModel(value);
      } catch {}
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!model) return null;
  const train = model.train ?? {};
  const test = model.test ?? {};

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-fuchsia-500/15 bg-fuchsia-500/[.015] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-fuchsia-300"><FlaskConical size={16}/> Walk-forward · out-of-sample</div>
          <div className="mt-2 text-xl font-black text-white">¿Lo aprendido aguanta datos posteriores?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">ExplodeX separa cronológicamente entrenamiento y prueba. El bloque de test no ajusta sus propios umbrales.</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-[10px] font-black text-slate-200">{model.status ?? "LEARNING"}</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Muestra total" value={`${model.total_sample ?? 0}`} sub={model.minimum_required ? `mínimo ${model.minimum_required}` : model.split_policy ?? "chronological"} />
        <Card label="Train" value={`${train.sample ?? 0}`} sub={`WR ${pct(train.win_rate_pct)} · Wilson ${pct(train.wilson_low_pct)}`} />
        <Card label="Test" value={`${test.sample ?? 0}`} sub={`WR ${pct(test.win_rate_pct)} · Wilson ${pct(test.wilson_low_pct)}`} />
        <Card label="EV test" value={r(test.observed_ev_r)} sub={`EV conservador ${r(test.conservative_ev_r)}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Cohorts title="Aguantan fuera de muestra" rows={model.holding_cohorts ?? []} empty="Todavía no hay cohortes validadas." />
        <Cohorts title="Fallaron fuera de muestra" rows={model.failed_cohorts ?? []} empty="Todavía no hay cohortes fallidas con muestra suficiente." />
      </div>

      <div className="mt-3 flex items-start gap-2 text-[9px] leading-4 text-slate-600"><SplitSquareVertical size={12} className="mt-0.5 shrink-0"/><span>{model.rule ?? "Validación cronológica."} {model.probability_note ?? "No es una probabilidad garantizada."}</span></div>
    </div>
  </section>;
}

function Cohorts({ title, rows, empty }: { title: string; rows: Array<Record<string, any>>; empty: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{title}</div>
    {rows.length === 0 ? <div className="mt-3 text-[10px] text-slate-600">{empty}</div> : <div className="mt-3 space-y-2">{rows.slice(0, 5).map((row, index) => <div key={index} className="rounded-xl border border-slate-800 bg-black/15 p-3 text-[10px] text-slate-400"><div className="font-black text-slate-200">{row.direction ?? "N/D"} · {row.market_regime ?? "N/D"} · {row.context_bucket ?? "N/D"}</div><div className="mt-1">train {row.train?.sample ?? 0} · test {row.test?.sample ?? 0} · test WR {pct(row.test?.win_rate_pct)}</div></div>)}</div>}
  </div>;
}

function pct(value: number | null | undefined) { return value == null ? "N/D" : `${Number(value).toFixed(1)}%`; }
function r(value: number | null | undefined) { return value == null ? "N/D" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}R`; }
function Card({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{sub}</div></div>; }
