"use client";

import { useEffect, useState } from "react";
import { Activity, CheckCircle2, CircleDashed, Radar, ShieldAlert, Zap } from "lucide-react";
import { getLiveAnalysis } from "@/lib/api";

type Fingerprint = {
  stage?: string;
  fingerprint_score?: number;
  score_is_probability?: boolean;
  trade_class?: "TRADE_NOW" | "TRADE_SOON" | "WATCHLIST" | "NO_TRADE" | string;
  trade_label?: string;
  grade?: string;
  trigger_passes?: number;
  trigger_total?: number;
  trigger_conditions?: Record<string, boolean>;
  early_signals?: string[];
  missing?: string[];
  components?: Record<string, number>;
  locks_passed?: number;
  zone_state?: string;
  zone_action?: string;
  path_aligned?: boolean;
  technical_confidence?: number;
};

function tone(value?: string) {
  if (value === "TRADE_NOW") return "border-emerald-400/35 bg-emerald-400/[.08] text-emerald-100";
  if (value === "TRADE_SOON") return "border-cyan-400/35 bg-cyan-400/[.07] text-cyan-100";
  if (value === "WATCHLIST") return "border-amber-400/30 bg-amber-400/[.06] text-amber-100";
  return "border-rose-400/25 bg-rose-400/[.05] text-rose-100";
}

function decision(value?: string) {
  if (value === "TRADE_NOW") return { question: "¿TRADEAR AHORA?", answer: "SÍ", detail: "ENTRADA OPERABLE" };
  if (value === "TRADE_SOON") return { question: "¿TRADEAR AHORA?", answer: "ESPERA", detail: "CASI LISTA" };
  if (value === "WATCHLIST") return { question: "¿TRADEAR AHORA?", answer: "TODAVÍA NO", detail: "VIGILAR" };
  return { question: "¿TRADEAR AHORA?", answer: "NO", detail: "NO ENTRAR" };
}

function stageEs(value?: string) {
  const map: Record<string, string> = {
    ARMED: "ARMADO",
    BUILDING: "CONSTRUYÉNDOSE",
    EARLY: "TEMPRANO",
    COLD: "FRÍO",
    REJECTED: "RECHAZADO",
  };
  return map[String(value ?? "")] ?? String(value ?? "—");
}

function conditionEs(value: string) {
  const map: Record<string, string> = {
    fingerprint_ready: "Fingerprint listo",
    locks_sufficient: "Confluencia suficiente",
    flow_ready: "Flow listo",
    anti_trap_ready: "Anti-trap listo",
    momentum_ready: "Momentum fresco",
    entry_location_ready: "Zona de entrada lista",
    not_chasing: "No persigue precio",
    not_invalidated: "Tesis vigente",
    path_not_conflicting: "Path Forecast acompaña",
  };
  return map[value] ?? value;
}

export default function PreMoveFingerprintPanel({ symbol }: { symbol: string }) {
  const safe = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [data, setData] = useState<Fingerprint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      try {
        const analysis = await getLiveAnalysis(safe, true);
        const fp = (analysis.prediction as any)?.premove_fingerprint as Fingerprint | undefined;
        if (!dead) {
          setData(fp ?? null);
          setError(null);
          setUpdatedAt(Date.now());
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const timer = window.setInterval(load, 12_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, [safe]);

  if (error) return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-2xl border border-rose-500/25 bg-rose-500/[.04] p-4 text-xs text-rose-200">Pre-Move Fingerprint temporalmente no disponible: {error}</div></section>;
  if (!data) return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500"><Radar size={14} className="mr-2 inline animate-pulse"/>Construyendo fingerprint de entrada…</div></section>;

  const score = Number(data.fingerprint_score ?? 0);
  const grade = data.grade ?? "—";
  const conditions = Object.entries(data.trigger_conditions ?? {});
  const passed = Number(data.trigger_passes ?? 0);
  const total = Number(data.trigger_total ?? conditions.length);
  const direct = decision(data.trade_class);

  return (
    <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-3xl border border-cyan-400/15 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.08),transparent_38%),linear-gradient(135deg,rgba(4,12,24,.98),rgba(2,8,17,.98))] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-cyan-300"><Radar size={14}/> Decisión de entrada · Pre-Move Fingerprint</div>
            <div className="mt-1 text-xs text-slate-500">Respuesta simple primero; detalle técnico debajo.</div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500"><Activity size={12}/>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : "LIVE"}</div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[.8fr_1.2fr]">
          <div className={`rounded-3xl border p-5 ${tone(data.trade_class)}`}>
            <div className="text-[11px] font-black uppercase tracking-[.18em] opacity-65">{direct.question}</div>
            <div className="mt-2 text-5xl font-black tracking-tight">{direct.answer}</div>
            <div className="mt-1 text-sm font-black uppercase tracking-[.12em] opacity-75">{direct.detail}</div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-xl border border-current/20 bg-black/10 px-3 py-1.5 text-xs font-black">TÉCNICO: {data.trade_label ?? data.trade_class ?? "—"}</span>
              <span className="rounded-xl border border-current/20 bg-black/10 px-3 py-1.5 text-xs font-black">GRADO {grade}</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Box label="Fingerprint" value={`${score.toFixed(0)}/100`} />
              <Box label="Etapa" value={stageEs(data.stage)} />
              <Box label="Trigger" value={`${passed}/${total}`} />
              <Box label="6 Entry Locks" value={`${Number(data.locks_passed ?? 0)}/6`} />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3 text-xs leading-5 opacity-80">{data.trade_class === "TRADE_NOW" ? "ExplodeX considera que la entrada está técnicamente operable ahora. Revisa zona, stop e invalidación antes de actuar." : data.trade_class === "TRADE_SOON" ? "No entrar todavía: está cerca, pero faltan pocos disparadores. Espera que se completen." : data.trade_class === "WATCHLIST" ? "Todavía no es entrada. Solo vigilar porque hay preparación temprana." : "No entrar con este setup ahora. Falta calidad o existe un bloqueo técnico."}</div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-black/15 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-500"><Zap size={13}/> Disparadores</div>
              <div className="space-y-2">{conditions.map(([key, ok]) => <div key={key} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${ok ? "border-emerald-400/20 bg-emerald-400/[.04] text-emerald-200" : "border-slate-800 bg-slate-950/40 text-slate-500"}`}><span>{conditionEs(key)}</span>{ok ? <CheckCircle2 size={14}/> : <CircleDashed size={14}/>}</div>)}</div>
            </div>

            <div className="space-y-3">
              <ListBox title="Señales tempranas detectadas" rows={data.early_signals ?? []} empty="Aún no aparece una firma temprana clara." />
              <ListBox title="Qué falta para poder tradear" rows={(data.missing ?? []).map(conditionEs)} empty="No falta un disparador principal." />
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[.04] p-3 text-[10px] leading-5 text-amber-100/70"><ShieldAlert size={13} className="mr-1 inline"/>“SÍ” significa que pasa las reglas técnicas actuales; no significa ganancia segura ni probabilidad garantizada.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-[9px] font-black uppercase tracking-[.12em] opacity-50">{label}</div><div className="mt-1 text-sm font-black">{value}</div></div>;
}

function ListBox({ title, rows, empty }: { title: string; rows: string[]; empty: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-black/15 p-4"><div className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">{title}</div><div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-400">{rows.length ? rows.map((row, i) => <div key={i}>• {row}</div>) : <div className="text-slate-600">{empty}</div>}</div></div>;
}
