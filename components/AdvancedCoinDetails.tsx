"use client";

import { ChevronDown, Microscope } from "lucide-react";
import ExplodeXVerdict from "@/components/ExplodeXVerdict";
import ForcedPathForecastPanel from "@/components/ForcedPathForecastPanel";
import MarketImpactPanel from "@/components/MarketImpactPanel";
import PredictionStackV5Panel from "@/components/PredictionStackV5Panel";
import PreMoveFingerprintPanel from "@/components/PreMoveFingerprintPanel";
import LockedPlanManager from "@/components/LockedPlanManager";
import ExplodeXAnalysisHub from "@/components/ExplodeXAnalysisHub";

export default function AdvancedCoinDetails({ symbol }: { symbol: string }) {
  return (
    <section className="mx-auto max-w-[1680px] px-3 pb-8 sm:px-5 lg:px-6">
      <details className="group overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/35">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-black text-slate-300 hover:bg-slate-900/45">
          <span className="flex items-center gap-2"><Microscope size={16} className="text-cyan-300"/> Ver análisis avanzado</span>
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-600">Stack · fingerprint · impacto · path <ChevronDown size={16} className="transition group-open:rotate-180"/></span>
        </summary>
        <div className="border-t border-slate-800/80 py-3">
          <ExplodeXVerdict symbol={symbol} />
          <PredictionStackV5Panel symbol={symbol} />
          <PreMoveFingerprintPanel symbol={symbol} />
          <MarketImpactPanel symbol={symbol} />
          <ForcedPathForecastPanel symbol={symbol} />
          <LockedPlanManager symbol={symbol} />
          <ExplodeXAnalysisHub symbol={symbol} />
        </div>
      </details>
    </section>
  );
}
