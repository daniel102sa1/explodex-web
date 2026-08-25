"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, ShieldAlert, Target, X } from "lucide-react";
import { getPrice } from "@/lib/api";
import { evaluateLockedPlan } from "@/lib/planDecision";
import { LOCKED_PLANS_EVENT, readLockedPlans, type LockedPlan } from "@/lib/lockedPlans";

type AlertState = {
  symbol: string;
  severity: "critical" | "warning" | "positive";
  title: string;
  detail: string;
  signature: string;
};

function inspect(plan: LockedPlan, price: number): AlertState | null {
  const decision = evaluateLockedPlan(plan, price);
  if (!plan.enteredAt || !plan.actualEntryPrice || !price) return null;

  if (decision.level === "CRITICAL") {
    return {
      symbol: plan.symbol,
      severity: "critical",
      title: decision.label,
      detail: decision.detail,
      signature: `${plan.symbol}:critical:${decision.label}:${Math.floor(Date.now() / 600000)}`,
    };
  }

  if (["DEBILITÁNDOSE RÁPIDO", "APALANCAMIENTO EXCESIVO", "TIME STOP", "BAJO PRESIÓN", "STOP MUY CERCA", "GANANCIA DEVUELTA"].includes(decision.label)) {
    return {
      symbol: plan.symbol,
      severity: "warning",
      title: decision.label,
      detail: decision.detail,
      signature: `${plan.symbol}:warning:${decision.label}:${Math.floor(Date.now() / 600000)}`,
    };
  }

  if (["TP1 · PROTEGER", "TP2 ALCANZADO", "TP3 ALCANZADO", "TP1 CERCA"].includes(decision.label)) {
    return {
      symbol: plan.symbol,
      severity: "positive",
      title: decision.label,
      detail: decision.detail,
      signature: `${plan.symbol}:positive:${decision.label}`,
    };
  }
  return null;
}

export default function GlobalPlanAlerts() {
  const [plans, setPlans] = useState<LockedPlan[]>([]);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const seen = useRef<Record<string, number>>({});

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

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const entered = plans.filter((p) => p.enteredAt && p.actualEntryPrice).slice(0, 20);
      const candidates: AlertState[] = [];
      for (const plan of entered) {
        try {
          const result = await getPrice(plan.symbol);
          const next = inspect(plan, Number(result.price || 0));
          if (next) candidates.push(next);
        } catch {}
      }
      if (cancelled || !candidates.length) return;
      const rank = { critical: 3, warning: 2, positive: 1 } as const;
      candidates.sort((a, b) => rank[b.severity] - rank[a.severity]);
      const next = candidates[0];
      const now = Date.now();
      const last = seen.current[next.signature] || 0;
      if (now - last < 10 * 60_000) return;
      seen.current[next.signature] = now;
      setAlert(next);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(`${next.symbol} · ${next.title}`, { body: next.detail, tag: next.signature }); } catch {}
      }
    }
    check();
    const timer = setInterval(check, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [plans]);

  if (!alert) return null;
  const tone = alert.severity === "critical"
    ? "border-rose-500/35 bg-rose-950/95"
    : alert.severity === "warning"
      ? "border-orange-500/30 bg-slate-950/95"
      : "border-emerald-500/30 bg-slate-950/95";
  const icon = alert.severity === "critical"
    ? <ShieldAlert size={18} className="text-rose-300"/>
    : alert.severity === "warning"
      ? <AlertTriangle size={18} className="text-orange-300"/>
      : <Target size={18} className="text-emerald-300"/>;

  return <div className="fixed bottom-4 right-4 z-[120] w-[min(430px,calc(100vw-2rem))]">
    <div className={`rounded-2xl border p-4 shadow-2xl shadow-black/50 backdrop-blur-xl ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{icon}</div>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-cyan-300"><BellRing size={12}/> Alerta de plan</div>
            <div className="mt-1 text-base font-black text-white">{alert.symbol} · {alert.title}</div>
            <p className="mt-1 text-xs leading-5 text-slate-300/80">{alert.detail}</p>
            <Link href={`/coin/${alert.symbol}`} onClick={() => setAlert(null)} className="mt-3 inline-flex rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-100">Abrir plan</Link>
          </div>
        </div>
        <button onClick={() => setAlert(null)} className="rounded-lg border border-slate-700 p-1.5 text-slate-500 hover:text-white"><X size={14}/></button>
      </div>
    </div>
  </div>;
}
