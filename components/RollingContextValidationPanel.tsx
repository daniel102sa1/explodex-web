"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

type Summary = {
  sample?: number;
  observed_ev_r?: number | null;
  wilson_upper_pct?: number | null;
  break_even_win_rate_pct?: number | null;
};

type Window = {
  window?: number;
  train?: Summary;
  test?: Summary;
};

type Cohort = {
  direction?: string;
  market_regime?: string;
  micro_bucket?: string;
  cascade_status?: string;
  exchange_status?: string;
  sequential_status?: string;
  eligible_windows?: number;
  failure_windows?: number;
  strong_failure_windows?: number;
  hold_windows?: number;
  failure_rate?: number | null;
  repeated_failure?: boolean;
  repeated_strong_failure?: boolean;
  repeated_hold?: boolean;
};

type Report = {
  status?: string;
  total_sample?: number;
  minimum_required?: number;
  window_count?: number;
  windows?: Window[];
  persistent_failures?: Cohort[];
  persistent_holds?: Cohort[];
  rule?: string;
  probability_note?: string;
};

const n = (value: number | null | undefined, digits = 1) => value == null ? "N/D" : Number(value).toFixed(digits);

export default function RollingContextValidationPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const runtime = await getRuntimeStatus();
        const next = runtime?.verdict_memory?.last_result?.stats?.rolling_context_validation as Report | undefined;
        if (alive) {
          setReport(next || null);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "No se pudo leer rolling validation");
      }
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const failures = useMemo(() => (report?.persistent_failures || []).slice(0, 5), [report]);
  const holds = useMemo(() => (report?.persistent_holds || []).slice(0, 5), [report]);

  return <section className="mx-4 mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-cyan-200"><RefreshCw size={15}/> Rolling Walk-Forward</div>
        <div className="mt-1 text-sm font-black text-white">Debilidad repetida en varias ventanas futuras</div>
        <div className="mt-1 text-[11px] text-slate-500">4 tests forward no solapados con train expansivo. Sigue en shadow.</div>
      </div>
      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-black text-cyan-200">{report?.status || "CARGANDO"}</span>
    </div>

    {error && <div className="mt-3 rounded-xl border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-300">{error}</div>}

    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <Metric label="Muestra" value={report?.total_sample ?? 0} />
      <Metric label="Ventanas" value={report?.window_count ?? 0} />
      <Metric label="Fallos persistentes" value={failures.length} />
    </div>

    {report?.status === "LEARNING" && <div className="mt-4 rounded-xl border border-amber-700/30 bg-amber-950/20 p-3 text-xs text-amber-200">Calibrando: {report.total_sample || 0}/{report.minimum_required || 120} resultados resueltos.</div>}

    <div className="mt-4 grid gap-3 xl:grid-cols-2">
      <CohortList title="Fallo repetido" rows={failures} icon={<TriangleAlert size={15}/>} />
      <CohortList title="Se sostiene repetidamente" rows={holds} icon={<ShieldCheck size={15}/>} good />
    </div>

    {!!report?.windows?.length && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{report.windows.map((w, i) => <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 text-[10px] text-slate-400"><div className="font-black text-slate-200">Ventana {w.window || i + 1}</div><div className="mt-1">Train {w.train?.sample || 0} · Test {w.test?.sample || 0}</div><div>Test EV {n(w.test?.observed_ev_r, 2)}R</div></div>)}</div>}

    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[10px] leading-4 text-slate-500">{report?.rule || "Esperando historial."} {report?.probability_note || ""}</div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3"><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-white">{value}</div></div>;
}

function CohortList({ title, rows, icon, good = false }: { title: string; rows: Cohort[]; icon: React.ReactNode; good?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3"><div className={`flex items-center gap-2 text-xs font-black ${good ? "text-emerald-200" : "text-amber-200"}`}>{icon}{title}</div><div className="mt-2 space-y-2">{rows.length ? rows.map((row, i) => <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] text-slate-400"><div className="font-bold text-slate-200">{row.direction} · {row.market_regime} · MICRO {row.micro_bucket}</div><div className="mt-1">{row.cascade_status} · {row.exchange_status} · {row.sequential_status}</div><div className="mt-1">Elegibles {row.eligible_windows || 0} · Fallos {row.failure_windows || 0} · Fuertes {row.strong_failure_windows || 0} · Holds {row.hold_windows || 0}</div><div>Failure rate {row.failure_rate == null ? "N/D" : `${(row.failure_rate * 100).toFixed(0)}%`}</div></div>) : <div className="text-[10px] text-slate-600">Todavía no hay cohortes repetidas suficientes.</div>}</div></div>;
}
