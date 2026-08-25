"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, DollarSign, Layers3, ShieldAlert } from "lucide-react";
import { LOCKED_PLANS_EVENT, readLockedPlans, type LockedPlan } from "@/lib/lockedPlans";

function calc(plan: LockedPlan) {
  const entry = Number(plan.actualEntryPrice || 0);
  const stop = Number(plan.stop || 0);
  const margin = Number(plan.marginUsdt ?? plan.marginUsed ?? 0);
  const leverage = Number(plan.leverage || 0);
  if (!(plan.enteredAt && entry > 0 && stop > 0 && margin > 0 && leverage > 0)) return null;
  const stopDistancePct = Math.abs(entry - stop) / entry * 100;
  const marginLossPct = stopDistancePct * leverage;
  const lossUsdt = margin * marginLossPct / 100;
  return { margin, leverage, stopDistancePct, marginLossPct, lossUsdt };
}

export default function PortfolioRiskBoard() {
  const [plans, setPlans] = useState<LockedPlan[]>([]);

  useEffect(() => {
    const refresh = () => setPlans(readLockedPlans());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    };
  }, []);

  const view = useMemo(() => {
    const rows = plans.map((plan) => ({ plan, risk: calc(plan) })).filter((x): x is { plan:LockedPlan; risk:NonNullable<ReturnType<typeof calc>> } => Boolean(x.risk));
    const totalMargin = rows.reduce((sum, x) => sum + x.risk.margin, 0);
    const totalLoss = rows.reduce((sum, x) => sum + x.risk.lossUsdt, 0);
    const weightedLossPct = totalMargin > 0 ? totalLoss / totalMargin * 100 : 0;
    const excessive = rows.filter((x) => x.risk.marginLossPct > 15).length;
    const largest = [...rows].sort((a, b) => b.risk.lossUsdt - a.risk.lossUsdt)[0];
    const longMargin = rows.filter((x) => x.plan.direction === "LONG").reduce((s, x) => s + x.risk.margin, 0);
    const shortMargin = rows.filter((x) => x.plan.direction === "SHORT").reduce((s, x) => s + x.risk.margin, 0);
    const concentration = totalMargin > 0 ? Math.max(longMargin, shortMargin) / totalMargin * 100 : 0;
    const riskLevel = weightedLossPct > 15 || excessive >= 2 ? "HIGH" : weightedLossPct > 8 || excessive === 1 ? "MEDIUM" : "LOW";
    return { rows, totalMargin, totalLoss, weightedLossPct, excessive, largest, longMargin, shortMargin, concentration, riskLevel };
  }, [plans]);

  if (!view.rows.length) return null;
  const frame = view.riskLevel === "HIGH" ? "border-rose-500/30 bg-rose-500/[.05]" : view.riskLevel === "MEDIUM" ? "border-amber-500/25 bg-amber-500/[.04]" : "border-emerald-500/20 bg-emerald-500/[.035]";

  return <section className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6">
    <div className={`rounded-3xl border p-4 ${frame}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><Layers3 size={16}/> Riesgo total de planes abiertos</div>
          <div className="mt-1 text-xl font-black text-white">No mires cada trade aislado</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Estimación simple usando tu margen, leverage, entrada real y stop. No incluye slippage, fees, funding ni cambios de mantenimiento de margen.</p>
        </div>
        <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${view.riskLevel === "HIGH" ? "border-rose-500/25 text-rose-200" : view.riskLevel === "MEDIUM" ? "border-amber-500/25 text-amber-200" : "border-emerald-500/20 text-emerald-200"}`}>RIESGO {view.riskLevel}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="Margen abierto" value={`$${view.totalMargin.toFixed(2)}`} />
        <Metric label="Pérdida si todos tocan stop" value={`~$${view.totalLoss.toFixed(2)}`} bad={view.totalLoss > 0} />
        <Metric label="% del margen al stop" value={`~${view.weightedLossPct.toFixed(1)}%`} bad={view.weightedLossPct > 10} />
        <Metric label="Leverage excesivo" value={String(view.excessive)} bad={view.excessive > 0} />
        <Metric label="Sesgo LONG/SHORT" value={`$${view.longMargin.toFixed(0)} / $${view.shortMargin.toFixed(0)}`} />
        <Metric label="Concentración direccional" value={`${view.concentration.toFixed(0)}%`} bad={view.concentration > 80 && view.rows.length >= 2} />
      </div>

      {view.largest && <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-950/45 p-3 text-xs leading-5 text-slate-400">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-rose-300"/>
        <span>Mayor riesgo individual: <b className="text-white">{view.largest.plan.symbol}</b> · stop implica aprox. <b className="text-rose-300">${view.largest.risk.lossUsdt.toFixed(2)}</b> o <b className="text-rose-300">{view.largest.risk.marginLossPct.toFixed(1)}%</b> de su margen.</span>
      </div>}

      {(view.weightedLossPct > 10 || view.excessive > 0) && <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-amber-200/80"><AlertTriangle size={13} className="mt-1 shrink-0"/>La exposición conjunta ya es alta. Añadir otra operación puede aumentar el riesgo aunque el nuevo setup sea bueno por separado.</div>}
    </div>
  </section>;
}

function Metric({ label, value, bad=false }: { label:string; value:string; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-sm font-black ${bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
