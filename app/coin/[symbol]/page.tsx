import ExplodeXMentor from "@/components/ExplodeXMentor";
import LockedPlanManager from "@/components/LockedPlanManager";
import ManualTradeMirror from "@/components/ManualTradeMirror";
import MultiTimeframeThesisPanel from "@/components/MultiTimeframeThesisPanel";
import PostEntryWatchdog from "@/components/PostEntryWatchdog";
import ProgressiveThesisMonitor from "@/components/ProgressiveThesisMonitor";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";
import RiskGuardPanel from "@/components/RiskGuardPanel";
import TemporalPathEngine from "@/components/TemporalPathEngine";
import TradeSafetyCoach from "@/components/TradeSafetyCoach";
import TraderConfidenceEngine from "@/components/TraderConfidenceEngine";
import TraderReadPanel from "@/components/TraderReadPanel";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <ProfessionalCoinWorkspace symbol={symbol} />
      <LockedPlanManager symbol={symbol} />
      <PostEntryWatchdog symbol={symbol} />
      <ProgressiveThesisMonitor symbol={symbol} />
      <RiskGuardPanel symbol={symbol} />
      <TemporalPathEngine symbol={symbol} />
      <TraderConfidenceEngine symbol={symbol} />
      <MultiTimeframeThesisPanel symbol={symbol} />
      <TradeSafetyCoach symbol={symbol} />
      <TraderReadPanel symbol={symbol} />
      <ExplodeXMentor symbol={symbol} />
      <ManualTradeMirror symbol={symbol} />
    </>
  );
}
