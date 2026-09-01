"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Gauge, ShieldAlert } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Diagnostics = {
  signals_checked?: number;
  enter_signals?: number;
  enter_symbols?: string[];
  actions?: Record<string, number>;
  missing_checks?: Record<string, number>;
  latest?: Array<{ symbol?:string; direction?:string; action?:string; state?:string; reason?:string; price_in_entry_zone?:boolean; advanced_stack_ready?:boolean }>;
};

type UnifiedDiagnostics = {
  version?: string;
  single_paper_authority?: boolean;
  opened_last_cycle?: number;
  closed_last_cycle?: number;
  reason?: string;
  signals_checked?: number;
  candidates?: number;
  rejected?: Record<string, number>;
  defensive?: boolean;
  defensive_learning_enabled?: boolean;
  status?: string;
};

type Summary = {
  execution_version?: string;
  open_positions?: Array<unknown>;
  heart_diagnostics?: Diagnostics;
  unified_paper_diagnostics?: UnifiedDiagnostics;
};

function topEntry(record?: Record<string, number>) {
  if (!record) return null;
  const rows = Object.entries(record).sort((a, b) => Number(b[1]) - Number(a[1]));
  return rows[0] ?? null;
}
function topEntries(record?: Record<string, number>, limit=4) {
  if (!record) return [];
  return Object.entries(record).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,limit);
}
function clean(value?: string) { return String(value ?? "—").replaceAll("_", " "); }

export default function PaperHeartStatus() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) return;
      try {
        const response = await fetch(`${BASE_URL}/api/v1/paper-trading/summary`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = await response.json() as Summary;
        if (!dead) { setSummary(payload); setError(null); }
      } catch (e) { if (!dead) setError(e instanceof Error ? e.message : String(e)); }
    }
    load();
    const timer = window.setInterval(load, 10000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  const d = summary?.heart_diagnostics;
  const u = summary?.unified_paper_diagnostics;
  const topMissing = topEntry(d?.missing_checks);
  const topAction = topEntry(d?.actions);
  const rejects = topEntries(u?.rejected);
  const enter = Number(d?.enter_signals ?? 0);
  const checked = Number(u?.signals_checked ?? d?.signals_checked ?? 0);
  const candidates = Number(u?.candidates ?? 0);
  const opened = Number(u?.opened_last_cycle ?? 0);

  return (
    <section className="terminal-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.13em] text-cyan-300"><Gauge size={15}/> Diagnóstico Heart → PAPER</div>
          <div className="mt-1 text-xs text-slate-500">Muestra por qué el simulador abrió o rechazó entradas en el último ciclo. Refresco 10 s.</div>
        </div>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black text-slate-400">{u?.version ?? summary?.execution_version ?? "cargando motor"}</span>
      </div>

      {error ? <div className="mt-4 text-xs text-rose-300">Diagnóstico no disponible: {error}</div> : !d && !u ? <div className="mt-4 text-xs text-slate-500"><Activity size={13} className="mr-1 inline animate-pulse"/>Esperando diagnóstico del backend…</div> : (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Señales revisadas" value={String(checked)} />
            <Stat label="Candidatos ejecutables" value={String(candidates)} good={candidates > 0} />
            <Stat label="Abiertas último ciclo" value={String(opened)} good={opened > 0} />
            <Stat label="Posiciones abiertas" value={String(summary?.open_positions?.length ?? 0)} good={(summary?.open_positions?.length ?? 0) > 0} />
            <Stat label="Modo" value={u?.defensive ? "DEFENSIVE LEARNING" : "NORMAL"} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div className={`rounded-2xl border p-3 ${opened > 0 ? "border-emerald-500/20 bg-emerald-500/[.05]" : "border-amber-500/20 bg-amber-500/[.04]"}`}>
              <div className="flex items-center gap-2 text-xs font-black text-white">{opened > 0 ? <CheckCircle2 size={14} className="text-emerald-300"/> : <AlertTriangle size={14} className="text-amber-300"/>}{opened > 0 ? "PAPER abrió una entrada" : "PAPER no abrió en el último ciclo"}</div>
              <div className="mt-2 text-xs leading-5 text-slate-400">
                {opened > 0 ? `El Heart autorizó ${opened} operación(es).` : rejects.length ? `Principal rechazo: ${clean(rejects[0][0])} (${rejects[0][1]} casos).` : u?.reason ? `Razón: ${clean(u.reason)}.` : topMissing ? `Check que más está faltando: ${clean(topMissing[0])} (${topMissing[1]} casos).` : "Esperando una entrada ejecutable."}
              </div>
              {!!rejects.length && <div className="mt-3 flex flex-wrap gap-2">{rejects.map(([name,count])=><span key={name} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{clean(name)} · {count}</span>)}</div>}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-3">
              <div className="flex items-center gap-2 text-xs font-black text-white"><ShieldAlert size={14} className="text-violet-300"/> Estado del Heart</div>
              <div className="mt-2 space-y-1.5 text-[11px] text-slate-400">
                <div>Autoridad PAPER única: <b className="text-white">{u?.single_paper_authority ? "SÍ" : "—"}</b></div>
                <div>Heart dice ENTRAR: <b className={enter>0?"text-emerald-300":"text-white"}>{enter}</b></div>
                <div>Acción dominante: <b className="text-white">{topAction ? `${clean(topAction[0])} · ${topAction[1]}` : "—"}</b></div>
              </div>
              <div className="mt-3 space-y-1.5">
                {(d?.latest ?? []).slice(0, 4).map((row, i) => <div key={`${row.symbol}-${i}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="font-black text-slate-300">{row.symbol ?? "—"}</span><span className={String(row.action).startsWith("ENTRAR") ? "font-black text-emerald-300" : row.action === "NO_ENTRAR" ? "font-black text-rose-300" : "font-bold text-amber-200"}>{clean(row.action)}</span></div>)}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-sm font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}
