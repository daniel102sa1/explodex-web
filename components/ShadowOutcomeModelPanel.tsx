"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, FlaskConical, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Cohort = {
  direction?: string;
  market_regime?: string;
  context_bucket?: string;
  sample?: number;
  wins?: number;
  losses?: number;
  observed_tp1_first_pct?: number | null;
  wilson_low_pct?: number | null;
  avg_rr1?: number | null;
  observed_ev_r?: number | null;
  conservative_ev_r?: number | null;
  state?: string;
};

type ShadowReport = {
  mode?: string;
  global?: Cohort;
  promising_cohorts?: Cohort[];
  weak_cohorts?: Cohort[];
  usable_cohorts?: number;
  rule?: string;
  probability_note?: string;
};

export default function ShadowOutcomeModelPanel() {
  const [report, setReport] = useState<ShadowReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.tp1_stop_shadow_model as ShadowReport | undefined;
        if (!cancelled) setReport(value ?? null);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!report) return null;
  const global = report.global ?? {};
  const promising = report.promising_cohorts ?? [];
  const weak = report.weak_cohorts ?? [];

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-fuchsia-500/15 bg-fuchsia-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-fuchsia-300"><BrainCircuit size={16}/> TP1 vs STOP Shadow Model</div>
          <div className="mt-2 text-xl font-black text-white">Aprende qué perfiles llegan a TP1 antes del stop</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Opera en sombra: observa y calibra, pero no puede crear entradas ni subir leverage.</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[.04] px-3 py-2 text-[10px] font-black text-fuchsia-200"><FlaskConical size={12}/> SHADOW ONLY</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Muestra" value={`${global.sample ?? 0}`} sub={global.state ?? "LEARNING"} />
        <Metric label="TP1 primero" value={pct(global.observed_tp1_first_pct)} sub="Tasa observada" />
        <Metric label="Wilson bajo" value={pct(global.wilson_low_pct)} sub="Límite conservador" />
        <Metric label="EV observado" value={r(global.observed_ev_r)} sub="En unidades R" />
        <Metric label="EV conservador" value={r(global.conservative_ev_r)} sub="Usando Wilson" />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Cohorts title="Cohortes prometedoras" rows={promising} empty="Todavía no hay cohortes con muestra y EV conservador suficientes." />
        <Cohorts title="Cohortes débiles" rows={weak} empty="Todavía no hay cohortes débiles con muestra suficiente." />
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.rule ?? "Menos de 30 casos = LEARNING."} {report.probability_note ?? "La calibración histórica no garantiza el próximo trade."}</span></div>
    </div>
  </section>;
}

function Cohorts({ title, rows, empty }: { title: string; rows: Cohort[]; empty: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{title}</div>
    {!rows.length ? <div className="mt-3 text-xs text-slate-600">{empty}</div> : <div className="mt-3 space-y-2">{rows.slice(0, 5).map((row, index) => <div key={`${row.direction}-${row.market_regime}-${row.context_bucket}-${index}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3 text-[10px] text-slate-500"><div className="font-black text-slate-300">{row.direction ?? "—"} · {row.market_regime ?? "N/D"} · ctx {row.context_bucket ?? "N/D"}</div><div className="mt-1">n={row.sample ?? 0} · TP1 {pct(row.observed_tp1_first_pct)} · Wilson {pct(row.wilson_low_pct)} · EVc {r(row.conservative_ev_r)}</div></div>)}</div>}
  </div>;
}

function pct(value: number | null | undefined) { return value == null ? "—" : `${Number(value).toFixed(1)}%`; }
function r(value: number | null | undefined) { return value == null ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}R`; }
function Metric({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[9px] text-slate-600">{sub}</div></div>; }
