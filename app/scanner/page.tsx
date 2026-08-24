import { RadioTower, Zap } from "lucide-react";
import ScannerLiveBoard from "@/components/ScannerLiveBoard";

export const dynamic = "force-dynamic";

export default function ScannerPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1680px] px-3 py-4 sm:px-5 lg:px-6">
      <header className="mb-4 flex flex-col gap-3 border-b border-slate-800/70 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-400"><RadioTower size={14}/> Scanner predictivo</div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Oportunidades antes del movimiento</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Busca impulso LONG/SHORT, rebotes y rechazos antes de la expansión. WATCH/PREACTIVACIÓN no son entradas; READY exige activación previa y plan vigente.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[.05] px-3 py-2 text-[11px] font-bold text-amber-100"><Zap size={14}/> PAPER TRADING · score ≠ probabilidad garantizada</div>
      </header>
      <ScannerLiveBoard />
    </main>
  );
}
