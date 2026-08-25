import type { LockedPlan, ThesisHealthSnapshot } from "@/lib/lockedPlans";

export type PlanDecisionLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type LeverageRisk = "UNKNOWN" | "PRUDENT" | "HIGH" | "EXCESSIVE";
export type PlanAction = "INVALIDADO" | "REEVALUAR" | "REDUCIR_RIESGO" | "PROTEGER" | "MANTENER" | "VIGILAR" | "SIN_ENTRADA";

type ProgressiveResult = {
  last: ThesisHealthSnapshot | null;
  state: string;
  persistent: boolean;
  fast: boolean;
  healthDelta: number | null;
};

type LeverageMetrics = {
  stopDistanceFromEntryPct: number | null;
  estimatedMarginLossAtStopPct: number | null;
  estimatedLossAtStopUsdt: number | null;
  leverageRisk: LeverageRisk;
  leverage5PctBenchmark: number | null;
  leverage10PctBenchmark: number | null;
};

export type PlanDecision = {
  plan: LockedPlan;
  price: number;
  score: number;
  level: PlanDecisionLevel;
  label: string;
  action: PlanAction;
  detail: string;
  r: number | null;
  maxR: number | null;
  givebackR: number | null;
  stopDistanceNowPct: number | null;
  tp1DistancePct: number | null;
  stopDistanceFromEntryPct: number | null;
  estimatedMarginLossAtStopPct: number | null;
  estimatedLossAtStopUsdt: number | null;
  leverageRisk: LeverageRisk;
  leverage5PctBenchmark: number | null;
  leverage10PctBenchmark: number | null;
  thesisState: string;
  thesisHealth: number | null;
  deteriorationPersistent: boolean;
  deteriorationFast: boolean;
  healthDelta: number | null;
};

