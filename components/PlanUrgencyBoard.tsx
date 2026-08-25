"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ShieldAlert, Target, TrendingDown } from "lucide-react";
import { getPrice } from "@/lib/api";
import { evaluateLockedPlan, type PlanDecisionLevel } from "@/lib/planDecision";
import { LOCKED_PLANS_EVENT, readLockedPlans, type LockedPlan } from "@/lib/lockedPlans";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function levelClasses(level: PlanDecisionLevel) {
  if (level === "CRITICAL") return "border-rose-500/35 bg-rose-500/[.07] text-rose-200";
  if (level === "HIGH") return "border-orange-500/30 bg-orange-500/[.06] text-orange-200";
  if (level === "MEDIUM") return "border-violet-500/25 bg-violet-500/[.05] text-violet-200";
  if (level === "LOW") return "border-emerald-500/20 bg-emerald-500/[.035] text-emerald-200";
  return "border-slate-800 bg-slate-950/45 text-slate-400";
}

export default function PlanUrgencyBoard() {
  const [plans, setPlans] = useState<LockedPlan[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const refreshPlans = () => setPlans(readLockedPlans());
    refreshPlans();
    window.addEventListener("storage", refreshPlans);
    window.addEventListener(LOCKED_PLANS_EVENT, refreshPlans as EventListener);
    return () => {
      window.removeEventListener("storage", refreshPlans);
      window.removeEventListener(LOCKED_PLANS_EVENT, refreshPlans as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshPrices() {
      const rows = await Promise.all(plans.slice(0, 30).map(async (plan) => {
        try {
          const result = await getPrice(plan.symbol);
          return [plan.symbol, Number(result.price || 0)] as const;
        } catch {
          return [plan.symbol, 0] as const;
        }
      }));
      if (!cancelled) setPrices(Object.fromEntries(rows));
    }
    refreshPrices();
    const timer = setInterval(refreshPrices, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [plans]);

  const ranked = useMemo(() => plans.map((plan) => evaluateLockedPlan(plan, prices[plan.symbol] || 0)).sort((a, b) => b.score - a.score), [plans, prices]);
  const urgent = ranked.filter((x) => x.score >= 70).length;
  const excessive = ranked.filter((x) => x.leverageRisk === "EXCESSIVE").length;
  const deteriorating = ranked.filter((x) => x.deteriorationPersistent || x.deteriorationFast).length;

  if (!plans.length) return null;

  return <section className="mx-auto max-w-[1500px] px-4 pt-6 sm:px-6">
    <div className="rounded-3xl border border-slate-800 bg-[#07111d]/75 p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-amber-300"><AlertTriangle size={16}/> Prioridad de atención</div>
          <h2 className="mt-1 text-xl font-black text-white">Una sola decisión por plan</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Combina precio, R, stop, time-stop, deterioro progresivo y riesgo real del apalancamiento.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge bad={urgent > 0}>{urgent ? `${urgent} urgentes` : "Sin urgencias fuertes"}</Badge>
          <Badge bad={deteriorating > 0}>{deteriorating ? `${deteriorating} deteriorándose` : "Tesis estables"}</Badge>
          <Badge bad={excessive > 0}>{excessive ? `${excessive} leverage excesivo` : "Leverage sin alerta roja"}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {ranked.slice(0, 10).map((item, index) => <Link key={item.plan.symbol} href={`/coin/${item.plan.symbol}`} className={`grid gap-3 rounded-2xl border p-3 transition hover:border-cyan-500/30 lg:grid-cols-[46px_1.05fr_.7fr_.7fr_.85fr_1.5fr] lg:items-center ${levelClasses(item.level)}`}>
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20 font-mono text-sm font-black">#{index + 1}</div>
          <div>
            <div className="flex items-center gap-2"><span className="font-black text-white">{item.plan.symbol}</span><span className={`inline-flex items-center gap-1 text-[10px] font-black ${item.plan.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{item.plan.direction === "LONG" ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>} {item.plan.direction}</span></div>
            <div className="mt-1 text-[10px] font-black opacity-85">{item.label}</div>
          </div>
          <Cell label="Ahora" value={fmt(item.price)} />
          <Cell label="R" value={item.r == null ? "—" : `${item.r >= 0 ? "+" : ""}${item.r.toFixed(2)}R`} good={item.r != null && item.r >= 0} bad={item.r != null && item.r < 0} />
          <Cell label="Riesgo al stop" value={item.estimatedMarginLossAtStopPct == null ? "—" : `${item.estimatedMarginLossAtStopPct.toFixed(1)}% margen`} bad={item.leverageRisk === "EXCESSIVE"} />
          <div className="text-xs leading-5 opacity-90"><b className="text-white">{item.action.replaceAll("_", " ")}</b><br/>{item.detail}</div>
        </Link>)}
      </div>

      <div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
        <div className="flex items-center gap-2"><ShieldAlert size={13} className="text-rose-300"/>Deterioro persistente puede subir una operación a prioridad máxima antes del stop.</div>
        <div className="flex items-center gap-2"><TrendingDown size={13} className="text-orange-300"/>El leverage se evalúa por la pérdida estimada del margen si el stop se ejecuta.</div>
        <div className="flex items-center gap-2"><Target size={13} className="text-violet-300"/>TP alcanzado cambia el objetivo del sistema de crecer a proteger beneficio.</div>
      </div>
    </div>
  </section>;
}

function Cell({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="text-xs"><span className="block text-[9px] uppercase tracking-[.08em] opacity-55">{label}</span><span className={`mt-1 block font-mono font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</span></div>;
}

function Badge({ children, bad=false }: { children:React.ReactNode; bad?:boolean }) {
  return <div className={`rounded-full border px-3 py-1.5 text-xs font-black ${bad ? "border-rose-500/25 bg-rose-500/5 text-rose-200" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"}`}>{children}</div>;
}
