"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bitcoin, Newspaper, RadioTower, ShieldAlert, TrendingDown, TrendingUp, Waves } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Impact = {
  state?: string;
  label?: string;
  support_score?: number;
  shock_risk?: boolean;
  factors?: Record<string, number>;
  reasons?: string[];
  symbol_news?: { sentiment?: string; headline_count?: number; headlines?: Array<{ title?: string; source?: string }> };
  global_news?: { sentiment?: string; headline_count?: number; headlines?: Array<{ title?: string; source?: string }> };
  broad_market?: { regime?: string; net_breadth_pct?: number; btc?: { trend?: string }; eth?: { trend?: string } };
  derivatives?: { oi_15m_pct?: number; oi_1h_pct?: number; taker_buy_sell_ratio?: number; funding_median_pct?: number; liquidation_imbalance_1h?: number };
};

type Payload = {
  symbol?: string;
  impact?: Impact;
  armed_trigger?: { trade_class?: string; trade_label?: string; grade?: string; market_impact_gate?: { demoted?: boolean; original_trade_class?: string } };
};

function tone(state?: string) {
  if (state === "SUPPORTIVE") return "border-emerald-400/30 bg-emerald-400/[.06] text-emerald-100";
  if (state === "CONFLICT") return "border-rose-400/30 bg-rose-400/[.06] text-rose-100";
  if (state === "SHOCK_RISK") return "border-orange-400/35 bg-orange-400/[.07] text-orange-100";
  return "border-slate-700 bg-slate-900/50 text-slate-200";
}

function sentimentText(value?: string) {
  if (value === "POSITIVE") return "POSITIVAS";
  if (value === "NEGATIVE") return "NEGATIVAS";
  if (value === "UNAVAILABLE") return "N/D";
  return "NEUTRALES";
}

function factorName(key: string) {
  const map: Record<string, string> = {
    symbol_news: "Noticias activo",
    global_news: "Noticias globales",
    market_regime: "Régimen mercado",
    btc_eth: "BTC / ETH",
    market_breadth: "Breadth",
    derivatives: "Derivados",
    technical_reaction: "Reacción técnica",
    path_alignment: "Path Forecast",
  };
  return map[key] ?? key;
}

