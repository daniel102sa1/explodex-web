"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, ShieldAlert, Target, X } from "lucide-react";
import { getPrice } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlans, type LockedPlan } from "@/lib/lockedPlans";

type AlertState = {
  symbol: string;
  severity: "critical" | "warning" | "positive";
  title: string;
  detail: string;
  signature: string;
};

function crossed(plan: LockedPlan, price: number, level: number, profit: boolean) {
  if (!(price > 0 && level > 0)) return false;
  if (plan.direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

function inspect(plan: LockedPlan, price: number): AlertState | null {
  if (!plan.enteredAt || !plan.actualEntryPrice || !price) return null;
  const entry = Number(plan.actualEntryPrice);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const maxR = Number(plan.maxRSeen ?? r);
  const givebackR = Math.max(0, maxR - r);
  const stopDistancePct = Math.abs(price - plan.stop) / price * 100;
  const tp1DistancePct = Math.abs(plan.tp1 - price) / price * 100;
  const ageMinutes = Math.max(0, (Date.now() - plan.enteredAt) / 60000);

  if (crossed(plan, price, plan.stop, false) || crossed(plan, price, plan.invalidation, false)) {
    return { symbol: plan.symbol, severity: "critical", title: "STOP / INVALIDACIÓN", detail: "La tesis original perdió su nivel de protección. Revisar de inmediato.", signature: `${plan.symbol}:invalidated` };
  }
  if (ageMinutes >= plan.maxDurationMinutes) {
    return { symbol: plan.symbol, severity: "critical", title: "DURACIÓN MÁXIMA", detail: `La operación lleva ~${Math.floor(ageMinutes)} min y excedió la duración máxima del plan.`, signature: `${plan.symbol}:max-duration` };
  }
  if (ageMinutes >= plan.timeStopMinutes && r < 0.5) {
    return { symbol: plan.symbol, severity: "warning", title: "TIME STOP", detail: `Lleva ~${Math.floor(ageMinutes)} min y todavía no desarrolló 0.5R.`, signature: `${plan.symbol}:time-stop:${Math.floor(ageMinutes / 10)}` };
  }
  if (stopDistancePct <= 0.35) {
    return { symbol: plan.symbol, severity: "critical", title: "STOP MUY CERCA", detail: `Queda aproximadamente ${stopDistancePct.toFixed(2)}% hasta el stop.`, signature: `${plan.symbol}:stop-near` };
  }
  if (r <= -0.7) {
    return { symbol: plan.symbol, severity: "warning", title: "BAJO PRESIÓN", detail: `La operación va ${r.toFixed(2)}R. Revisar riesgo antes de que llegue al stop.`, signature: `${plan.symbol}:pressure` };
  }
  if (givebackR >= 0.75 && maxR >= 0.8) {
    return { symbol: plan.symbol, severity: "warning", title: "GANANCIA DEVUELTA", detail: `Llegó a +${maxR.toFixed(2)}R y devolvió ${givebackR.toFixed(2)}R. Revisar protección.`, signature: `${plan.symbol}:giveback:${Math.floor(givebackR * 4)}` };
  }
  if (crossed(plan, price, plan.tp1, true)) {
    return { symbol: plan.symbol, severity: "positive", title: "TP1 ALCANZADO", detail: "Primer objetivo alcanzado. Revisar protección del resto del plan.", signature: `${plan.symbol}:tp1` };
  }
  if (tp1DistancePct <= 0.25 && r > 0) {
    return { symbol: plan.symbol, severity: "positive", title: "TP1 MUY CERCA", detail: `TP1 está a aproximadamente ${tp1DistancePct.toFixed(2)}%.`, signature: `${plan.symbol}:tp1-near` };
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
        try {
          new Notification(`${next.symbol} · ${next.title}`, { body: next.detail, tag: next.signature });
        } catch {}
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
