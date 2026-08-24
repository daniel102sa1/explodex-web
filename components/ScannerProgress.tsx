"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, Loader2, RadioTower } from "lucide-react";

type RecentResult = {
  symbol: string;
  direction?: string;
  state?: string;
  setup_score?: number;
  risk_score?: number;
  price?: number;
  confirmations?: number;
  reject_reasons?: string[];
  oi_change_pct?: number;
  taker_ratio?: number;
  relative_volume?: number;
  futures_delta_ratio?: number;
  spot_delta_ratio?: number;
  order_book_imbalance?: number;
  trend_15m?: string;
  trend_1h?: string;
};

type Progress = {
  run_id?: string | null;
  status: string;
  phase: string;
  universe_size: number;
  early_pool_size: number;
  deep_total: number;
  deep_completed: number;
  progress_pct: number;
  candidates_found: number;
  current_symbols: string[];
  recent_symbols: string[];
  recent_results: RecentResult[];
  errors: string[];
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

const reasonLabel: Record<string, string> = {
  aggressive_flow_absorbed: "flujo absorbido",
  btc_conflict: "BTC en contra",
  multi_timeframe_conflict: "15m/1h en contra",
  futures_flow_conflict: "futuros en contra",
  spot_flow_conflict: "spot en contra",
  already_extended: "ya extendida",
  insufficient_confirmations: "faltan confirmaciones",
};

export default function ScannerProgress() {
  const [data, setData] = useState<Progress | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (!BASE_URL) {
        setConnected(false);
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/scanner/progress`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as Progress;
        if (mounted) {
          setData(payload);
          setConnected(true);
        }
      } catch {
        if (mounted) setConnected(false);
      } finally {
        if (mounted) timer = setTimeout(load, 1500);
      }
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const currentText = useMemo(() => {
    if (!data?.current_symbols?.length) return "Esperando siguiente lote";
    return data.current_symbols.join(" · ");
  }, [data]);

  if (!connected) {
    return <section className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-200">No se pudo leer el progreso en vivo del scanner.</section>;
  }

  if (!data) {
    return <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/65 p-5 text-sm text-slate-400">Cargando estado del scanner…</section>;
  }

  const running = data.status === "running";

  return (
    <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">
            {running ? <Loader2 size={16} className="animate-spin" /> : <RadioTower size={16} />}
            Scanner Binance en vivo
          </div>
          <h2 className="mt-2 text-2xl font-black text-white">{running ? "Analizando mercado ahora" : "Último ciclo terminado"}</h2>
          <p className="mt-2 text-sm text-slate-400">{running ? `Viendo: ${currentText}` : "El sistema volverá a escanear automáticamente según el intervalo configurado."}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Box label="Universo" value={data.universe_size} />
          <Box label="Filtro temprano" value={data.early_pool_size} />
          <Box label="Analizadas" value={`${data.deep_completed}/${data.deep_total}`} />
          <Box label="Candidatas" value={data.candidates_found} />
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, data.progress_pct))}%` }} /></div>
      <div className="mt-2 flex justify-between text-xs text-slate-500"><span>Fase: {data.phase}</span><span>{data.progress_pct.toFixed(1)}%</span></div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><Activity size={16}/> Monedas que va viendo</div>
          <div className="flex flex-wrap gap-2">
            {data.recent_symbols.length ? data.recent_symbols.map((symbol, index) => <Link key={`${symbol}-${index}`} href={`/coin/${symbol}`} className="rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300">{symbol}</Link>) : <span className="text-sm text-slate-500">Todavía no comenzó el análisis profundo.</span>}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white"><CheckCircle2 size={16}/> Resultados recientes</div>
          <div className="space-y-2">
            {data.recent_results.slice(0, 8).map((item, index) => (
              <Link key={`${item.symbol}-${index}`} href={`/coin/${item.symbol}`} className="block rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 hover:bg-slate-900">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                  <div><div className="font-bold text-white">{item.symbol}</div><div className="text-xs text-slate-500">{item.state ?? "—"} · {item.confirmations ?? 0}/7 confirmaciones</div></div>
                  <div className={item.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}>{item.direction ?? "—"}</div>
                  <div className="font-mono text-sm font-bold text-slate-200">{item.setup_score?.toFixed(1) ?? "—"}</div>
                </div>
                {!!item.reject_reasons?.length && <div className="mt-2 flex flex-wrap gap-1.5">{item.reject_reasons.slice(0, 3).map((reason) => <span key={reason} className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-200">{reasonLabel[reason] ?? reason}</span>)}</div>}
              </Link>
            ))}
            {!data.recent_results.length && <div className="text-sm text-slate-500">Sin resultados todavía.</div>}
          </div>
        </div>
      </div>

      {!!data.errors.length && <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80">Último error parcial: {data.errors[0]}</div>}
    </section>
  );
}

function Box({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-24 rounded-2xl border border-slate-800 bg-slate-900/60 p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-1 text-lg font-black text-white">{value}</div></div>;
}