export default function MarketImpactPanel({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) {
        setError("NEXT_PUBLIC_API_BASE_URL no está configurada");
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/market-impact/${encodeURIComponent(safeSymbol)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = await response.json();
        if (!dead) {
          setData(payload);
          setError(null);
          setUpdatedAt(Date.now());
        }
      } catch (exc) {
        if (!dead) setError(exc instanceof Error ? exc.message : String(exc));
      }
    }
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, [safeSymbol]);

  if (!data && !error) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500"><RadioTower size={13} className="mr-2 inline animate-pulse"/>Calculando noticias + contexto + derivados…</div></section>;
  }

  if (error) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-3xl border border-rose-500/25 bg-rose-500/[.04] p-4 text-xs text-rose-200">Market Impact temporalmente no disponible: {error}</div></section>;
  }

  const impact = data?.impact ?? {};
  const armed = data?.armed_trigger ?? {};
  const factors = Object.entries(impact.factors ?? {});
  const supportive = impact.state === "SUPPORTIVE";
  const against = impact.state === "CONFLICT" || impact.state === "SHOCK_RISK";

  return (
    <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.08),transparent_35%),linear-gradient(135deg,rgba(4,12,23,.98),rgba(6,15,26,.98))] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-cyan-300"><Newspaper size={14}/> Catalyst / Market Impact</div>
            <div className="mt-1 text-xs text-slate-500">Noticias + BTC/ETH + mercado + OI + taker + funding + liquidaciones + reacción técnica.</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${tone(impact.state)}`}>{impact.label ?? "ENTORNO MIXTO"}</span>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[10px] font-black text-slate-300">{Number(impact.support_score ?? 0).toFixed(0)}/100</span>
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Mini icon={<Newspaper size={14}/>} label="Noticias activo" value={sentimentText(impact.symbol_news?.sentiment)} />
              <Mini icon={<Activity size={14}/>} label="Noticias globales" value={sentimentText(impact.global_news?.sentiment)} />
              <Mini icon={<Bitcoin size={14}/>} label="BTC / ETH" value={`${impact.broad_market?.btc?.trend ?? "—"} / ${impact.broad_market?.eth?.trend ?? "—"}`} />
              <Mini icon={<Waves size={14}/>} label="Régimen" value={impact.broad_market?.regime ?? "MIXED"} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {factors.map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-800 bg-black/15 p-3"><div className="text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{factorName(key)}</div><div className={`mt-1 font-mono text-base font-black ${value > 4 ? "text-emerald-300" : value < -4 ? "text-rose-300" : "text-slate-300"}`}>{value >= 0 ? "+" : ""}{Number(value).toFixed(1)}</div></div>)}
            </div>

            <div className={`mt-3 rounded-2xl border p-4 ${tone(impact.state)}`}>
              <div className="flex items-center gap-2 text-sm font-black">{supportive ? <TrendingUp size={16}/> : against ? <TrendingDown size={16}/> : <Activity size={16}/>} ¿Qué significa?</div>
              <p className="mt-2 text-xs leading-5 opacity-80">{impact.state === "SUPPORTIVE" ? "El entorno externo acompaña la dirección técnica. Esto refuerza el contexto, pero no crea una entrada por sí solo." : impact.state === "SHOCK_RISK" ? "Hay un catalizador contrario y la reacción técnica también está deteriorándose. ExplodeX puede degradar una entrada para esperar confirmación." : impact.state === "CONFLICT" ? "Noticias/mercado/derivados están contradiciendo la dirección técnica. Conviene exigir más confirmación antes de entrar." : "El entorno no da una ventaja externa clara. La decisión depende más de estructura, zona y trigger."}</p>
            </div>
          </div>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-slate-800 bg-black/15 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Clasificación después del Catalyst Gate</div>
              <div className="mt-2 flex items-center justify-between gap-3"><div className="text-2xl font-black text-white">{armed.trade_label ?? armed.trade_class ?? "—"}</div><div className="rounded-xl border border-slate-700 px-3 py-2 text-lg font-black text-cyan-200">{armed.grade ?? "—"}</div></div>
              {armed.market_impact_gate?.demoted && <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/[.05] p-2.5 text-[10px] leading-4 text-amber-100">El Market Impact degradó temporalmente la clasificación original {armed.market_impact_gate.original_trade_class}. Está esperando que el entorno confirme.</div>}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-black/15 p-4">
              <div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">Lecturas clave</div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-slate-400">{(impact.reasons ?? []).map((reason, index) => <div key={index}>• {reason}</div>)}</div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-black/15 p-4 text-[10px] leading-5 text-slate-500">
              OI 15m {Number(impact.derivatives?.oi_15m_pct ?? 0).toFixed(2)}% · OI 1h {Number(impact.derivatives?.oi_1h_pct ?? 0).toFixed(2)}% · Taker {Number(impact.derivatives?.taker_buy_sell_ratio ?? 1).toFixed(2)}x · Funding {Number(impact.derivatives?.funding_median_pct ?? 0).toFixed(4)}% · Breadth {Number(impact.broad_market?.net_breadth_pct ?? 0).toFixed(1)}%
            </div>

            <div className="flex gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/[.04] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldAlert size={14} className="mt-0.5 shrink-0"/>Una noticia no puede crear TRADE NOW. Solo puede apoyar, advertir o degradar una entrada técnica existente. El /100 no es probabilidad.</div>
            {updatedAt && <div className="text-right text-[9px] text-slate-700">Actualizado {new Date(updatedAt).toLocaleTimeString()}</div>}
          </aside>
        </div>
      </div>
    </section>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-black/15 p-3"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className="mt-2 text-sm font-black text-white">{value}</div></div>;
}
