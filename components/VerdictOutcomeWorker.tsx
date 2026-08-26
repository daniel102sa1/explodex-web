"use client";

import { useEffect, useRef } from "react";
import { getCandles, type Candle } from "@/lib/api";
import { readVerdictJournal, updateVerdictJournalEntry, type VerdictJournalEntry } from "@/lib/verdictJournal";

function intervalForAge(ageHours: number) {
  if (ageHours <= 24) return "5m";
  if (ageHours <= 72) return "15m";
  return null;
}

function evaluate(entry: VerdictJournalEntry, candles: Candle[]) {
  const rows = candles.filter((c) => c.time >= entry.at);
  if (!rows.length) return null;

  let best = entry.price;
  let worst = entry.price;

  for (const c of rows) {
    const hitTp = entry.direction === "LONG" ? c.high >= entry.tp1 : c.low <= entry.tp1;
    const hitStop = entry.direction === "LONG" ? c.low <= entry.stop : c.high >= entry.stop;

    if (entry.direction === "LONG") {
      best = Math.max(best, c.high);
      worst = Math.min(worst, c.low);
    } else {
      best = Math.min(best, c.low);
      worst = Math.max(worst, c.high);
    }

    const mfePct = entry.direction === "LONG"
      ? (best - entry.price) / entry.price * 100
      : (entry.price - best) / entry.price * 100;
    const maePct = entry.direction === "LONG"
      ? (entry.price - worst) / entry.price * 100
      : (worst - entry.price) / entry.price * 100;

    if (hitTp && hitStop) {
      return { outcome: "AMBIGUOUS" as const, evaluatedAt: Date.now(), mfePct, maePct };
    }
    if (hitTp) {
      return {
        outcome: "TP1_FIRST" as const,
        evaluatedAt: Date.now(),
        tp1At: c.time,
        minutesToOutcome: (c.time - entry.at) / 60000,
        mfePct,
        maePct,
      };
    }
    if (hitStop) {
      return {
        outcome: "STOP_FIRST" as const,
        evaluatedAt: Date.now(),
        stopAt: c.time,
        minutesToOutcome: (c.time - entry.at) / 60000,
        mfePct,
        maePct,
      };
    }
  }

  return null;
}

export default function VerdictOutcomeWorker() {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (running.current) return;
      running.current = true;
      try {
        const unresolved = readVerdictJournal()
          .filter((row) => row.verdict === "ENTER" && !row.outcome)
          .filter((row) => Date.now() - row.at >= 5 * 60_000)
          .slice(-30);
        if (!unresolved.length) return;

        const bySymbol = new Map<string, VerdictJournalEntry[]>();
        for (const row of unresolved) {
          const group = bySymbol.get(row.symbol) ?? [];
          group.push(row);
          bySymbol.set(row.symbol, group);
        }

        for (const [symbol, group] of bySymbol) {
          const oldest = Math.min(...group.map((x) => x.at));
          const interval = intervalForAge((Date.now() - oldest) / 3600_000);
          if (!interval) continue;
          const candles = await getCandles(symbol, interval, 300);
          if (cancelled) return;
          for (const entry of group) {
            const result = evaluate(entry, candles);
            if (result) updateVerdictJournalEntry(entry.id, result);
          }
        }
      } catch {}
      finally {
        running.current = false;
      }
    }

    run();
    const timer = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
