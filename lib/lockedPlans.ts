export type LockedPlanDirection = "LONG" | "SHORT";

export type LockedPlan = {
  symbol: string;
  direction: LockedPlanDirection;
  predictionType: string;
  lockedAt: number;
  trigger: number;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  timeStopMinutes: number;
  maxDurationMinutes: number;
  initialSetupScore: number;
  initialPreparationScore: number;
  initialRiskScore: number;
  enteredAt?: number;
  actualEntryPrice?: number;
};

export const LOCKED_PLAN_PREFIX = "explodex:locked-plan:";
export const LOCKED_PLANS_EVENT = "explodex:locked-plans-changed";

function normalizeSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  return upper.endsWith("USDT") ? upper : `${upper}USDT`;
}

export function lockedPlanKey(symbol: string) {
  return `${LOCKED_PLAN_PREFIX}${normalizeSymbol(symbol)}`;
}

export function readLockedPlan(symbol: string): LockedPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lockedPlanKey(symbol));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockedPlan;
    return parsed?.symbol ? parsed : null;
  } catch {
    return null;
  }
}

export function readLockedPlans(): LockedPlan[] {
  if (typeof window === "undefined") return [];
  const plans: LockedPlan[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(LOCKED_PLAN_PREFIX)) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as LockedPlan;
        if (parsed?.symbol) plans.push(parsed);
      } catch {}
    }
  } catch {}
  return plans.sort((a, b) => (b.enteredAt ?? b.lockedAt) - (a.enteredAt ?? a.lockedAt));
}

export function writeLockedPlan(plan: LockedPlan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lockedPlanKey(plan.symbol), JSON.stringify(plan));
    window.dispatchEvent(new CustomEvent(LOCKED_PLANS_EVENT, { detail: { symbol: plan.symbol, action: "write" } }));
  } catch {}
}

export function removeLockedPlan(symbol: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lockedPlanKey(symbol));
    window.dispatchEvent(new CustomEvent(LOCKED_PLANS_EVENT, { detail: { symbol: normalizeSymbol(symbol), action: "remove" } }));
  } catch {}
}
