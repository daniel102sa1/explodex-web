"use client";

import { useEffect, useState } from "react";
import { BarChart3, FlaskConical, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Cohort = {
  cohort?: string;
  sample?: number;
  wins?: number;
  losses?: number;
  win_rate_pct?: number | null;
  wilson_low_pct?: number | null;
  wilson_high_pct?: number | null;
  avg_rr1?: number | null;
  observed_ev_r?: number | null;
  conservative_ev_r?: number | null;
  avg_mfe_pct?: number | null;
  avg_mae_pct?: number | null;
  avg_minutes_to_outcome?: number | null;
  sample_status?: string;
};

type Report = {
  mode?: string;
  sample?: number;
  total_rows?: number;
  by_lock_count?: Cohort[];
  by_burst?: Cohort[];
  by_fast_track?: Cohort[];
  by_candidate?: Cohort[];
  strong_profiles?: Array<Cohort & { family?: string }>;
  important?: string;
  continuation_limit?: string;
};

export default function FusionEdgeResearchPanel() {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const runtime = await getRuntimeStatus();
        const value = runtime?.verdict_memory?.last_result?.stats?.fusion_edge_research as Report | undefined;
        if (!cancelled) setReport(value ?? null);
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (!report) return null;

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-emerald-500/15 bg-emerald-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-emerald-300"><BarChart3 size={16}/> Fusion Edge Research</div>
          <div className="mt-2 text-xl font-black text-white">¿Qué tipo de entrada está dejando más edge real?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Compara 5/6 vs 6/6, BURST, FAST TRACK y candidatos usando resultados PAPER, EV en R, Wilson, MFE y MAE.</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/20 bg-emerald-500/[.04] px-3 py-2 text-[10px] font-black text-emerald-200"><FlaskConical size={12}/> SHADOW RESEARCH</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Casos decididos" value={`${report.sample ?? 0}`} sub="TP1 primero o STOP primero" />
        <Metric label="Perfiles fuertes" value={`${report.strong_profiles?.length ?? 0}`} sub="n≥30 y EV observado/conservador > 0" />
        <Metric label="Datos fusionados" value={`${report.total_rows ?? 0}`} sub="Server Verdict Fusion" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Cohorts title="LOCKS" rows={report.by_lock_count ?? []} />
        <Cohorts title="BURST" rows={report.by_burst ?? []} />
        <Cohorts title="FAST TRACK" rows={report.by_fast_track ?? []} />
        <Cohorts title="CANDIDATE ENTER" rows={report.by_candidate ?? []} />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Perfiles con edge conservador positivo</div>
        {!report.strong_profiles?.length ? <div className="mt-3 text-xs text-slate-600">Todavía no hay perfiles con ≥30 casos y EV conservador positivo.</div> : <div className="mt-3 grid gap-2 md:grid-cols-2">{report.strong_profiles.slice(0, 8).map((row, index) => <div key={`${row.family}-${row.cohort}-${index}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3 text-[10px] text-slate-500"><div className="font-black text-slate-300">{row.family ?? "perfil"} · {row.cohort ?? "N/D"}</div><div className="mt-1">n={row.sample ?? 0} · aciertos {pct(row.win_rate_pct)} · Wilson bajo {pct(row.wilson_low_pct)} · EVc {r(row.conservative_ev_r)}</div></div>)}</div>}
      </div>

      <div className="mt-3 space-y-2 text-[10px] leading-5 text-slate-500">
        <div className="flex items-start gap-2"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.important ?? "Las tasas históricas no son probabilidad del siguiente trade."}</span></div>
        <div className="flex items-start gap-2"><ShieldCheck size={13} className="mt-0.5 shrink-0"/><span>{report.continuation_limit ?? "Este reporte mide calidad de entrada hasta TP1/STOP; la continuación posterior se estudia aparte."}</span></div>
      </div>
    </div>
  </section>;
}

function Cohorts({ title, rows }: { title: string; rows: Cohort[] }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
    <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{title}</div>
    {!rows.length ? <div className="mt-3 text-xs text-slate-600">Sin suficientes resultados todavía.</div> : <div className="mt-3 space-y-2">{rows.slice(0, 6).map((row, index) => <div key={`${row.cohort}-${index}`} className="rounded-xl border border-slate-800/80 bg-black/15 p-3"><div className="flex items-center justify-between gap-3"><div className="text-[11px] font-black text-slate-300">{row.cohort ?? "N/D"}</div><div className="text-[9px] font-black text-slate-600">{row.sample_status ?? "CALIBRATING"}</div></div><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-500 sm:grid-cols-4"><span>n {row.sample ?? 0}</span><span>WR {pct(row.win_rate_pct)}</span><span>EV {r(row.observed_ev_r)}</span><span>EVc {r(row.conservative_ev_r)}</span><span>MFE {pct(row.avg_mfe_pct)}</span><span>MAE {pct(row.avg_mae_pct)}</span><span>RR1 {num(row.avg_rr1)}</span><span>t {minutes(row.avg_minutes_to_outcome)}</span></div></div>)}</div>}
  </div>;
}

function pct(value: number | null | undefined) { return value == null ? "—" : `${Number(value).toFixed(1)}%`; }
function r(value: number | null | undefined) { return value == null ? "—" : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}R`; }
function num(value: number | null | undefined) { return value == null ? "—" : Number(value).toFixed(2); }
function minutes(value: number | null | undefined) { return value == null ? "—" : `${Number(value).toFixed(0)}m`; }
function Metric({ label, value, sub }: { label: string; value: string; sub: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-lg font-black text-white">{value}</div><div className="mt-1 text-[9px] text-slate-600">{sub}</div></div>; }
