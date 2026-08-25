"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Crosshair,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getPrice } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlans, type LockedPlan } from "@/lib/lockedPlans";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function crossed(plan: LockedPlan, price: number, level: number, profit: boolean) {
  if (!(price > 0 && level > 0)) return false;
  if (plan.direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

type Urgency = {
  plan: LockedPlan;
  price: number;
  score: number;
  level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  label: string;
  detail: string;
  r: number | null;
  stopDistancePct: number | null;
  tp1DistancePct: number | null;
  givebackR: number | null;
};

function derive(plan: LockedPlan, price: number): Urgency {
  if (!price) {
    return { plan, price, score: 5, level: "INFO", label: "PRECIO NO DISPONIBLE", detail: "No pude actualizar el precio en este ciclo.", r: null, stopDistancePct: null, tp1DistancePct: null, givebackR: null };
  }

  if (!plan.enteredAt || !plan.actualEntryPrice) {
    return { plan, price, score: 15, level: "INFO", label: "FIJADO · SIN ENTRADA", detail: "Plan guardado; todavía no hay entrada real registrada.", r: null, stopDistancePct: null, tp1DistancePct: null, givebackR: null };
  }

  const entry = Number(plan.actualEntryPrice);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const maxR = Number(plan.maxRSeen ?? r);
  const givebackR = Math.max(0, maxR - r);
  const stopDistancePct = Math.abs(price - plan.stop) / price * 100;
  const tp1DistancePct = Math.abs(plan.tp1 - price) / price * 100;
  const ageMinutes = Math.max(0, (Date.now() - plan.enteredAt) / 60000);
  const stopHit = crossed(plan, price, plan.stop, false);
  const invalidated = crossed(plan, price, plan.invalidation, false);
  const tp1Hit = crossed(plan, price, plan.tp1, true);
  const tp2Hit = crossed(plan, price, plan.tp2, true);
  const tp3Hit = crossed(plan, price, plan.tp3, true);

  if (stopHit || invalidated) {
    return { plan, price, score: 100, level: "CRITICAL", label: "STOP / INVALIDACIÓN", detail: "El plan original perdió su nivel de protección. Revisar de inmediato.", r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (ageMinutes >= plan.maxDurationMinutes) {
    return { plan, price, score: 94, level: "CRITICAL", label: "DURACIÓN MÁXIMA", detail: `Lleva ~${Math.floor(ageMinutes)} min; excedió la duración máxima del plan.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (ageMinutes >= plan.timeStopMinutes && r < 0.5) {
    return { plan, price, score: 90, level: "HIGH", label: "TIME STOP", detail: `Lleva ~${Math.floor(ageMinutes)} min y todavía no desarrolló 0.5R.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (r <= -0.7) {
    return { plan, price, score: 88, level: "HIGH", label: "BAJO PRESIÓN", detail: `La operación va ${r.toFixed(2)}R y se acerca a la zona de pérdida total del plan.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (stopDistancePct <= 0.35) {
    return { plan, price, score: 86, level: "HIGH", label: "STOP MUY CERCA", detail: `Queda ~${stopDistancePct.toFixed(2)}% hasta el stop.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (givebackR >= 0.75 && maxR >= 0.8) {
    return { plan, price, score: 82, level: "HIGH", label: "GANANCIA DEVUELTA", detail: `Llegó a +${maxR.toFixed(2)}R y devolvió ${givebackR.toFixed(2)}R. Conviene revisar protección.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (tp3Hit) {
    return { plan, price, score: 78, level: "MEDIUM", label: "TP3 ALCANZADO", detail: "Runner en objetivo final; revisar cierre/protección.", r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (tp2Hit) {
    return { plan, price, score: 74, level: "MEDIUM", label: "TP2 ALCANZADO", detail: "Objetivo principal alcanzado; revisar toma de beneficio.", r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (tp1Hit) {
    return { plan, price, score: 70, level: "MEDIUM", label: "TP1 · PROTEGER", detail: "Primer objetivo alcanzado; el foco pasa a proteger la operación.", r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (tp1DistancePct <= 0.4 && r > 0) {
    return { plan, price, score: 64, level: "MEDIUM", label: "TP1 CERCA", detail: `TP1 está a ~${tp1DistancePct.toFixed(2)}%. Vigilar reacción.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  if (r >= 0.5) {
    return { plan, price, score: 45, level: "LOW", label: "MANTENER SEGÚN PLAN", detail: `Va +${r.toFixed(2)}R y todavía no hay condición urgente.`, r, stopDistancePct, tp1DistancePct, givebackR };
  }
  return { plan, price, score: 35, level: "LOW", label: "MANTENER / VIGILAR", detail: `Va ${r >= 0 ? "+" : ""}${r.toFixed(2)}R. Sin condición urgente por precio/tiempo.`, r, stopDistancePct, tp1DistancePct, givebackR };
}

function levelClasses(level: Urgency["level"]) {
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

  const ranked = useMemo(() => plans.map((plan) => derive(plan, prices[plan.symbol] || 0)).sort((a, b) => b.score - a.score), [plans, prices]);
  const urgent = ranked.filter((x) => x.score >= 70).length;

  if (!plans.length) return null;

  return <section className="mx-auto max-w-[1500px] px-4 pt-6 sm:px-6">
    <div className="rounded-3xl border border-slate-800 bg-[#07111d]/75 p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-amber-300"><AlertTriangle size={16}/> Prioridad de atención</div>
          <h2 className="mt-1 text-xl font-black text-white">Revisa primero lo que puede cambiar tu riesgo</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Ordenado por stop/invalidación, tiempo, deterioro del R, ganancia devuelta y cercanía a TP.</p>
        </div>
        <div className={`rounded-full border px-3 py-1.5 text-xs font-black ${urgent ? "border-rose-500/25 bg-rose-500/5 text-rose-200" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"}`}>{urgent ? `${urgent} requieren atención` : "Sin urgencias fuertes"}</div>
      </div>

      <div className="mt-4 grid gap-2">
        {ranked.slice(0, 8).map((item, index) => <Link key={item.plan.symbol} href={`/coin/${item.plan.symbol}`} className={`grid gap-3 rounded-2xl border p-3 transition hover:border-cyan-500/30 md:grid-cols-[48px_1.2fr_.8fr_.8fr_1.7fr] md:items-center ${levelClasses(item.level)}`}>
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-black/20 font-mono text-sm font-black">#{index + 1}</div>
          <div>
            <div className="flex items-center gap-2"><span className="font-black text-white">{item.plan.symbol}</span><span className={`inline-flex items-center gap-1 text-[10px] font-black ${item.plan.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{item.plan.direction === "LONG" ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>} {item.plan.direction}</span></div>
            <div className="mt-1 text-[10px] opacity-70">{item.label}</div>
          </div>
          <div className="text-xs"><span className="block text-[9px] uppercase tracking-[.08em] opacity-55">Ahora</span><span className="mt-1 block font-mono font-black text-white">{fmt(item.price)}</span></div>
          <div className="text-xs"><span className="block text-[9px] uppercase tracking-[.08em] opacity-55">R actual</span><span className={`mt-1 block font-mono font-black ${item.r != null && item.r >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{item.r == null ? "—" : `${item.r >= 0 ? "+" : ""}${item.r.toFixed(2)}R`}</span></div>
          <div className="text-xs leading-5 opacity-85">{item.detail}</div>
        </Link>)}
      </div>

      <div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
        <div className="flex items-center gap-2"><ShieldAlert size={13} className="text-rose-300"/>Stop/invalidación y time-stop tienen prioridad máxima.</div>
        <div className="flex items-center gap-2"><TrendingDown size={13} className="text-orange-300"/>También prioriza R negativo o ganancia que se está devolviendo.</div>
        <div className="flex items-center gap-2"><Target size={13} className="text-violet-300"/>TP1/TP2/TP3 se muestran como eventos de gestión, no como garantía.</div>
      </div>
    </div>
  </section>;
}
