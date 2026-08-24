import { RadioTower, Zap } from "lucide-react";
import LiveChartWorkbench from "@/components/LiveChartWorkbench";
import LiveMarketTerminal from "@/components/LiveMarketTerminal";

export const dynamic = "force-dynamic";

export default function TerminalPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-400">
          <RadioTower size={16} /> Terminal de mercado
        </div>
        <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Mercado vivo + predictor previo</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
          Precios y velas en tiempo real por WebSocket, más análisis de preactivación para impulso LONG/SHORT, rebote y rechazo.
          El predictor busca la preparación antes del movimiento; no garantiza que aparezca una vela grande.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
          <Zap size={15} /> PAPER TRADING: una preactivación no es una orden. READY exige activación, confirmaciones y que el precio siga dentro de la zona planificada.
        </div>
      </header>

      <LiveChartWorkbench />
      <LiveMarketTerminal />
    </main>
  );
}
