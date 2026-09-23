import PaperTradeCenter from "@/components/PaperTradeCenter";
export const dynamic="force-dynamic";
export default function Page(){
  return <main className="mx-auto min-h-screen max-w-[1600px] px-3 py-4 sm:px-5">
    <header className="mb-4">
      <div className="text-xs font-black uppercase tracking-[.14em] text-cyan-300">ExplodeX · Panel de Trades</div>
      <h1 className="mt-1 text-3xl font-black">Historial y Operaciones</h1>
      <p className="mt-1 text-xs text-slate-500">Por defecto evalúa solo las operaciones nacidas después del arsenal nuevo; el historial anterior queda guardado y se puede consultar aparte.</p>
    </header>
    <PaperTradeCenter/>
  </main>
}
