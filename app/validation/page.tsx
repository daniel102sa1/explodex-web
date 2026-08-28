"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, FlaskConical, Gauge, ShieldCheck, Target } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Cohort = {
  trade_class: string;
  horizon_minutes: number;
  sample: number;
  tp1_first: number;
  stop_first: number;
  ambiguous: number;
  no_barrier: number;
  tp1_before_stop_rate_pct: number | null;
  avg_mfe_pct: number | null;
  avg_mae_abs_pct: number | null;
  avg_directional_return_pct: number | null;
  avg_mfe_atr: number | null;
  rate_is_probability?: boolean;
};

type Report = {
  version?: string;
  research_status?: string;
  minimum_research_sample?: number;
  observations?: number;
  horizon_results?: number;
  labeled_60m?: number;
  trade_class_counts?: Record<string, number>;
  actionable_share_pct?: number;
  cohorts?: Cohort[];
  diagnostics?: {
    false_yes_60m_stop_first?: number;
    missed_opportunity_proxy_60m?: number;
    missed_proxy_definition?: string;
  };
  safety?: {
    paper_research_only?: boolean;
    rates_are_probabilities?: boolean;
    changes_live_entry_rules?: boolean;
    requires_out_of_sample_review_before_calibration?: boolean;
  };
  note?: string;
};

const CLASS_ORDER = ["TRADE_NOW", "TRADE_SOON", "WATCHLIST", "NO_TRADE", "UNCLASSIFIED"];
const HORIZONS = [5, 15, 30, 60, 120];

function classLabel(value: string) {
  if (value === "TRADE_NOW") return "SÍ · TRADE NOW";
  if (value === "TRADE_SOON") return "ESPERA · TRADE SOON";
  if (value === "WATCHLIST") return "VIGILAR";
  if (value === "NO_TRADE") return "NO TRADE";
  return value || "N/D";
}

function statusLabel(value?: string) {
  if (value === "RESEARCH_READY") return "MUESTRA ÚTIL";
  if (value === "EARLY_RESEARCH") return "INVESTIGACIÓN TEMPRANA";
  return "CALIBRANDO";
}

function statusTone(value?: string) {
  if (value === "RESEARCH_READY") return "border-emerald-400/30 bg-emerald-400/[.07] text-emerald-200";
  if (value === "EARLY_RESEARCH") return "border-cyan-400/30 bg-cyan-400/[.07] text-cyan-200";
  return "border-amber-400/30 bg-amber-400/[.07] text-amber-200";
}

function fmt(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(Number(value)) ? "N/D" : Number(value).toFixed(digits);
}

