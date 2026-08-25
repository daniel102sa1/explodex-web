"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Crosshair,
  Lock,
  Play,
  RefreshCcw,
  ShieldAlert,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Unlock,
  XCircle,
} from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type Direction = "LONG" | "SHORT";

type LockedPlan = {
  symbol: string;
  direction: Direction;
  predictionType: string;
  lockedAt: number;
  trigger: number;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  timeStopMinutes: number;
  maxDurationMinutes: number;
  initialSetupScore: number;
  initialPreparationScore: number;
  initialRiskScore: number;
  enteredAt?: number;
  actualEntryPrice?: number;
};

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function okxId(symbol: string) {
  return `${symbol.replace(/USDT$/, "")}-USDT-SWAP`;
}

function crossed(direction: Direction, price: number, level: number, kind: "profit" | "loss") {
  if (!(price > 0 && level > 0)) return false;
  if (direction === "LONG") return kind === "profit" ? price >= level : price <= level;
  return kind === "profit" ? price <= level : price >= level;
}

export default function LockedPlanManager({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const storageKey = `explodex:locked-plan:${safeSymbol}`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [plan, setPlan] = useState<LockedPlan | null>(null);
  const [livePrice, setLivePrice] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setPlan(JSON.parse(raw) as LockedPlan);
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (plan) window.localStorage.setItem(storageKey, JSON.stringify(plan));
      else window.localStorage.removeItem(storageKey);
    } catch {}
  }, [plan, storageKey]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (!cancelled) {
          setAnalysis(value);
          setLivePrice((old) => old || Number(value.current_price || 0));
        }
      } catch {}
    }
    load();
    const timer = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol]);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let ws: WebSocket | null = null;
    const apply = (price: number) => { if (!disposed && price > 0) setLivePrice(price); };
    const connectOkx = () => {
      try { ws?.close(); } catch {}
      ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      ws.onopen = () => ws?.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: okxId(safeSymbol) }] }));
      ws.onmessage = (event) => {
        try { apply(Number(JSON.parse(event.data)?.data?.[0]?.last ?? 0)); } catch {}
      };
    };
    ws = new WebSocket(`wss://fstream.binance.com/ws/${safeSymbol.toLowerCase()}@aggTrade`);
    ws.onmessage = (event) => {
      gotBinance = true;
      try { apply(Number(JSON.parse(event.data)?.p ?? 0)); } catch {}
    };
    ws.onerror = () => { if (!gotBinance) connectOkx(); };
    const fallback = setTimeout(() => { if (!gotBinance) connectOkx(); }, 4500);
    return () => { disposed = true; clearTimeout(fallback); try { ws?.close(); } catch {} };
  }, [safeSymbol]);

  const currentPrediction = analysis?.prediction;

  function lockCurrentPlan() {
    if (!analysis?.prediction) return;
    const p = analysis.prediction;
    setPlan({
      symbol: safeSymbol,
      direction: p.direction,
      predictionType: p.type || "SETUP",
      lockedAt: Date.now(),
      trigger: Number(p.trigger_price || 0),
      entryLow: Number(p.entry_low || analysis.entry_low || 0),
      entryHigh: Number(p.entry_high || analysis.entry_high || 0),
      invalidation: Number(p.invalidation_price || analysis.invalidation_price || 0),
      stop: Number(p.stop_loss || analysis.stop_loss || 0),
      tp1: Number(p.tp1 || analysis.tp1 || 0),
      tp2: Number(p.tp2 || analysis.tp2 || 0),
      tp3: Number(p.tp3 || analysis.tp3 || 0),
      timeStopMinutes: Number(p.time_stop_minutes || 40),
      maxDurationMinutes: Number(p.expected_duration_max_minutes || analysis.expected_duration_max_minutes || 240),
      initialSetupScore: Number(analysis.setup_score || 0),
      initialPreparationScore: Number(p.preactivation_score || 0),
      initialRiskScore: Number(analysis.risk_score || 0),
    });
  }

  function markEntered() {
    if (!plan) return;
    setPlan({ ...plan, enteredAt: Date.now(), actualEntryPrice: livePrice || (plan.entryLow + plan.entryHigh) / 2 });
  }

  const view = useMemo(() => {
    if (!plan) return null;
    const price = Number(livePrice || analysis?.current_price || 0);
    const entryLow = Math.min(plan.entryLow, plan.entryHigh);
    const entryHigh = Math.max(plan.entryLow, plan.entryHigh);
    const inOriginalZone = price >= entryLow && price <= entryHigh;
    const triggerHit = crossed(plan.direction, price, plan.trigger, "profit");
    const invalidationHit = crossed(plan.direction, price, plan.invalidation, "loss");
    const stopHit = crossed(plan.direction, price, plan.stop, "loss");
    const tp1Hit = crossed(plan.direction, price, plan.tp1, "profit");
    const tp2Hit = crossed(plan.direction, price, plan.tp2, "profit");
    const tp3Hit = crossed(plan.direction, price, plan.tp3, "profit");
    const currentDirection = currentPrediction?.direction ?? analysis?.direction;
    const directionConflict = Boolean(currentDirection && currentDirection !== plan.direction);
    const currentReadySameSide = Boolean(analysis?.state === "READY" && currentPrediction?.phase === "ACTIVADO" && currentDirection === plan.direction);
    const ageMinutes = Math.max(0, (clock - plan.lockedAt) / 60000);
    const enteredMinutes = plan.enteredAt ? Math.max(0, (clock - plan.enteredAt) / 60000) : 0;
    const entry = Number(plan.actualEntryPrice || (entryLow + entryHigh) / 2);
    const riskPerUnit = Math.abs(entry - plan.stop);
    const favorableMove = plan.direction === "LONG" ? price - entry : entry - price;
    const r = riskPerUnit > 0 ? favorableMove / riskPerUnit : 0;

    let action = "PLAN FIJADO · ESPERAR";
    let tone: "green" | "amber" | "red" | "violet" = "amber";
    let detail = "El plan original queda congelado. Los análisis nuevos no cambian sus niveles automáticamente.";

    if (!plan.enteredAt) {
      if (invalidationHit || stopHit) {
        action = "PLAN ORIGINAL INVALIDADO · NO ENTRAR";
        tone = "red";
        detail = "El mercado cruzó la invalidación/stop del plan antes de la entrada. Este plan ya no debe reutilizarse.";
      } else if (triggerHit && inOriginalZone && currentReadySameSide) {
        action = `VENTANA ORIGINAL ${plan.direction} ABIERTA`;
        tone = "green";
        detail = "El plan fijado conserva su trigger y zona. La lectura actual sigue alineada con la misma dirección y está READY.";
      } else if (triggerHit && !inOriginalZone) {
        action = "PLAN ORIGINAL · ESPERAR RETEST";
        tone = "violet";
        detail = "El trigger del plan original ya fue tocado, pero el precio está fuera de su zona. No persigas el movimiento.";
      } else if (directionConflict) {
        action = "PLAN ORIGINAL EN PAUSA · NUEVO ANÁLISIS EN CONFLICTO";
        tone = "red";
        detail = `El plan fijado es ${plan.direction}, pero el análisis actual apunta ${currentDirection}. El plan no se borra; simplemente no se habilita entrada hasta resolver el conflicto.`;
      }
    } else {
      if (stopHit || invalidationHit) {
        action = "SALIDA DEL PLAN · STOP / INVALIDACIÓN";
        tone = "red";
        detail = "Se cruzó el nivel que protegía la tesis original. El sistema no amplía el stop para intentar salvar la operación.";
      } else if (tp3Hit) {
        action = "TP3 ALCANZADO · PROTEGER/CERRAR RUNNER";
        tone = "green";
        detail = "El tercer objetivo original fue alcanzado. Si mantienes una parte, debería quedar protegida por estructura; no devolver toda la ganancia.";
      } else if (tp2Hit) {
        action = "TP2 ALCANZADO · BENEFICIO PRINCIPAL";
        tone = "green";
        detail = "El objetivo principal del plan original fue alcanzado. Esta es una zona objetiva para tomar beneficio según la lógica paper.";
      } else if (tp1Hit) {
        action = "MANTENER PROTEGIDO · TP1 ALCANZADO";
        tone = "violet";
        detail = "TP1 fue alcanzado. El plan entra en modo protección: no debería permitirse que una operación favorable termine como pérdida completa.";
      } else if (enteredMinutes >= plan.maxDurationMinutes) {
        action = "DURACIÓN MÁXIMA · REEVALUAR SALIDA";
        tone = "red";
        detail = `El plan original esperaba como máximo ~${plan.maxDurationMinutes} min. Ya excedió esa ventana sin completar objetivos.`;
      } else if (enteredMinutes >= plan.timeStopMinutes && r < 0.5) {
        action = "TIME STOP · REEVALUAR/CERRAR";
        tone = "red";
        detail = `Han pasado ~${Math.floor(enteredMinutes)} min y el plan no desarrolló 0.5R. No se amplía el stop; se reevalúa la salida.`;
      } else if (directionConflict && r < 0) {
        action = "PLAN BAJO PRESIÓN · REVISAR SALIDA";
        tone = "red";
        detail = `El plan original sigue sin tocar stop, pero el análisis actual cambió a ${currentDirection} y la operación va contra ti. Es una advertencia, no un motivo para mover el stop más lejos.`;
      } else if (directionConflict) {
        action = "MANTENER CON CAUTELA · ANÁLISIS NUEVO EN CONFLICTO";
        tone = "amber";
        detail = `El análisis actual cambió a ${currentDirection}, pero el plan original todavía no está invalidado. No cierres solo por un flip; vigila estructura, R y time-stop.`;
      } else if (r >= 0.5) {
        action = "MANTENER SEGÚN PLAN";
        tone = "green";
        detail = "El plan original sigue válido y ya desarrolló avance favorable. El stop original y los objetivos siguen mandando.";
      } else {
        action = "MANTENER / VIGILAR";
        tone = "amber";
        detail = "La operación sigue dentro de la tesis original. Todavía no llegó a TP1 ni a stop; vigila el time-stop y no cambies niveles por emoción.";
      }
    }

    return {
      price, inOriginalZone, triggerHit, invalidationHit, stopHit, tp1Hit, tp2Hit, tp3Hit,
      directionConflict, currentDirection, ageMinutes, enteredMinutes, r, action, tone, detail,
    };
  }, [plan, analysis, currentPrediction, livePrice, clock]);

  if (!analysis?.prediction && !plan) return null;

  const toneClass = view?.tone === "green" ? "border-emerald-500/35 bg-emerald-500/[.06]" : view?.tone === "red" ? "border-rose-500/35 bg-rose-500/[.06]" : view?.tone === "violet" ? "border-violet-500/35 bg-violet-500/[.06]" : "border-amber-500/30 bg-amber-500/[.05]";
  const actionClass = view?.tone === "green" ? "text-emerald-300" : view?.tone === "red" ? "text-rose-300" : view?.tone === "violet" ? "text-violet-300" : "text-amber-300";

  return <section className="mx-auto mt-5 max-w-[1500px] px-4">
    <div className={`rounded-3xl border p-5 shadow-2xl shadow-black/20 ${plan ? toneClass : "border-cyan-500/20 bg-cyan-500/[.035]"}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300">{plan ? <Lock size={17}/> : <Unlock size={17}/>} Plan fijado / gestión de tesis</div>
          {!plan ? <>
            <div className="mt-2 text-2xl font-black text-white">Todavía no fijaste este plan</div>
            <p className="mt-2 text-sm leading-6 text-slate-400">Si este setup te interesa, congela sus niveles. Después ExplodeX seguirá ese plan original aunque el predictor genere otro distinto.</p>
            <button onClick={lockCurrentPlan} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-black text-cyan-100 hover:bg-cyan-500/15"><Lock size={15}/> Fijar este plan</button>
          </> : <>
            <div className={`mt-2 text-2xl font-black ${actionClass}`}>{view?.action}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">{view?.detail}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!plan.enteredAt && <button onClick={markEntered} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-sm font-black text-emerald-100"><Play size={15}/> Marcar que entré ahora</button>}
              <button onClick={lockCurrentPlan} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2.5 text-xs font-bold text-violet-200"><RefreshCcw size={14}/> Reemplazar por plan actual</button>
              <button onClick={() => setPlan(null)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2.5 text-xs font-bold text-rose-200"><Trash2 size={14}/> Liberar plan</button>
            </div>
          </>}
        </div>

        {plan && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[640px]">
          <Mini label="Plan original" value={plan.direction} icon={plan.direction === "LONG" ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} good />
          <Mini label="Análisis actual" value={view?.currentDirection || "—"} icon={<Activity size={13}/>} bad={Boolean(view?.directionConflict)} />
          <Mini label="Precio vivo" value={fmt(view?.price)} icon={<Crosshair size={13}/>} />
          <Mini label="R del plan" value={plan.enteredAt ? `${Number(view?.r || 0) >= 0 ? "+" : ""}${Number(view?.r || 0).toFixed(2)}R` : "SIN ENTRADA"} icon={<Target size={13}/>} good={Number(view?.r || 0) > 0} bad={Number(view?.r || 0) < 0} />
          <Mini label="Trigger fijo" value={fmt(plan.trigger)} icon={<Crosshair size={13}/>} />
          <Mini label="Entrada fija" value={`${fmt(Math.min(plan.entryLow, plan.entryHigh))} – ${fmt(Math.max(plan.entryLow, plan.entryHigh))}`} icon={<Target size={13}/>} />
          <Mini label="Stop fijo" value={fmt(plan.stop)} icon={<ShieldAlert size={13}/>} bad />
          <Mini label="Tiempo" value={plan.enteredAt ? `${Math.floor(view?.enteredMinutes || 0)} min abierta` : `${Math.floor(view?.ageMinutes || 0)} min fijado`} icon={<Clock3 size={13}/>} />
        </div>}
      </div>

      {plan && <>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Level label="Invalidación" value={plan.invalidation} bad hit={Boolean(view?.invalidationHit)} />
          <Level label="STOP" value={plan.stop} bad hit={Boolean(view?.stopHit)} />
          <Level label="TP1" value={plan.tp1} good hit={Boolean(view?.tp1Hit)} />
          <Level label="TP2" value={plan.tp2} good hit={Boolean(view?.tp2Hit)} />
          <Level label="TP3" value={plan.tp3} good hit={Boolean(view?.tp3Hit)} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-white"><Lock size={15} className="text-cyan-300"/> Plan original</div>
            <div className="mt-2 text-xs leading-5 text-slate-400">Tipo: <b className="text-slate-200">{plan.predictionType}</b> · Setup inicial {plan.initialSetupScore.toFixed(1)}/100 · Preparación {plan.initialPreparationScore.toFixed(1)}/100 · Riesgo {plan.initialRiskScore.toFixed(1)}/100. Estos datos no se recalculan.</div>
          </div>
          <div className={`rounded-2xl border p-4 ${view?.directionConflict ? "border-rose-500/20 bg-rose-500/[.035]" : "border-emerald-500/15 bg-emerald-500/[.025]"}`}>
            <div className="flex items-center gap-2 text-sm font-black text-white">{view?.directionConflict ? <AlertTriangle size={15} className="text-rose-300"/> : <CheckCircle2 size={15} className="text-emerald-300"/>} Análisis actual vs plan</div>
            <div className="mt-2 text-xs leading-5 text-slate-400">{view?.directionConflict ? `El motor ahora ve ${view.currentDirection}, pero tu plan fijado sigue siendo ${plan.direction}. El conflicto se usa para gestión; no reemplaza automáticamente stop/TP.` : `El análisis actual sigue en la misma dirección ${plan.direction}. Aun así, la operación solo se mantiene mientras el plan original no sea invalidado.`}</div>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><XCircle size={13} className="mt-1 shrink-0"/>El gestor no modifica tu operación real en Binance. Es una guía paper/reglada: nunca amplía el stop y conserva la tesis original para evitar que cada recálculo cambie las reglas a mitad del trade.</div>
      </>}
    </div>
  </section>;
}

function Mini({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}

function Level({ label, value, good=false, bad=false, hit=false }: { label:string; value:number; good?:boolean; bad?:boolean; hit?:boolean }) {
  return <div className={`rounded-xl border p-3 ${hit ? good ? "border-emerald-500/30 bg-emerald-500/[.07]" : "border-rose-500/30 bg-rose-500/[.07]" : "border-slate-800 bg-slate-950/45"}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</span>{hit && <span className={`text-[8px] font-black ${good ? "text-emerald-300" : "text-rose-300"}`}>TOCADO</span>}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{fmt(value)}</div></div>;
}
