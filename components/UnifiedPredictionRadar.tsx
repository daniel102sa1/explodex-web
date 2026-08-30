"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDashed, RadioTower, ShieldAlert, Zap } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Point = {
  at?: string | null;
  preactivation_score: number;
  setup_score: number;
  risk_score: number;
  phase: string;
};

type HeartAction = "ENTRAR_LONG" | "ENTRAR_SHORT" | "MANTENER_LONG" | "MANTENER_SHORT" | "PLAN_COMPLETADO" | "ESPERAR" | "ESPERAR_RETEST" | "NO_ENTRAR" | string;

type Item = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  state: string;
  setup_type?: string;
  setup_score: number;
  risk_score: number;
  current_price: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  operable: boolean;
  heart_action?: HeartAction;
  conditions_ready: number;
  conditions_total: number;
  prediction?: {
    type?: string;
    phase?: string;
    preactivation_score?: number;
    trigger_price?: number;
    trigger_hit?: boolean;
    sequence?: Record<string, any>;
  };
  preparation_trajectory?: Point[];
  preparation_velocity?: number;
  preparation_accelerating?: boolean;
};

type Payload = {
  items: Item[];
  summary: { symbols: number; operable: number; preactivation: number; activated: number; accelerating: number };
  note?: string;
};

function phaseEs(value?: string) {
  const map: Record<string, string> = {
    ACTIVADO: "ACTIVADO",
    PREACTIVACION: "PREACTIVACIÓN",
    VIGILAR_CONFIRMACION: "FALTA CONFIRMACIÓN",
    VIGILAR_CONFLICTOS: "CONFLICTOS",
    ESPERAR_RETEST: "ESPERAR RETEST",
    VIGILAR: "VIGILAR",
    SIN_SETUP: "SIN SETUP",
    SIN_DATOS: "SIN DATOS",
  };
  return map[String(value ?? "").toUpperCase()] ?? String(value ?? "—").replaceAll("_", " ");
}

function typeEs(value?: string) {
  const map: Record<string, string> = {
    IMPULSO_LONG: "IMPULSO LONG",
    IMPULSO_SHORT: "IMPULSO SHORT",
    REBOTE_LONG: "REBOTE LONG",
    RECHAZO_SHORT: "RECHAZO SHORT",
    SIN_SETUP: "SIN SETUP",
  };
  return map[String(value ?? "").toUpperCase()] ?? String(value ?? "—").replaceAll("_", " ");
}

function ActionBadge({ action }: { action?: HeartAction }) {
  if (action === "ENTRAR_LONG") return <span className="inline-flex items-center gap-1 font-black text-emerald-300"><Zap size={12}/> ENTRAR LONG</span>;
  if (action === "ENTRAR_SHORT") return <span className="inline-flex items-center gap-1 font-black text-rose-300"><Zap size={12}/> ENTRAR SHORT</span>;
  if (action === "MANTENER_LONG") return <span className="inline-flex items-center gap-1 font-black text-cyan-300"><CheckCircle2 size={12}/> MANTENER LONG</span>;
  if (action === "MANTENER_SHORT") return <span className="inline-flex items-center gap-1 font-black text-cyan-300"><CheckCircle2 size={12}/> MANTENER SHORT</span>;
  if (action === "PLAN_COMPLETADO") return <span className="inline-flex items-center gap-1 font-black text-blue-300"><CheckCircle2 size={12}/> PLAN COMPLETADO</span>;
  if (action === "ESPERAR_RETEST") return <span className="inline-flex items-center gap-1 font-black text-violet-300"><ShieldAlert size={12}/> ESPERAR RETEST</span>;
  if (action === "NO_ENTRAR") return <span className="inline-flex items-center gap-1 font-black text-rose-300"><ShieldAlert size={12}/> NO ENTRAR</span>;
  return <span className="font-bold text-amber-200">ESPERAR</span>;
}

