import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Filter, Search } from "lucide-react";
import { getOpportunities, type Opportunity } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function ScannerPage() {
  const data = await getOpportunities().catch(() => null);
  const groups = data?.groups ?? {};
  const items: Opportunity[] = [
    ...(groups.elite ?? []),
    ...(groups.very_strong ?? []),
    ...(groups.strong ?? []),
    ...(groups.watch ?? []),
    ...(groups.no_trade ?? []),
  ];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400"><Search size={16}/> Scanner completo</div>
          <h1 className="mt-2 text-3xl font-black text-white">Ranking del mercado</h1>
          <p className="mt-2 text-sm text-slate-400">Ordenado por score contextual, riesgo y estado actual.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400"><Filter size={15}/> {items.length} señales visibles</div>
      </div>

      {!data ? (
        <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 text-rose-200">No se pudo cargar el scanner.</div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/60">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-4 py-3">Moneda</th><th className="px-4 py-3">Dirección</th><th className="px-4 py-3">Nivel</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Riesgo</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Potencial</th><th className="px-4 py-3">Mercado</th></tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isLong = item.direction === "LONG";
                  const score = item.contextual_score ?? item.setup_score;
                  const risk = item.contextual_risk_score ?? item.risk_score;
                  return (
                    <tr key={item.id} className="border-b border-slate-900 last:border-0 hover:bg-slate-900/50">
                      <td className="px-4 py-4 font-black text-white"><Link href={`/?symbol=${item.symbol}`}>{item.symbol}</Link></td>
                      <td className={`px-4 py-4 font-bold ${isLong ? "text-emerald-400" : "text-rose-400"}`}><span className="inline-flex items-center gap-1">{isLong ? <ArrowUpRight size={15}/> : <ArrowDownRight size={15}/>} {item.direction}</span></td>
                      <td className="px-4 py-4 text-slate-200">{item.label ?? "—"} {item.tier ?? ""}</td>
                      <td className="px-4 py-4 font-mono font-bold text-white">{score.toFixed(1)}</td>
                      <td className="px-4 py-4 font-mono text-slate-300">{risk.toFixed(1)}</td>
                      <td className="px-4 py-4 text-slate-300">{item.state}</td>
                      <td className="px-4 py-4 text-slate-300">{item.expected_move_min_pct ?? "—"}% – {item.expected_move_max_pct ?? "—"}%</td>
                      <td className="px-4 py-4 text-slate-400">{item.market_regime ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!items.length && <div className="p-8 text-center text-slate-500">Aún no hay señales almacenadas.</div>}
        </div>
      )}
    </main>
  );
}
