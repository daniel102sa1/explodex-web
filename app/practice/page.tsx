import { FlaskConical, GraduationCap, ShieldCheck } from "lucide-react";
import PracticeTradingTerminal from "@/components/PracticeTradingTerminal";

export const dynamic = "force-dynamic";

export default function PracticePage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1800px] px-3 py-3 sm:px-4 lg:px-5">
      <header className="mb-3 flex flex-col gap-3 border-b border-slate-800/70 pb-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">
            <GraduationCap size={14}/> Laboratorio de práctica
          </div>
          <h1 className="mt-1 text-2xl font-black text-white">ExplodeX Trading Lab</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Gráfico tipo TradingView, indicadores, patrones, MARKET/LIMIT, apalancamiento, SL/TP1/TP2/TP3, BE y cuenta ficticia aislada de $1,000 para practicar sin órdenes reales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[.05] px-3 py-2 text-[10px] font-bold text-emerald-200">
            <ShieldCheck size={13}/> 100% práctica · dinero ficticio
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/[.05] px-3 py-2 text-[10px] font-bold text-violet-200">
            <FlaskConical size={13}/> Dibuja → confirma → ejecuta → gestiona → revisa métricas
          </span>
        </div>
      </header>
      <PracticeTradingTerminal/>
    </main>
  );
}
