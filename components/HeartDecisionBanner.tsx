"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ShieldAlert, TimerReset, Zap } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

function fmt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

export default function HeartDecisionBanner({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol, true);
        if (!cancelled) {
          setAnalysis(value);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el Heart");
      }
    }
    load();
    const timer = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [safeSymbol]);

  const heart = (analysis as any)?.explodex_heart ?? (analysis?.prediction as any)?.explodex_heart;
  const decision = heart?.action_decision ?? {};
  const plan = heart?.plan ?? {};
  const action = String(decision?.action ?? "ESPERAR").toUpperCase();
  const enter = Boolean(decision?.should_enter) || action === "ENTRAR_LONG" || action === "ENTRAR_SHORT";
  const retest = action === "ESPERAR_RETEST";
  const noEnter = action === "NO_ENTRAR";
  const direction = String(decision?.direction ?? heart?.direction ?? analysis?.direction ?? "").toUpperCase();

  const tone = enter
    ? "border-emerald-400/60 bg-emerald-500/[.12]"
    : noEnter
      ? "border-rose-400/45 bg-rose-500/[.08]"
      : retest
        ? "border-violet-400/45 bg-violet-500/[.08]"
        : "border-amber-400/45 bg-amber-500/[.08]";

  const title = enter
    ? `ENTRAR ${direction} AHORA`
    : noEnter
      ? "NO ENTRAR"
      : retest
        ? "NO ENTRAR AHORA · ESPERAR RETEST"
        : "ESPERAR · TODAVÍA NO ENTRAR";

  const titleClass = enter ? "text-emerald-300" : noEnter ? "text-rose-300" : retest ? "text-violet-300" : "text-amber-200";

  return (
    <section className="mx-auto max-w-[1680px] px-3 pt-4 sm:px-5 lg:px-6">
      <div className={`rounded-2xl border p-4 shadow-2xl ${tone}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">
              <Zap size={14} className={enter ? "text-emerald-300" : "text-amber-300"} />
              ExplodeX Heart · decisión principal
              {heart?.version ? <span className="text-slate-600">{String(heart.version)}</span> : null}
            </div>
            <div className={`mt-2 flex items-center gap-2 text-2xl font-black sm:text-3xl ${titleClass}`}>
              {direction === "SHORT" ? <ArrowDownRight size={28} /> : direction === "LONG" ? <ArrowUpRight size={28} /> : <ShieldAlert size={26} />}
              {error ? "HEART NO DISPONIBLE" : analysis ? title : "CALCULANDO..."}
            </div>
            <p className="mt-2 max-w-4xl text-sm text-slate-300">
              {error ?? decision?.reason ?? "ExplodeX está evaluando si la oportunidad ya es operable o todavía debe esperar."}
            </p>
          </div>

          <div className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[620px]">
            <Box label="Dirección" value={direction || "—"} />
            <Box label="Zona entrada" value={`${fmt(plan?.entry_low)} – ${fmt(plan?.entry_high)}`} />
            <Box label="Stop" value={fmt(plan?.stop_loss)} />
            <Box label="TP1" value={fmt(plan?.tp1)} />
          </div>
        </div>

        {!enter && decision?.advanced_stack_missing?.length ? (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-700/70 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            <TimerReset size={14} className="mt-0.5 shrink-0" />
            <span>Falta: {decision.advanced_stack_missing.join(" · ")}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-black text-white">{value}</div>
    </div>
  );
}
