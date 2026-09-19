"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Gauge, ShieldAlert, TrendingUp } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Diagnostics = {
  signals_checked?: number;
  enter_signals?: number;
  actions?: Record<string, number>;
  missing_checks?: Record<string, number>;
  latest?: Array<{ symbol?:string; action?:string }>;
};

type LaneExecution = {
  opened?: number;
  reason?: string;
  signals_checked?: number;
  rejected?: Record<string, number>;
  trades?: Array<{
    symbol?: string;
    side?: string;
    entry?: number;
    stop?: number;
    target?: number;
    pattern_score?: number;
    net_rr?: number;
    stop_basis?: string;
  }>;
};

type UnifiedDiagnostics = {
  version?: string;
  single_paper_authority?: boolean;
  opened_last_cycle?: number;
  closed_last_cycle?: number;
  reason?: string;
  signals_checked?: number;
  candidates?: number;
  rejected?: Record<string, number>;
  defensive?: boolean;
  defensive_learning_enabled?: boolean;
  status?: string;
  structure_retest_execution?: LaneExecution;
  structure_retest_learning?: { opened?: number };
  effective_new_entry_risk_multiplier?: number;
  regime?: {
    regime?: string;
    label?: string;
  };
  btc_overlay?: {
    stress?: string;
    direction?: string;
    atr_pct?: number;
    atr_percentile_recent?: number;
    abs_move_5m_pct?: number;
    abs_move_15m_pct?: number;
    abs_move_60m_pct?: number;
    risk_multiplier?: number;
    stop_buffer_multiplier?: number;
    countertrend_multiplier?: number;
    force_defensive?: boolean;
    block_new_entries?: boolean;
    min_quality_bonus?: number;
    confirmation_minutes?: number;
  };
  chati_sarpon_612_live_monitor?: {
    version?: string;
    open_positions_checked?: number;
    portfolio_new_entry_risk_multiplier?: number;
    counts?: Record<string, number>;
    positions?: Array<{
      position_id?: number;
      symbol?: string;
      side?: string;
      phase?: string;
      score?: number | null;
      management?: string;
      chati?: {
        ratio_5m?: number | null;
        ratio_15m?: number | null;
        ratio_15m_source?: string;
        futures_delta_ratio?: number | null;
        spot_delta_ratio?: number | null;
        five_minute_aligned?: boolean;
        fifteen_minute_aligned?: boolean;
      };
      oi_change_pct?: number | null;
      btc?: {
        trend?: string;
        stress?: string;
        hard_conflict?: boolean;
      };
      contradictions?: string[];
      progress_r?: number | null;
      data_status?: string;
    }>;
  };
};

type Summary = {
  execution_version?: string;
  open_positions?: Array<unknown>;
  heart_diagnostics?: Diagnostics;
  unified_paper_diagnostics?: UnifiedDiagnostics;
  quant_risk_guard?: {
    state?: string;
    risk_multiplier?: number;
    halt_new_entries?: boolean;
    metrics?: {
      expectancy_kelly?: {
        status?: string;
        expectancy_r?: number | null;
        full_kelly_fraction?: number | null;
        quarter_kelly_reference_fraction?: number | null;
      };
      paper_monte_carlo?: {
        status?: string;
        median_ending_return_pct?: number | null;
        p90_max_drawdown_pct?: number | null;
        drawdown_ge_20pct_frequency_pct?: number | null;
      };
    };
  };
  loss_autopsy?: {
    overall?: {
      trades?: number;
      stops?: number;
      stop_rate?: number;
      win_rate?: number;
      net_pnl?: number;
      expectancy_net?: number;
      profit_factor?: number;
      costs?: number;
    };
    portfolio_brake?: {
      mode?: string;
      drawdown_24h_pct?: number;
      reason?: string;
    };
  };
  quant_brain?: {
    version?: string;
    stance_counts?: Record<string, number>;
    rows?: Array<{
      symbol?: string;
      direction?: string;
      state?: string;
      stance?: string;
      directional_edge?: number | null;
      evidence_strength?: number | null;
      risk_multiplier?: number | null;
      preferred_strategy?: string | null;
      regime?: string | null;
      hurst?: number | null;
      entropy?: number | null;
      btc_beta?: number | null;
      btc_correlation?: number | null;
      calibration_status?: string | null;
      calibration_sample?: number | null;
      block_new_entry?: boolean;
      strong_conflict?: boolean;
    }>;
  };
};

