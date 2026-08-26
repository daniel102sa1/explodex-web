import type { Candle, LiveAnalysis } from "@/lib/api";

export type VerdictDirection = "LONG" | "SHORT";

export type VerdictLocks = {
  core: boolean;
  mtf: boolean;
  flow: boolean;
  trap: boolean;
  momentum: boolean;
  entry: boolean;
};

export type VerdictFusion = {
  direction: VerdictDirection;
  locks: VerdictLocks;
  passCount: number;
  hardBlock: boolean;
  hardBlockReason?: string;
  candidateEnter: boolean;
  fastTrack: boolean;
  trapRisk: number;
  decayRisk: number;
  accelerationScore: number;
  burstDetected: boolean;
  mtfStrength: number;
  flowStrength: number;
  entryQuality: number;
  technicalConfidence: number;
  inZone: boolean;
  nearZone: boolean;
  chase: boolean;
  invalidated: boolean;
  price: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  rr1: number;
};

function clamp(value: number, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function serverFusion(analysis: LiveAnalysis): VerdictFusion | null {
  const raw = (analysis.prediction as any)?.verdict_fusion as Record<string, any> | undefined;
  if (!raw || raw.version !== "server_parity_v1" || !raw.locks) return null;

  const hardBlockReasonMap: Record<string, string> = {
    invalidation_crossed: "La tesis cruzó su invalidación.",
    risk_guard: "Risk Guard bloquea la operación.",
    direction_conflict: "Dirección principal y predictor están en conflicto.",
    data_limited: "Calidad de datos insuficiente para una entrada limpia.",
  };

  return {
    direction: raw.direction as VerdictDirection,
    locks: {
      core: Boolean(raw.locks.core),
      mtf: Boolean(raw.locks.mtf),
      flow: Boolean(raw.locks.flow),
      trap: Boolean(raw.locks.trap),
      momentum: Boolean(raw.locks.momentum),
      entry: Boolean(raw.locks.entry),
    },
    passCount: num(raw.pass_count),
    hardBlock: Boolean(raw.hard_block),
    hardBlockReason: raw.hard_block_reason ? (hardBlockReasonMap[String(raw.hard_block_reason)] ?? String(raw.hard_block_reason)) : undefined,
    candidateEnter: Boolean(raw.candidate_enter),
    fastTrack: Boolean(raw.fast_track),
    trapRisk: num(raw.trap_risk),
    decayRisk: num(raw.decay_risk),
    accelerationScore: num(raw.acceleration_score),
    burstDetected: Boolean(raw.burst_detected),
    mtfStrength: num(raw.mtf_strength),
    flowStrength: num(raw.flow_strength),
    entryQuality: num(raw.entry_quality),
    technicalConfidence: num(raw.technical_confidence),
    inZone: Boolean(raw.in_zone),
    nearZone: Boolean(raw.near_zone),
    chase: Boolean(raw.chase),
    invalidated: Boolean(raw.invalidated),
    price: num(raw.price),
    entryLow: num(raw.entry_low),
    entryHigh: num(raw.entry_high),
    stop: num(raw.stop),
    tp1: num(raw.tp1),
    rr1: num(raw.rr1),
  };
}

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const alpha = 2 / (period + 1);
  let current = values[0];
  for (let i = 1; i < values.length; i++) current = values[i] * alpha + current * (1 - alpha);
  return current;
}

function atr(candles: Candle[], period = 14) {
  if (candles.length < 2) return 0;
  const rows = candles.slice(-(period + 1));
  const values: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i];
    const p = rows[i - 1];
    values.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function relativeVolume(candles: Candle[]) {
  if (candles.length < 14) return 1;
  const prior = avg(candles.slice(-12, -6).map((x) => x.volume)) || 1;
  const recent = avg(candles.slice(-6).map((x) => x.volume));
  return recent / prior;
}

function bodyEfficiency(candles: Candle[], direction: VerdictDirection) {
  const rows = candles.slice(-5);
  return avg(rows.map((c) => {
    const range = Math.max(c.high - c.low, 1e-12);
    const body = direction === "LONG" ? c.close - c.open : c.open - c.close;
    return body / range;
  }));
}

