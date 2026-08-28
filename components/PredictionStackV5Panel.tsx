"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, BrainCircuit, Newspaper, ShieldAlert } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Layer = {
  key?: string;
  label?: string;
  state?: string;
  display?: string;
  score?: number | null;
};

type Stack = {
  version?: string;
  direction?: {
    side?: string;
    state?: string;
    score?: number;
    path_bias?: string | null;
    path_clarity?: string;
  };
  entry_timing?: {
    state?: string;
    label?: string;
    trade_class?: string;
    steps_to_yes?: number;
    yes_missing?: string[];
    zone_state?: string;
    zone_quality?: number;
    trigger_hit?: boolean;
    locks_passed?: number;
  };
  risk_veto?: {
    blocked?: boolean;
    vetoes?: string[];
    warnings?: string[];
    trap_risk?: number;
    momentum_decay_risk?: number;
  };
  regime?: {
    state?: string;
    label?: string;
  };
  master_decision?: {
    state?: string;
    label?: string;
    can_trade_now?: boolean;
  };
  layers?: Layer[];
};

type Impact = {
  state?: string;
  label?: string;
  support_score?: number;
};

type IntegratedPayload = {
  prediction_stack_v5?: Stack;
  impact?: Impact;
};

function decisionTone(state?: string) {
  if (state === "YES") return "border-emerald-400/35 bg-emerald-400/[.08] text-emerald-100";
  if (state === "WAIT") return "border-cyan-400/35 bg-cyan-400/[.07] text-cyan-100";
  if (state === "WATCH") return "border-amber-400/30 bg-amber-400/[.06] text-amber-100";
  return "border-rose-400/25 bg-rose-400/[.05] text-rose-100";
}

function layerTone(state?: string) {
  const s = String(state ?? "").toUpperCase();
  if (["YES", "SUPPORT", "SUPPORTIVE", "SAFE", "CLEAR", "HIT", "STRONG", "FAVORED", "ENTER_NOW"].includes(s)) return "border-emerald-400/20 bg-emerald-400/[.04] text-emerald-100";
  if (["WAIT", "MIXED", "NEUTRAL", "COMPRESSION", "TREND", "WATCH", "WAIT_NEAR"].includes(s)) return "border-cyan-400/20 bg-cyan-400/[.04] text-cyan-100";
  if (["CONFLICT", "SHOCK_RISK", "RISK", "BLOCKED", "NO", "HIGH_VOLATILITY", "AVOID_OR_COLD"].includes(s)) return "border-rose-400/20 bg-rose-400/[.04] text-rose-100";
  return "border-slate-800 bg-slate-950/40 text-slate-300";
}

function missingEs(value: string) {
  const map: Record<string, string> = {
    fingerprint_ready: "Fingerprint listo",
    locks_sufficient: "5+ Entry Locks",
    flow_ready: "Flow suficiente",
    anti_trap_ready: "Anti-trap suficiente",
    momentum_ready: "Momentum fresco",
    entry_location_ready: "Zona de entrada",
    not_chasing: "No perseguir precio",
    not_invalidated: "Tesis vigente",
    path_not_conflicting: "Path no conflictivo",
  };
  return map[value] ?? value;
}

