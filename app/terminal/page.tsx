import { RadioTower, Zap } from "lucide-react";
import LiveMarketTerminal from "@/components/LiveMarketTerminal";

export const dynamic = "force-dynamic";

export default function TerminalPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1720px] px-3 py-3 sm:px-4 lg:px-5">
      <header className="mb-3 flex flex-col gap-2 border-b border-slate-800/70 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-emerald-400"><RadioTower size={13}/> Terminal profesional</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3"><h1 className="text-2xl font-black text-white">Mercado vivo + predictor</h1><span className="text-[11px] text-slate-600">precios · velas · order book · tape · OI · CoinGlass · plan</span></div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[.045] px-3 py-2 text-[10px] font-bold text-amber-100"><Zap size={13}/> PAPER: PREACTIVACIÓN ≠ entrada · READY exige trigger</div>
      </header>
      <LiveMarketTerminal />
    </main>
  );
}
