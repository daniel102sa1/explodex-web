import Link from "next/link";
import { ArrowLeft, Newspaper, ShieldAlert } from "lucide-react";
import PriceChart from "@/components/PriceChart";
import { getCandles, getNews, getOpportunities, getPrice, type Opportunity } from "@/lib/api";

export const dynamic = "force-dynamic";

function fmt(value?: number | null) {
  if (value == null) return "—";
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function findOpportunity(all: Awaited<ReturnType<typeof getOpportunities>>, symbol: string): Opportunity | null {
  const groups = all.groups ?? {};
  const items = [
    ...(groups.elite ?? []),
    ...(groups.very_strong ?? []),
    ...(groups.strong ?? []),
    ...(groups.watch ?? []),
    ...(groups.no_trade ?? []),
  ];
  return items.find((item) => item.symbol === symbol) ?? null;
}

export default async function CoinPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = raw.toUpperCase();
  const [opps, price, news, candles5m, candles15m, candles1h, candles4h] = await Promise.all([
    getOpportunities().catch(() => ({ groups: {} })),
    getPrice(symbol).catch(() => null),
    getNews(symbol).catch(() => null),
    getCandles(symbol, "5m", 96).catch(() => []),
    getCandles(symbol, "15m", 96).catch(() => []),
    getCandles(symbol, "1h", 96).catch(() => []),
    getCandles(symbol, "4h", 96).catch(() => []),
  ]);
  const item = findOpportunity(opps, symbol);
  const livePrice = price ? Number(price.price) : item?.current_price;

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/scanner" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white"><ArrowLeft size={16}/> Volver al scanner</Link>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-4xl font-black text-white">{symbol}</h1><p className="mt-2 text-sm text-slate-400">Detalle multi-timeframe y contexto disponible.</p></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/65 px-4 py-3"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">Precio</div><div className="mt-1 text-2xl font-black text-white">{fmt(livePrice)}</div></div>
      </div>

      {item ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Dirección" value={item.direction} />
          <Stat label="Score" value={`${Number(item.contextual_score ?? item.setup_score).toFixed(1)}/100`} />
          <Stat label="Riesgo" value={`${Number(item.contextual_risk_score ?? item.risk_score).toFixed(1)}/100`} />
          <Stat label="Estado" value={item.state} />
        </section>
      ) : <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/65 p-4 text-sm text-slate-400">La moneda no tiene una señal reciente guardada; el gráfico público sí está disponible.</div>}

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <ChartBlock title="5 minutos" candles={candles5m}/><ChartBlock title="15 minutos" candles={candles15m}/><ChartBlock title="1 hora" candles={candles1h}/><ChartBlock title="4 horas" candles={candles4h}/>
      </section>

      {item && <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-300"/><h2 className="text-xl font-black text-white">Mapa del setup</h2></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Mini label="Entrada baja" value={fmt(item.entry_low)}/><Mini label="Entrada alta" value={fmt(item.entry_high)}/><Mini label="Stop" value={fmt(item.stop_loss)}/><Mini label="TP1" value={fmt(item.tp1)}/><Mini label="TP2" value={fmt(item.tp2)}/><Mini label="TP3" value={fmt(item.tp3)}/>
        </div>
        <div className="mt-4 text-sm text-slate-400">Movimiento estimado: {item.expected_move_min_pct ?? "—"}% – {item.expected_move_max_pct ?? "—"}% · Mercado: {item.market_regime ?? "—"}</div>
      </section>}

      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <div className="flex items-center gap-2"><Newspaper size={18} className="text-fuchsia-300"/><h2 className="text-xl font-black text-white">Noticias</h2></div>
        <div className="mt-2 text-sm text-slate-400">Sentimiento: {news?.sentiment ?? item?.news?.sentiment ?? "Sin datos"}</div>
        <div className="mt-4 space-y-3">
          {(news?.headlines ?? item?.news?.headlines ?? []).slice(0, 6).map((headline: any, index: number) => <div key={index} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><div className="text-sm font-semibold text-slate-100">{headline.title}</div><div className="mt-1 text-xs text-slate-500">{headline.source ?? "Fuente"}</div></div>)}
          {!(news?.headlines ?? item?.news?.headlines ?? []).length && <div className="text-sm text-slate-500">Sin titulares relevantes.</div>}
        </div>
      </section>
    </main>
  );
}

function ChartBlock({ title, candles }: { title: string; candles: any[] }) { return <div><div className="mb-2 text-sm font-bold text-slate-300">{title}</div><PriceChart candles={candles}/></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>; }
function Mini({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-mono text-sm font-bold text-slate-100">{value}</div></div>; }