function topEntry(record?: Record<string, number>) {
  if (!record) return null;
  return Object.entries(record).sort((a, b) => Number(b[1]) - Number(a[1]))[0] ?? null;
}
function topEntries(record?: Record<string, number>, limit=4) {
  if (!record) return [];
  return Object.entries(record).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,limit);
}
function clean(value?: string) { return String(value ?? "—").replaceAll("_", " "); }
function fmt(v?: number) { return v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toLocaleString(undefined,{maximumSignificantDigits:8}); }
function pctValue(v?: number | null, scale=1) { return v == null || !Number.isFinite(Number(v)) ? "—" : `${(Number(v)*scale).toFixed(1)}%`; }
function phaseLabel(phase?: string) {
  if (phase === "GREEN_CONFIRMATION") return "🟢 CONFIRMACIÓN";
  if (phase === "RED_DAMAGED") return "🔴 DAÑADO";
  if (phase === "YELLOW_PREACTIVATION") return "🟡 PREACTIVACIÓN";
  return clean(phase);
}
function phaseTone(phase?: string) {
  if (phase === "GREEN_CONFIRMATION") return "border-emerald-500/25 bg-emerald-500/[.05] text-emerald-200";
  if (phase === "RED_DAMAGED") return "border-rose-500/25 bg-rose-500/[.05] text-rose-200";
  return "border-amber-500/25 bg-amber-500/[.04] text-amber-200";
}

