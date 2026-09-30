import { GraduationCap, ShieldCheck } from "lucide-react";
import PracticeTradingTerminal from "@/components/PracticeTradingTerminal";

export const dynamic = "force-dynamic";

export default function PracticePage() {
  return (
    <main className="min-h-screen w-full px-2 pb-4 pt-2 sm:px-3">
      <header className="mx-auto mb-2 flex max-w-[1920px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/70 bg-[#07111d]/75 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/[.07] text-cyan-300">
            <GraduationCap size={17}/>
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-white sm:text-base">ExplodeX Trading Lab</h1>
            <p className="mt-0.5 text-[10px] text-slate-500">Analiza · dibuja · ejecuta demo · gestiona · revisa</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[.05] px-3 py-2 text-[10px] font-bold text-emerald-200">
          <ShieldCheck size={13}/> $1,000 ficticios · PAPER ONLY
        </div>
      </header>
      <div className="mx-auto max-w-[1920px]">
        <PracticeTradingTerminal/>
      </div>
    </main>
  );
}
