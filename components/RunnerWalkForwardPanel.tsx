"use client";

import { useEffect, useMemo, useState } from "react";
import { Route, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type WindowRow = {
  window?: number;
  verdict?: string;
  train?: Record<string, number>;
  test?: Record<string, number>;
};

type Horizon = {
  horizon_minutes?: number;
  eligible_windows?: number;
  held_windows?: number;
  failed_windows?: number;
  repeated_hold?: boolean;
  repeated_failure?: boolean;
  windows?: WindowRow[];
};

type Cohort = Horizon & { cohort?: string; sample?: number };

type Report = {
  status?: string;
  total_sample?: number;
  minimum_required?: number;
  window_count?: number;
  horizons?: Horizon[];
  persistent_holds?: Cohort[];
  persistent_failures?: Cohort[];
  rule?: string;
  probability_note?: string;
};

export default function RunnerWalkForwardPanel() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.runner_walk_forward as Report | undefined;
        if (!cancelled) setReport(value ?? null);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const horizons = useMemo(() => [...(report?.horizons ?? [])].sort((a, b) => Number(a.horizon_minutes ?? 0) - Number(b.horizon_minutes ?? 0)), [report]);
  if (!report) return null;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-violet-500/15 bg-violet-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-violet-300"><Route size={16}/> Runner Walk-Forward</div>
          <div className="mt-2 text-xl font-black text-white">¿El runner siguió funcionando fuera de la muestra inicial?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Usa cuatro ventanas forward no superpuestas. Una hipótesis solo se considera repetidamente sostenida si aguanta al menos 2 de 3 ventanas elegibles.</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-black text-slate-300">{report.status ?? "LEARNING"}</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="TP1 con continuación" value={String(report.total_sample ?? 0)} />
        <Metric label="Mínimo para iniciar" value={String(report.minimum_required ?? 120)} />
        <Metric label="Ventanas forward" value={String(report.window_count ?? 0)} />
      </div>

      {!!horizons.length && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {horizons.map((row) => {
          const state = row.repeated_hold ? "HELD" : row.repeated_failure ? "FAILED" : "MIXED";
          return <div key={row.horizon_minutes} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">+{row.horizon_minutes ?? 0} min</div>
            <div className="mt-2 text-lg font-black text-white">{state}</div>
            <div className="mt-2 text-[10px] leading-5 text-slate-500">Elegibles {row.eligible_windows ?? 0} · sostuvo {row.held_windows ?? 0} · falló {row.failed_windows ?? 0}</div>
          </div>;
        })}
      </div>}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <CohortBox title="Perfiles sostenidos" rows={report.persistent_holds ?? []} empty="Aún no hay cohortes con hold repetido." />
        <CohortBox title="Perfiles que fallaron" rows={report.persistent_failures ?? []} empty="Aún no hay cohortes con fallo repetido." />
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.rule ?? "Sigue siendo SHADOW ONLY."} {report.probability_note ?? "La validación histórica forward no garantiza el siguiente trade."}</span></div>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div></div>;
}

function CohortBox({ title, rows, empty }: { title: string; rows: Cohort[]; empty: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{title}</div>
    {!rows.length ? <div className="mt-3 text-xs text-slate-600">{empty}</div> : <div className="mt-3 space-y-2">{rows.slice(0, 6).map((row, index) => <div key={`${row.cohort}-${row.horizon_minutes}-${index}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3 text-[10px] text-slate-500"><div className="font-black text-slate-300">{row.cohort ?? "N/D"} · +{row.horizon_minutes ?? 0}m · n={row.sample ?? 0}</div><div className="mt-1">hold {row.held_windows ?? 0}/{row.eligible_windows ?? 0} · fail {row.failed_windows ?? 0}/{row.eligible_windows ?? 0}</div></div>)}</div>}
  </div>;
}
