import { Activity, Bitcoin, Gauge, Waves } from "lucide-react";
import { getMarketContext } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const market = await getMarketContext().catch(() => null);
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-300"><Gauge size={16}/> Estado general</div>
      <h1 className="mt-2 text-3xl font-black text-white">Contexto del mercado</h1>
      <p className="mt-2 text-sm text-slate-400">BTC, ETH, amplitud y régimen general como filtro adicional del scanner.</p>

      {!market ? <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-amber-200">El contexto de mercado no está disponible todavía.</div> : <>
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Gauge size={18}/>} label="Régimen" value={String(market.regime ?? "MIXED")} />
          <Stat icon={<Activity size={18}/>} label="Breadth positiva" value={`${Number(market.positive_breadth_pct ?? 0).toFixed(1)}%`} />
          <Stat icon={<Waves size={18}/>} label="Suben / bajan" value={`${market.positive_symbols ?? 0} / ${market.negative_symbols ?? 0}`} />
          <Stat icon={<Activity size={18}/>} label="Mov. mediano 24h" value={`${Number(market.median_24h_change_pct ?? 0).toFixed(2)}%`} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <Asset title="BTC" data={market.btc} icon={<Bitcoin size={20}/>} />
          <Asset title="ETH" data={market.eth} icon={<Activity size={20}/>} />
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
          <h2 className="text-lg font-black text-white">Ajustes del contexto</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Risk-on points" value={String(market.risk_on_points ?? 0)} />
            <Mini label="Risk-off points" value={String(market.risk_off_points ?? 0)} />
            <Mini label="Ajuste LONG" value={`${Number(market.long_score_adjustment ?? 0).toFixed(1)}`} />
            <Mini label="Ajuste SHORT" value={`${Number(market.short_score_adjustment ?? 0).toFixed(1)}`} />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Este contexto solo ajusta/prioriza señales; no genera una entrada por sí mismo.</p>
        </section>
      </>}
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs uppercase tracking-[0.12em]">{label}</span></div><div className="mt-3 text-2xl font-black text-white">{value}</div></div>; }
function Asset({ title, data, icon }: { title: string; data: any; icon: React.ReactNode }) { return <div className="rounded-3xl border border-slate-800 bg-slate-950/65 p-5"><div className="flex items-center gap-2 text-slate-300">{icon}<span className="font-black text-white">{title}</span></div><div className="mt-5 grid grid-cols-3 gap-3"><Mini label="Tendencia" value={data?.trend ?? "NEUTRAL"}/><Mini label="15m" value={`${Number(data?.change_15m_pct ?? 0).toFixed(2)}%`}/><Mini label="1h" value={`${Number(data?.change_1h_pct ?? 0).toFixed(2)}%`}/></div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold text-slate-100">{value}</div></div>; }