export default function UnifiedPredictionRadar() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPERABLE" | "EARLY" | "ACCELERATING">("ALL");

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) return;
      try {
        const response = await fetch(`${BASE_URL}/api/v1/predictions/live?limit=50`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = await response.json() as Payload;
        if (!dead) {
          setData(payload);
          setError(null);
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : "No se pudo cargar el radar predictivo");
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => { dead = true; clearInterval(timer); };
  }, []);

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    if (filter === "OPERABLE") return rows.filter((x) => x.operable || ["MANTENER_LONG","MANTENER_SHORT"].includes(String(x.heart_action)));
    if (filter === "EARLY") return rows.filter((x) => ["PREACTIVACION", "VIGILAR_CONFIRMACION"].includes(String(x.prediction?.phase)));
    if (filter === "ACCELERATING") return rows.filter((x) => x.preparation_accelerating);
    return rows;
  }, [data, filter]);

  return (
    <section className="terminal-panel mb-4 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-white"><RadioTower size={16} className="text-cyan-300"/> Radar predictivo unificado</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-600">Decisión tomada por ExplodeX Heart · refresco cada 5 s · una entrada disparada queda memorizada hasta cierre/invalidation</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["ALL", "OPERABLE", "EARLY", "ACCELERATING"] as const).map((value) => (
            <button key={value} onClick={() => setFilter(value)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${filter === value ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" : "border-slate-800 text-slate-500"}`}>
              {value === "ALL" ? "TODAS" : value === "OPERABLE" ? "ENTRAR / ACTIVAS" : value === "EARLY" ? "TEMPRANAS" : "ACELERANDO"}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="grid gap-px bg-slate-800/30 sm:grid-cols-2 lg:grid-cols-5">
          <Mini label="Monedas" value={String(data.summary.symbols)} />
          <Mini label="Entrar ahora" value={String(data.summary.operable)} good />
          <Mini label="Preactivación" value={String(data.summary.preactivation)} warn />
          <Mini label="Heart activadas" value={String(data.summary.activated)} />
          <Mini label="Acelerando" value={String(data.summary.accelerating)} good />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="border-b border-slate-800 bg-[#07111d] text-[9px] uppercase tracking-[.1em] text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Moneda</th>
              <th className="px-3 py-2 text-left">Predicción</th>
              <th className="px-3 py-2 text-left">Fase</th>
              <th className="px-3 py-2 text-right">Preparación</th>
              <th className="px-3 py-2 text-right">Setup</th>
              <th className="px-3 py-2 text-right">Riesgo</th>
              <th className="px-3 py-2 text-center">Checks Heart</th>
              <th className="px-3 py-2 text-left">Memoria</th>
              <th className="px-3 py-2 text-left">Decisión</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const p = item.prediction ?? {};
              const trajectory = (item.preparation_trajectory ?? []).map((x) => Number(x.preactivation_score || 0)).filter(Boolean);
              const checksComplete = item.conditions_total > 0 && item.conditions_ready >= item.conditions_total;
              const latched = ["MANTENER_LONG","MANTENER_SHORT"].includes(String(item.heart_action));
              return (
                <tr key={item.id} className="border-b border-slate-900 hover:bg-slate-900/50">
                  <td className="px-3 py-3"><Link href={`/coin/${item.symbol}`} className="font-black text-white hover:text-cyan-300">{item.symbol}</Link></td>
                  <td className={`px-3 py-3 font-black ${item.direction === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>
                    <span className="inline-flex items-center gap-1">{item.direction === "LONG" ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {typeEs(p.type ?? item.setup_type)}</span>
                  </td>
                  <td className="px-3 py-3"><span className={`status-pill ${item.operable || latched ? "status-ready" : p.phase === "PREACTIVACION" ? "status-watch" : "status-neutral"}`}>{latched ? "PLAN ACTIVO" : phaseEs(p.phase)}</span></td>
                  <td className="px-3 py-3 text-right font-black text-cyan-300">{Number(p.preactivation_score ?? 0).toFixed(1)}</td>
                  <td className="px-3 py-3 text-right font-black text-white">{item.setup_score.toFixed(1)}</td>
                  <td className="px-3 py-3 text-right text-slate-400">{item.risk_score.toFixed(1)}</td>
                  <td className="px-3 py-3 text-center"><span className={`inline-flex items-center gap-1 font-bold ${checksComplete || latched ? "text-emerald-300" : "text-slate-300"}`}>{checksComplete || latched ? <CheckCircle2 size={12} className="text-emerald-400"/> : <CircleDashed size={12} className="text-amber-300"/>}{latched ? "ACTIVO" : `${item.conditions_ready}/${item.conditions_total}`}</span></td>
                  <td className="px-3 py-3">
                    <div className="flex items-end gap-1">
                      {trajectory.slice(-6).map((score, index) => <span key={index} className="inline-block w-1.5 rounded-sm bg-violet-400/45" style={{ height: `${Math.max(4, Math.min(24, score * .24))}px` }} />)}
                      <span className={`ml-1 text-[9px] font-black ${item.preparation_accelerating ? "text-emerald-300" : (item.preparation_velocity ?? 0) < 0 ? "text-rose-300" : "text-slate-600"}`}>{item.preparation_accelerating ? "ACELERA" : `${(item.preparation_velocity ?? 0) >= 0 ? "+" : ""}${Number(item.preparation_velocity ?? 0).toFixed(0)}`}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><ActionBadge action={item.heart_action} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!items.length && <div className="p-8 text-center text-xs text-slate-600">{error ?? "No hay predicciones en este filtro."}</div>}
      </div>
      <div className="border-t border-slate-800 px-4 py-3 text-[10px] leading-4 text-slate-600">ENTRAR es el disparo inicial. Después se convierte en MANTENER LONG/SHORT para que un recálculo posterior no borre la decisión ya activada. Sigue siendo PAPER/ayuda técnica, no garantía de beneficio.</div>
    </section>
  );
}

function Mini({ label, value, good = false, warn = false }: { label: string; value: string; good?: boolean; warn?: boolean }) {
  return <div className="bg-[#07111d] p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-lg font-black ${good ? "text-emerald-300" : warn ? "text-amber-200" : "text-white"}`}>{value}</div></div>;
}