export default function PredictionStackV5Panel({ symbol }: { symbol: string }) {
  const safe = useMemo(() => symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`, [symbol]);
  const [stack, setStack] = useState<Stack | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) {
        if (!dead) setError("NEXT_PUBLIC_API_BASE_URL no está configurada");
        return;
      }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/market-impact/${encodeURIComponent(safe)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Backend ${response.status}`);
        const payload = await response.json() as IntegratedPayload;
        if (!dead) {
          setStack(payload.prediction_stack_v5 ?? null);
          setImpact(payload.impact ?? null);
          setError(null);
          setUpdatedAt(Date.now());
        }
      } catch (e) {
        if (!dead) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const timer = window.setInterval(load, 30_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, [safe]);

  if (error) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-2xl border border-rose-500/25 bg-rose-500/[.04] p-4 text-xs text-rose-200">Prediction Stack v5 temporalmente no disponible: {error}</div></section>;
  }
  if (!stack) {
    return <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6"><div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500"><BrainCircuit size={14} className="mr-2 inline animate-pulse"/>Organizando señales + noticias + mercado…</div></section>;
  }

  const decision = stack.master_decision ?? {};
  const direction = stack.direction ?? {};
  const timing = stack.entry_timing ?? {};
  const risk = stack.risk_veto ?? {};
  const layers = stack.layers ?? [];
  const steps = Number(timing.steps_to_yes ?? 0);

  return (
    <section className="mx-auto mb-4 max-w-[1680px] px-3 sm:px-5 lg:px-6">
      <div className="overflow-hidden rounded-3xl border border-violet-400/15 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,.10),transparent_34%),linear-gradient(135deg,rgba(5,10,22,.99),rgba(2,7,15,.99))] shadow-2xl shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-violet-300"><BrainCircuit size={15}/> Prediction Stack v5 · Catalyst integrado</div>
            <div className="mt-1 text-xs text-slate-500">Régimen → Noticias/Macro → Dirección → Derivados → Flow → Trampa → Zona → Trigger → Veto → Decisión.</div>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500"><Activity size={12}/>{updatedAt ? new Date(updatedAt).toLocaleTimeString() : "LIVE"}</div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-[.82fr_1.18fr]">
          <div className={`rounded-3xl border p-5 ${decisionTone(decision.state)}`}>
            <div className="text-[10px] font-black uppercase tracking-[.18em] opacity-60">Decisión maestra después de noticias y contexto</div>
            <div className="mt-2 text-3xl font-black sm:text-4xl">{decision.label ?? "—"}</div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric label="Dirección" value={`${direction.side ?? "—"} · ${direction.state ?? "—"}`} />
              <Metric label="Dirección score" value={`${Number(direction.score ?? 0).toFixed(0)}/100`} />
              <Metric label="Timing" value={timing.label ?? "—"} />
              <Metric label="Régimen" value={stack.regime?.label ?? "—"} />
              <Metric label="Noticias / Macro" value={impact?.label ?? impact?.state ?? "MIXTO"} />
              <Metric label="Catalyst score" value={`${Number(impact?.support_score ?? 50).toFixed(0)}/100`} />
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-3 text-xs leading-5 opacity-80">
              {decision.state === "YES" ? "Dirección, timing, noticias/contexto y controles de riesgo permiten una entrada técnica ahora. No es garantía de beneficio." : decision.state === "WAIT" ? `La tesis está cerca, pero todavía faltan ${steps} paso${steps === 1 ? "" : "s"} para el SÍ o el contexto externo aún necesita alinearse.` : decision.state === "WATCH" ? "Hay algo que vigilar, pero la geometría, confirmación o contexto todavía no justifica entrada." : risk.blocked ? "Existe al menos un veto activo. Aunque la dirección parezca buena, no conviene autorizar una entrada ahora." : "No existe una entrada suficientemente preparada en este momento."}
            </div>

            {impact?.state === "SHOCK_RISK" || impact?.state === "CONFLICT" ? <div className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-400/[.04] p-3 text-xs text-orange-100"><Newspaper size={13} className="mr-1 inline"/><b>Catalyst:</b> {impact.label ?? impact.state}. Esta capa puede degradar una señal técnica, pero nunca crear un SÍ por sí sola.</div> : null}
            {risk.vetoes?.length ? <div className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-400/[.04] p-3 text-xs text-rose-100"><ShieldAlert size={13} className="mr-1 inline"/><b>Veto:</b> {risk.vetoes.join(" · ")}</div> : null}
            {timing.yes_missing?.length ? <div className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[.04] p-3 text-xs text-cyan-100/80"><b>Falta para SÍ:</b> {timing.yes_missing.map(missingEs).join(" · ")}</div> : null}
          </div>

          <div>
            <div className="mb-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Cadena de decisión integrada</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {layers.map((layer, index) => (
                <div key={`${layer.key}-${index}`} className={`rounded-2xl border p-3 ${layerTone(layer.state)}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[9px] font-black uppercase tracking-[.13em] opacity-55">{index + 1}. {layer.label}</div>
                    {layer.score != null ? <span className="rounded-lg border border-current/15 px-2 py-0.5 text-[10px] font-black">{Number(layer.score).toFixed(0)}</span> : null}
                  </div>
                  <div className="mt-1.5 text-sm font-black leading-5">{layer.display ?? layer.state ?? "—"}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-800 bg-black/15 p-3 text-[10px] leading-5 text-slate-500"><ArrowRight size={13}/>Noticias y macro ya están dentro de la decisión maestra. Pueden apoyar, advertir o degradar; nunca fabrican una entrada.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><div className="text-[9px] font-black uppercase tracking-[.12em] opacity-50">{label}</div><div className="mt-1 text-sm font-black leading-5">{value}</div></div>;
}