function crossed(plan: LockedPlan, price: number, level: number, profit: boolean): boolean {
  if (!(price > 0 && level > 0)) return false;
  if (plan.direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

function rounded(value: number, digits = 2): number {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function progressive(plan: LockedPlan): ProgressiveResult {
  const rows = (plan.thesisSnapshots ?? []).slice(-6);
  const last = rows.length ? rows[rows.length - 1] : null;
  if (!last) return { last: null, state: "SIN_MEMORIA", persistent: false, fast: false, healthDelta: null };

  const last3 = rows.slice(-3);
  const healths = last3.map((x) => x.health);
  const falling3 = healths.length >= 3 && healths[0] > healths[1] && healths[1] > healths[2];
  const fallingFast = healths.length >= 2 && healths[healths.length - 2] - healths[healths.length - 1] >= 8;
  const weak3 = last3.filter((x) => x.state === "WEAKENING" || x.state === "DETERIORATING" || x.state === "INVALIDATED").length;
  const conflicts3 = last3.filter((x) => x.directionConflict).length;
  const guardFails3 = last3.filter((x) => !x.riskGuardPass).length;
  const persistent = last.state === "INVALIDATED" || (last3.length >= 3 && (weak3 >= 3 || (falling3 && last.health < 45) || (conflicts3 >= 2 && guardFails3 >= 2)));
  const fast = !persistent && (last.state === "DETERIORATING" || fallingFast);
  const reference = rows[Math.max(0, rows.length - 3)];
  const healthDelta = rows.length >= 2 ? last.health - reference.health : 0;
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

function leverageMetrics(plan: LockedPlan): LeverageMetrics {
  const entry = Number(plan.actualEntryPrice || 0);
  const stop = Number(plan.stop || 0);
  if (!(entry > 0 && stop > 0)) {
    return {
      stopDistanceFromEntryPct: null,
      estimatedMarginLossAtStopPct: null,
      estimatedLossAtStopUsdt: null,
      leverageRisk: "UNKNOWN",
      leverage5PctBenchmark: null,
      leverage10PctBenchmark: null,
    };
  }

  const stopDistanceFromEntryPct = Math.abs(entry - stop) / entry * 100;
  const leverage = Number(plan.leverage || 0);
  const margin = Number(plan.marginUsdt ?? plan.marginUsed ?? 0);
  const estimatedMarginLossAtStopPct = leverage > 0 ? stopDistanceFromEntryPct * leverage : null;
  const estimatedLossAtStopUsdt = estimatedMarginLossAtStopPct !== null && margin > 0 ? margin * estimatedMarginLossAtStopPct / 100 : null;
  const leverage5PctBenchmark = stopDistanceFromEntryPct > 0 ? Math.max(1, Math.min(125, 5 / stopDistanceFromEntryPct)) : null;
  const leverage10PctBenchmark = stopDistanceFromEntryPct > 0 ? Math.max(1, Math.min(125, 10 / stopDistanceFromEntryPct)) : null;
  let leverageRisk: LeverageRisk = "UNKNOWN";
  if (estimatedMarginLossAtStopPct !== null) {
    leverageRisk = estimatedMarginLossAtStopPct <= 7 ? "PRUDENT" : estimatedMarginLossAtStopPct <= 15 ? "HIGH" : "EXCESSIVE";
  }

  return {
    stopDistanceFromEntryPct: rounded(stopDistanceFromEntryPct, 3),
    estimatedMarginLossAtStopPct: estimatedMarginLossAtStopPct === null ? null : rounded(estimatedMarginLossAtStopPct, 2),
    estimatedLossAtStopUsdt: estimatedLossAtStopUsdt === null ? null : rounded(estimatedLossAtStopUsdt, 2),
    leverageRisk,
    leverage5PctBenchmark: leverage5PctBenchmark === null ? null : rounded(leverage5PctBenchmark, 1),
    leverage10PctBenchmark: leverage10PctBenchmark === null ? null : rounded(leverage10PctBenchmark, 1),
  };
}

function decision(base: Omit<PlanDecision, "score" | "level" | "label" | "action" | "detail">, score: number, level: PlanDecisionLevel, label: string, action: PlanAction, detail: string): PlanDecision {
  return { ...base, score, level, label, action, detail };
}

export function evaluateLockedPlan(plan: LockedPlan, price: number, now = Date.now()): PlanDecision {
  const lev = leverageMetrics(plan);
  const prog = progressive(plan);
  const base: Omit<PlanDecision, "score" | "level" | "label" | "action" | "detail"> = {
    plan,
    price,
    r: null,
    maxR: null,
    givebackR: null,
    stopDistanceNowPct: null,
    tp1DistancePct: null,
    ...lev,
    thesisState: prog.state,
    thesisHealth: prog.last?.health ?? null,
    deteriorationPersistent: prog.persistent,
    deteriorationFast: prog.fast,
    healthDelta: prog.healthDelta,
  };

  if (!(price > 0)) return decision(base, 5, "INFO", "PRECIO NO DISPONIBLE", "VIGILAR", "No pude actualizar el precio en este ciclo.");
  if (!plan.enteredAt || !plan.actualEntryPrice) return decision(base, 15, "INFO", "FIJADO · SIN ENTRADA", "SIN_ENTRADA", "Plan guardado; todavía no hay entrada real registrada.");

  const entry = Number(plan.actualEntryPrice);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const maxR = Math.max(Number(plan.maxRSeen ?? r), r);
  const givebackR = Math.max(0, maxR - r);
  const stopDistanceNowPct = Math.abs(price - plan.stop) / price * 100;
  const tp1DistancePct = Math.abs(plan.tp1 - price) / price * 100;
  const ageMinutes = Math.max(0, (now - plan.enteredAt) / 60000);
  const common = { ...base, r, maxR, givebackR, stopDistanceNowPct, tp1DistancePct };
  const stopHit = crossed(plan, price, plan.stop, false);
  const invalidated = crossed(plan, price, plan.invalidation, false);
  const tp1Hit = crossed(plan, price, plan.tp1, true);
  const tp2Hit = crossed(plan, price, plan.tp2, true);
  const tp3Hit = crossed(plan, price, plan.tp3, true);

  if (stopHit || invalidated || prog.state === "INVALIDADO") return decision(common, 100, "CRITICAL", "STOP / INVALIDACIÓN", "INVALIDADO", "La tesis original perdió su nivel de protección. No ampliar el stop para rescatar la operación.");
  if (prog.persistent) return decision(common, 97, "CRITICAL", "DETERIORO PERSISTENTE", "REEVALUAR", `La tesis lleva varias lecturas empeorando${prog.last ? `; salud ${prog.last.health.toFixed(0)}/100` : ""}. Revisar salida antes de esperar ciegamente al stop.`);
  if (ageMinutes >= plan.maxDurationMinutes) return decision(common, 94, "CRITICAL", "DURACIÓN MÁXIMA", "REEVALUAR", `Lleva ~${Math.floor(ageMinutes)} min; excedió la duración máxima del plan.`);
  if (ageMinutes >= plan.timeStopMinutes && r < 0.5) return decision(common, 92, "HIGH", "TIME STOP", "REEVALUAR", `Lleva ~${Math.floor(ageMinutes)} min y todavía no desarrolló 0.5R.`);
  if (prog.fast) return decision(common, 90, "HIGH", "DEBILITÁNDOSE RÁPIDO", "REDUCIR_RIESGO", `La salud de la tesis cayó con fuerza entre snapshots${prog.last ? `; ahora ${prog.last.health.toFixed(0)}/100` : ""}.`);
  if (lev.leverageRisk === "EXCESSIVE") return decision(common, 89, "HIGH", "APALANCAMIENTO EXCESIVO", "REDUCIR_RIESGO", `Con ${plan.leverage ?? "—"}x, llegar al stop equivale aprox. a ${lev.estimatedMarginLossAtStopPct !== null ? lev.estimatedMarginLossAtStopPct.toFixed(1) : "—"}% del margen${lev.estimatedLossAtStopUsdt !== null ? ` (~$${lev.estimatedLossAtStopUsdt.toFixed(2)})` : ""}, antes de fees/funding.`);
  if (r <= -0.7) return decision(common, 88, "HIGH", "BAJO PRESIÓN", "REEVALUAR", `La operación va ${r.toFixed(2)}R y se acerca a la pérdida planificada completa.`);
  if (stopDistanceNowPct <= 0.35) return decision(common, 86, "HIGH", "STOP MUY CERCA", "REEVALUAR", `Queda ~${stopDistanceNowPct.toFixed(2)}% hasta el stop.`);
  if (givebackR >= 0.75 && maxR >= 0.8) return decision(common, 84, "HIGH", "GANANCIA DEVUELTA", "PROTEGER", `Llegó a +${maxR.toFixed(2)}R y devolvió ${givebackR.toFixed(2)}R. Revisar protección.`);
  if (tp3Hit) return decision(common, 80, "MEDIUM", "TP3 ALCANZADO", "PROTEGER", "Objetivo runner alcanzado; proteger cualquier parte restante.");
  if (tp2Hit) return decision(common, 76, "MEDIUM", "TP2 ALCANZADO", "PROTEGER", "Objetivo principal alcanzado; revisar realización/protección del beneficio.");
  if (tp1Hit) return decision(common, 72, "MEDIUM", "TP1 · PROTEGER", "PROTEGER", "Primer objetivo alcanzado; el foco pasa de buscar entrada a proteger la operación.");
  if (prog.state === "DEBILITANDO") return decision(common, 68, "MEDIUM", "TESIS DEBILITÁNDOSE", "VIGILAR", `La memoria progresiva muestra pérdida de calidad${prog.last ? `; salud ${prog.last.health.toFixed(0)}/100` : ""}.`);
  if (tp1DistancePct <= 0.4 && r > 0) return decision(common, 64, "MEDIUM", "TP1 CERCA", "VIGILAR", `TP1 está a ~${tp1DistancePct.toFixed(2)}%. Vigilar reacción.`);
  if (r >= 0.5 && (prog.state === "ESTABLE" || prog.state === "FORTALECIENDO")) return decision(common, 45, "LOW", "MANTENER SEGÚN PLAN", "MANTENER", `Va +${r.toFixed(2)}R y la memoria de tesis no muestra deterioro persistente.`);
  return decision(common, 35, "LOW", "MANTENER / VIGILAR", "VIGILAR", `Va ${r >= 0 ? "+" : ""}${r.toFixed(2)}R. Sin condición urgente; respetar stop y time-stop.`);
}
