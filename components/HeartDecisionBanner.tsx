"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, ShieldAlert, Zap } from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

const human: Record<string,string> = {
  fingerprint_trade_now: "Confirmación final del patrón",
  master_yes: "Dirección maestra",
  timing_enter: "Timing de entrada",
  veto_clear: "Quitar veto",
  not_chasing: "Precio sin persecución",
  not_invalidated: "Tesis vigente",
  risk_guard_pass: "Risk Guard",
  ignition_fast_path: "Ignición suficiente",
  price_in_entry_zone: "Precio dentro de la zona",
};

export default function HeartDecisionBanner({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [canonicalHeart, setCanonicalHeart] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [value, radar] = await Promise.all([
          getLiveAnalysis(safeSymbol, true),
          BASE_URL
            ? fetch(`${BASE_URL}/api/v1/predictions/live?limit=100`, { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setAnalysis(value);
        const items = Array.isArray(radar?.items) ? radar.items : [];
        const match = items.find((item:any) => String(item?.symbol ?? "").toUpperCase() === safeSymbol);
        setCanonicalHeart(match?.explodex_heart ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo cargar el Heart");
      }
    }
    load();
    const timer = setInterval(load, 8_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const liveHeart = (analysis as any)?.explodex_heart ?? (analysis?.prediction as any)?.explodex_heart;
  const heart = canonicalHeart ?? liveHeart;
  const decision = heart?.action_decision ?? {};
  const plan = heart?.plan ?? {};
  const event = heart?.market_event ?? liveHeart?.market_event ?? {};
  const ignition = heart?.ignition ?? {};
  const action = String(decision?.action ?? "ESPERAR").toUpperCase();
  const enter = Boolean(decision?.should_enter) || action === "ENTRAR_LONG" || action === "ENTRAR_SHORT";
  const retest = action === "ESPERAR_RETEST";
  const noEnter = action === "NO_ENTRAR";
  const direction = String(decision?.direction ?? heart?.direction ?? analysis?.direction ?? "").toUpperCase();
  const prep = Number(ignition?.score ?? event?.pressure_index ?? (analysis?.prediction as any)?.preactivation_score ?? 0);
  const missing = Array.isArray(decision?.advanced_stack_missing) ? decision.advanced_stack_missing : [];
  const sourceLabel = canonicalHeart ? "DECISIÓN CANÓNICA · SCANNER/PAPER" : "ANÁLISIS EN VIVO";

  const tone = enter ? "border-emerald-400/60 bg-emerald-500/[.12]" : noEnter ? "border-rose-400/45 bg-rose-500/[.08]" : retest ? "border-violet-400/45 bg-violet-500/[.08]" : "border-amber-400/45 bg-amber-500/[.08]";
  const title = enter ? `ENTRAR ${direction} AHORA` : noEnter ? "NO ENTRAR" : retest ? "ESPERAR RETEST" : "ESPERAR";
  const titleClass = enter ? "text-emerald-300" : noEnter ? "text-rose-300" : retest ? "text-violet-300" : "text-amber-200";

  const nextText = useMemo(() => {
    if (enter) return "La entrada está habilitada ahora. Respeta la zona y el stop; no persigas si el precio se escapa.";
    if (noEnter) return "No abras esta operación. Espera una tesis nueva o que desaparezca el bloqueo.";
    if (retest) return "La idea puede seguir viva, pero la entrada actual ya pasó. Espera que vuelva a la zona.";
    if (missing.length) return `Falta: ${missing.slice(0,3).map((x:string)=>human[x] ?? x.replaceAll("_"," ")).join(" · ")}.`;
    return "Todavía no hay autorización completa de entrada.";
  }, [enter,noEnter,retest,missing]);

  return (
    <section className="mx-auto max-w-[1680px] px-3 pt-4 sm:px-5 lg:px-6">
      <div className={`overflow-hidden rounded-3xl border shadow-2xl ${tone}`}>
        <div className="grid gap-0 xl:grid-cols-[1.15fr_.85fr]">
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-slate-400">
              <Zap size={14} className={enter ? "text-emerald-300" : "text-amber-300"}/>
              ExplodeX · decisión
              <span className="rounded-full border border-slate-700/70 px-2 py-0.5 text-slate-500">{safeSymbol}</span>
              <span className="text-slate-600">{sourceLabel}</span>
            </div>
            <div className={`mt-3 flex items-center gap-2 text-3xl font-black sm:text-4xl ${titleClass}`}>
              {direction === "SHORT" ? <ArrowDownRight size={34}/> : direction === "LONG" ? <ArrowUpRight size={34}/> : <ShieldAlert size={30}/>} 
              {error ? "SIN DATOS" : analysis ? title : "CALCULANDO..."}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{error ?? decision?.reason ?? "Evaluando la próxima expansión y el momento de entrada."}</p>
            <div className="mt-4 rounded-2xl border border-slate-700/70 bg-slate-950/45 p-3">
              <div className="flex items-start gap-2 text-xs text-slate-300">
                {enter ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300"/> : <Clock3 size={15} className="mt-0.5 shrink-0 text-amber-300"/>}
                <span><b className="text-white">Qué hacer:</b> {nextText}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700/60 bg-slate-950/30 p-4 xl:border-l xl:border-t-0 sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Metric label="Preparación / ignición" value={Number.isFinite(prep) ? `${Math.round(prep)}/100` : "—"} strong />
              <Metric label="Dirección" value={direction || "—"}/>
              <Metric label="Estado" value={String(ignition?.stage ?? event?.event ?? action).replaceAll("_"," ")}/>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Entrada" value={`${fmt(plan?.entry_low)} – ${fmt(plan?.entry_high)}`}/>
              <Metric label="Stop" value={fmt(plan?.stop_loss)} bad/>
              <Metric label="TP1" value={fmt(plan?.tp1)} good/>
              <Metric label="TP2" value={fmt(plan?.tp2)} good/>
            </div>
            <div className="mt-3 text-[10px] leading-5 text-slate-500">La página prioriza la misma decisión canónica que consume PAPER. El índice técnico no es una probabilidad garantizada; veto duro, invalidación y no-chase siguen mandando.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({label,value,strong=false,good=false,bad=false}:{label:string;value:string;strong?:boolean;good?:boolean;bad?:boolean}) {
  return <div className="rounded-xl border border-slate-700/65 bg-slate-950/50 px-3 py-2.5"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}</div><div className={`mt-1 text-sm font-black ${strong?"text-cyan-200":good?"text-emerald-300":bad?"text-rose-300":"text-white"}`}>{value}</div></div>
}