function opposingWick(candles: Candle[], direction: VerdictDirection) {
  const rows = candles.slice(-4);
  return avg(rows.map((c) => {
    const range = Math.max(c.high - c.low, 1e-12);
    const wick = direction === "LONG"
      ? c.high - Math.max(c.open, c.close)
      : Math.min(c.open, c.close) - c.low;
    return clamp(wick / range, 0, 1);
  }));
}

function trendAligned(candles: Candle[], direction: VerdictDirection) {
  if (candles.length < 25) return false;
  const closes = candles.map((x) => x.close);
  const price = closes.at(-1) ?? 0;
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  return direction === "LONG" ? price > e9 && e9 > e21 : price < e9 && e9 < e21;
}

function breakoutTrapRisk(candles: Candle[], direction: VerdictDirection) {
  if (candles.length < 30) return 30;
  const base = candles.slice(-27, -3);
  const recent = candles.slice(-3);
  const high = Math.max(...base.map((x) => x.high));
  const low = Math.min(...base.map((x) => x.low));
  const unit = atr(candles, 14) || Math.max((recent.at(-1)?.close ?? 1) * 0.001, 1e-12);
  const latest = recent.at(-1)!;

  const brokeUp = recent.some((x) => x.high > high + unit * 0.08);
  const brokeDown = recent.some((x) => x.low < low - unit * 0.08);
  const acceptedUp = recent.slice(-2).every((x) => x.close > high);
  const acceptedDown = recent.slice(-2).every((x) => x.close < low);
  const backInsideUp = brokeUp && latest.close < high;
  const backInsideDown = brokeDown && latest.close > low;

  let risk = 15;
  if (direction === "LONG") {
    if (backInsideUp) risk += 40;
    if (brokeUp && !acceptedUp) risk += 15;
    if (brokeDown && latest.close > low) risk -= 8;
  } else {
    if (backInsideDown) risk += 40;
    if (brokeDown && !acceptedDown) risk += 15;
    if (brokeUp && latest.close < high) risk -= 8;
  }
  return clamp(risk);
}

function accelerationBurstScore(candles: Candle[], direction: VerdictDirection, flowStrength: number) {
  if (candles.length < 18) return 0;
  const side = direction === "LONG" ? 1 : -1;
  const unit = atr(candles, 14) || Math.max((candles.at(-1)?.close ?? 1) * 0.001, 1e-12);
  const recent = candles.slice(-4);
  const prior = candles.slice(-8, -4);

  const recentMove = recent.length > 1 ? (recent.at(-1)!.close - recent[0].open) * side / unit : 0;
  const priorMove = prior.length > 1 ? (prior.at(-1)!.close - prior[0].open) * side / unit : 0;
  const acceleration = recentMove - priorMove;

  const recentBody = bodyEfficiency(recent, direction);
  const priorBody = bodyEfficiency(prior, direction);
  const recentVolume = avg(recent.map((x) => x.volume));
  const priorVolume = avg(prior.map((x) => x.volume)) || 1;
  const volumeExpansion = recentVolume / priorVolume;

  let score = 0;
  if (recentMove >= 0.35) score += 22;
  else if (recentMove >= 0.18) score += 12;
  if (acceleration >= 0.20) score += 22;
  else if (acceleration >= 0.08) score += 12;
  if (volumeExpansion >= 1.35) score += 20;
  else if (volumeExpansion >= 1.10) score += 10;
  if (recentBody >= 0.28 && recentBody > priorBody + 0.08) score += 16;
  else if (recentBody >= 0.18) score += 8;
  if (flowStrength >= 65) score += 14;
  else if (flowStrength >= 55) score += 8;
  if (opposingWick(recent, direction) <= 0.22) score += 6;

  return clamp(score);
}

