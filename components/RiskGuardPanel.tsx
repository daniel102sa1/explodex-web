"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  ShieldAlert,
  Target,
  TrendingDown,
  XCircle,
  Zap,
} from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlan } from "@/lib/lockedPlans";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function pct(value?: number | null, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export default function RiskGuardPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [testLeverage, setTestLeverage] = useState(5);
  const [lockedLeverage, setLockedLeverage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (!cancelled) setAnalysis(value);
      } catch {}
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    const refresh = () => {
      const plan = readLockedPlan(safeSymbol);
      const lev = Number(plan?.leverage || 0);
      setLockedLeverage(lev > 0 ? lev : null);
      if (lev > 0) setTestLeverage(lev);
    };
    refresh();
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    const timer = setInterval(refresh, 2500);
    return () => {
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
      clearInterval(timer);
    };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis?.prediction) return null;
    const p = analysis.prediction;
    const guard = (p.decision_guard ?? {}) as Record<string, any>;
    const sequence = (p.sequence ?? {}) as Record<string, any>;
    const trigger = Number(p.trigger_price || analysis.current_price || 0);
    const stop = Number(p.stop_loss || analysis.stop_loss || 0);
    const tp1 = Number(p.tp1 || analysis.tp1 || 0);
    const tp2 = Number(p.tp2 || analysis.tp2 || 0);
    const stopDistancePct = Number(guard.stop_distance_pct ?? sequence.stop_distance_pct ?? (trigger > 0 ? Math.abs(trigger - stop) / trigger * 100 : 0));
    const stopDistanceAtr = Number(guard.stop_distance_atr ?? sequence.stop_distance_atr ?? 0);
    const rr1 = Number(guard.reward_risk_tp1 ?? sequence.reward_risk_tp1 ?? (Math.abs(trigger - stop) > 0 ? Math.abs(tp1 - trigger) / Math.abs(trigger - stop) : 0));
    const rr2 = Number(guard.reward_risk_tp2 ?? sequence.reward_risk_tp2 ?? (Math.abs(trigger - stop) > 0 ? Math.abs(tp2 - trigger) / Math.abs(trigger - stop) : 0));
    const blocks: string[] = Array.isArray(guard.risk_guard_blocks) ? guard.risk_guard_blocks : Array.isArray(sequence.risk_guard_blocks) ? sequence.risk_guard_blocks : [];
    const pass = guard.risk_guard_pass !== false && sequence.risk_guard_pass !== false && blocks.length === 0;
    const maxLev10 = Number(guard.suggested_max_leverage_10pct_margin_loss || (stopDistancePct > 0 ? Math.max(1, Math.min(20, 10 / stopDistancePct)) : 1));
    const maxLev5 = Number(guard.suggested_max_leverage_5pct_margin_loss || (stopDistancePct > 0 ? Math.max(1, Math.min(10, 5 / stopDistancePct)) : 1));
    const targetInfo = (guard.targets ?? sequence.target_feasibility ?? {}) as Record<string, any>;
    const marginLossAtStop = stopDistancePct * testLeverage;
    const riskTone = marginLossAtStop <= 5 ? "green" : marginLossAtStop <= 10 ? "amber" : "red";
    const leverageVerdict = marginLossAtStop <= 5
      ? "APALANCAMIENTO PRUDENTE PARA ESTE STOP"
      : marginLossAtStop <= 10
        ? "RIESGO ALTO · REDUCIR TAMAÑO / APALANCAMIENTO"
        : "RIESGO EXCESIVO · NO USAR ESE APALANCAMIENTO";
    return { p, guard, sequence, trigger, stop, tp1, tp2, stopDistancePct, stopDistanceAtr, rr1, rr2, blocks, pass, maxLev10, maxLev5, targetInfo, marginLossAtStop, riskTone, leverageVerdict };
  }, [analysis, testLeverage]);

  if (!analysis || !view) return null;

  const blockLabels: Record<string, string> = {
    direction_unstable: "Dirección LONG/SHORT todavía inestable",
    tp1_too_far: "TP1 demasiado lejano para el ATR actual",
    stop_too_wide: "Stop demasiado amplio para la volatilidad",
    reward_risk_poor: "Relación beneficio/riesgo insuficiente",
    entry_zone_too_wide: "Zona de entrada demasiado amplia",
    ema_mtf_conflict: "EMA y 15m/1h no acompañan",
  };
  const riskFrame = view.riskTone === "green" ? "border-emerald-500/25 bg-emerald-500/[.05]" : view.riskTone === "amber" ? "border-amber-500/30 bg-amber-500/[.05]" : "border-rose-500/35 bg-rose-500/[.07]";
  const riskText = view.riskTone === "green" ? "text-emerald-300" : view.riskTone === "amber" ? "text-amber-300" : "text-rose-300";

  return (
    <section className="mx-auto mt-5 max-w-[1500px] px-4">
      <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${view.pass ? "border-cyan-500/20 bg-cyan-500/[.025]" : "border-rose-500/35 bg-rose-500/[.055]"}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><ShieldAlert size={17}/> Risk Guard V2 · antes de entrar</div>
            <div className={`mt-2 text-2xl font-black ${view.pass ? "text-emerald-300" : "text-rose-300"}`}>{view.pass ? "RISK GUARD APROBADO" : "ENTRADA BLOQUEADA POR RIESGO"}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">Este filtro revisa dirección, stop vs ATR, distancia de objetivos, R:R y coherencia multi-timeframe. Que lo apruebe no garantiza que el trade gane.</p>
            {!view.pass && <div className="mt-3 space-y-1.5">{view.blocks.map((item) => <div key={item} className="flex items-start gap-2 text-xs text-rose-200"><XCircle size={13} className="mt-0.5 shrink-0"/>{blockLabels[item] ?? item}</div>)}</div>}
          </div>

          <div className="grid min-w-[360px] grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
            <Metric label="Stop desde trigger" value={pct(view.stopDistancePct, 3)} icon={<TrendingDown size={13}/>} bad={view.stopDistancePct > 2.5} />
            <Metric label="Stop en ATR" value={`${view.stopDistanceAtr.toFixed(2)} ATR`} icon={<Gauge size={13}/>} bad={view.stopDistanceAtr > 2.4} />
            <Metric label="R:R TP1" value={`${view.rr1.toFixed(2)}R`} icon={<Target size={13}/>} good={view.rr1 >= 1.25} bad={view.rr1 < 1.15} />
            <Metric label="R:R TP2" value={`${view.rr2.toFixed(2)}R`} icon={<Target size={13}/>} good={view.rr2 >= 2} bad={view.rr2 < 1.8} />
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border p-4 ${riskFrame}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Simulador de pérdida sobre margen si toca STOP</div>
              <div className={`mt-1 text-xl font-black ${riskText}`}>{view.leverageVerdict}</div>
              <div className="mt-1 text-xs text-slate-400">Stop ≈ {view.stopDistancePct.toFixed(3)}% del precio × {testLeverage}x ≈ <b className={riskText}>{view.marginLossAtStop.toFixed(1)}%</b> del margen, antes de comisiones/funding y sin considerar slippage.</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 5, 10, 20].map((lev) => <button key={lev} onClick={() => setTestLeverage(lev)} className={`rounded-xl border px-3 py-2 text-xs font-black ${testLeverage === lev ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-slate-800 bg-slate-950/50 text-slate-500"}`}>{lev}x</button>)}
              <label className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2"><span className="mr-2 text-[9px] text-slate-600">x</span><input inputMode="decimal" value={testLeverage} onChange={(e) => setTestLeverage(Math.max(1, Math.min(125, Number(e.target.value) || 1)))} className="w-12 bg-transparent font-mono text-xs font-black text-white outline-none" /></label>
            </div>
          </div>
          {lockedLeverage && <div className="mt-3 text-[10px] text-slate-500">Tu plan fijado tiene <b className="text-slate-300">{lockedLeverage}x</b>; por eso el simulador lo seleccionó automáticamente.</div>}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Máx. aprox. para ~5% margen al stop" value={`${view.maxLev5.toFixed(1)}x`} icon={<CheckCircle2 size={13}/>} good />
          <Metric label="Máx. aprox. para ~10% margen al stop" value={`${view.maxLev10.toFixed(1)}x`} icon={<AlertTriangle size={13}/>} />
          <Metric label="TP1 viabilidad" value={String(view.targetInfo?.tp1?.feasibility ?? "—")} icon={<Target size={13}/>} good={view.targetInfo?.tp1?.feasibility === "REALISTA"} bad={view.targetInfo?.tp1?.feasibility === "LEJANO"} />
          <Metric label="Dirección" value={String(view.guard.direction_stability ?? view.sequence.direction_stability ?? "—")} icon={<Zap size={13}/>} good={String(view.guard.direction_stability ?? view.sequence.direction_stability) === "ESTABLE"} bad={["INESTABLE","CONFLICTO"].includes(String(view.guard.direction_stability ?? view.sequence.direction_stability))} />
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><AlertTriangle size={13} className="mt-1 shrink-0"/>El cálculo de pérdida sobre margen es una aproximación simple de movimiento de precio × apalancamiento. El ROI exacto de Binance puede variar por mark price, margen aislado/cruzado, comisiones, funding, slippage y mantenimiento.</div>
      </div>
    </section>
  );
}

function Metric({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
