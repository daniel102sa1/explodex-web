import LockedPlansDashboard from "@/components/LockedPlansDashboard";
import PlanUrgencyBoard from "@/components/PlanUrgencyBoard";
import PortfolioRiskBoard from "@/components/PortfolioRiskBoard";

export const dynamic = "force-dynamic";

export default function PlansPage() {
  return (
    <>
      <PlanUrgencyBoard />
      <PortfolioRiskBoard />
      <LockedPlansDashboard />
    </>
  );
}
