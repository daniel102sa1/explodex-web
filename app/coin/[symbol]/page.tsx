import AdvancedCoinDetails from "@/components/AdvancedCoinDetails";
import HeartDecisionBanner from "@/components/HeartDecisionBanner";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";
import VerdictOutcomeWorker from "@/components/VerdictOutcomeWorker";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <VerdictOutcomeWorker />
      <HeartDecisionBanner symbol={symbol} />
      <ProfessionalCoinWorkspace symbol={symbol} />
      <AdvancedCoinDetails symbol={symbol} />
    </>
  );
}
