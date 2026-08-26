import EntryShieldX from "@/components/EntryShieldX";
import ExplodeXMentor from "@/components/ExplodeXMentor";
import ExplodeXVerdict from "@/components/ExplodeXVerdict";
import LockedPlanManager from "@/components/LockedPlanManager";
import ManualTradeMirror from "@/components/ManualTradeMirror";
import MomentumDecayEngine from "@/components/MomentumDecayEngine";
import MultiTimeframeThesisPanel from "@/components/MultiTimeframeThesisPanel";
import PostEntryWatchdog from "@/components/PostEntryWatchdog";
import ProgressiveThesisMonitor from "@/components/ProgressiveThesisMonitor";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";
import RecoveryReclaimEngine from "@/components/RecoveryReclaimEngine";
import RiskGuardPanel from "@/components/RiskGuardPanel";
import TemporalPathEngine from "@/components/TemporalPathEngine";
import TradeSafetyCoach from "@/components/TradeSafetyCoach";
import TraderConfidenceEngine from "@/components/TraderConfidenceEngine";
import TraderReadPanel from "@/components/TraderReadPanel";
import TrapDetectorX from "@/components/TrapDetectorX";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <ExplodeXVerdict symbol={symbol} />
      <ProfessionalCoinWorkspace symbol={symbol} />
      <LockedPlanManager symbol={symbol} />

      <details className="mx-auto mt-5 max-w-[1500px] px-4">
        <summary className="cursor-pointer list-none rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm font-black text-slate-200 shadow-lg shadow-black/10">
          Análisis avanzado · abrir solo si quieres ver por qué
        </summary>
        <div className="pb-6">
          <PostEntryWatchdog symbol={symbol} />
          <RecoveryReclaimEngine symbol={symbol} />
          <ProgressiveThesisMonitor symbol={symbol} />
          <RiskGuardPanel symbol={symbol} />
          <TemporalPathEngine symbol={symbol} />
          <TrapDetectorX symbol={symbol} />
          <MomentumDecayEngine symbol={symbol} />
          <EntryShieldX symbol={symbol} />
          <TraderConfidenceEngine symbol={symbol} />
          <MultiTimeframeThesisPanel symbol={symbol} />
          <TradeSafetyCoach symbol={symbol} />
          <TraderReadPanel symbol={symbol} />
          <ExplodeXMentor symbol={symbol} />
          <ManualTradeMirror symbol={symbol} />
        </div>
      </details>
    </>
  );
}
