import ExplodeXAnalysisHub from "@/components/ExplodeXAnalysisHub";
import ExplodeXVerdict from "@/components/ExplodeXVerdict";
import ForcedPathForecastPanel from "@/components/ForcedPathForecastPanel";
import HeartDecisionBanner from "@/components/HeartDecisionBanner";
import LockedPlanManager from "@/components/LockedPlanManager";
import MarketImpactPanel from "@/components/MarketImpactPanel";
import PredictionStackV5Panel from "@/components/PredictionStackV5Panel";
import PreMoveFingerprintPanel from "@/components/PreMoveFingerprintPanel";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";
import VerdictOutcomeWorker from "@/components/VerdictOutcomeWorker";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <VerdictOutcomeWorker />
      <HeartDecisionBanner symbol={symbol} />
      <ExplodeXVerdict symbol={symbol} />
      <PredictionStackV5Panel symbol={symbol} />
      <PreMoveFingerprintPanel symbol={symbol} />
      <MarketImpactPanel symbol={symbol} />
      <ForcedPathForecastPanel symbol={symbol} />
      <ProfessionalCoinWorkspace symbol={symbol} />
      <LockedPlanManager symbol={symbol} />
      <ExplodeXAnalysisHub symbol={symbol} />
    </>
  );
}
