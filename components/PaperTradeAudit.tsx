"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, Gauge, ShieldCheck, ShieldX, TrendingUp } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Calibration = {
  status?: string;
  sample?: number;
  minimum_sample?: number;
  tp1_before_sl_observed_pct?: number | null;
  one_r_before_sl_observed_pct?: number | null;
  runner_2r_after_tp1_observed_pct?: number | null;
  runner_3r_after_tp1_observed_pct?: number | null;
  note?: string;
};

type AuditItem = {
  position_id?: number;
  symbol?: string;
  stage?: string;
  strategy_mode?: string;
  side?: string;
  observed_at?: string | null;
  entry_price?: number;
  current_price?: number;
  stop_loss?: number;
  tp1?: number;
  exit_price?: number | null;
  exit_reason?: string | null;
  net_pnl?: number | null;
  progress_r?: number | null;
  max_favorable_r?: number | null;
  max_adverse_r?: number | null;
  one_r_before_stop?: boolean | null;
  tp1_before_stop?: boolean | null;
  runner_2r_after_tp1?: boolean | null;
  runner_3r_after_tp1?: boolean | null;
  reversed_to_entry_after_tp1?: boolean | null;
  stop_quality?: string | null;
  recommendation?: string | null;
  narrative?: string | null;
  technical?: {
    rsi14?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    macd_histogram?: number | null;
    atr_pct?: number | null;
  };
  flow?: {
    oi_change_pct?: number | null;
    funding_rate?: number | null;
    futures_delta_ratio?: number | null;
    spot_delta_ratio?: number | null;
    order_book_imbalance?: number | null;
    trend_15m?: string | null;
    trend_1h?: string | null;
  };
  stop_analysis?: {
    status?: string;
    reason?: string;
    stop_distance_atr?: number | null;
    structural_level?: number | null;
    ideal_hard_stop_for_future_similar_setups?: number | null;
    entry_atr_pct?: number | null;
    rule?: string;
  };
  management?: {
    action?: string;
    explanation?: string;
    progress_r?: number | null;
    suggested_protective_stop?: number | null;
    current_structure_stop?: number | null;
    alignment?: {
      state?: string;
      positives?: string[];
      conflicts?: string[];
    };
  };
  calibration?: Calibration;
};

type AuditResponse = {
  version?: string;
  open?: AuditItem[];
  recent_closed?: AuditItem[];
  aggregate?: {
    audited_closed_cases?: number;
    tp1_before_sl_observed_pct?: number | null;
    one_r_before_sl_observed_pct?: number | null;
    tight_stops?: number;
    wide_stops?: number;
    logical_stops?: number;
    status?: string;
    minimum_sample?: number;
  };
  policy?: {
    audit_only_v1?: boolean;
    does_not_mutate_live_stop?: boolean;
    never_widen_live_stop?: boolean;
  };
};

