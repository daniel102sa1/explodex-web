"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type DirectionPoint = { at: number; direction: "LONG" | "SHORT"; longScore: number; shortScore: number };

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function targetFeasibility(distanceAtr: number, target: "TP1" | "TP2" | "TP3") {
  const limits = target === "TP1" ? [2, 3] : target === "TP2" ? [3.5, 5] : [5.5, 7.5];
  if (!Number.isFinite(distanceAtr) || distanceAtr <= 0) return "SIN DATOS";
  if (distanceAtr <= limits[0]) return "REALISTA";
  if (distanceAtr <= limits[1]) return "EXIGENTE";
  return "LEJANO";
}

export default function TradeSafetyCoach({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [history, setHistory] = useState<DirectionPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (cancelled) return;
        setAnalysis(value);
        setHistory((old) => {
          const next = [...old, { at: Date.now(), direction: value.direction, longScore: value.long_score, shortScore: value.short_score }];
          return next.slice(-6);
        });
      } catch {}
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis?.prediction) return null;
    const p = analysis.prediction;
    const direction = p.direction;
    const directionMatch = analysis.direction === direction;
    const edge = Math.abs(Number(analysis.long_score || 0) - Number(analysis.short_score || 0));
    const recent = history.slice(-4);
    const sameDirection = recent.length >= 3 && recent.every((x) => x.direction === direction);
    const flips = recent.slice(1).filter((x, i) => x.direction !== recent[i].direction).length;
    const stable = directionMatch && edge >= 12 && sameDirection && flips === 0;
    const developing = directionMatch && edge >= 6 && flips <= 1;

    const triggerHit = Boolean(p.trigger_hit) || (direction === "LONG" ? analysis.current_price >= Number(p.trigger_price || Infinity) : analysis.current_price <= Number(p.trigger_price || -Infinity));
    const entryLow = Math.min(Number(p.entry_low || 0), Number(p.entry_high || 0));
    const entryHigh = Math.max(Number(p.entry_low || 0), Number(p.entry_high || 0));
    const inZone = analysis.current_price >= entryLow && analysis.current_price <= entryHigh;
    const chase = Boolean(p.sequence?.chase_risk) || (triggerHit && !inZone);
    const ready = analysis.state === "READY" && p.phase === "ACTIVADO" && stable && triggerHit && inZone && !chase;

    const atrPct = Number(analysis.metrics?.atr_pct || 0);
    const atrAbs = analysis.current_price * atrPct / 100;
    const trigger = Number(p.trigger_price || analysis.current_price);
    const targets = (["TP1", "TP2", "TP3"] as const).map((name) => {
      const price = Number(name === "TP1" ? p.tp1 : name === "TP2" ? p.tp2 : p.tp3);
      const dist = Math.abs(price - trigger);
      const atr = atrAbs > 0 ? dist / atrAbs : 0;
      return { name, price, atr, pct: trigger > 0 ? dist / trigger * 100 : 0, label: targetFeasibility(atr, name) };
    });

    let action = "NO ENTRAR";
    let tone: "green" | "amber" | "red" | "violet" = "red";
    let why = "La dirección todavía no es suficientemente estable.";
    if (ready) {
      action = `ENTRADA ${direction} HABILITADA`;
      tone = "green";
      why = "Dirección estable, trigger activado y precio todavía dentro de la zona. Aun así el stop sigue siendo obligatorio.";
    } else if (flips > 0 || !directionMatch || edge < 6) {
      action = "NO TRADE · DIRECCIÓN INESTABLE";
      tone = "red";
      why = "LONG y SHORT están demasiado parejos o la dirección cambió recientemente. Espera hasta que deje de alternar.";
    } else if (!sameDirection) {
      action = "ESPERAR PERSISTENCIA";
      tone = "amber";
      why = "La dirección actual necesita mantenerse al menos 3 lecturas consecutivas antes de considerarla estable.";
    } else if (!triggerHit) {
      action = "ESPERAR TRIGGER";
      tone = "amber";
      why = `La idea todavía no está activada. Esperar ${fmt(p.trigger_price)}.`;
    } else if (chase || !inZone) {
      action = "ESPERAR RETEST · NO PERSEGUIR";
      tone = "violet";
      why = "El precio ya está fuera de la zona calculada. Entrar tarde empeora la relación riesgo/beneficio.";
    } else if (analysis.state !== "READY") {
      action = "CONFIRMANDO · NO ENTRAR TODAVÍA";
      tone = "amber";
      why = "La dirección ya tiene algo de ventaja, pero faltan confirmaciones profundas para READY.";
    }

    const tp1 = targets[0];
    const tpWarning = tp1.label === "LEJANO"
      ? "TP1 está lejos para la volatilidad actual. No asumir que llegará; exigir seguimiento fuerte y usar time-stop."
      : tp1.label === "EXIGENTE"
        ? "TP1 requiere un movimiento mayor de lo normal. Es alcanzable, pero no debe tratarse como objetivo fácil."
        : "TP1 está dentro de una distancia razonable respecto al ATR actual.";

    const hold = ready
      ? `Si entras, mantén mientras no se rompa el stop ${fmt(p.stop_loss)}, no aparezca un conflicto fuerte y no venza el time-stop (~${p.time_stop_minutes ?? 40} min) sin al menos ~0.5R de avance. En TP1 protege; TP2 es el objetivo principal; TP3 es runner.`
      : "Todavía no hay una operación que debas 'aguantar'. Primero debe existir una entrada válida; esperar también es una decisión.";

    return { direction, edge, stable, developing, sameDirection, flips, ready, action, tone, why, targets, tpWarning, hold, triggerHit, inZone };
  }, [analysis, history]);

  if (!analysis || !view) return null;

  const border = view.tone === "green" ? "border-emerald-500/35 bg-emerald-500/[.06]" : view.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.05]" : view.tone === "amber" ? "border-amber-500/30 bg-amber-500/[.05]" : "border-rose-500/35 bg-rose-500/[.06]";
  const text = view.tone === "green" ? "text-emerald-300" : view.tone === "violet" ? "text-violet-300" : view.tone === "amber" ? "text-amber-300" : "text-rose-300";

  return (
    <section className="mx-auto mt-5 max-w-[1500px] px-4">
      <div className={`rounded-3xl border p-5 ${border}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><ShieldCheck size={17}/> Filtro de seguridad de entrada</div>
            <div className={`mt-2 text-2xl font-black ${text}`}>{view.action}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">{view.why}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini label="Dirección" value={view.direction} good={view.stable} bad={!view.developing} icon={view.direction === "LONG" ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} />
            <Mini label="Ventaja vs lado opuesto" value={`${view.edge.toFixed(1)} pts`} good={view.edge >= 12} bad={view.edge < 6} icon={<Crosshair size={13}/>} />
            <Mini label="Persistencia" value={history.length < 3 ? `${history.length}/3` : view.sameDirection ? "3/3 estable" : "cambió"} good={view.sameDirection} bad={view.flips > 0} icon={<Clock3 size={13}/>} />
            <Mini label="Trigger / zona" value={`${view.triggerHit ? "✓" : "○"} / ${view.inZone ? "✓" : "○"}`} good={view.triggerHit && view.inZone} icon={<Target size={13}/>} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {view.targets.map((t) => <div key={t.name} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
            <div className="flex items-center justify-between"><span className="text-xs font-black text-white">{t.name}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${t.label === "REALISTA" ? "bg-emerald-500/10 text-emerald-300" : t.label === "EXIGENTE" ? "bg-amber-500/10 text-amber-300" : "bg-rose-500/10 text-rose-300"}`}>{t.label}</span></div>
            <div className="mt-2 font-mono text-sm font-black text-slate-100">{fmt(t.price)}</div>
            <div className="mt-1 text-[10px] text-slate-500">{t.pct.toFixed(2)}% desde trigger · {t.atr.toFixed(2)} ATR</div>
          </div>)}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-amber-200"><AlertTriangle size={15}/> ¿TP1 está demasiado lejos?</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{view.tpWarning}</p>
          </div>
          <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.035] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-cyan-200"><CheckCircle2 size={15}/> ¿Hasta dónde aguanto?</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{view.hold}</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500"><XCircle size={13} className="mt-0.5 shrink-0"/>No existe forma de estar 100% seguro de LONG o SHORT. Este filtro está diseñado para que el sistema se abstenga cuando la evidencia es inestable, en lugar de obligarte a escoger una dirección.</div>
      </div>
    </section>
  );
}

function Mini({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