export default function ValidationPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) {
        setError("NEXT_PUBLIC_API_BASE_URL no está configurada");
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/validation/report`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = (await response.json()) as Report;
        if (!dead) {
          setReport(payload);
          setError(null);
          setUpdatedAt(Date.now());
        }
      } catch (exc) {
        if (!dead) setError(exc instanceof Error ? exc.message : String(exc));
      }
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      dead = true;
      window.clearInterval(timer);
    };
  }, []);

  const cohortMap = useMemo(() => {
    const map = new Map<string, Cohort>();
    for (const row of report?.cohorts ?? []) map.set(`${row.trade_class}:${row.horizon_minutes}`, row);
    return map;
  }, [report]);

  const classes = useMemo(() => {
    const seen = new Set(Object.keys(report?.trade_class_counts ?? {}));
    for (const row of report?.cohorts ?? []) seen.add(row.trade_class);
    return [...seen].sort((a, b) => {
      const ai = CLASS_ORDER.indexOf(a);
      const bi = CLASS_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });
  }, [report]);

  if (error && !report) {
    return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="rounded-3xl border border-rose-500/25 bg-rose-500/[.05] p-5 text-sm text-rose-200">Validation Mode no disponible: {error}</div></main>;
  }

  if (!report) {
    return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400"><FlaskConical className="mr-2 inline animate-pulse" size={16}/>Cargando laboratorio de validación…</div></main>;
  }

  const observations = Number(report.observations ?? 0);
  const labeled60 = Number(report.labeled_60m ?? 0);
  const minSample = Number(report.minimum_research_sample ?? 100);
  const progress = Math.min(100, minSample > 0 ? (labeled60 / minSample) * 100 : 0);
  const classCounts = report.trade_class_counts ?? {};
  const falseYes = Number(report.diagnostics?.false_yes_60m_stop_first ?? 0);
  const missed = Number(report.diagnostics?.missed_opportunity_proxy_60m ?? 0);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-violet-400/15 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.12),transparent_38%),linear-gradient(135deg,#07101a,#040912)] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-300"><FlaskConical size={16}/> ExplodeX Validation Mode v1</div>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">¿El sistema realmente está funcionando?</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Aquí no calificamos lo bonito que se ve una señal. Medimos qué ocurrió después de cada predicción a 5, 15, 30, 60 y 120 minutos.</p>
          </div>
          <div className={`rounded-full border px-4 py-2 text-xs font-black ${statusTone(report.research_status)}`}>{statusLabel(report.research_status)}</div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          <Metric icon={<Activity size={16}/>} label="Predicciones registradas" value={String(observations)} note="Casos guardados para medir" />
          <Metric icon={<Gauge size={16}/>} label="Casos con 60m" value={String(labeled60)} note={`Meta inicial ${minSample}`} />
          <Metric icon={<Target size={16}/>} label="Señales operables" value={`${fmt(report.actionable_share_pct, 1)}%`} note="TRADE NOW + TRADE SOON" />
          <Metric icon={<BarChart3 size={16}/>} label="Resultados de horizontes" value={String(report.horizon_results ?? 0)} note="5/15/30/60/120m" />
        </div>

        <div className="px-5 pb-6 sm:px-6">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[.12em] text-slate-500"><span>Progreso para primera muestra útil</span><span>{Math.round(progress)}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }}/></div>
          <div className="mt-2 text-[10px] text-slate-600">Hasta llegar a una muestra suficiente, los porcentajes son descriptivos y NO deben interpretarse como probabilidad de la próxima operación.</div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5 lg:col-span-2">
          <div className="flex items-center gap-2 text-sm font-black text-white"><ShieldCheck size={17} className="text-emerald-300"/>Distribución de decisiones</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {CLASS_ORDER.slice(0, 4).map((key) => <ClassCount key={key} label={classLabel(key)} value={Number(classCounts[key] ?? 0)} total={observations}/>) }
          </div>
        </div>

        <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[.04] p-5">
          <div className="flex items-center gap-2 text-sm font-black text-amber-100"><AlertTriangle size={17}/>Diagnóstico 60m</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SmallMetric label="SÍ → STOP primero" value={String(falseYes)} />
            <SmallMetric label="Oportunidades omitidas*" value={String(missed)} />
          </div>
          <p className="mt-3 text-[10px] leading-5 text-amber-100/60">*Proxy experimental: no era TRADE NOW/SOON, avanzó ≥1 ATR a favor y no sufrió una excursión adversa mayor a 0.75 ATR en 60m.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
        <div className="border-b border-slate-800 px-5 py-4">
          <div className="text-sm font-black text-white">Comportamiento por clase y horizonte</div>
          <div className="mt-1 text-[11px] text-slate-500">TP1 antes de STOP es una estadística histórica descriptiva. Las velas donde TP1 y STOP aparecen dentro del mismo minuto quedan como AMBIGUOUS y no se fuerzan a ganador/perdedor.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-xs">
            <thead className="bg-slate-950 text-[9px] uppercase tracking-[.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Clase</th>
                <th className="px-4 py-3">Horizonte</th>
                <th className="px-4 py-3">Muestra</th>
                <th className="px-4 py-3">TP1 primero</th>
                <th className="px-4 py-3">STOP primero</th>
                <th className="px-4 py-3">Ambiguas</th>
                <th className="px-4 py-3">TP1/STOP*</th>
                <th className="px-4 py-3">MFE prom.</th>
                <th className="px-4 py-3">MAE prom.</th>
                <th className="px-4 py-3">Retorno dir.</th>
                <th className="px-4 py-3">MFE ATR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {classes.flatMap((tradeClass) => HORIZONS.map((horizon) => {
                const row = cohortMap.get(`${tradeClass}:${horizon}`);
                if (!row) return null;
                return (
                  <tr key={`${tradeClass}-${horizon}`} className="text-slate-300 hover:bg-white/[.02]">
                    <td className="px-4 py-3 font-black text-white">{classLabel(tradeClass)}</td>
                    <td className="px-4 py-3 font-mono">{horizon}m</td>
                    <td className="px-4 py-3 font-mono">{row.sample}</td>
                    <td className="px-4 py-3 font-mono text-emerald-300">{row.tp1_first}</td>
                    <td className="px-4 py-3 font-mono text-rose-300">{row.stop_first}</td>
                    <td className="px-4 py-3 font-mono text-amber-300">{row.ambiguous}</td>
                    <td className="px-4 py-3 font-mono">{fmt(row.tp1_before_stop_rate_pct, 1)}%</td>
                    <td className="px-4 py-3 font-mono text-emerald-200">{fmt(row.avg_mfe_pct)}%</td>
                    <td className="px-4 py-3 font-mono text-rose-200">-{fmt(row.avg_mae_abs_pct)}%</td>
                    <td className={`px-4 py-3 font-mono ${(row.avg_directional_return_pct ?? 0) >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{(row.avg_directional_return_pct ?? 0) >= 0 ? "+" : ""}{fmt(row.avg_directional_return_pct)}%</td>
                    <td className="px-4 py-3 font-mono">{fmt(row.avg_mfe_atr)}</td>
                  </tr>
                );
              }))}
              {!classes.length && <tr><td colSpan={11} className="px-5 py-10 text-center text-slate-600">Todavía no hay suficientes observaciones evaluadas.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-800 px-5 py-3 text-[10px] text-slate-600">*TP1/STOP = TP1 primero ÷ casos decididos (TP1+STOP). NO ES PROBABILIDAD de la siguiente operación.</div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/[.035] p-5">
          <div className="flex items-center gap-2 text-sm font-black text-cyan-100"><CheckCircle2 size={16}/>Qué sí demuestra esta pantalla</div>
          <p className="mt-3 text-xs leading-6 text-cyan-100/65">Permite comprobar si las clases de ExplodeX muestran diferencias observables, si los SÍ están fallando demasiado, si estamos perdiendo movimientos importantes y cuánto se mueve el precio a favor/en contra después de cada decisión.</p>
        </div>
        <div className="rounded-3xl border border-rose-400/15 bg-rose-400/[.035] p-5">
          <div className="flex items-center gap-2 text-sm font-black text-rose-100"><AlertTriangle size={16}/>Qué todavía NO demuestra</div>
          <p className="mt-3 text-xs leading-6 text-rose-100/65">No demuestra ganancias futuras, no convierte scores en probabilidades y no calibra automáticamente los umbrales. Primero necesitamos muestra suficiente y revisión fuera de muestra/walk-forward.</p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-[10px] leading-5 text-slate-500">
        <b className="text-slate-300">Datos incompletos:</b> el scanner actual persiste Fingerprint, Prediction Stack y Path Forecast. Catalyst/Market Impact puede aparecer como N/D en observaciones del scanner hasta que esa capa se integre directamente en el scanner; Validation Mode no inventa ese dato. {updatedAt ? `Última actualización visual: ${new Date(updatedAt).toLocaleTimeString()}.` : ""}
      </section>
    </main>
  );
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-black/15 p-4"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.12em] text-slate-500">{icon}{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{note}</div></div>;
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-amber-400/15 bg-black/10 p-3"><div className="text-[9px] font-black uppercase tracking-[.08em] text-amber-100/45">{label}</div><div className="mt-1 text-2xl font-black text-amber-100">{value}</div></div>;
}

function ClassCount({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return <div className="rounded-2xl border border-slate-800 bg-black/15 p-3"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-1 flex items-end justify-between gap-2"><span className="text-2xl font-black text-white">{value}</span><span className="font-mono text-[10px] text-slate-500">{pct.toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, pct)}%` }}/></div></div>;
}
