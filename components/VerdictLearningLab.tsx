"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Brain, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import {
  getVerdictProfileStats,
  readVerdictJournal,
  type VerdictJournalEntry,
} from "@/lib/verdictJournal";

export default function VerdictLearningLab({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [rows, setRows] = useState<VerdictJournalEntry[]>([]);

  useEffect(() => {
    const refresh = () => setRows(readVerdictJournal());
    refresh();
    window.addEventListener("explodex:verdict-journal-changed", refresh as EventListener);
    return () => window.removeEventListener("explodex:verdict-journal-changed", refresh as EventListener);
  }, []);

  const stats = useMemo(() => {
    const resolved = rows.filter((row) => row.verdict === "ENTER" && (row.outcome === "TP1_FIRST" || row.outcome === "STOP_FIRST"));
    const wins = resolved.filter((row) => row.outcome === "TP1_FIRST").length;
    const lock5 = getVerdictProfileStats({ lockCount: 5 });
    const lock6 = getVerdictProfileStats({ lockCount: 6 });
    const burst = getVerdictProfileStats({ burst: true });
    const fast = getVerdictProfileStats({ fastTrack: true });
    const currentSymbol = resolved.filter((row) => row.symbol === safeSymbol);
    const currentWins = currentSymbol.filter((row) => row.outcome === "TP1_FIRST").length;
    const ambiguous = rows.filter((row) => row.verdict === "ENTER" && row.outcome === "AMBIGUOUS").length;
    const unresolved = rows.filter((row) => row.verdict === "ENTER" && !row.outcome).length;
    return {
      total: resolved.length,
      wins,
      winRate: resolved.length ? wins / resolved.length * 100 : null,
      lock5,
      lock6,
      burst,
      fast,
      currentSymbolN: currentSymbol.length,
      currentSymbolRate: currentSymbol.length ? currentWins / currentSymbol.length * 100 : null,
      ambiguous,
      unresolved,
    };
  }, [rows, safeSymbol]);

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className="rounded-3xl border border-violet-500/15 bg-violet-500/[.018] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-violet-300"><Brain size={16}/> Verdict Learning Lab</div>
          <div className="mt-2 text-xl font-black text-white">¿Qué versión del VERDICT funciona de verdad?</div>
          <div className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">El worker silencioso etiqueta ENTER como TP1 primero, STOP primero o ambiguo usando velas posteriores. Estas tasas son históricas, no una promesa del próximo trade.</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-[10px] text-slate-400">{stats.unresolved} pendientes · {stats.ambiguous} ambiguos</div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Global resuelto" value={stats.winRate == null ? "—" : `${stats.winRate.toFixed(1)}%`} sub={`${stats.total} casos`} />
        <Card label="LOCK 5/6" value={rate(stats.lock5.winRatePct)} sub={`${stats.lock5.sample} casos · ${stats.lock5.status}`} />
        <Card label="LOCK 6/6" value={rate(stats.lock6.winRatePct)} sub={`${stats.lock6.sample} casos · ${stats.lock6.status}`} />
        <Card label="⚡ BURST" value={rate(stats.burst.winRatePct)} sub={`${stats.burst.sample} casos · ${stats.burst.status}`} />
        <Card label="FAST TRACK" value={rate(stats.fast.winRatePct)} sub={`${stats.fast.sample} casos · ${stats.fast.status}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
          <div className="flex items-center gap-2 text-xs font-black text-white"><BarChart3 size={14} className="text-cyan-300"/> Esta moneda</div>
          <div className="mt-2 font-mono text-2xl font-black text-white">{stats.currentSymbolRate == null ? "—" : `${stats.currentSymbolRate.toFixed(1)}%`}</div>
          <div className="mt-1 text-[10px] text-slate-500">{stats.currentSymbolN} ENTER resueltos para {safeSymbol}. Con muestra pequeña no se usa para bloquear nada.</div>
        </div>
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[.025] p-4">
          <div className="flex items-center gap-2 text-xs font-black text-amber-200"><ShieldAlert size={14}/> Regla de aprendizaje</div>
          <div className="mt-2 text-xs leading-5 text-slate-400">El historial solo puede actuar como <b className="text-white">veto suave</b> con al menos 30 resultados comparables. Nunca crea una entrada, nunca aumenta el apalancamiento y nunca convierte un score en certeza.</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500"><Clock3 size={12}/><span>Las señales sin resolver y las velas ambiguas quedan fuera del win rate.</span>{stats.total >= 30 && <span className="ml-auto inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 size={12}/>Ya existe muestra global útil</span>}</div>
    </div>
  </section>;
}

function rate(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-2 font-mono text-xl font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-500">{sub}</div></div>;
}
