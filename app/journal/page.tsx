import ExternalSignalJournal from "@/components/ExternalSignalJournal";
import ValidationLab from "@/components/ValidationLab";

export const dynamic = "force-dynamic";

export default function JournalPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-3 py-4 sm:px-5 lg:px-6">
      <header className="mb-4 border-b border-slate-800/70 pb-4">
        <div className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-300">ExplodeX Validation Mode</div>
        <h1 className="mt-1 text-3xl font-black text-white">Laboratorio: demostrar si el sistema funciona</h1>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">Compara qué ocurrió después de TRADE NOW, TRADE SOON, WATCHLIST y NO TRADE a 5, 15, 30, 60 y 120 minutos. No recalibra reglas hasta acumular evidencia suficiente.</p>
      </header>
      <ValidationLab />
      <div className="mt-8 border-t border-slate-800/70 pt-6">
        <ExternalSignalJournal />
      </div>
    </main>
  );
}
