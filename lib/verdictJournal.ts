export type VerdictJournalVerdict = "ENTER" | "WAIT" | "NO_TRADE";
export type VerdictJournalDirection = "LONG" | "SHORT";
export type VerdictJournalOutcome = "TP1_FIRST" | "STOP_FIRST" | "AMBIGUOUS" | "UNRESOLVED";

export type VerdictJournalEntry = {
  id: string;
  at: number;
  symbol: string;
  verdict: VerdictJournalVerdict;
  direction: VerdictJournalDirection;
  price: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  rr1?: number;
  lockCount: number;
  technicalConfidence: number;
  trapRisk: number;
  decayRisk: number;
  accelerationScore: number;
  fastTrack: boolean;
  reason: string;
  outcome?: VerdictJournalOutcome;
  evaluatedAt?: number;
  tp1At?: number;
  stopAt?: number;
  minutesToOutcome?: number;
  mfePct?: number;
  maePct?: number;
};

export type VerdictProfileStats = {
  sample: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  wilsonLowPct: number | null;
  avgMfePct: number | null;
  avgMaePct: number | null;
  avgMinutes: number | null;
  status: "LEARNING" | "WEAK" | "MIXED" | "GOOD";
};

const STORAGE_KEY = "explodex:verdict-journal:v1";
const MAX_ROWS = 800;

function safeRead(): VerdictJournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ROWS) : [];
  } catch {
    return [];
  }
}

function safeWrite(rows: VerdictJournalEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
    window.dispatchEvent(new CustomEvent("explodex:verdict-journal-changed"));
  } catch {}
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function wilsonLowerBound(wins: number, total: number, z = 1.96) {
  if (total <= 0) return null;
  const p = wins / total;
  const z2 = z * z;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  const denominator = 1 + z2 / total;
  return Math.max(0, (center - margin) / denominator) * 100;
}

export function readVerdictJournal() {
  return safeRead();
}

export function appendVerdictJournal(entry: Omit<VerdictJournalEntry, "id" | "at"> & { at?: number }) {
  if (typeof window === "undefined") return;
  const now = entry.at ?? Date.now();
  const rows = safeRead();
  const last = rows.at(-1);

  const sameState = Boolean(
    last &&
    last.symbol === entry.symbol &&
    last.verdict === entry.verdict &&
    last.direction === entry.direction &&
    last.lockCount === entry.lockCount &&
    Math.abs(last.technicalConfidence - entry.technicalConfidence) < 3 &&
    Math.abs(last.accelerationScore - entry.accelerationScore) < 8,
  );

  if (sameState && last && now - last.at < 5 * 60_000) return;

  const row: VerdictJournalEntry = {
    ...entry,
    id: `${entry.symbol}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
  };
  safeWrite([...rows, row]);
}

export function updateVerdictJournalEntry(id: string, patch: Partial<VerdictJournalEntry>) {
  const rows = safeRead();
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return;
  const next = [...rows];
  next[index] = { ...next[index], ...patch };
  safeWrite(next);
}

export function getVerdictProfileStats(input: {
  lockCount?: number;
  burst?: boolean;
  fastTrack?: boolean;
  confidenceMin?: number;
  confidenceMax?: number;
  direction?: VerdictJournalDirection;
} = {}): VerdictProfileStats {
  const decided = safeRead().filter((row) => {
    if (row.verdict !== "ENTER") return false;
    if (row.outcome !== "TP1_FIRST" && row.outcome !== "STOP_FIRST") return false;
    if (input.lockCount != null && row.lockCount !== input.lockCount) return false;
    if (input.burst != null && (row.accelerationScore >= 72) !== input.burst) return false;
    if (input.fastTrack != null && row.fastTrack !== input.fastTrack) return false;
    if (input.direction && row.direction !== input.direction) return false;
    if (input.confidenceMin != null && row.technicalConfidence < input.confidenceMin) return false;
    if (input.confidenceMax != null && row.technicalConfidence > input.confidenceMax) return false;
    return true;
  });

  const wins = decided.filter((row) => row.outcome === "TP1_FIRST").length;
  const losses = decided.length - wins;
  const winRatePct = decided.length ? wins / decided.length * 100 : null;
  const wilsonLowPct = wilsonLowerBound(wins, decided.length);
  const avgMfePct = avg(decided.map((row) => row.mfePct).filter((x): x is number => Number.isFinite(x)));
  const avgMaePct = avg(decided.map((row) => row.maePct).filter((x): x is number => Number.isFinite(x)));
  const avgMinutes = avg(decided.map((row) => row.minutesToOutcome).filter((x): x is number => Number.isFinite(x)));

  let status: VerdictProfileStats["status"] = "LEARNING";
  if (decided.length >= 30) {
    if ((winRatePct ?? 0) < 48 || (wilsonLowPct ?? 0) < 35) status = "WEAK";
    else if ((winRatePct ?? 0) >= 58 && (wilsonLowPct ?? 0) >= 42) status = "GOOD";
    else status = "MIXED";
  }

  return { sample: decided.length, wins, losses, winRatePct, wilsonLowPct, avgMfePct, avgMaePct, avgMinutes, status };
}

export function clearVerdictJournal() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("explodex:verdict-journal-changed"));
  } catch {}
}
