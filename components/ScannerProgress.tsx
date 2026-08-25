"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleGauge,
  Coins,
  Filter,
  Loader2,
  Radar,
  RadioTower,
  SearchCheck,
  ShieldAlert,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

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
  pre_move_direction_conflict: "dirección en conflicto",
  pre_move_chase_risk: "entrada tardía",
  pre_move_not_activated: "preactivación incompleta",
};

const phaseLabel: Record<string, string> = {
  idle: "esperando",
  loading_universe: "cargando universo",
  early_filter: "filtro temprano",
  deep_analysis: "análisis profundo",
  persisting: "guardando resultados",
  finished: "finalizado",
  failed: "falló",
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
    return (
      <section className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/5 p-5 text-sm text-rose-200">
        <div className="flex items-center gap-2 font-black"><ShieldAlert size={18}/> Scanner desconectado</div>
        <div className="mt-1 text-xs text-rose-200/70">No se pudo leer el progreso en vivo del backend.</div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/65 p-5 text-sm text-slate-400">
        <div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin"/> Cargando estado del scanner…</div>
      </section>
    );
  }

  const running = data.status === "running";
  const failed = data.status === "failed";
  const statusText = running ? "ESCANEANDO" : failed ? "ERROR" : "CICLO COMPLETO";

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950/90 to-[#06101b] shadow-2xl shadow-black/20">
      <div className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-400">
                {running ? <Loader2 size={16} className="animate-spin" /> : <RadioTower size={16} />}
                Scanner de mercado en vivo
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-black tracking-[.12em] ${running ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300" : failed ? "border-rose-500/25 bg-rose-500/10 text-rose-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-cyan-300" : failed ? "bg-rose-300" : "bg-emerald-300"}`} />
                {statusText}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-white">{running ? "Analizando mercado ahora" : failed ? "Último ciclo con error" : "Último ciclo terminado"}</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              {running ? `Viendo: ${currentText}` : failed ? "El sistema reintentará automáticamente en el siguiente ciclo." : "El sistema volverá a escanear automáticamente según el intervalo configurado."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Box icon={<Coins size={16}/>} label="Universo" value={data.universe_size} tone="cyan" />
            <Box icon={<Filter size={16}/>} label="Filtro temprano" value={data.early_pool_size} tone="violet" />
            <Box icon={<SearchCheck size={16}/>} label="Analizadas" value={`${data.deep_completed}/${data.deep_total}`} tone="blue" />
            <Box icon={<Sparkles size={16}/>} label="Candidatas" value={data.candidates_found} tone={data.candidates_found ? "emerald" : "slate"} />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-full border border-slate-800 bg-slate-900/80 p-[2px]">
          <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-emerald-300 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, data.progress_pct))}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><CircleGauge size={12}/> Fase: {phaseLabel[data.phase] ?? data.phase}</span>
          <span>{data.progress_pct.toFixed(1)}%</span>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Radar size={16} className="text-cyan-300"/> Monedas revisadas</div>
            <div className="flex flex-wrap gap-2">
              {data.recent_symbols.length ? data.recent_symbols.map((symbol, index) => (
                <Link key={`${symbol}-${index}`} href={`/coin/${symbol}`} className="group inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-500/40 hover:bg-cyan-500/5 hover:text-cyan-200">
                  <Activity size={11} className="text-slate-600 transition group-hover:text-cyan-300"/>{symbol}
                </Link>
              )) : <span className="text-sm text-slate-500">Todavía no comenzó el análisis profundo.</span>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-white"><Target size={16} className="text-emerald-300"/> Resultados recientes</div>
            <div className="space-y-2">
              {data.recent_results.slice(0, 8).map((item, index) => {
                const long = item.direction === "LONG";
                const state = String(item.state ?? "NO_TRADE");
                const ready = state === "READY";
                const preparing = state === "PREPARING";
                return (
                  <Link key={`${item.symbol}-${index}`} href={`/coin/${item.symbol}`} className="block rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-3 transition hover:border-slate-700 hover:bg-slate-900/80">
                    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-black text-white"><Activity size={13} className="text-slate-500"/>{item.symbol}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${ready ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : preparing ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-slate-800 text-slate-500"}`}>
                            {ready ? <Zap size={10}/> : preparing ? <Sparkles size={10}/> : <AlertTriangle size={10}/>} {state.replaceAll("_", " ")}
                          </span>
                          <span>{item.confirmations ?? 0}/7 confirmaciones</span>
                        </div>
                      </div>
                      <div className={`inline-flex items-center gap-1 font-black ${long ? "text-emerald-400" : "text-rose-400"}`}>
                        {long ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>} {item.direction ?? "—"}
                      </div>
                      <div className="font-mono text-sm font-black text-slate-100">{item.setup_score?.toFixed(1) ?? "—"}</div>
                    </div>
                    {!!item.reject_reasons?.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.reject_reasons.slice(0, 3).map((reason) => <span key={reason} className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-200"><AlertTriangle size={9}/>{reasonLabel[reason] ?? reason}</span>)}
                      </div>
                    )}
                  </Link>
                );
              })}
              {!data.recent_results.length && <div className="text-sm text-slate-500">Sin resultados todavía.</div>}
            </div>
          </div>
        </div>

        {!!data.errors.length && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/80">
            <AlertTriangle size={15} className="mt-0.5 shrink-0"/><div><div className="font-black text-amber-200">Último error parcial</div><div className="mt-1 break-words text-amber-200/70">{data.errors[0]}</div></div>
          </div>
        )}
      </div>
    </section>
  );
}

function Box({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "cyan" | "violet" | "blue" | "emerald" | "slate" }) {
  const toneClass = {
    cyan: "text-cyan-300 border-cyan-500/15 bg-cyan-500/[.035]",
    violet: "text-violet-300 border-violet-500/15 bg-violet-500/[.035]",
    blue: "text-blue-300 border-blue-500/15 bg-blue-500/[.035]",
    emerald: "text-emerald-300 border-emerald-500/15 bg-emerald-500/[.035]",
    slate: "text-slate-400 border-slate-800 bg-slate-900/55",
  }[tone];
  return (
    <div className={`min-w-24 rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex items-center justify-center gap-1.5">{icon}<span className="text-[9px] uppercase tracking-[0.1em] text-slate-500">{label}</span></div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}
