"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, ShieldAlert, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Summary = {
  sample?: number;
  win_rate_pct?: number | null;
  wilson_low_pct?: number | null;
  observed_ev_r?: number | null;
  conservative_ev_r?: number | null;
};

type Cohort = {
  direction?: string;
  market_regime?: string;
  micro_bucket?: string;
  cascade_status?: string;
  exchange_status?: string;
  sequential_status?: string;
  stability?: string;
  train?: Summary;
  test?: Summary;
  veto_candidate?: boolean;
};

type Report = {
  mode?: string;
  status?: string;
  total_sample?: number;
  minimum_required?: number;
  train?: Summary;
  test?: Summary;
  cohorts?: Cohort[];
  veto_candidates?: Cohort[];
  holding_cohorts?: Cohort[];
  rule?: string;
  probability_note?: string;
};

const n = (v: number | null | undefined, digits = 1) => v == null ? "N/D" : Number(v).toFixed(digits);

export default function ContextMetaShadowPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const runtime = await getRuntimeStatus();
        const next = runtime?.verdict_memory?.last_result?.stats?.context_meta_shadow as Report | undefined;
        if (alive) {
          setReport(next || null);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo leer el meta-modelo");
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const topHold = useMemo(() => (report?.holding_cohorts || []).slice(0, 4), [report]);
  const topVeto = useMemo(() => (report?.veto_candidates || []).slice(0, 4), [report]);

  return <section className="mx-4 mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-fuchsia-200"><BrainCircuit size={16}/> Context Meta Shadow</div>
        <div className="mt-1 text-sm font-black text-white">Régimen + microestructura + cascadas + lead/lag</div>
        <div className="mt-1 text-[11px] text-slate-500">Validación cronológica. Solo aprendizaje; no abre operaciones ni aumenta leverage.</div>
      </div>
      <span className="rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-[10px] font-black text-fuchsia-200">{report?.status || "CARGANDO"}</span>
    </div>

    {error && <div className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">{error}</div>}

    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Muestra total" value={report?.total_sample ?? 0} />
      <Metric label="Train EV conservador" value={`${n(report?.train?.conservative_ev_r, 2)} R`} />
      <Metric label="Test EV observado" value={`${n(report?.test?.observed_ev_r, 2)} R`} />
      <Metric label="Test Wilson bajo" value={`${n(report?.test?.wilson_low_pct)}%`} />
    </div>

    {report?.status === "LEARNING" && <div className="mt-4 rounded-xl border border-amber-700/30 bg-amber-950/20 p-3 text-xs text-amber-200">Calibrando: {report.total_sample || 0}/{report.minimum_required || 80} resultados resueltos.</div>}

    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      <CohortBox title="Aguantan fuera de muestra" icon={<ShieldCheck size={15}/>} rows={topHold} good />
      <CohortBox title="Candidatos de veto en shadow" icon={<ShieldAlert size={15}/>} rows={topVeto} />
    </div>

    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[10px] leading-4 text-slate-500">{report?.rule || "Esperando suficiente historial."} {report?.probability_note || ""}</div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>;
}

function CohortBox({ title, icon, rows, good = false }: { title: string; icon: React.ReactNode; rows: Cohort[]; good?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
    <div className={`flex items-center gap-2 text-xs font-black ${good ? "text-emerald-200" : "text-amber-200"}`}>{icon}{title}</div>
    <div className="mt-2 space-y-2">{rows.length ? rows.map((row, i) => <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-400">
      <div className="font-bold text-slate-200">{row.direction} · {row.market_regime} · MICRO {row.micro_bucket}</div>
      <div className="mt-1">{row.cascade_status} · {row.exchange_status} · {row.sequential_status}</div>
      <div className="mt-1">Train {row.train?.sample || 0} | Test {row.test?.sample || 0} | Test EV {n(row.test?.observed_ev_r, 2)}R</div>
    </div>) : <div className="text-[10px] text-slate-600">Todavía no hay cohortes suficientes.</div>}</div>
  </div>;
}
