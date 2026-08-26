"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Route, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type HorizonSummary = {
  sample?: number;
  avg_extra_r_after_tp1?: number;
  avg_max_total_r?: number;
  avg_pullback_from_tp1_r?: number;
  reached_2r_pct?: number;
  reached_3r_pct?: number;
  reached_4r_pct?: number;
  held_beyond_entry_pct?: number;
  status?: string;
};

type Cohort = HorizonSummary & {
  cohort?: string;
  horizon_minutes?: number;
};

type Report = {
  mode?: string;
  version?: string;
  horizons?: Record<string, HorizonSummary>;
  cohorts?: Cohort[];
  rule?: string;
  probability_note?: string;
};

function pct(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value).toFixed(1)}%`;
}

function r(value: number | null | undefined) {
  return value == null ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}R`;
}

export default function Tp1ContinuationResearchPanel() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.tp1_continuation_research as Report | undefined;
        if (!cancelled) setReport(value ?? null);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const rows = useMemo(() => {
    const source = report?.horizons ?? {};
    return Object.entries(source)
      .map(([minutes, summary]) => ({ minutes: Number(minutes), summary }))
      .filter((row) => Number.isFinite(row.minutes))
      .sort((a, b) => a.minutes - b.minutes);
  }, [report]);

  const strongest = useMemo(() => {
    return [...(report?.cohorts ?? [])]
      .filter((row) => Number(row.sample ?? 0) >= 30)
      .sort((a, b) => Number(b.avg_extra_r_after_tp1 ?? -999) - Number(a.avg_extra_r_after_tp1 ?? -999))
      .slice(0, 6);
  }, [report]);

  if (!report) return null;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-emerald-300"><Route size={16}/> TP1 Continuation Research</div>
          <div className="mt-2 text-xl font-black text-white">¿Después de TP1 todavía había una gran corrida?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Mide cuánto R adicional dejó el mercado a 30, 60, 120 y 240 minutos después de TP1. Es investigación SHADOW: todavía no cambia la gestión del trade.</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[.04] px-3 py-2 text-[10px] font-black text-emerald-200"><Activity size={12}/> POST-TP1</div>
      </div>

      {!rows.length ? <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-500">Todavía no hay suficientes TP1 maduros para medir continuación. Los horizontes se llenan conforme pasan 30/60/120/240 minutos.</div> : <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map(({ minutes, summary }) => <div key={minutes} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">+{minutes} min · n={summary.sample ?? 0}</div>
          <div className="mt-3 font-mono text-xl font-black text-white">{r(summary.avg_extra_r_after_tp1)}</div>
          <div className="mt-1 text-[9px] text-slate-600">R adicional media después de TP1</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
            <span>Máx total <b className="text-slate-300">{r(summary.avg_max_total_r)}</b></span>
            <span>Retroceso <b className="text-slate-300">{r(summary.avg_pullback_from_tp1_r)}</b></span>
            <span>2R <b className="text-slate-300">{pct(summary.reached_2r_pct)}</b></span>
            <span>3R <b className="text-slate-300">{pct(summary.reached_3r_pct)}</b></span>
            <span>4R <b className="text-slate-300">{pct(summary.reached_4r_pct)}</b></span>
            <span>Sobre BE <b className="text-slate-300">{pct(summary.held_beyond_entry_pct)}</b></span>
          </div>
          <div className="mt-3 text-[9px] font-black text-slate-600">{summary.status ?? "CALIBRATING"}</div>
        </div>)}
      </div>}

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Cohortes con muestra usable</div>
        {!strongest.length ? <div className="mt-3 text-xs text-slate-600">Aún no hay cohortes FAST TRACK / BURST / LOCK con n≥30 para comparar runner.</div> : <div className="mt-3 space-y-2">
          {strongest.map((row, index) => <div key={`${row.cohort}-${row.horizon_minutes}-${index}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3 text-[10px] text-slate-500">
            <div className="font-black text-slate-300">{row.cohort ?? "N/D"} · +{row.horizon_minutes ?? 0} min · n={row.sample ?? 0}</div>
            <div className="mt-1">extra {r(row.avg_extra_r_after_tp1)} · 3R {pct(row.reached_3r_pct)} · 4R {pct(row.reached_4r_pct)} · pullback {r(row.avg_pullback_from_tp1_r)}</div>
          </div>)}
        </div>}
      </div>

      <div className="mt-3 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.rule ?? "Menos de 30 muestras comparables = CALIBRATING."} {report.probability_note ?? "Las tasas históricas no garantizan el siguiente trade."}</span></div>
    </div>
  </section>;
}
