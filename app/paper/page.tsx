import { WalletCards } from "lucide-react";
import PaperLiveBoard from "@/components/PaperLiveBoard";

export const dynamic = "force-dynamic";

export default function PaperPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1500px] px-3 py-4 sm:px-5 lg:px-6">
      <header className="mb-4 border-b border-slate-800/70 pb-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-amber-300"><WalletCards size={14}/> Paper trading</div>
        <h1 className="mt-1 text-3xl font-black text-white">Validación realista del sistema</h1>
        <p className="mt-1 text-xs leading-5 text-slate-500">READY abre solo dentro del plan. El manager controla stop, TP1 → break-even, TP2, time-stop y duración máxima. No usa dinero real.</p>
      </header>
      <PaperLiveBoard />
    </main>
  );
}
