"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, BrainCircuit, TrendingDown, TrendingUp } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Point = { at?: string | null; preactivation_score: number; setup_score: number; risk_score: number; phase: string };
type Row = {
  symbol: string;
  direction: string;
  prediction?: { phase?: string; preactivation_score?: number };
  preparation_trajectory?: Point[];
  preparation_velocity?: number;
  preparation_accelerating?: boolean;
};
type Payload = { items: Row[] };

export default function PreparationMemory() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) return;
      try {
        const response = await fetch(`${BASE_URL}/api/v1/predictions/live?limit=50`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as Payload;
        if (!dead) setRows(payload.items ?? []);
      } catch {}
    }
    load();
    const timer = setInterval(load, 7000);
    return () => { dead = true; clearInterval(timer); };
  }, []);

  const groups = useMemo(() => {
    return rows
      .map((row) => {
        const points = (row.preparation_trajectory ?? []).slice(-6);
        const values = points.map((x) => Number(x.preactivation_score || 0)).filter((x) => x > 0);
        const velocity = Number(row.preparation_velocity ?? (values.length > 1 ? values.at(-1)! - values[0] : 0));
        const accelerating = Boolean(row.preparation_accelerating);
        const cooling = values.length >= 3 && values.at(-1)! < values.at(-2)! && values.at(-2)! < values.at(-3)!;
        return { ...row, points, velocity, accelerating, cooling };
      })
      .filter((row) => row.points.length > 0)
      .sort((a, b) => Number(b.accelerating) - Number(a.accelerating) || b.velocity - a.velocity || Number(b.prediction?.preactivation_score ?? 0) - Number(a.prediction?.preactivation_score ?? 0))
      .slice(0, 8);
  }, [rows]);

  return (
    <section className="terminal-panel mt-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-white"><BrainCircuit size={16} className="text-violet-300"/> Memoria de preparación</div>
          <div className="mt-1 text-[10px] text-slate-600">Trayectoria oficial de los últimos ciclos · una sola serie por moneda</div>
        </div>
        <span className="status-pill status-neutral"><Activity size={11}/> HISTORIA</span>
      </div>

      <div className="grid gap-px bg-slate-800/30 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const last = group.points.at(-1);
          return (
            <Link href={`/coin/${group.symbol}`} key={group.symbol} className="bg-[#07111d] p-4 hover:bg-slate-900/70">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-black text-white">{group.symbol}</div>
                  <div className={`mt-1 text-[10px] font-bold ${group.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>{group.direction} · {String(last?.phase ?? group.prediction?.phase ?? "—").replaceAll("_", " ")}</div>
                </div>
                {group.accelerating ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-300"><TrendingUp size={13}/> ACELERANDO</span>
                ) : group.cooling ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-300"><TrendingDown size={13}/> ENFRIANDO</span>
                ) : (
                  <span className="text-[10px] text-slate-600">ESTABLE</span>
                )}
              </div>

              <div className="mt-4 flex items-end gap-1">
                {group.points.map((point, index) => (
                  <div key={`${point.at ?? index}-${index}`} className="flex-1">
                    <div className="rounded-sm bg-violet-400/25" style={{ height: `${Math.max(4, Math.min(42, Number(point.preactivation_score || 0) * .42))}px` }}/>
                    <div className="mt-1 text-center text-[9px] font-bold text-slate-500">{Number(point.preactivation_score || 0).toFixed(0)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex justify-between text-[10px] text-slate-600">
                <span>{group.points.length} ciclos</span>
                <span className={group.velocity >= 0 ? "text-emerald-400" : "text-rose-400"}>{group.velocity >= 0 ? "+" : ""}{group.velocity.toFixed(1)}</span>
              </div>
            </Link>
          );
        })}
        {!groups.length && <div className="col-span-full p-8 text-center text-xs text-slate-600">Esperando varios ciclos para construir memoria de preparación.</div>}
      </div>

      <div className="border-t border-slate-800 px-4 py-3 text-[10px] leading-4 text-slate-600">“Acelerando” significa que la preparación subió en ciclos consecutivos. No es probabilidad de ganar y nunca reemplaza trigger, stop, TP ni gestión de riesgo.</div>
    </section>
  );
}
