"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Crosshair,
  RadioTower,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
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

function okxId(symbol: string) {
  return `${symbol.replace(/USDT$/, "")}-USDT-SWAP`;
}

export default function TradeSafetyCoach({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [history, setHistory] = useState<DirectionPoint[]>([]);
  const [livePrice, setLivePrice] = useState(0);
  const notifiedWindow = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (cancelled) return;
        setAnalysis(value);
        setLivePrice((current) => current || Number(value.current_price || 0));
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

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let ws: WebSocket | null = null;
    const apply = (price: number) => { if (!disposed && price > 0) setLivePrice(price); };
    const connectOkx = () => {
      try { ws?.close(); } catch {}
      ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/public");
      ws.onopen = () => ws?.send(JSON.stringify({ op: "subscribe", args: [{ channel: "tickers", instId: okxId(safeSymbol) }] }));
      ws.onmessage = (event) => { try { apply(Number(JSON.parse(event.data)?.data?.[0]?.last ?? 0)); } catch {} };
    };
    ws = new WebSocket(`wss://fstream.binance.com/ws/${safeSymbol.toLowerCase()}@aggTrade`);
    ws.onmessage = (event) => { gotBinance = true; try { apply(Number(JSON.parse(event.data)?.p ?? 0)); } catch {} };
    ws.onerror = () => { if (!gotBinance) connectOkx(); };
    const fallback = setTimeout(() => { if (!gotBinance) connectOkx(); }, 4500);
    return () => { disposed = true; clearTimeout(fallback); try { ws?.close(); } catch {} };
  }, [safeSymbol]);

  const view = useMemo(() => {
    if (!analysis?.prediction) return null;
    const p = analysis.prediction;
    const direction = p.direction;
    const price = livePrice || analysis.current_price;
    const directionMatch = analysis.direction === direction;
    const edge = Math.abs(Number(analysis.long_score || 0) - Number(analysis.short_score || 0));
    const recent = history.slice(-4);
    const sameDirection = recent.length >= 3 && recent.every((x) => x.direction === direction);
    const flips = recent.slice(1).filter((x, i) => x.direction !== recent[i].direction).length;

    const ema9 = Number(analysis.metrics?.ema9 || 0);
    const ema21 = Number(analysis.metrics?.ema21 || 0);
    const emaKnown = ema9 > 0 && ema21 > 0;
    const emaAligned = !emaKnown || (direction === "LONG" ? ema9 > ema21 : ema9 < ema21);
    const stable = directionMatch && edge >= 12 && sameDirection && flips === 0 && emaAligned;
    const developing = directionMatch && edge >= 6 && flips <= 1;

    const trigger = Number(p.trigger_price || 0);
    const triggerHit = trigger > 0 && (direction === "LONG" ? price >= trigger : price <= trigger);
    const entryLow = Math.min(Number(p.entry_low || 0), Number(p.entry_high || 0));
    const entryHigh = Math.max(Number(p.entry_low || 0), Number(p.entry_high || 0));
    const inZone = price >= entryLow && price <= entryHigh;
    const invalidation = Number(p.invalidation_price || p.stop_loss || 0);
    const invalidated = invalidation > 0 && (direction === "LONG" ? price <= invalidation : price >= invalidation);
    const chase = Boolean(p.sequence?.chase_risk) || (triggerHit && !inZone && (direction === "LONG" ? price > entryHigh : price < entryLow));
    const deepReady = analysis.state === "READY" && p.phase === "ACTIVADO";
    const ready = deepReady && stable && triggerHit && inZone && !chase && !invalidated;

    const longWindowOpen = direction === "LONG" && ready;
    const shortWindowOpen = direction === "SHORT" && ready;
    const triggerDistancePct = trigger > 0 && price > 0
      ? (direction === "LONG" ? ((trigger - price) / price) * 100 : ((price - trigger) / price) * 100)
      : null;
    const zoneRoomPct = direction === "LONG" && entryHigh > 0 && price > 0
      ? ((entryHigh - price) / price) * 100
      : direction === "SHORT" && entryLow > 0 && price > 0
        ? ((price - entryLow) / price) * 100
        : null;

    const atrPct = Number(analysis.metrics?.atr_pct || 0);
    const atrAbs = price * atrPct / 100;
    const targets = (["TP1", "TP2", "TP3"] as const).map((name) => {
      const targetPrice = Number(name === "TP1" ? p.tp1 : name === "TP2" ? p.tp2 : p.tp3);
      const dist = Math.abs(targetPrice - trigger);
      const atr = atrAbs > 0 ? dist / atrAbs : 0;
      return { name, price: targetPrice, atr, pct: trigger > 0 ? dist / trigger * 100 : 0, label: targetFeasibility(atr, name) };
    });

    let action = "NO ENTRAR";
    let tone: "green" | "amber" | "red" | "violet" = "red";
    let why = "La dirección todavía no es suficientemente estable.";
    let longStage = "NO LONG";

    if (longWindowOpen) {
      action = "VENTANA LONG ABIERTA";
      longStage = "CONDICIÓN LONG CUMPLIDA";
      tone = "green";
      why = `Las reglas LONG están alineadas ahora mismo a ${fmt(price)}. El precio sigue dentro de ${fmt(entryLow)} – ${fmt(entryHigh)}.`;
    } else if (shortWindowOpen) {
      action = "VENTANA SHORT ABIERTA · NO LONG";
      longStage = "NO LONG";
      tone = "red";
      why = "La única ventana habilitada por las reglas actuales es SHORT. No mezclar direcciones.";
    } else if (direction !== "LONG") {
      action = "NO LONG · SESGO ACTUAL SHORT";
      longStage = "NO LONG";
      tone = "red";
      why = "El predictor actual no tiene una estructura LONG suficientemente fuerte. Esperar un cambio estable, no anticiparlo.";
    } else if (flips > 0 || !directionMatch || edge < 6) {
      action = "NO TRADE · DIRECCIÓN INESTABLE";
      longStage = "NO LONG";
      tone = "red";
      why = "LONG y SHORT están demasiado parejos o la dirección cambió recientemente. Espera hasta que deje de alternar.";
    } else if (!sameDirection || !emaAligned || edge < 12) {
      action = "VIGILAR LONG · FALTA ESTABILIDAD";
      longStage = "VIGILAR LONG";
      tone = "amber";
      why = "El LONG existe como idea, pero necesita persistencia, ventaja clara sobre SHORT y EMA alineadas antes de armar la entrada.";
    } else if (!triggerHit) {
      action = "LONG ARMADO · ESPERAR TRIGGER";
      longStage = "ARMADO";
      tone = "amber";
      why = `No entrar antes. El evento técnico que falta es tocar/cruzar ${fmt(trigger)} y conservar la estructura.`;
    } else if (invalidated) {
      action = "LONG INVALIDADO · NO ENTRAR";
      longStage = "INVALIDADO";
      tone = "red";
      why = "El precio cruzó la invalidación estructural del setup.";
    } else if (chase || !inZone) {
      action = "TRIGGER PASÓ · ESPERAR RETEST";
      longStage = "NO PERSEGUIR";
      tone = "violet";
      why = "El trigger se activó, pero el precio ya salió de la zona. La ventana de entrada ya no está abierta.";
    } else if (!deepReady) {
      action = "TRIGGER TOCADO · CONFIRMANDO";
      longStage = "CONFIRMANDO";
      tone = "violet";
      why = "El precio activó el trigger y sigue en zona, pero el análisis profundo todavía no autoriza READY.";
    }

    const tp1 = targets[0];
    const tpWarning = tp1.label === "LEJANO"
      ? "TP1 está lejos para la volatilidad actual. No asumir que llegará; exigir seguimiento fuerte y usar time-stop."
      : tp1.label === "EXIGENTE"
        ? "TP1 requiere un movimiento mayor de lo normal. Es alcanzable, pero no debe tratarse como objetivo fácil."
        : "TP1 está dentro de una distancia razonable respecto al ATR actual.";

    const hold = ready
      ? `Después de una entrada válida, mantener mientras no se rompa el stop ${fmt(p.stop_loss)}, no aparezca conflicto fuerte y no venza el time-stop (~${p.time_stop_minutes ?? 40} min) sin al menos ~0.5R de avance. En TP1 protege; TP2 es objetivo principal.`
      : "Todavía no hay una entrada válida que sostener. Esperar también forma parte del plan.";

    return { direction, price, edge, stable, developing, sameDirection, flips, emaAligned, ready, longWindowOpen, action, tone, why, longStage, targets, tpWarning, hold, triggerHit, inZone, trigger, entryLow, entryHigh, triggerDistancePct, zoneRoomPct };
  }, [analysis, history, livePrice]);

  useEffect(() => {
    if (!view?.longWindowOpen) {
      notifiedWindow.current = false;
      return;
    }
    if (notifiedWindow.current) return;
    notifiedWindow.current = true;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`ExplodeX · ${safeSymbol} LONG`, {
        body: `Condición LONG cumplida a ${fmt(view.price)} · zona ${fmt(view.entryLow)}–${fmt(view.entryHigh)}`,
      });
    }
  }, [view?.longWindowOpen, view?.price, view?.entryLow, view?.entryHigh, safeSymbol]);

  if (!analysis || !view) return null;

  const border = view.tone === "green" ? "border-emerald-500/40 bg-emerald-500/[.075]" : view.tone === "violet" ? "border-violet-500/30 bg-violet-500/[.05]" : view.tone === "amber" ? "border-amber-500/30 bg-amber-500/[.05]" : "border-rose-500/35 bg-rose-500/[.06]";
  const text = view.tone === "green" ? "text-emerald-300" : view.tone === "violet" ? "text-violet-300" : view.tone === "amber" ? "text-amber-300" : "text-rose-300";

  return (
    <section className="mx-auto mt-5 max-w-[1500px] px-4">
      <div className={`rounded-3xl border p-5 ${border}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><ShieldCheck size={17}/> Momento de entrada</div>
            <div className={`mt-2 text-3xl font-black ${text}`}>{view.action}</div>
            <p className="mt-2 text-sm leading-6 text-slate-300/80">{view.why}</p>
            {view.longWindowOpen && <div className="mt-4 animate-pulse rounded-2xl border border-emerald-400/35 bg-emerald-400/10 p-4">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-200"><BellRing size={17}/> CONDICIÓN LONG CUMPLIDA AHORA</div>
              <div className="mt-2 font-mono text-2xl font-black text-white">Precio vivo {fmt(view.price)}</div>
              <div className="mt-1 text-xs text-emerald-100/70">Zona válida: {fmt(view.entryLow)} – {fmt(view.entryHigh)} · margen antes de salir de zona: {view.zoneRoomPct == null ? "—" : `${Math.max(0, view.zoneRoomPct).toFixed(3)}%`}</div>
            </div>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Mini label="Estado LONG" value={view.longStage} good={view.longWindowOpen} bad={view.longStage === "NO LONG" || view.longStage === "INVALIDADO"} icon={<Zap size={13}/>} />
            <Mini label="Precio vivo" value={fmt(view.price)} good={view.longWindowOpen} icon={<RadioTower size={13}/>} />
            <Mini label="Ventaja L/S" value={`${view.edge.toFixed(1)} pts`} good={view.edge >= 12} bad={view.edge < 6} icon={<Crosshair size={13}/>} />
            <Mini label="Persistencia" value={history.length < 3 ? `${history.length}/3` : view.sameDirection ? "3/3 estable" : "cambió"} good={view.sameDirection} bad={view.flips > 0} icon={<Clock3 size={13}/>} />
            <Mini label="Trigger / zona" value={`${view.triggerHit ? "✓" : "○"} / ${view.inZone ? "✓" : "○"}`} good={view.triggerHit && view.inZone} icon={<Target size={13}/>} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Step n="1" title="LONG estable" ok={view.direction === "LONG" && view.stable} text="Misma dirección varias lecturas + ventaja suficiente + EMA alineadas." />
          <Step n="2" title="Trigger" ok={view.triggerHit} text={`Esperar ${fmt(view.trigger)}. No anticipar el cruce.`} />
          <Step n="3" title="Dentro de zona" ok={view.inZone} text={`${fmt(view.entryLow)} – ${fmt(view.entryHigh)}. Fuera = no perseguir.`} />
          <Step n="4" title="READY profundo" ok={analysis.state === "READY" && analysis.prediction?.phase === "ACTIVADO"} text="Flujo, riesgo y confirmaciones profundas siguen alineados." />
        </div>

        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-white">Ruta exacta al LONG</span><span className="font-mono text-[10px] text-violet-300">{view.triggerDistancePct == null ? "—" : view.triggerDistancePct <= 0 ? "TRIGGER TOCADO" : `${view.triggerDistancePct.toFixed(3)}% al trigger`}</span></div>
          <div className="mt-2 text-xs text-slate-400">Mientras no aparezca <b className="text-emerald-300">VENTANA LONG ABIERTA</b>, el sistema no considera completadas todas las condiciones. Si aparece y luego desaparece, la ventana se cerró: no perseguir.</div>
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
            <div className="flex items-center gap-2 text-sm font-black text-cyan-200"><CheckCircle2 size={15}/> ¿Hasta dónde sostener?</div>
            <p className="mt-2 text-xs leading-5 text-slate-400">{view.hold}</p>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500"><XCircle size={13} className="mt-0.5 shrink-0"/>“VENTANA LONG ABIERTA” significa que se cumplieron las reglas técnicas configuradas; no significa que el trade sea seguro ni que TP1 vaya a alcanzarse.</div>
      </div>
    </section>
  );
}

function Mini({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.08em] text-slate-500">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}

function Step({ n, title, ok, text }: { n:string; title:string; ok:boolean; text:string }) {
  return <div className={`rounded-2xl border p-3 ${ok ? "border-emerald-500/20 bg-emerald-500/[.045]" : "border-slate-800 bg-slate-950/45"}`}><div className="flex items-center gap-2"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${ok ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"}`}>{ok ? "✓" : n}</span><span className={`text-xs font-black ${ok ? "text-emerald-200" : "text-slate-300"}`}>{title}</span></div><div className="mt-2 text-[10px] leading-4 text-slate-500">{text}</div></div>;
}
