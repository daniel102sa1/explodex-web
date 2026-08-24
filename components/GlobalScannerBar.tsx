"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, RadioTower, TriangleAlert } from "lucide-react";

type Progress = {
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
  errors: string[];
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

export default function GlobalScannerBar() {
  const [data, setData] = useState<Progress | null>(null);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (!BASE_URL) {
        if (mounted) setConnected(false);
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
        if (mounted) timer = setTimeout(load, 2000);
      }
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const symbols = useMemo(() => {
    if (!data) return [];
    const source = data.current_symbols?.length ? data.current_symbols : data.recent_symbols;
    return source.slice(0, 12);
  }, [data]);

  const running = data?.status === "running";

  return (
    <div className="border-b border-slate-800/80 bg-[#08131d]">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        <Link href="/scanner" className="inline-flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-300">
          {running ? <Loader2 size={14} className="animate-spin" /> : <RadioTower size={14} />}
          {running ? "Escaneando" : "Scanner"}
        </Link>

        {!connected ? (
          <div className="inline-flex shrink-0 items-center gap-1.5 text-xs text-rose-300">
            <TriangleAlert size={13} /> sin conexión al progreso
          </div>
        ) : !data ? (
          <div className="shrink-0 text-xs text-slate-500">cargando actividad…</div>
        ) : (
          <>
            <div className="shrink-0 text-xs text-slate-500">
              {running
                ? `${data.deep_completed}/${data.deep_total} · ${Number(data.progress_pct || 0).toFixed(0)}%`
                : data.deep_total
                  ? `último lote ${data.deep_completed}/${data.deep_total}`
                  : "esperando próximo ciclo"}
            </div>

            {!!symbols.length && <div className="h-4 w-px shrink-0 bg-slate-800" />}

            <div className="flex shrink-0 items-center gap-1.5">
              {symbols.map((symbol, index) => (
                <Link
                  key={`${symbol}-${index}`}
                  href={`/coin/${symbol}`}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition hover:text-white ${
                    data.current_symbols?.includes(symbol)
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {symbol}
                </Link>
              ))}
            </div>

            <div className="ml-auto inline-flex shrink-0 items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><Activity size={12} /> universo {data.universe_size}</span>
              <span>candidatas {data.candidates_found}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
