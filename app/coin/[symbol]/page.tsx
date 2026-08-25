import ExplodeXMentor from "@/components/ExplodeXMentor";
import ManualTradeMirror from "@/components/ManualTradeMirror";
import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";
import TradeSafetyCoach from "@/components/TradeSafetyCoach";
import TraderReadPanel from "@/components/TraderReadPanel";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <>
      <ProfessionalCoinWorkspace symbol={symbol} />
      <TradeSafetyCoach symbol={symbol} />
      <TraderReadPanel symbol={symbol} />
      <ExplodeXMentor symbol={symbol} />
      <ManualTradeMirror symbol={symbol} />
    </>
  );
}