function fmt(v?: number | null) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toLocaleString(undefined, { maximumSignificantDigits: 9 });
}
function pct(v?: number | null) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(2)}%`;
}
function num(v?: number | null, digits = 2) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(digits);
}
function clean(v?: string | null) {
  return String(v ?? "—").replaceAll("_", " ");
}
function stopTone(q?: string | null) {
  if (q === "LOGICAL") return "border-emerald-500/25 bg-emerald-500/[.06] text-emerald-300";
  if (q === "TOO_TIGHT") return "border-rose-500/25 bg-rose-500/[.06] text-rose-300";
  if (q === "TOO_WIDE") return "border-amber-500/25 bg-amber-500/[.06] text-amber-300";
  return "border-slate-700 text-slate-400";
}
function translateAction(action?: string | null) {
  const map: Record<string, string> = {
    HOLD_ORIGINAL_PLAN: "Mantener plan original",
    HOLD_AND_DO_NOT_CHOKE: "Mantener · no ahogar con el stop",
    WATCH_FOR_STRUCTURE_PROTECTION: "Vigilar nueva estructura para proteger",
    PROTECT_IF_NEW_STRUCTURE_ALLOWS: "Proteger solo si la estructura lo permite",
    HOLD_OR_EXIT_ON_STRUCTURAL_INVALIDATION: "No ensanchar · salir si invalida estructura",
    TAKE_PARTIAL_AND_TRAIL_STRUCTURE: "Tomar parcial + trailing estructural",
    TAKE_PARTIAL_PROTECT_REST: "Tomar parcial + proteger resto",
    CLOSE_MOST_OR_ALL_AT_TP1: "Cerrar mayor parte o todo en TP1",
    POST_TRADE_AUDIT: "Auditoría post-trade",
  };
  return map[String(action ?? "")] ?? clean(action);
}
function yesNo(v?: boolean | null) {
  if (v == null) return "—";
  return v ? "SÍ" : "NO";
}

export default function PaperTradeAudit() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) {
        if (!dead) setError("NEXT_PUBLIC_API_BASE_URL no configurada");
        return;
      }
      try {
        const res = await fetch(`${BASE_URL}/api/v1/paper-trading/audit?closed_limit=12`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Backend ${res.status}`);
        const payload = await res.json() as AuditResponse;
        if (!dead) {
          setData(payload);
          setError(null);
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const timer = window.setInterval(load, 10000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  const open = data?.open ?? [];
  const closed = data?.recent_closed ?? [];
  const aggregate = data?.aggregate;
  const calibrationText = useMemo(() => {
    if (!aggregate) return "—";
    const sample = Number(aggregate.audited_closed_cases ?? 0);
    return `${aggregate.status ?? "CALIBRATING"} · ${sample}/${aggregate.minimum_sample ?? 30}`;
  }, [aggregate]);

  return (
    <section className="space-y-4">
      <div className="terminal-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.13em] text-violet-300">
              <BrainCircuit size={15}/> Auditoría PAPER · stop y manejo
            </div>
            <div className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Revisa si el stop estaba en una zona lógica, si +1R o TP1 llegaron antes del SL y si después de TP1 habría convenido cerrar o dejar runner. No ensancha stops vivos.
            </div>
          </div>
          <span className="rounded-full border border-violet-500/20 px-3 py-1 text-[10px] font-black text-violet-200">
            {data?.version ?? "cargando auditor"}
          </span>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[.04] p-3 text-xs text-rose-200">
            Auditoría no disponible todavía: {error}
          </div>
        ) : !data ? (
          <div className="mt-4 text-xs text-slate-500"><Activity className="mr-1 inline animate-pulse" size={13}/>Cargando auditoría…</div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <Mini label="Estado muestra" value={calibrationText} />
            <Mini label="TP1 antes de SL" value={pct(aggregate?.tp1_before_sl_observed_pct)} good={(aggregate?.tp1_before_sl_observed_pct ?? 0) >= 55} />
            <Mini label="+1R antes de SL" value={pct(aggregate?.one_r_before_sl_observed_pct)} good={(aggregate?.one_r_before_sl_observed_pct ?? 0) >= 55} />
            <Mini label="SL lógicos" value={String(aggregate?.logical_stops ?? 0)} good={(aggregate?.logical_stops ?? 0) > 0} />
            <Mini label="SL apretados" value={String(aggregate?.tight_stops ?? 0)} />
            <Mini label="SL demasiado anchos" value={String(aggregate?.wide_stops ?? 0)} />
          </div>
        )}
      </div>

      {!!open.length && (
        <div className="grid gap-3 xl:grid-cols-2">
          {open.map((item) => (
            <article key={item.position_id} className="terminal-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black text-white">{item.symbol}</span>
                    <span className={item.side === "LONG" ? "text-xs font-black text-emerald-300" : "text-xs font-black text-rose-300"}>{item.side}</span>
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[.1em] text-slate-600">{clean(item.strategy_mode)}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black ${stopTone(item.stop_quality)}`}>
                  SL {item.stop_quality === "LOGICAL" ? "LÓGICO" : item.stop_quality === "TOO_TIGHT" ? "APRETADO" : item.stop_quality === "TOO_WIDE" ? "ANCHO" : "SIN CLASIFICAR"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Cell label="Entrada" value={fmt(item.entry_price)} />
                <Cell label="Precio" value={fmt(item.current_price)} />
                <Cell label="SL" value={fmt(item.stop_loss)} bad />
                <Cell label="TP1" value={fmt(item.tp1)} good />
                <Cell label="Progreso" value={item.progress_r == null ? "—" : `${num(item.progress_r)}R`} />
              </div>

              <div className="mt-3 rounded-2xl border border-cyan-500/15 bg-cyan-500/[.035] p-3">
                <div className="flex items-center gap-2 text-xs font-black text-cyan-200"><TrendingUp size={14}/> Qué haría el auditor</div>
                <div className="mt-1 text-sm font-black text-white">{translateAction(item.management?.action ?? item.recommendation)}</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">{item.management?.explanation ?? item.narrative ?? "—"}</div>
                {item.management?.suggested_protective_stop != null && (
                  <div className="mt-2 text-[11px] text-amber-200">Stop protector estructural candidato: <b>{fmt(item.management.suggested_protective_stop)}</b></div>
                )}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-400"><Gauge size={12}/> Técnico ahora</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <Row label="RSI14" value={num(item.technical?.rsi14)} />
                    <Row label="MACD hist." value={num(item.technical?.macd_histogram, 5)} />
                    <Row label="EMA20" value={fmt(item.technical?.ema20)} />
                    <Row label="EMA50" value={fmt(item.technical?.ema50)} />
                    <Row label="ATR" value={pct(item.technical?.atr_pct)} />
                    <Row label="Alineación" value={clean(item.management?.alignment?.state)} />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Flujo y derivados</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                    <Row label="OI Δ" value={pct(item.flow?.oi_change_pct)} />
                    <Row label="Funding" value={item.flow?.funding_rate == null ? "—" : Number(item.flow.funding_rate).toExponential(2)} />
                    <Row label="Delta futuros" value={num(item.flow?.futures_delta_ratio, 3)} />
                    <Row label="Delta spot" value={num(item.flow?.spot_delta_ratio, 3)} />
                    <Row label="Order book" value={num(item.flow?.order_book_imbalance, 3)} />
                    <Row label="15m / 1h" value={`${clean(item.flow?.trend_15m)} / ${clean(item.flow?.trend_1h)}`} />
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-800 p-3 text-[11px] leading-5 text-slate-400">
                <div className="font-black text-white">Auditoría del stop</div>
                <div>{clean(item.stop_analysis?.reason)}</div>
                <div className="mt-1">Distancia: <b className="text-white">{item.stop_analysis?.stop_distance_atr == null ? "—" : `${num(item.stop_analysis.stop_distance_atr)} ATR`}</b> · Swing: <b className="text-white">{fmt(item.stop_analysis?.structural_level)}</b></div>
                {item.stop_analysis?.ideal_hard_stop_for_future_similar_setups != null && (
                  <div>Hard stop de referencia para <b>futuros setups parecidos</b>: <b className="text-white">{fmt(item.stop_analysis.ideal_hard_stop_for_future_similar_setups)}</b></div>
                )}
              </div>

              <CalibrationBlock calibration={item.calibration} />
            </article>
          ))}
        </div>
      )}

      {!error && data && !open.length && (
        <div className="terminal-panel p-4 text-xs text-slate-500">
          No hay posiciones PAPER abiertas para auditar ahora. La auditoría sigue procesando operaciones cerradas para aprender stops y manejo.
        </div>
      )}

      {!!closed.length && (
        <div className="terminal-panel overflow-hidden">
          <div className="border-b border-slate-800 px-4 py-3">
            <div className="text-xs font-black uppercase tracking-[.12em] text-slate-300">Auditorías cerradas recientes</div>
            <div className="mt-1 text-[10px] text-slate-600">Aquí se compara lo que ocurrió con el SL, +1R, TP1 y un posible runner.</div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-950/30 text-[9px] uppercase tracking-[.1em] text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Activo</th>
                  <th className="px-3 py-2 text-left">SL</th>
                  <th className="px-3 py-2">+1R antes SL</th>
                  <th className="px-3 py-2">TP1 antes SL</th>
                  <th className="px-3 py-2">Runner 2R</th>
                  <th className="px-3 py-2">Runner 3R</th>
                  <th className="px-3 py-2 text-right">MFE</th>
                  <th className="px-3 py-2 text-right">MAE</th>
                  <th className="px-3 py-2 text-left">Lectura</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((item) => (
                  <tr key={`closed-${item.position_id}`} className="border-t border-slate-900">
                    <td className="px-3 py-3 font-black text-white">{item.symbol} <span className="ml-1 text-[9px] text-slate-600">{item.side}</span></td>
                    <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${stopTone(item.stop_quality)}`}>{clean(item.stop_quality)}</span></td>
                    <td className="px-3 py-3 text-center">{yesNo(item.one_r_before_stop)}</td>
                    <td className="px-3 py-3 text-center">{yesNo(item.tp1_before_stop)}</td>
                    <td className="px-3 py-3 text-center">{yesNo(item.runner_2r_after_tp1)}</td>
                    <td className="px-3 py-3 text-center">{yesNo(item.runner_3r_after_tp1)}</td>
                    <td className="px-3 py-3 text-right">{item.max_favorable_r == null ? "—" : `${num(item.max_favorable_r)}R`}</td>
                    <td className="px-3 py-3 text-right">{item.max_adverse_r == null ? "—" : `${num(item.max_adverse_r)}R`}</td>
                    <td className="max-w-[430px] px-3 py-3 text-left text-slate-400">{item.narrative ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[.035] p-3 text-[11px] leading-5 text-amber-100/75">
        <div className="flex items-center gap-2 font-black text-amber-200"><ShieldCheck size={13}/> Regla de seguridad</div>
        Si un SL resulta demasiado apretado, la auditoría lo usa para mejorar <b>la próxima entrada</b>. No aleja el stop de una operación que ya está perdiendo. Las tasas TP1/+1R son frecuencias históricas PAPER y no garantías del próximo trade.
      </div>
    </section>
  );
}

function CalibrationBlock({ calibration }: { calibration?: Calibration }) {
  if (!calibration) return null;
  const mature = calibration.status === "MATURE";
  return (
    <div className={`mt-3 rounded-xl border p-3 ${mature ? "border-emerald-500/20 bg-emerald-500/[.035]" : "border-violet-500/20 bg-violet-500/[.035]"}`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-300">
        {mature ? <ShieldCheck size={12} className="text-emerald-300"/> : <ShieldX size={12} className="text-violet-300"/>}
        Frecuencia histórica comparable · {calibration.status}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini label="Casos" value={`${calibration.sample ?? 0}/${calibration.minimum_sample ?? 30}`} />
        <Mini label="TP1 antes SL" value={pct(calibration.tp1_before_sl_observed_pct)} />
        <Mini label="+1R antes SL" value={pct(calibration.one_r_before_sl_observed_pct)} />
        <Mini label="2R tras TP1" value={pct(calibration.runner_2r_after_tp1_observed_pct)} />
      </div>
      <div className="mt-2 text-[10px] leading-4 text-slate-500">{calibration.note}</div>
    </div>
  );
}

function Mini({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-sm font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}
function Cell({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5"><div className="text-[9px] text-slate-600">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good?"text-emerald-300":bad?"text-rose-300":"text-white"}`}>{value}</div></div>;
}
function Row({ label, value }: { label:string; value:string }) {
  return <><span>{label}</span><span className="text-right font-bold text-slate-200">{value}</span></>;
}
