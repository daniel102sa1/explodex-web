import Link from "next/link";
import { ArrowLeft, Newspaper, ShieldAlert, Database, Activity, Gauge, Waves, Users, BookOpen, RadioTower, Network, ShieldCheck, TriangleAlert } from "lucide-react";
import PriceChart from "@/components/PriceChart";
import { getCandles, getLiveAnalysis, getNews, getPrice } from "@/lib/api";

export const dynamic = "force-dynamic";

function fmt(value?: number | null, digits = 8) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumSignificantDigits: digits });
}

function money(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function pct(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function yesNo(value?: boolean) {
  return value ? "Disponible" : "No disponible";
}

function labelReason(reason: string) {
  return reason.replaceAll("_", " ");
}

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();

  const [analysis, price, news, candles5m, candles15m, candles1h, candles4h] = await Promise.all([
    getLiveAnalysis(symbol).catch(() => null),
    getPrice(symbol).catch(() => null),
    getNews(symbol).catch(() => null),
    getCandles(symbol, "5m", 96).catch(() => []),
    getCandles(symbol, "15m", 96).catch(() => []),
    getCandles(symbol, "1h", 96).catch(() => []),
    getCandles(symbol, "4h", 96).catch(() => []),
  ]);

  const livePrice = price ? Number(price.price) : analysis?.current_price;
  const metrics = analysis?.metrics ?? {};
  const availability = analysis?.availability ?? {};
  const cg = analysis?.coinglass ?? {};
  const cgOi = cg.open_interest ?? {};
  const cgTaker = cg.taker ?? {};
  const cgFunding = cg.funding ?? {};
  const cgLiq = cg.liquidations ?? {};
  const limited = analysis?.data_quality === "LIMITED";
  const cgConfirmations: string[] = metrics.coinglass_confirmations ?? [];
  const cgConflicts: string[] = metrics.coinglass_conflicts ?? [];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/scanner" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"><ArrowLeft size={16}/> Volver al scanner</Link>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-4xl font-black text-white">{symbol}</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${analysis?.source === "BINANCE_FUTURES" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-200"}`}>
              {analysis?.source ?? price?.source ?? "SIN FUENTE"}
            </span>
            {analysis && <span className={`rounded-full border px-3 py-1 text-xs font-black ${limited ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"}`}>{analysis.data_quality}</span>}
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${cg.available ? "border-violet-500/30 bg-violet-500/10 text-violet-200" : "border-slate-700 bg-slate-900 text-slate-400"}`}>
              CoinGlass {cg.available ? "CONECTADO" : "SIN DATOS"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">Análisis vivo multi-timeframe, flujo, derivados y confirmación multi-exchange.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/65 px-5 py-4">
          <div className="text-xs uppercase tracking-[0.12em] text-slate-500">Precio actual</div>
          <div className="mt-1 text-3xl font-black text-white">{fmt(livePrice)}</div>
        </div>
      </div>

      {analysis?.provider_warning && (
        <div className="mt-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm text-amber-100">
          Binance principal no está disponible desde el servidor. Se está usando {analysis.source}. Las métricas que no estén disponibles no se inventan.
        </div>
      )}

      {analysis ? (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <Stat label="Dirección" value={analysis.direction} />
            <Stat label="Estado" value={analysis.state} />
            <Stat label="Score final" value={`${analysis.setup_score.toFixed(1)}/100`} />
            <Stat label="Score local" value={`${Number(analysis.local_setup_score_before_coinglass ?? analysis.setup_score).toFixed(1)}/100`} />
            <Stat label="LONG / SHORT" value={`${analysis.long_score.toFixed(1)} / ${analysis.short_score.toFixed(1)}`} />
            <Stat label="Riesgo final" value={`${analysis.risk_score.toFixed(1)}/100`} />
          </section>

          <section className="mt-6 rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-violet-200"><Network size={19}/><h2 className="text-xl font-black text-white">Confirmación CoinGlass</h2></div>
              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Multi-exchange · no genera trades por sí sola</div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<Database size={17}/>} title="OI agregado" value={cgOi.available ? money(cgOi.open_interest_usd) : "No disponible"} sub={`5m ${pct(cgOi.change_5m_pct)} · 15m ${pct(cgOi.change_15m_pct)} · 1h ${pct(cgOi.change_1h_pct)}`} />
              <MetricCard icon={<Activity size={17}/>} title="Taker agregado" value={cgTaker.available ? `${fmt(cgTaker.buy_sell_ratio, 5)}x` : "No disponible"} sub={cgTaker.available ? `Buy ${pct(cgTaker.buy_ratio_pct)} · Sell ${pct(cgTaker.sell_ratio_pct)}` : "Sin confirmación"} />
              <MetricCard icon={<Waves size={17}/>} title="Funding agregado" value={cgFunding.available ? pct(cgFunding.median_rate_pct) : "No disponible"} sub={cgFunding.available ? `min ${pct(cgFunding.min_rate_pct)} · max ${pct(cgFunding.max_rate_pct)}` : "Sin datos"} />
              <MetricCard icon={<Gauge size={17}/>} title="Liquidaciones" value={cgLiq.available ? money(cgLiq.total_1h) : "No disponible"} sub={cgLiq.available ? `Long ${money(cgLiq.long_1h)} · Short ${money(cgLiq.short_1h)}` : "Sin datos"} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-300"><ShieldCheck size={16}/> Confirmaciones</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cgConfirmations.length ? cgConfirmations.map((item) => <span key={item} className="rounded-full border border-emerald-500/25 px-3 py-1 text-xs text-emerald-200">{labelReason(item)}</span>) : <span className="text-sm text-slate-500">Sin confirmaciones CoinGlass suficientes.</span>}
                </div>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                <div className="flex items-center gap-2 text-sm font-black text-rose-300"><TriangleAlert size={16}/> Conflictos / vetos</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cgConflicts.length ? cgConflicts.map((item) => <span key={item} className="rounded-full border border-rose-500/25 px-3 py-1 text-xs text-rose-200">{labelReason(item)}</span>) : <span className="text-sm text-slate-500">No hay conflictos fuertes registrados.</span>}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Ajuste score CoinGlass" value={`${Number(metrics.coinglass_score_adjustment ?? 0) >= 0 ? "+" : ""}${Number(metrics.coinglass_score_adjustment ?? 0).toFixed(1)}`} />
              <Mini label="Ajuste riesgo CoinGlass" value={`+${Number(metrics.coinglass_risk_adjustment ?? 0).toFixed(1)}`} />
              <Mini label="OI 15m CoinGlass" value={pct(metrics.coinglass_oi_change_15m_pct)} />
              <Mini label="Taker CoinGlass" value={`${fmt(metrics.coinglass_taker_buy_sell_ratio, 5)}x`} />
            </div>
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={<Database size={17}/>} title="Open Interest local" value={availability.open_interest_current ? fmt(analysis.current_open_interest) : "No disponible"} sub={availability.open_interest_history ? `Δ OI ${pct(metrics.oi_change_pct)}` : "Histórico OI no disponible"} />
            <MetricCard icon={<Activity size={17}/>} title="Taker local" value={availability.taker_ratio ? fmt(metrics.taker_avg_3, 5) : "No disponible"} sub={`Último ${fmt(metrics.taker_latest, 5)}`} />
            <MetricCard icon={<Gauge size={17}/>} title="Volumen relativo" value={`${fmt(metrics.relative_volume, 5)}x`} sub={`Aceleración ${fmt(metrics.volume_acceleration, 5)}x`} />
            <MetricCard icon={<Waves size={17}/>} title="Funding local" value={availability.funding ? pct(Number(metrics.funding_rate ?? 0) * 100) : "No disponible"} sub={`ATR ${pct(metrics.atr_pct)}`} />
            <MetricCard icon={<BookOpen size={17}/>} title="Order Book" value={availability.order_book ? pct(Number(metrics.order_book_imbalance ?? 0) * 100) : "No disponible"} sub={`Spread ${fmt(metrics.order_book_spread_bps, 5)} bps`} />
            <MetricCard icon={<RadioTower size={17}/>} title="Flujo futuros" value={availability.futures_flow ? pct(Number(metrics.futures_delta_ratio ?? 0) * 100) : "No disponible"} sub={`B/S ${fmt(metrics.futures_buy_sell_ratio, 5)}`} />
            <MetricCard icon={<RadioTower size={17}/>} title="Flujo spot" value={availability.spot_flow ? pct(Number(metrics.spot_delta_ratio ?? 0) * 100) : "No disponible"} sub={`B/S ${fmt(metrics.spot_buy_sell_ratio, 5)}`} />
            <MetricCard icon={<Users size={17}/>} title="Top traders" value={availability.top_trader_positions ? fmt(metrics.top_position_long_short_ratio, 5) : "No disponible"} sub={availability.global_long_short ? `Global L/S ${fmt(metrics.global_long_short_ratio, 5)}` : "Global L/S no disponible"} />
          </section>

          <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
            <h2 className="text-lg font-black text-white">Confirmaciones del setup local</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini label="Confirmaciones" value={`${metrics.confirmations ?? 0}/7`} />
              <Mini label="Tendencia 15m" value={metrics.trend_15m ?? "—"} />
              <Mini label="Tendencia 1h" value={metrics.trend_1h ?? "—"} />
              <Mini label="BTC" value={metrics.btc_trend ?? "—"} />
            </div>
            {!!metrics.reject_reasons?.length && (
              <div className="mt-4 flex flex-wrap gap-2">
                {metrics.reject_reasons.map((reason: string) => <span key={reason} className="rounded-full border border-amber-500/25 bg-amber-500/5 px-3 py-1 text-xs text-amber-200">{labelReason(reason)}</span>)}
              </div>
            )}
          </section>

          <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
            <h2 className="text-lg font-black text-white">Disponibilidad de métricas</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(availability).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="text-xs text-slate-500">{key.replaceAll("_", " ")}</div>
                  <div className={`mt-1 text-sm font-bold ${value ? "text-emerald-300" : "text-amber-200"}`}>{yesNo(Boolean(value))}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-200">No se pudo cargar el análisis vivo de esta moneda.</div>
      )}

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <ChartBlock title="5 minutos" candles={candles5m}/>
        <ChartBlock title="15 minutos" candles={candles15m}/>
        <ChartBlock title="1 hora" candles={candles1h}/>
        <ChartBlock title="4 horas" candles={candles4h}/>
      </section>

      {analysis && <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-300"/><h2 className="text-xl font-black text-white">Mapa del setup</h2></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Mini label="Entrada baja" value={fmt(analysis.entry_low)}/>
          <Mini label="Entrada alta" value={fmt(analysis.entry_high)}/>
          <Mini label="Stop" value={fmt(analysis.stop_loss)}/>
          <Mini label="TP1" value={fmt(analysis.tp1)}/>
          <Mini label="TP2" value={fmt(analysis.tp2)}/>
          <Mini label="TP3" value={fmt(analysis.tp3)}/>
        </div>
        <div className="mt-4 text-sm text-slate-400">Movimiento estimado: {analysis.expected_move_min_pct}% – {analysis.expected_move_max_pct}% · Duración estimada: {analysis.expected_duration_min_minutes}–{analysis.expected_duration_max_minutes} min.</div>
        <div className="mt-2 text-xs text-slate-500">El score representa calidad del setup; no es una probabilidad garantizada de ganancia.</div>
      </section>}

      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <div className="flex items-center gap-2"><Newspaper size={18} className="text-fuchsia-300"/><h2 className="text-xl font-black text-white">Noticias</h2></div>
        <div className="mt-2 text-sm text-slate-400">Sentimiento: {news?.sentiment ?? "Sin datos"}</div>
        <div className="mt-4 space-y-3">
          {(news?.headlines ?? []).slice(0, 6).map((headline: any, index: number) => <div key={index} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><div className="text-sm font-semibold text-slate-100">{headline.title}</div><div className="mt-1 text-xs text-slate-500">{headline.source ?? "Fuente"}</div></div>)}
          {!(news?.headlines ?? []).length && <div className="text-sm text-slate-500">Sin titulares relevantes.</div>}
        </div>
      </section>
    </main>
  );
}

function ChartBlock({ title, candles }: { title: string; candles: any[] }) { return <div><div className="mb-2 text-sm font-bold text-slate-300">{title}</div><PriceChart candles={candles}/></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-mono text-sm font-bold text-slate-100">{value}</div></div>; }
function MetricCard({ icon, title, value, sub }: { icon: React.ReactNode; title: string; value: string; sub: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-slate-500">{icon}{title}</div><div className="mt-3 text-2xl font-black text-white">{value}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></div>; }
