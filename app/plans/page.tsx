import LockedPlansDashboard from "@/components/LockedPlansDashboard";
import PlanUrgencyBoard from "@/components/PlanUrgencyBoard";

export const dynamic = "force-dynamic";

export default function PlansPage() {
  return (
    <>
      <PlanUrgencyBoard />
      <LockedPlansDashboard />
    </>
  );
}
