"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ShieldEllipsis } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Summary = {
  sample?: number;
  wins?: number;
  losses?: number;
  win_rate_pct?: number | null;
  observed_ev_r?: number | null;
  conservative_ev_r?: number | null;
  avg_rr1?: number | null;
};

type Candidate = {
  direction?: string;
  market_regime?: string;
  micro_bucket?: string;
  cascade_status?: string;
  exchange_status?: string;
  sequential_status?: string;
  stability?: string;
  grade?: string;
  evidence_score?: number;
  test_wilson_upper_pct?: number | null;
  test_break_even_win_rate_pct?: number | null;
  evidence_reasons?: string[];
  train?: Summary;
  test?: Summary;
  eligible_for_future_veto_review?: boolean;
  veto_active?: boolean;
};

type Report = {
  mode?: string;
  status?: string;
  total_sample?: number;
  cohorts_assessed?: number;
  strong_candidates?: Candidate[];
  caution_candidates?: Candidate[];
  top_ranked?: Candidate[];
  veto_active?: boolean;
  veto_activation_allowed?: boolean;
  future_activation_requirements?: Record<string, unknown>;
  rule?: string;
};

const n = (v: number | null | undefined, d = 1) => v == null ? "N/D" : Number(v).toFixed(d);

export default function GraduatedVetoShadowPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const runtime = await getRuntimeStatus();
        const next = runtime?.verdict_memory?.last_result?.stats?.context_veto_shadow as Report | undefined;
        if (alive) {
          setReport(next || null);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo leer el veto shadow");
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const strong = useMemo(() => (report?.strong_candidates || []).slice(0, 6), [report]);
  const caution = useMemo(() => (report?.caution_candidates || []).slice(0, 4), [report]);

  return <section className="mx-4 mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-amber-200"><ShieldEllipsis size={16}/> Veto estadístico graduado · Shadow</div>
        <div className="mt-1 text-sm font-black text-white">Evidencia contra cohortes, sin bloquear operaciones</div>
        <div className="mt-1 text-[11px] text-slate-500">Combina EV, Wilson, break-even y validación cronológica para graduar debilidad.</div>
      </div>
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black text-amber-200">{report?.status || "CARGANDO"}</span>
    </div>

    {error && <div className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">{error}</div>}

    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Muestra total" value={report?.total_sample ?? 0} />
      <Metric label="Cohortes evaluadas" value={report?.cohorts_assessed ?? 0} />
      <Metric label="Candidatos fuertes" value={strong.length} />
      <Metric label="Veto activo" value={report?.veto_active ? "SÍ" : "NO"} />
    </div>

    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      <CandidateBox title="Candidatos fuertes" rows={strong} />
      <CandidateBox title="Precaución" rows={caution} />
    </div>

    <div className="mt-4 rounded-xl border border-amber-900/40 bg-amber-950/15 p-3 text-[10px] leading-4 text-amber-100/70">
      <div className="flex items-center gap-2 font-bold text-amber-200"><ShieldAlert size={14}/> Bloqueo automático desactivado</div>
      <div className="mt-1">{report?.rule || "La evidencia se observa, pero no modifica entradas."}</div>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>;
}

function CandidateBox({ title, rows }: { title: string; rows: Candidate[] }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3">
    <div className="text-xs font-black text-slate-200">{title}</div>
    <div className="mt-2 space-y-2">{rows.length ? rows.map((row, i) => <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-400">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold text-slate-200">{row.direction} · {row.market_regime} · MICRO {row.micro_bucket}</span><span className="font-black text-amber-200">{row.grade} · {n(row.evidence_score)}%</span></div>
      <div className="mt-1">{row.cascade_status} · {row.exchange_status} · {row.sequential_status}</div>
      <div className="mt-1">Train {row.train?.sample || 0} · Test {row.test?.sample || 0} · Test EV {n(row.test?.observed_ev_r, 2)}R</div>
      <div className="mt-1">Wilson upper {n(row.test_wilson_upper_pct)}% · Break-even {n(row.test_break_even_win_rate_pct)}%</div>
      {!!row.evidence_reasons?.length && <div className="mt-1 text-slate-500">{row.evidence_reasons.slice(0, 3).join(" · ")}</div>}
    </div>) : <div className="text-[10px] text-slate-600">Todavía no hay evidencia suficiente.</div>}</div>
  </div>;
}