export default function PaperHeartStatus() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) { if (!dead) setError("NEXT_PUBLIC_API_BASE_URL no configurada"); return; }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/paper-trading/summary`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = await response.json() as Summary;
        if (!dead) { setSummary(payload); setError(null); }
      } catch (e) { if (!dead) setError(e instanceof Error ? e.message : String(e)); }
    }
    load();
    const timer = window.setInterval(load, 10000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  const d = summary?.heart_diagnostics;
  const u = summary?.unified_paper_diagnostics;
  const structure = u?.structure_retest_execution;
  const structureTrade = structure?.trades?.[0];
  const topMissing = topEntry(d?.missing_checks);
  const topAction = topEntry(d?.actions);
  const rejects = topEntries(u?.rejected);
  const structureRejects = topEntries(structure?.rejected, 3);
  const enter = Number(d?.enter_signals ?? 0);
  const checked = Number(u?.signals_checked ?? d?.signals_checked ?? 0);
  const candidates = Number(u?.candidates ?? 0);
  const opened = Number(u?.opened_last_cycle ?? 0);
  const structureOpened = Number(structure?.opened ?? u?.structure_retest_learning?.opened ?? 0);
  const btc = u?.btc_overlay;
  const btcStress = String(btc?.stress ?? "—");
  const btcBlocked = Boolean(btc?.block_new_entries);
  const btcRiskPct = btc?.risk_multiplier == null ? "—" : `${Math.round(Number(btc.risk_multiplier) * 100)}%`;
  const quantRows = summary?.quant_brain?.rows ?? [];
  const quantTop = quantRows[0];
  const kelly = summary?.quant_risk_guard?.metrics?.expectancy_kelly;
  const paperMc = summary?.quant_risk_guard?.metrics?.paper_monte_carlo;
  const manualMonitor = u?.chati_sarpon_612_live_monitor;
  const manualPositions = manualMonitor?.positions ?? [];
  const manualCounts = manualMonitor?.counts ?? {};
  const loss = summary?.loss_autopsy?.overall;
  const lossBrake = summary?.loss_autopsy?.portfolio_brake;

  return (
    <section className="terminal-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.13em] text-cyan-300"><Gauge size={15}/> Diagnóstico Heart → PAPER</div>
          <div className="mt-1 text-xs text-slate-500">Incluye la lane STRUCTURE RETEST y los motivos de rechazo. Refresco 10 s.</div>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black text-slate-400">{u?.version ?? summary?.execution_version ?? "cargando motor"}</span>
      </div>

      {error ? <div className="mt-4 text-xs text-rose-300">Diagnóstico no disponible: {error}</div> : !d && !u ? <div className="mt-4 text-xs text-slate-500"><Activity size={13} className="mr-1 inline animate-pulse"/>Esperando diagnóstico del backend…</div> : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            <Stat label="Señales revisadas" value={String(checked)} />
            <Stat label="Candidatos" value={String(candidates)} good={candidates > 0} />
            <Stat label="Abiertas ciclo" value={String(opened)} good={opened > 0} />
            <Stat label="Retest abiertas" value={String(structureOpened)} good={structureOpened > 0} />
            <Stat label="Posiciones abiertas" value={String(summary?.open_positions?.length ?? 0)} good={(summary?.open_positions?.length ?? 0) > 0} />
            <Stat label="BTC stress" value={btcStress} good={btcStress === "NORMAL"} />
            <Stat label="Risk guard" value={summary?.quant_risk_guard?.state ?? (u?.defensive ? "DEFENSIVE" : "NORMAL")} />
          </div>

          {btc && <div className={`mt-3 rounded-2xl border p-3 ${btcBlocked ? "border-rose-500/25 bg-rose-500/[.05]" : btcStress === "HIGH" || btcStress === "EXTREME" ? "border-amber-500/25 bg-amber-500/[.04]" : "border-slate-800 bg-slate-950/35"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-[.11em] text-white">BTC ADAPTIVE REGIME</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${btcBlocked ? "border-rose-500/30 text-rose-300" : "border-slate-700 text-slate-300"}`}>{btcBlocked ? "NUEVAS ENTRADAS BLOQUEADAS" : btcStress}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 text-[11px] text-slate-400">
              <div>Dirección BTC: <b className="text-white">{btc.direction ?? "—"}</b></div>
              <div>ATR BTC: <b className="text-white">{btc.atr_pct == null ? "—" : `${Number(btc.atr_pct).toFixed(3)}%`}</b></div>
              <div>Percentil vol.: <b className="text-white">{btc.atr_percentile_recent == null ? "—" : `${Number(btc.atr_percentile_recent).toFixed(0)}`}</b></div>
              <div>Riesgo permitido: <b className="text-white">{btcRiskPct}</b></div>
              <div>Buffer stop nuevo: <b className="text-white">{btc.stop_buffer_multiplier == null ? "—" : `${Number(btc.stop_buffer_multiplier).toFixed(2)}x`}</b></div>
              <div>Confirma en: <b className="text-white">{btc.confirmation_minutes ?? "—"}m</b></div>
            </div>
            <div className="mt-2 text-[10px] leading-4 text-slate-500">
              BTC cambia el tamaño y la exigencia de las nuevas entradas. Puede dar más margen estructural antes de entrar, pero después reduce tamaño; nunca aleja un stop ya abierto.
            </div>
          </div>}

          {manualMonitor && <div className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[.035] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-black uppercase tracking-[.11em] text-cyan-200">CHATI + SARPON + 612 · MONITOR VIVO</div>
                <div className="mt-1 text-[10px] text-slate-500">PREACTIVACIÓN no es entrada. Revisa 5m/15m, OI, absorción, estructura y BTC mientras el trade sigue abierto.</div>
              </div>
              <span className="rounded-full border border-cyan-500/25 px-2 py-1 text-[10px] font-black text-cyan-100">
                Riesgo nuevas entradas · {pctValue(manualMonitor.portfolio_new_entry_risk_multiplier, 100)}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Stat label="🟢 Confirmadas" value={String(Number(manualCounts.GREEN_CONFIRMATION ?? 0))} good={Number(manualCounts.GREEN_CONFIRMATION ?? 0)>0} />
              <Stat label="🟡 Preactivación" value={String(Number(manualCounts.YELLOW_PREACTIVATION ?? 0))} />
              <Stat label="🔴 Dañadas" value={String(Number(manualCounts.RED_DAMAGED ?? 0))} />
              <Stat label="Datos stale" value={String(Number(manualCounts.STALE_DATA ?? 0))} />
            </div>

            {!!manualPositions.length ? <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {manualPositions.map((p, i) => <div key={`${p.position_id ?? p.symbol}-${i}`} className={`rounded-xl border p-3 ${phaseTone(p.phase)}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-black text-white">{p.symbol ?? "—"} <span className="ml-1 text-[10px] text-slate-400">{p.side ?? "—"}</span></div>
                  <span className="text-[10px] font-black">{phaseLabel(p.phase)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-slate-400 sm:grid-cols-4">
                  <div>612 score <b className="text-white">{p.score == null ? "—" : Number(p.score).toFixed(1)}</b></div>
                  <div>5m ratio <b className="text-white">{p.chati?.ratio_5m == null ? "—" : Number(p.chati.ratio_5m).toFixed(2)}</b></div>
                  <div>15m ratio <b className="text-white">{p.chati?.ratio_15m == null ? "—" : Number(p.chati.ratio_15m).toFixed(2)}</b></div>
                  <div>OI Δ <b className="text-white">{p.oi_change_pct == null ? "—" : `${Number(p.oi_change_pct).toFixed(2)}%`}</b></div>
                  <div>Fut. delta <b className="text-white">{p.chati?.futures_delta_ratio == null ? "—" : Number(p.chati.futures_delta_ratio).toFixed(3)}</b></div>
                  <div>Spot delta <b className="text-white">{p.chati?.spot_delta_ratio == null ? "—" : Number(p.chati.spot_delta_ratio).toFixed(3)}</b></div>
                  <div>BTC <b className="text-white">{clean(p.btc?.trend)} / {clean(p.btc?.stress)}</b></div>
                  <div>Progreso <b className="text-white">{p.progress_r == null ? "—" : `${Number(p.progress_r).toFixed(2)}R`}</b></div>
                </div>
                <div className="mt-2 text-[10px] leading-4 text-slate-300"><b>Manejo:</b> {clean(p.management)}</div>
                <div className="mt-1 text-[9px] text-slate-500">15m: {clean(p.chati?.ratio_15m_source)} · datos {clean(p.data_status)}</div>
                {!!p.contradictions?.length && <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.contradictions.slice(0,5).map(x=><span key={x} className="rounded-full border border-current/15 px-2 py-0.5 text-[9px] opacity-80">{clean(x)}</span>)}
                </div>}
              </div>)}
            </div> : <div className="mt-3 text-[10px] text-slate-500">No hay posiciones PAPER abiertas para vigilar en este momento.</div>}

            <div className="mt-3 text-[10px] leading-4 text-slate-500">
              El score 612 es una regla de confluencia, no una probabilidad de ganar. Un estado 🔴 reduce nueva exposición, pero nunca aleja un stop vivo ni cambia LONG↔SHORT por sí solo.
            </div>
          </div>}

          {(loss || lossBrake) && <div className="mt-3 rounded-2xl border border-rose-500/15 bg-rose-500/[.025] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-[.11em] text-rose-200">AUTOPSIA DE PÉRDIDAS PAPER</div>
              <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${lossBrake?.mode === "DEFENSIVE" ? "border-rose-500/30 text-rose-300" : "border-slate-700 text-slate-300"}`}>{lossBrake?.mode ?? "—"}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
              <Stat label="Trades" value={String(loss?.trades ?? 0)} />
              <Stat label="Stops" value={String(loss?.stops ?? 0)} />
              <Stat label="Stop rate" value={pctValue(loss?.stop_rate,100)} />
              <Stat label="Win rate" value={pctValue(loss?.win_rate,100)} good={Number(loss?.win_rate ?? 0)>=0.5} />
              <Stat label="Profit factor" value={loss?.profit_factor == null ? "—" : Number(loss.profit_factor).toFixed(2)} good={Number(loss?.profit_factor ?? 0)>1} />
              <Stat label="Expectancy neta" value={loss?.expectancy_net == null ? "—" : Number(loss.expectancy_net).toFixed(3)} good={Number(loss?.expectancy_net ?? 0)>0} />
              <Stat label="Net PnL" value={loss?.net_pnl == null ? "—" : Number(loss.net_pnl).toFixed(2)} good={Number(loss?.net_pnl ?? 0)>0} />
            </div>
            <div className="mt-2 text-[10px] leading-4 text-slate-500">{lossBrake?.reason ?? "La autopsia usa operaciones PAPER cerradas para reducir o vetar patrones repetidamente malos."}</div>
          </div>}

          {!!quantRows.length && <div className="mt-3 rounded-2xl border border-violet-500/20 bg-violet-500/[.035] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-[.11em] text-violet-200">QUANT BRAIN · matemáticas dentro del Heart</div>
              <span className="rounded-full border border-violet-500/25 px-2 py-1 text-[10px] font-black text-violet-200">{quantTop?.stance ?? "—"}</span>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-6 text-[11px] text-slate-400">
              <div>Activo: <b className="text-white">{quantTop?.symbol ?? "—"} · {quantTop?.direction ?? "—"}</b></div>
              <div>Edge cuant.: <b className={Number(quantTop?.directional_edge ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}>{quantTop?.directional_edge == null ? "—" : Number(quantTop.directional_edge).toFixed(1)}</b></div>
              <div>Fuerza evidencia: <b className="text-white">{quantTop?.evidence_strength == null ? "—" : Number(quantTop.evidence_strength).toFixed(1)}</b></div>
              <div>Riesgo Quant: <b className="text-white">{quantTop?.risk_multiplier == null ? "—" : `${Math.round(Number(quantTop.risk_multiplier) * 100)}%`}</b></div>
              <div>Régimen: <b className="text-white">{clean(quantTop?.regime ?? undefined)}</b></div>
              <div>Estrategia: <b className="text-white">{clean(quantTop?.preferred_strategy ?? undefined)}</b></div>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-[10px] text-slate-500">
              <div>Hurst <b className="text-slate-300">{quantTop?.hurst == null ? "—" : Number(quantTop.hurst).toFixed(3)}</b></div>
              <div>Entropía <b className="text-slate-300">{quantTop?.entropy == null ? "—" : Number(quantTop.entropy).toFixed(3)}</b></div>
              <div>Beta BTC <b className="text-slate-300">{quantTop?.btc_beta == null ? "—" : Number(quantTop.btc_beta).toFixed(2)}</b></div>
              <div>Corr. BTC <b className="text-slate-300">{quantTop?.btc_correlation == null ? "—" : Number(quantTop.btc_correlation).toFixed(2)}</b></div>
              <div>Calibración <b className="text-slate-300">{quantTop?.calibration_status ?? "—"} · n={quantTop?.calibration_sample ?? 0}</b></div>
            </div>
            {(kelly || paperMc) && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Expectancy R" value={kelly?.expectancy_r == null ? "—" : Number(kelly.expectancy_r).toFixed(3)} good={Number(kelly?.expectancy_r ?? 0) > 0} />
              <Stat label="Kelly ref. ¼" value={kelly?.quarter_kelly_reference_fraction == null ? "—" : `${(Number(kelly.quarter_kelly_reference_fraction) * 100).toFixed(1)}%`} />
              <Stat label="MC p90 drawdown" value={paperMc?.p90_max_drawdown_pct == null ? "—" : `${Number(paperMc.p90_max_drawdown_pct).toFixed(1)}%`} />
              <Stat label="MC DD≥20%" value={paperMc?.drawdown_ge_20pct_frequency_pct == null ? "—" : `${Number(paperMc.drawdown_ge_20pct_frequency_pct).toFixed(1)}%`} />
            </div>}
            <div className="mt-2 text-[10px] leading-4 text-slate-500">
              Edge, Hurst, entropía, Markov y Monte Carlo son evidencia/modelos, no garantías. El Quant Brain puede apoyar o bloquear, pero no inventa dirección ni convierte ESPERAR en ENTRAR.
            </div>
          </div>}

          <div className="mt-3 grid gap-3 xl:grid-cols-3">
            <div className={`rounded-2xl border p-3 ${opened > 0 ? "border-emerald-500/20 bg-emerald-500/[.05]" : "border-amber-500/20 bg-amber-500/[.04]"}`}>
              <div className="flex items-center gap-2 text-xs font-black text-white">{opened > 0 ? <CheckCircle2 size={14} className="text-emerald-300"/> : <AlertTriangle size={14} className="text-amber-300"/>}{opened > 0 ? "PAPER abrió una entrada" : "Sin entrada en el último ciclo"}</div>
              <div className="mt-2 text-xs leading-5 text-slate-400">
                {opened > 0 ? `El Heart autorizó ${opened} operación(es).` : rejects.length ? `Principal rechazo: ${clean(rejects[0][0])} (${rejects[0][1]} casos).` : u?.reason ? `Razón: ${clean(u.reason)}.` : topMissing ? `Check faltante: ${clean(topMissing[0])} (${topMissing[1]} casos).` : "Esperando una entrada ejecutable."}
              </div>
              {!!rejects.length && <div className="mt-3 flex flex-wrap gap-2">{rejects.map(([name,count])=><span key={name} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{clean(name)} · {count}</span>)}</div>}
            </div>

            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[.035] p-3">
              <div className="flex items-center gap-2 text-xs font-black text-white"><TrendingUp size={14} className="text-cyan-300"/> STRUCTURE RETEST PAPER</div>
              <div className="mt-2 text-[11px] leading-5 text-slate-400">
                <div>Estado: <b className={structureOpened > 0 ? "text-emerald-300" : "text-white"}>{structureOpened > 0 ? "ENTRÓ" : clean(structure?.reason)}</b></div>
                <div>Revisadas: <b className="text-white">{structure?.signals_checked ?? "—"}</b></div>
                {structureTrade ? <>
                  <div>Trade: <b className="text-white">{structureTrade.symbol} · {structureTrade.side}</b></div>
                  <div>Entrada / Stop / TP: <b className="text-white">{fmt(structureTrade.entry)} / {fmt(structureTrade.stop)} / {fmt(structureTrade.target)}</b></div>
                  <div>Score patrón: <b className="text-white">{structureTrade.pattern_score ?? "—"}</b> · R/R neto <b className="text-white">{structureTrade.net_rr ?? "—"}</b></div>
                </> : structureRejects.length ? <div className="mt-2 flex flex-wrap gap-2">{structureRejects.map(([name,count])=><span key={name} className="rounded-full border border-cyan-500/15 px-2 py-1 text-[10px] text-cyan-100/70">{clean(name)} · {count}</span>)}</div> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-white"><ShieldAlert size={14} className="text-violet-300"/> Estado del Heart</div>
              <div className="mt-2 space-y-1.5 text-[11px] text-slate-400">
                <div>Autoridad PAPER única: <b className="text-white">{u?.single_paper_authority ? "SÍ" : "—"}</b></div>
                <div>Heart dice ENTRAR: <b className={enter>0?"text-emerald-300":"text-white"}>{enter}</b></div>
                <div>Acción dominante: <b className="text-white">{topAction ? `${clean(topAction[0])} · ${topAction[1]}` : "—"}</b></div>
                <div>Kill switch: <b className={summary?.quant_risk_guard?.halt_new_entries ? "text-rose-300" : "text-emerald-300"}>{summary?.quant_risk_guard?.halt_new_entries ? "ACTIVO" : "LIBRE"}</b></div>
              </div>
              <div className="mt-3 space-y-1.5">
                {(d?.latest ?? []).slice(0, 4).map((row, i) => <div key={`${row.symbol}-${i}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="font-black text-slate-300">{row.symbol ?? "—"}</span><span className={String(row.action).startsWith("ENTRAR") ? "font-black text-emerald-300" : row.action === "NO_ENTRAR" ? "font-black text-rose-300" : "font-bold text-amber-200"}>{clean(row.action)}</span></div>)}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-sm font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}
