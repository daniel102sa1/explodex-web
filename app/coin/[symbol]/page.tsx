import ProfessionalCoinWorkspace from "@/components/ProfessionalCoinWorkspace";

export const dynamic = "force-dynamic";

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <ProfessionalCoinWorkspace symbol={symbol} />;
}