export function buildVerdictFusion(
  analysis: LiveAnalysis,
  m1: Candle[],
  m5: Candle[],
  m15: Candle[],
): VerdictFusion {
  const fromServer = serverFusion(analysis);
  if (fromServer) return fromServer;

  const direction = (analysis.prediction?.direction ?? analysis.direction) as VerdictDirection;
  const side = direction === "LONG" ? 1 : -1;
  const phase = String(analysis.prediction?.phase ?? "SIN_SETUP");
  const price = num(analysis.current_price, m1.at(-1)?.close ?? 0);
  const entryLow = Math.min(num(analysis.entry_low), num(analysis.entry_high));
  const entryHigh = Math.max(num(analysis.entry_low), num(analysis.entry_high));
  const stop = num(analysis.stop_loss);
  const tp1 = num(analysis.tp1);
  const invalidation = num(analysis.invalidation_price, stop);
  const riskGuardPass = analysis.ready_checks?.risk_guard_pass !== false;
  const directionMatch = analysis.ready_checks?.direction_match !== false;
  const chase = Boolean(analysis.ready_checks?.chase_risk ?? analysis.prediction?.sequence?.chase_risk);
  const dataLimited = analysis.data_quality === "LIMITED";
  const invalidated = direction === "LONG" ? price <= invalidation : price >= invalidation;
  const inZone = entryLow > 0 && entryHigh > 0 && price >= entryLow && price <= entryHigh;
  const atr1 = atr(m1, 14) || Math.max(price * 0.001, 1e-12);
  const distanceToZone = price < entryLow ? entryLow - price : price > entryHigh ? price - entryHigh : 0;
  const nearZone = distanceToZone <= atr1 * 0.35;

  const setup = num(analysis.setup_score);
  const prep = num(analysis.prediction?.preactivation_score);
  const edge = Math.abs(num(analysis.long_score) - num(analysis.short_score));
  const core = analysis.state === "READY" && phase === "ACTIVADO" && riskGuardPass && directionMatch && !dataLimited && !invalidated;

  let mtfStrength = 0;
  if (trendAligned(m5, direction)) mtfStrength += 45;
  if (trendAligned(m15, direction)) mtfStrength += 35;
  if (edge >= 12) mtfStrength += 20;
  else if (edge >= 6) mtfStrength += 12;
  mtfStrength = clamp(mtfStrength);
  const mtf = mtfStrength >= 55;

  const metrics = analysis.metrics ?? {};
  const seq = analysis.prediction?.sequence ?? {};
  const spot = num(metrics.spot_delta_ratio, num(seq.spot_delta_ratio));
  const futures = num(metrics.futures_delta_ratio, num(seq.futures_delta_ratio));
  const oi = num(metrics.oi_change_pct, num(seq.oi_change_pct));
  const takerAvailable = Boolean(analysis.coinglass?.taker?.available);
  const takerRatio = num(analysis.coinglass?.taker?.buy_sell_ratio, 1);
  const spotAvailable = Math.abs(spot) > 1e-9;
  const futuresAvailable = Math.abs(futures) > 1e-9;
  let flowStrength = 50;
  if (spotAvailable) flowStrength += spot * side > 0.03 ? 18 : spot * side < -0.03 ? -22 : 0;
  if (futuresAvailable) flowStrength += futures * side > 0.03 ? 16 : futures * side < -0.03 ? -20 : 0;
  if (oi < -0.35 && ((spotAvailable && spot * side <= 0) || (futuresAvailable && futures * side <= 0))) flowStrength -= 10;
  if (takerAvailable) {
    const aligned = direction === "LONG" ? takerRatio >= 1.02 : takerRatio <= 0.98;
    flowStrength += aligned ? 10 : -10;
  }
  flowStrength = clamp(flowStrength);
  const flow = flowStrength >= 48;

  let trapRisk = breakoutTrapRisk(m1, direction);
  const wick = opposingWick(m1, direction);
  const rvol = relativeVolume(m1);
  if (wick >= 0.35) trapRisk += 12;
  if (rvol < 0.72) trapRisk += 8;
  if (flowStrength < 38) trapRisk += 15;
  trapRisk = clamp(trapRisk);
  const trap = trapRisk < 60;

  const recent = m1.slice(-6);
  const prior = m1.slice(-12, -6);
  const moveRecent = recent.length > 1 ? (recent.at(-1)!.close - recent[0].open) * side / atr1 : 0;
  const movePrior = prior.length > 1 ? (prior.at(-1)!.close - prior[0].open) * side / atr1 : 0;
  const velocityRatio = Math.abs(movePrior) > 0.10 ? moveRecent / Math.abs(movePrior) : 1;
  const body = bodyEfficiency(m1, direction);
  const closes5 = m5.map((x) => x.close);
  const ema21_5 = ema(closes5, 21);
  const atr5 = atr(m5, 14) || atr1 * 2;
  const extensionAtr = atr5 > 0 ? Math.abs(price - ema21_5) / atr5 : 0;
  let decayRisk = 12;
  if (velocityRatio < 0.60) decayRisk += 22;
  if (rvol < 0.78) decayRisk += 14;
  if (body < 0.08) decayRisk += 12;
  if (wick >= 0.35) decayRisk += 14;
  if (extensionAtr >= 1.35) decayRisk += 18;
  if (chase) decayRisk += 20;
  decayRisk = clamp(decayRisk);

  const accelerationScore = accelerationBurstScore(m1, direction, flowStrength);
  const burstDetected = accelerationScore >= 72 && trapRisk <= 45 && decayRisk <= 55;
  if (burstDetected) decayRisk = clamp(decayRisk - 8);
  const momentum = decayRisk < 65;

  const riskUnit = Math.abs(((entryLow + entryHigh) / 2) - stop);
  const rr1 = riskUnit > 0 ? Math.abs(tp1 - ((entryLow + entryHigh) / 2)) / riskUnit : 0;
  let entryQuality = inZone ? 78 : nearZone ? 58 : 28;
  if (!chase) entryQuality += 10;
  if (rr1 >= 1.15) entryQuality += 8;
  else if (rr1 < 0.9) entryQuality -= 12;
  if (trapRisk >= 60) entryQuality -= 12;
  if (decayRisk >= 65) entryQuality -= 12;
  if (burstDetected && (inZone || nearZone)) entryQuality += 6;
  entryQuality = clamp(entryQuality);
  const entry = inZone && !chase && entryQuality >= 72;

  const locks: VerdictLocks = { core, mtf, flow, trap, momentum, entry };
  const passCount = Object.values(locks).filter(Boolean).length;

  let hardBlock = false;
  let hardBlockReason: string | undefined;
  if (invalidated) {
    hardBlock = true;
    hardBlockReason = "La tesis cruzó su invalidación.";
  } else if (!riskGuardPass) {
    hardBlock = true;
    hardBlockReason = "Risk Guard bloquea la operación.";
  } else if (!directionMatch) {
    hardBlock = true;
    hardBlockReason = "Dirección principal y predictor están en conflicto.";
  } else if (dataLimited) {
    hardBlock = true;
    hardBlockReason = "Calidad de datos insuficiente para una entrada limpia.";
  }

  const technicalConfidence = clamp(
    setup * 0.20 + prep * 0.11 + mtfStrength * 0.17 + flowStrength * 0.13 +
    (100 - trapRisk) * 0.13 + (100 - decayRisk) * 0.09 + entryQuality * 0.10 + accelerationScore * 0.07,
  );

  const candidateEnter = !hardBlock && core && entry && trap && momentum && passCount >= 5;
  const fastTrack = candidateEnter && passCount === 6 && technicalConfidence >= 84 && trapRisk <= 38 && decayRisk <= 46 && (burstDetected || accelerationScore >= 58);

  return {
    direction,
    locks,
    passCount,
    hardBlock,
    hardBlockReason,
    candidateEnter,
    fastTrack,
    trapRisk,
    decayRisk,
    accelerationScore,
    burstDetected,
    mtfStrength,
    flowStrength,
    entryQuality,
    technicalConfidence,
    inZone,
    nearZone,
    chase,
    invalidated,
    price,
    entryLow,
    entryHigh,
    stop,
    tp1,
    rr1,
  };
}
