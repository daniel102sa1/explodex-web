import ExplodeXAnalysisHub from "@/components/ExplodeXAnalysisHub";
import ExplodeXVerdict from "@/components/ExplodeXVerdict";
import LockedPlanManager from "@/components/LockedPlanManager";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <ExplodeXVerdict symbol={symbol} />
      <ProfessionalCoinWorkspace symbol={symbol} />
      <LockedPlanManager symbol={symbol} />
      <ExplodeXAnalysisHub symbol={symbol} />
    </>
  );
}
