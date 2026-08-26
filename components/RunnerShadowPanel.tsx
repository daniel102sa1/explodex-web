"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Route, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Row = {
  cohort?: string;
  horizon_minutes?: number;
  sample?: number;
  sample_status?: string;
  state?: string;
  runner_evidence_score?: number;
  avg_extra_r_after_tp1?: number;
  avg_pullback_from_tp1_r?: number;
  reached_2r_pct?: number;
  reached_3r_pct?: number;
  reached_4r_pct?: number;
};

type Report = {
  mode?: string;
  version?: string;
  global_horizons?: Row[];
  preferred_horizon_minutes?: number | null;
  promising_cohorts?: Row[];
  protect_profit_cohorts?: Row[];
  usable_cohorts?: number;
  rule?: string;
  score_note?: string;
  probability_note?: string;
};

function r(v?: number) { return v == null ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}R`; }
function pct(v?: number) { return v == null ? "—" : `${Number(v).toFixed(1)}%`; }

export default function RunnerShadowPanel() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.runner_shadow_model as Report | undefined;
        if (!cancelled) setReport(value ?? null);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const best = useMemo(() => (report?.promising_cohorts ?? []).slice(0, 6), [report]);
  const protect = useMemo(() => (report?.protect_profit_cohorts ?? []).slice(0, 6), [report]);
  if (!report) return null;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-amber-500/15 bg-amber-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-amber-300"><Route size={16}/> Runner Shadow Model</div>
          <div className="mt-2 text-xl font-black text-white">¿Dejar correr una parte después de TP1?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Convierte la continuación post-TP1 en hipótesis históricas. No mueve stops ni cambia salidas todavía.</div>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[.04] px-3 py-2 text-[10px] font-black text-amber-200"><Flag size={12} className="mr-1 inline"/> SHADOW ONLY</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(report.global_horizons ?? []).map((row) => <div key={row.horizon_minutes} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[10px] font-black text-slate-400">+{row.horizon_minutes ?? 0} min · n={row.sample ?? 0}</div>
          <div className="mt-2 text-lg font-black text-white">{row.state ?? "CALIBRATING"}</div>
          <div className="mt-1 font-mono text-sm text-amber-200">score {Number(row.runner_evidence_score ?? 0).toFixed(0)}/100</div>
          <div className="mt-2 text-[10px] leading-5 text-slate-500">extra {r(row.avg_extra_r_after_tp1)} · pullback {r(row.avg_pullback_from_tp1_r)} · 3R {pct(row.reached_3r_pct)}</div>
        </div>)}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Cohorts title="Perfiles donde runner promete" rows={best} empty="Todavía no hay cohortes utilizables que favorezcan runner." />
        <Cohorts title="Perfiles donde conviene proteger" rows={protect} empty="Todavía no hay cohortes utilizables que pidan proteger beneficio." />
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.rule} {report.score_note} {report.probability_note}</span></div>
    </div>
  </section>;
}

function Cohorts({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{title}</div>
    {!rows.length ? <div className="mt-3 text-xs text-slate-600">{empty}</div> : <div className="mt-3 space-y-2">{rows.map((row, i) => <div key={`${row.cohort}-${row.horizon_minutes}-${i}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3 text-[10px] text-slate-500"><div className="font-black text-slate-300">{row.cohort ?? "N/D"} · +{row.horizon_minutes ?? 0}m · n={row.sample ?? 0}</div><div className="mt-1">{row.state} · score {Number(row.runner_evidence_score ?? 0).toFixed(0)}/100 · extra {r(row.avg_extra_r_after_tp1)} · 4R {pct(row.reached_4r_pct)}</div></div>)}</div>}
  </div>;
}
