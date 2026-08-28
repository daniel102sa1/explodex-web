import { WalletCards } from "lucide-react";
import PaperPortfolioLab from "@/components/PaperPortfolioLab";

export const dynamic = "force-dynamic";

export default function PaperPage() {
  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-3 py-4 sm:px-5 lg:px-6">
      <header className="mb-4 border-b border-slate-800/70 pb-4">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-amber-300"><WalletCards size={14}/> ExplodeX PAPER Portfolio</div>
        <h1 className="mt-1 text-3xl font-black text-white">Cuenta simulada · 1,000 USDT</h1>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">ExplodeX decide qué TRADE NOW simular, LONG o SHORT, tamaño, apalancamiento virtual y salida. Se descuentan costos simulados y se registra el resultado sin enviar ninguna orden real.</p>
      </header>
      <PaperPortfolioLab />
    </main>
  );
}
