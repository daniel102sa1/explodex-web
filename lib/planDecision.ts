import type { LockedPlan, ThesisHealthSnapshot } from "@/lib/lockedPlans";

export type PlanDecisionLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type PlanDecision = {
  plan: LockedPlan;
  price: number;
  score: number;
  level: PlanDecisionLevel;
  label: string;
  action: "INVALIDADO" | "REEVALUAR" | "REDUCIR_RIESGO" | "PROTEGER" | "MANTENER" | "VIGILAR" | "SIN_ENTRADA";
  detail: string;
  r: number | null;
  maxR: number | null;
  givebackR: number | null;
  stopDistanceNowPct: number | null;
  tp1DistancePct: number | null;
  stopDistanceFromEntryPct: number | null;
  estimatedMarginLossAtStopPct: number | null;
  estimatedLossAtStopUsdt: number | null;
  leverageRisk: "UNKNOWN" | "PRUDENT" | "HIGH" | "EXCESSIVE";
  leverage5PctBenchmark: number | null;
  leverage10PctBenchmark: number | null;
  thesisState: string;
  thesisHealth: number | null;
  deteriorationPersistent: boolean;
  deteriorationFast: boolean;
  healthDelta: number | null;
};

function crossed(plan: LockedPlan, price: number, level: number, profit: boolean) {
  if (!(price > 0 && level > 0)) return false;
  if (plan.direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

function round(value: number, digits = 2) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function progressive(plan: LockedPlan) {
  const rows = (plan.thesisSnapshots ?? []).slice(-6);
  const last = rows.at(-1);
  if (!last) {
    return {
      last: null as ThesisHealthSnapshot | null,
      state: "SIN_MEMORIA",
      persistent: false,
      fast: false,
      healthDelta: null as number | null,
    };
  }
  const last3 = rows.slice(-3);
  const healths = last3.map((x) => x.health);
  const falling3 = healths.length >= 3 && healths[0] > healths[1] && healths[1] > healths[2];
  const fallingFast = healths.length >= 2 && healths.at(-2)! - healths.at(-1)! >= 8;
  const weak3 = last3.filter((x) => ["WEAKENING", "DETERIORATING", "INVALIDATED"].includes(x.state)).length;
  const conflicts3 = last3.filter((x) => x.directionConflict).length;
  const guardFails3 = last3.filter((x) => !x.riskGuardPass).length;
  const persistent = last.state === "INVALIDATED" || (last3.length >= 3 && (weak3 >= 3 || (falling3 && last.health < 45) || (conflicts3 >= 2 && guardFails3 >= 2)));
  const fast = !persistent && (last.state === "DETERIORATING" || fallingFast);
  const healthDelta = rows.length >= 2 ? last.health - rows[Math.max(0, rows.length - 3)].health : 0;
  const state = last.state === "INVALIDATED"
    ? "INVALIDADO"
    : persistent
      ? "DETERIORO_PERSISTENTE"
      : fast
        ? "DEBILITANDO_RAPIDO"
        : last.state === "WEAKENING"
          ? "DEBILITANDO"
          : last.state === "STRONG" && healthDelta > 0
            ? "FORTALECIENDO"
            : "ESTABLE";
  return { last, state, persistent, fast, healthDelta };
}

function leverageMetrics(plan: LockedPlan) {
  const entry = Number(plan.actualEntryPrice || 0);
  const stop = Number(plan.stop || 0);
  if (!(entry > 0 && stop > 0)) {
    return {
      stopDistanceFromEntryPct: null,
      estimatedMarginLossAtStopPct: null,
      estimatedLossAtStopUsdt: null,
      leverageRisk: "UNKNOWN" as const,
      leverage5PctBenchmark: null,
      leverage10PctBenchmark: null,
    };
  }
  const stopDistanceFromEntryPct = Math.abs(entry - stop) / entry * 100;
  const leverage = Number(plan.leverage || 0);
  const margin = Number(plan.marginUsdt ?? plan.marginUsed ?? 0);
  const estimatedMarginLossAtStopPct = leverage > 0 ? stopDistanceFromEntryPct * leverage : null;
  const estimatedLossAtStopUsdt = estimatedMarginLossAtStopPct != null && margin > 0 ? margin * estimatedMarginLossAtStopPct / 100 : null;
  const leverage5PctBenchmark = stopDistanceFromEntryPct > 0 ? Math.max(1, Math.min(125, 5 / stopDistanceFromEntryPct)) : null;
  const leverage10PctBenchmark = stopDistanceFromEntryPct > 0 ? Math.max(1, Math.min(125, 10 / stopDistanceFromEntryPct)) : null;
  const leverageRisk = estimatedMarginLossAtStopPct == null
    ? "UNKNOWN"
    : estimatedMarginLossAtStopPct <= 7
      ? "PRUDENT"
      : estimatedMarginLossAtStopPct <= 15
        ? "HIGH"
        : "EXCESSIVE";
  return {
    stopDistanceFromEntryPct: round(stopDistanceFromEntryPct, 3),
    estimatedMarginLossAtStopPct: estimatedMarginLossAtStopPct == null ? null : round(estimatedMarginLossAtStopPct, 2),
    estimatedLossAtStopUsdt: estimatedLossAtStopUsdt == null ? null : round(estimatedLossAtStopUsdt, 2),
    leverageRisk,
    leverage5PctBenchmark: leverage5PctBenchmark == null ? null : round(leverage5PctBenchmark, 1),
    leverage10PctBenchmark: leverage10PctBenchmark == null ? null : round(leverage10PctBenchmark, 1),
  };
}

export function evaluateLockedPlan(plan: LockedPlan, price: number, now = Date.now()): PlanDecision {
  const lev = leverageMetrics(plan);
  const prog = progressive(plan);
  const base = {
    plan,
    price,
    r: null as number | null,
    maxR: null as number | null,
    givebackR: null as number | null,
    stopDistanceNowPct: null as number | null,
    tp1DistancePct: null as number | null,
    ...lev,
    thesisState: prog.state,
    thesisHealth: prog.last?.health ?? null,
    deteriorationPersistent: prog.persistent,
    deteriorationFast: prog.fast,
    healthDelta: prog.healthDelta,
  };

  if (!price) {
    return { ...base, score: 5, level: "INFO", label: "PRECIO NO DISPONIBLE", action: "VIGILAR", detail: "No pude actualizar el precio en este ciclo." };
  }
  if (!plan.enteredAt || !plan.actualEntryPrice) {
    return { ...base, score: 15, level: "INFO", label: "FIJADO · SIN ENTRADA", action: "SIN_ENTRADA", detail: "Plan guardado; todavía no hay entrada real registrada." };
  }

  const entry = Number(plan.actualEntryPrice);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const maxR = Math.max(Number(plan.maxRSeen ?? r), r);
  const givebackR = Math.max(0, maxR - r);
  const stopDistanceNowPct = Math.abs(price - plan.stop) / price * 100;
  const tp1DistancePct = Math.abs(plan.tp1 - price) / price * 100;
  const ageMinutes = Math.max(0, (now - plan.enteredAt) / 60000);
  const stopHit = crossed(plan, price, plan.stop, false);
  const invalidated = crossed(plan, price, plan.invalidation, false);
  const tp1Hit = crossed(plan, price, plan.tp1, true);
  const tp2Hit = crossed(plan, price, plan.tp2, true);
  const tp3Hit = crossed(plan, price, plan.tp3, true);
  const common = { ...base, r, maxR, givebackR, stopDistanceNowPct, tp1DistancePct };

  if (stopHit || invalidated || prog.state === "INVALIDADO") {
    return { ...common, score: 100, level: "CRITICAL", label: "STOP / INVALIDACIÓN", action: "INVALIDADO", detail: "La tesis original perdió su nivel de protección. No ampliar el stop para rescatar la operación." };
  }
  if (prog.persistent) {
    return { ...common, score: 97, level: "CRITICAL", label: "DETERIORO PERSISTENTE", action: "REEVALUAR", detail: `La tesis lleva varias lecturas empeorando${prog.last ? `; salud ${prog.last.health.toFixed(0)}/100` : ""}. Revisar salida antes de esperar ciegamente al stop.` };
  }
  if (ageMinutes >= plan.maxDurationMinutes) {
    return { ...common, score: 94, level: "CRITICAL", label: "DURACIÓN MÁXIMA", action: "REEVALUAR", detail: `Lleva ~${Math.floor(ageMinutes)} min; excedió la duración máxima del plan.` };
  }
  if (ageMinutes >= plan.timeStopMinutes && r < 0.5) {
    return { ...common, score: 92, level: "HIGH", label: "TIME STOP", action: "REEVALUAR", detail: `Lleva ~${Math.floor(ageMinutes)} min y todavía no desarrolló 0.5R.` };
  }
  if (prog.fast) {
    return { ...common, score: 90, level: "HIGH", label: "DEBILITÁNDOSE RÁPIDO", action: "REDUCIR_RIESGO", detail: `La salud de la tesis cayó con fuerza entre snapshots${prog.last ? `; ahora ${prog.last.health.toFixed(0)}/100` : ""}.` };
  }
  if (lev.leverageRisk === "EXCESSIVE") {
    return { ...common, score: 89, level: "HIGH", label: "APALANCAMIENTO EXCESIVO", action: "REDUCIR_RIESGO", detail: `Con ${plan.leverage ?? "—"}x, llegar al stop equivale aprox. a ${lev.estimatedMarginLossAtStopPct?.toFixed(1)}% del margen${lev.estimatedLossAtStopUsdt != null ? ` (~$${lev.estimatedLossAtStopUsdt.toFixed(2)})` : ""}, antes de fees/funding.` };
  }
  if (r <= -0.7) {
    return { ...common, score: 88, level: "HIGH", label: "BAJO PRESIÓN", action: "REEVALUAR", detail: `La operación va ${r.toFixed(2)}R y se acerca a la pérdida planificada completa.` };
  }
  if (stopDistanceNowPct <= 0.35) {
    return { ...common, score: 86, level: "HIGH", label: "STOP MUY CERCA", action: "REEVALUAR", detail: `Queda ~${stopDistanceNowPct.toFixed(2)}% hasta el stop.` };
  }
  if (givebackR >= 0.75 && maxR >= 0.8) {
    return { ...common, score: 84, level: "HIGH", label: "GANANCIA DEVUELTA", action: "PROTEGER", detail: `Llegó a +${maxR.toFixed(2)}R y devolvió ${givebackR.toFixed(2)}R. Revisar protección.` };
  }
  if (tp3Hit) {
    return { ...common, score: 80, level: "MEDIUM", label: "TP3 ALCANZADO", action: "PROTEGER", detail: "Objetivo runner alcanzado; proteger cualquier parte restante." };
  }
  if (tp2Hit) {
    return { ...common, score: 76, level: "MEDIUM", label: "TP2 ALCANZADO", action: "PROTEGER", detail: "Objetivo principal alcanzado; revisar realización/protección del beneficio." };
  }
  if (tp1Hit) {
    return { ...common, score: 72, level: "MEDIUM", label: "TP1 · PROTEGER", action: "PROTEGER", detail: "Primer objetivo alcanzado; el foco pasa de buscar entrada a proteger la operación." };
  }
  if (prog.state === "DEBILITANDO") {
    return { ...common, score: 68, level: "MEDIUM", label: "TESIS DEBILITÁNDOSE", action: "VIGILAR", detail: `La memoria progresiva muestra pérdida de calidad${prog.last ? `; salud ${prog.last.health.toFixed(0)}/100` : ""}.` };
  }
  if (tp1DistancePct <= 0.4 && r > 0) {
    return { ...common, score: 64, level: "MEDIUM", label: "TP1 CERCA", action: "VIGILAR", detail: `TP1 está a ~${tp1DistancePct.toFixed(2)}%. Vigilar reacción.` };
  }
  if (r >= 0.5 && ["ESTABLE", "FORTALECIENDO"].includes(prog.state)) {
    return { ...common, score: 45, level: "LOW", label: "MANTENER SEGÚN PLAN", action: "MANTENER", detail: `Va +${r.toFixed(2)}R y la memoria de tesis no muestra deterioro persistente.` };
  }
  return { ...common, score: 35, level: "LOW", label: "MANTENER / VIGILAR", action: "VIGILAR", detail: `Va ${r >= 0 ? "+" : ""}${r.toFixed(2)}R. Sin condición urgente; respetar stop y time-stop.` };
}
