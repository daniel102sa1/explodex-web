export type VerdictJournalVerdict = "ENTER" | "WAIT" | "NO_TRADE";
export type VerdictJournalDirection = "LONG" | "SHORT";

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
  lockCount: number;
  technicalConfidence: number;
  trapRisk: number;
  decayRisk: number;
  accelerationScore: number;
  fastTrack: boolean;
  reason: string;
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
  } catch {}
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

  // Avoid writing every polling tick. Keep state changes immediately, and a
  // heartbeat at most every five minutes if nothing material changed.
  if (sameState && last && now - last.at < 5 * 60_000) return;

  const row: VerdictJournalEntry = {
    ...entry,
    id: `${entry.symbol}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
  };
  safeWrite([...rows, row]);
}

export function clearVerdictJournal() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
}
