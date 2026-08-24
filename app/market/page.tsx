import { Activity, Bitcoin, Database, Gauge, RadioTower, Waves } from "lucide-react";
import { getCoinGlass, getCoinGlassStatus, getMarketContext } from "@/lib/api";

export const dynamic = "force-dynamic";

function regimeEs(value?: string) {
  switch ((value ?? "").toUpperCase()) {
    case "RISK_ON": return "MERCADO FAVORABLE";
    case "RISK_OFF": return "MERCADO DEFENSIVO";
    case "MIXED": return "MIXTO";
    default: return value ?? "MIXTO";
  }
}

function trendEs(value?: string) {
  switch ((value ?? "").toUpperCase()) {
    case "BULLISH": return "ALCISTA";
    case "BEARISH": return "BAJISTA";
    case "NEUTRAL": return "NEUTRAL";
    default: return value ?? "NEUTRAL";
  }
}

function fmtMoney(value?: number) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

function pct(value?: number) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export default async function MarketPage() {
  const [market, cgStatus, btcCg, ethCg] = await Promise.all([
    getMarketContext().catch(() => null),
    getCoinGlassStatus(false).catch(() => null),
    getCoinGlass("BTCUSDT").catch(() => null),
    getCoinGlass("ETHUSDT").catch(() => null),
  ]);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-300"><Gauge size={16}/> Estado general</div>
      <h1 className="mt-2 text-3xl font-black text-white">Contexto del mercado</h1>
      <p className="mt-2 text-sm text-slate-400">BTC, ETH, amplitud, régimen general y confirmación agregada de CoinGlass.</p>

      {!market ? <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-amber-200">El contexto de mercado no está disponible todavía.</div> : <>
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Gauge size={18}/>} label="Régimen" value={regimeEs(String(market.regime ?? "MIXED"))} />
          <Stat icon={<Activity size={18}/>} label="Mercado en positivo" value={`${Number(market.positive_breadth_pct ?? 0).toFixed(1)}%`} />
          <Stat icon={<Waves size={18}/>} label="Suben / bajan" value={`${market.positive_symbols ?? 0} / ${market.negative_symbols ?? 0}`} />
          <Stat icon={<Activity size={18}/>} label="Movimiento mediano 24h" value={`${Number(market.median_24h_change_pct ?? 0).toFixed(2)}%`} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <Asset title="BTC" data={market.btc} icon={<Bitcoin size={20}/>} />
          <Asset title="ETH" data={market.eth} icon={<Activity size={20}/>} />
        </section>

        <section className="mt-8 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-cyan-300"><Database size={18}/><h2 className="text-lg font-black">Confirmación CoinGlass</h2></div>
              <p className="mt-1 text-xs text-slate-400">Datos agregados de varios exchanges. Sirven para confirmar o rechazar setups; no generan una entrada por sí solos.</p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${cgStatus?.configured ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
              CoinGlass {cgStatus?.configured ? "CONECTADO" : "NO CONECTADO"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <CoinGlassAsset title="BTC" data={btcCg} />
            <CoinGlassAsset title="ETH" data={ethCg} />
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
          <h2 className="text-lg font-black text-white">Ajustes del contexto</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label="Puntos favorables" value={String(market.risk_on_points ?? 0)} />
            <Mini label="Puntos defensivos" value={String(market.risk_off_points ?? 0)} />
            <Mini label="Ajuste alcista (LONG)" value={`${Number(market.long_score_adjustment ?? 0).toFixed(1)}`} />
            <Mini label="Ajuste bajista (SHORT)" value={`${Number(market.short_score_adjustment ?? 0).toFixed(1)}`} />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Este contexto solo ajusta o prioriza señales; no genera una entrada por sí mismo.</p>
        </section>
      </>}
    </main>
  );
}

function CoinGlassAsset({ title, data }: { title: string; data: any }) {
  const oi = data?.open_interest ?? {};
  const taker = data?.taker ?? {};
  const funding = data?.funding ?? {};
  const liq = data?.liquidations ?? {};
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="flex items-center gap-2"><RadioTower size={16} className="text-cyan-300"/><div className="font-black text-white">{title} agregado</div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Mini label="Interés abierto total" value={oi.available ? fmtMoney(oi.open_interest_usd) : "No disponible"}/>
        <Mini label="Cambio OI 15m" value={oi.available ? pct(oi.change_15m_pct) : "No disponible"}/>
        <Mini label="Compras/Ventas agresivas" value={taker.available ? `${Number(taker.buy_sell_ratio ?? 1).toFixed(2)}x` : "No disponible"}/>
        <Mini label="Funding mediano" value={funding.available ? pct(funding.median_rate_pct) : "No disponible"}/>
        <Mini label="Liquidaciones LONG 1h" value={liq.available ? fmtMoney(liq.long_1h) : "No disponible"}/>
        <Mini label="Liquidaciones SHORT 1h" value={liq.available ? fmtMoney(liq.short_1h) : "No disponible"}/>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs uppercase tracking-[0.12em]">{label}</span></div><div className="mt-3 text-2xl font-black text-white">{value}</div></div>; }
function Asset({ title, data, icon }: { title: string; data: any; icon: React.ReactNode }) { return <div className="rounded-3xl border border-slate-800 bg-slate-950/65 p-5"><div className="flex items-center gap-2 text-slate-300">{icon}<span className="font-black text-white">{title}</span></div><div className="mt-5 grid grid-cols-3 gap-3"><Mini label="Tendencia" value={trendEs(data?.trend)}/><Mini label="15m" value={`${Number(data?.change_15m_pct ?? 0).toFixed(2)}%`}/><Mini label="1h" value={`${Number(data?.change_1h_pct ?? 0).toFixed(2)}%`}/></div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-bold text-slate-100">{value}</div></div>; }
