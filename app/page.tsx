import { AlertTriangle, BarChart3, CircleGauge, RadioTower } from "lucide-react";
import OpportunityCard from "@/components/OpportunityCard";
import { getMarketContext, getOpportunities, getPerformance, getRuntimeStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [opportunitiesResult, marketResult, performanceResult, runtimeResult] = await Promise.allSettled([
    getOpportunities(),
    getMarketContext(),
    getPerformance(),
    getRuntimeStatus(),
  ]);

  const opportunities = opportunitiesResult.status === "fulfilled" ? opportunitiesResult.value : null;
  const market = marketResult.status === "fulfilled" ? marketResult.value : null;
  const performance = performanceResult.status === "fulfilled" ? performanceResult.value : null;
  const runtime = runtimeResult.status === "fulfilled" ? runtimeResult.value : null;

  const elite = opportunities?.groups?.elite ?? [];
  const veryStrong = opportunities?.groups?.very_strong ?? [];
  const strong = opportunities?.groups?.strong ?? [];
  const watch = opportunities?.groups?.watch ?? [];
  const allTradeable = [...elite, ...veryStrong, ...strong];
  const featured = allTradeable[0] ?? watch[0];

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-slate-800 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-emerald-400">
            <RadioTower size={17} /> Live scanner
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">ExplodeX</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">Dashboard de oportunidades tempranas LONG/SHORT con score técnico, contexto de mercado, riesgo y calibración por paper trading.</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Modo</div>
          <div className="mt-1 font-bold text-amber-300">PAPER TRADING</div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<CircleGauge size={20} />} label="Régimen mercado" value={String(market?.regime ?? "Sin datos")} />
        <StatCard icon={<BarChart3 size={20} />} label="Win rate paper" value={performance?.win_rate_pct == null ? "Sin muestra" : `${performance.win_rate_pct}%`} />
        <StatCard icon={<BarChart3 size={20} />} label="PnL paper" value={performance ? `${performance.net_pnl_usdt.toFixed(2)} USDT` : "—"} />
        <StatCard icon={<RadioTower size={20} />} label="Runtime" value={runtime ? "ONLINE" : "SIN CONEXIÓN"} />
      </section>

      {!opportunities && (
        <section className="mt-6 rounded-3xl border border-amber-500/30 bg-amber-500/5 p-5 text-amber-100">
          <div className="flex items-center gap-2 font-bold"><AlertTriangle size={19} /> No se pudo leer el backend</div>
          <p className="mt-2 text-sm text-amber-200/70">Configura <code className="rounded bg-black/30 px-1.5 py-0.5">NEXT_PUBLIC_API_BASE_URL</code> en Railway con la URL pública del backend.</p>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Prioridad</div>
            <h2 className="mt-1 text-2xl font-black text-white">Mejor oportunidad ahora</h2>
          </div>
          <div className="text-sm text-slate-500">{allTradeable.length} candidatos operables</div>
        </div>

        {featured ? (
          <OpportunityCard item={featured} featured />
        ) : (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-8 text-center">
            <div className="text-xl font-black text-white">NO TRADE</div>
            <p className="mt-2 text-sm text-slate-400">El sistema no encontró una oportunidad suficientemente fuerte ahora mismo.</p>
          </div>
        )}
      </section>

      <TierSection title="ELITE A+" subtitle="Score contextual más alto y riesgo bajo" items={elite} />
      <TierSection title="MUY FUERTES A" subtitle="Alta prioridad, todavía requiere disciplina de entrada" items={veryStrong} />
      <TierSection title="FUERTES B+" subtitle="Candidatos de trade que deben confirmar" items={strong} />
      <TierSection title="WATCH" subtitle="Vigilar; todavía no entrar" items={watch} />

      <footer className="mt-12 border-t border-slate-800 py-7 text-xs leading-5 text-slate-500">
        Un score 100/100 representa calidad del setup, no una probabilidad de éxito del 100%. La tasa histórica se muestra únicamente cuando exista muestra suficiente de paper trading.
      </footer>
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-xs uppercase tracking-[0.12em]">{label}</span></div>
      <div className="mt-3 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function TierSection({ title, subtitle, items }: { title: string; subtitle: string; items: any[] }) {
  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="text-xl font-black text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => <OpportunityCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-800 px-5 py-6 text-sm text-slate-600">Sin oportunidades en este nivel.</div>
      )}
    </section>
  );
}
