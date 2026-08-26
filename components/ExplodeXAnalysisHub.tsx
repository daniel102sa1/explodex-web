"use client";

import { useState } from "react";
import { Activity, Brain, ChevronDown, ChevronUp, ShieldCheck, Target } from "lucide-react";
import ContextEnginePanel from "@/components/ContextEnginePanel";
import EntryShieldX from "@/components/EntryShieldX";
import ExplodeXMentor from "@/components/ExplodeXMentor";
import LiquidationCascadePanel from "@/components/LiquidationCascadePanel";
import ManualTradeMirror from "@/components/ManualTradeMirror";
import MomentumDecayEngine from "@/components/MomentumDecayEngine";
import MultiTimeframeThesisPanel from "@/components/MultiTimeframeThesisPanel";
import PositionSizingPanel from "@/components/PositionSizingPanel";
import PostEntryWatchdog from "@/components/PostEntryWatchdog";
import ProgressiveThesisMonitor from "@/components/ProgressiveThesisMonitor";
import RecoveryReclaimEngine from "@/components/RecoveryReclaimEngine";
import RiskGuardPanel from "@/components/RiskGuardPanel";
import ShadowOutcomeModelPanel from "@/components/ShadowOutcomeModelPanel";
import TemporalPathEngine from "@/components/TemporalPathEngine";
import TradeSafetyCoach from "@/components/TradeSafetyCoach";
import TraderConfidenceEngine from "@/components/TraderConfidenceEngine";
import TraderReadPanel from "@/components/TraderReadPanel";
import TrapDetectorX from "@/components/TrapDetectorX";
import VerdictLearningLab from "@/components/VerdictLearningLab";

type Group = "ENTRY" | "RISK" | "POST" | "LEARNING";

export default function ExplodeXAnalysisHub({ symbol }: { symbol: string }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group>("ENTRY");

  return <section className="mx-auto mt-5 max-w-[1500px] px-4 pb-8">
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 shadow-2xl shadow-black/20">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <div>
          <div className="text-xs font-black uppercase tracking-[.14em] text-slate-400">ExplodeX Analysis Hub</div>
          <div className="mt-1 text-lg font-black text-white">Análisis avanzado · todo ordenado en un solo lugar</div>
          <div className="mt-1 text-[11px] text-slate-500">No necesitas abrir esto para decidir. El VERDICT de arriba sigue siendo la salida principal.</div>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300">{open ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</div>
      </button>

      {open && <div className="border-t border-slate-800">
        <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tab active={group === "ENTRY"} icon={<Target size={15}/>} title="1. Entrada" text="Contexto, liquidaciones, trampas, momentum, timing y confianza" onClick={() => setGroup("ENTRY")} />
          <Tab active={group === "RISK"} icon={<ShieldCheck size={15}/>} title="2. Riesgo" text="Sizing, stop, R:R, estructura y tesis multi-timeframe" onClick={() => setGroup("RISK")} />
          <Tab active={group === "POST"} icon={<Activity size={15}/>} title="3. Post-entrada" text="Watchdog, reclaim, deterioro y gestión" onClick={() => setGroup("POST")} />
          <Tab active={group === "LEARNING"} icon={<Brain size={15}/>} title="4. Aprendizaje" text="Memoria 24/7, calibración y modelo TP1 vs STOP" onClick={() => setGroup("LEARNING")} />
        </div>

        <div className="border-t border-slate-800 pb-4">
          {group === "ENTRY" && <><ContextEnginePanel symbol={symbol} /><LiquidationCascadePanel symbol={symbol} /><TemporalPathEngine symbol={symbol} /><TrapDetectorX symbol={symbol} /><MomentumDecayEngine symbol={symbol} /><EntryShieldX symbol={symbol} /><TraderConfidenceEngine symbol={symbol} /></>}
          {group === "RISK" && <><PositionSizingPanel symbol={symbol} /><RiskGuardPanel symbol={symbol} /><MultiTimeframeThesisPanel symbol={symbol} /><TradeSafetyCoach symbol={symbol} /><TraderReadPanel symbol={symbol} /></>}
          {group === "POST" && <><PostEntryWatchdog symbol={symbol} /><RecoveryReclaimEngine symbol={symbol} /><ProgressiveThesisMonitor symbol={symbol} /><ExplodeXMentor symbol={symbol} /><ManualTradeMirror symbol={symbol} /></>}
          {group === "LEARNING" && <><VerdictLearningLab symbol={symbol} /><ShadowOutcomeModelPanel /></>}
        </div>
      </div>}
    </div>
  </section>;
}

function Tab({ active, icon, title, text, onClick }: { active: boolean; icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-2xl border p-4 text-left transition ${active ? "border-cyan-500/30 bg-cyan-500/[.06]" : "border-slate-800 bg-slate-950/50 hover:border-slate-700"}`}><div className={`flex items-center gap-2 text-xs font-black ${active ? "text-cyan-200" : "text-slate-300"}`}>{icon}{title}</div><div className="mt-1 text-[10px] leading-4 text-slate-500">{text}</div></button>;
}
