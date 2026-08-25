"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  DollarSign,
  Gauge,
  Pencil,
  Play,
  ShieldAlert,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { getLiveAnalysis, type LiveAnalysis } from "@/lib/api";

type Direction = "LONG" | "SHORT";

type ManualTrade = {
  symbol: string;
  direction: Direction;
  entry: number;
  margin: number;
  leverage: number;
  stop: number;
  tp1: number;
  tp2: number;
  tp3: number;
  feePctPerSide: number;
  openedAt: number;
};

type FormState = {
  direction: Direction;
  entry: string;
  margin: string;
  leverage: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  feePctPerSide: string;
};

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function money(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function okxId(symbol: string) {
  return `${symbol.replace(/USDT$/, "")}-USDT-SWAP`;
}

export default function ManualTradeMirror({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const storageKey = `explodex:manual-trade:${safeSymbol}`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [livePrice, setLivePrice] = useState(0);
  const [trade, setTrade] = useState<ManualTrade | null>(null);
  const [open, setOpen] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [form, setForm] = useState<FormState>({ direction: "LONG", entry: "", margin: "25", leverage: "5", stop: "", tp1: "", tp2: "", tp3: "", feePctPerSide: "0.05" });
  const hydrated = useRef(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try { setTrade(JSON.parse(raw) as ManualTrade); } catch {}
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    if (trade) window.localStorage.setItem(storageKey, JSON.stringify(trade));
    else window.localStorage.removeItem(storageKey);
  }, [storageKey, trade]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await getLiveAnalysis(safeSymbol);
        if (cancelled) return;
        setAnalysis(value);
        setLivePrice((current) => current || Number(value.current_price || 0));
        if (!trade && !open) {
          const p = value.prediction;
          setForm((old) => ({
            ...old,
            direction: p?.direction ?? (value.direction === "SHORT" ? "SHORT" : "LONG"),
            entry: fmt(value.current_price),
            stop: p?.stop_loss ? String(p.stop_loss) : "",
            tp1: p?.tp1 ? String(p.tp1) : "",
            tp2: p?.tp2 ? String(p.tp2) : "",
            tp3: p?.tp3 ? String(p.tp3) : "",
          }));
        }
      } catch {}
    }
    load();
    const timer = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [safeSymbol, trade, open]);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let ws: WebSocket | null = null;

    const apply = (p: number) => { if (!disposed && p > 0) setLivePrice(p); };
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

  const stats = useMemo(() => {
    if (!trade || !livePrice) return null;
    const notional = trade.margin * trade.leverage;
    const quantity = notional / trade.entry;
    const gross = trade.direction === "LONG" ? (livePrice - trade.entry) * quantity : (trade.entry - livePrice) * quantity;
    const entryFee = notional * (trade.feePctPerSide / 100);
    const exitNotional = livePrice * quantity;
    const estimatedFees = entryFee + exitNotional * (trade.feePctPerSide / 100);
    const net = gross - estimatedFees;
    const roi = trade.margin > 0 ? (net / trade.margin) * 100 : 0;
    const initialRisk = Math.abs(trade.entry - trade.stop) * quantity;
    const r = initialRisk > 0 ? net / initialRisk : 0;
    const elapsedMinutes = Math.max(0, (clock - trade.openedAt) / 60000);
    const hit = (level: number, kind: "profit" | "stop") => {
      if (!level) return false;
      if (trade.direction === "LONG") return kind === "profit" ? livePrice >= level : livePrice <= level;
      return kind === "profit" ? livePrice <= level : livePrice >= level;
    };
    const stopHit = hit(trade.stop, "stop");
    const tp1Hit = hit(trade.tp1, "profit");
    const tp2Hit = hit(trade.tp2, "profit");
    const tp3Hit = hit(trade.tp3, "profit");
    const timeStop = Number(analysis?.prediction?.time_stop_minutes || 40);
    const directionAligned = analysis?.prediction?.direction === trade.direction;

    let action = "MANTENER / VIGILAR";
    let tone: "green" | "amber" | "red" | "violet" = "amber";
    let detail = "La operación sigue abierta. Respeta el stop y observa el flujo.";
    if (stopHit) {
      action = "STOP ALCANZADO · SALIR"; tone = "red"; detail = "El precio cruzó tu stop registrado. En la operación real no conviene ampliar el stop para evitar la pérdida.";
    } else if (tp3Hit) {
      action = "TP3 ALCANZADO · PROTEGER RUNNER"; tone = "green"; detail = "El tercer objetivo fue alcanzado. Si sigues dentro, protege beneficio con estructura/trailing; no devuelvas toda la ganancia.";
    } else if (tp2Hit) {
      action = "TP2 ALCANZADO · TOMAR BENEFICIO"; tone = "green"; detail = "El objetivo principal del plan fue alcanzado. Paper V1 considera TP2 como salida principal.";
    } else if (tp1Hit) {
      action = "TP1 ALCANZADO · PROTEGER"; tone = "violet"; detail = "Primer objetivo alcanzado. La lógica de ExplodeX propone proteger y considerar stop a break-even si la estructura sigue válida.";
    } else if (elapsedMinutes >= timeStop && r < 0.5) {
      action = "TIME STOP · REEVALUAR"; tone = "red"; detail = `Han pasado ${Math.floor(elapsedMinutes)} min y la operación no desarrolló 0.5R netos. Es señal para revisar salida, no para ampliar el stop.`;
    } else if (!directionAligned && analysis?.prediction) {
      action = "SEÑAL ACTUAL EN CONFLICTO"; tone = "red"; detail = `Tu operación es ${trade.direction}, pero la predicción profunda actual apunta ${analysis.prediction.direction}. Vigila especialmente invalidación y flujo.`;
    } else if (analysis?.state === "READY" && directionAligned) {
      action = "MANTENER SEGÚN PLAN"; tone = "green"; detail = "La dirección registrada sigue alineada con un READY profundo. Mantener no significa garantía: el stop sigue mandando.";
    }
    return { notional, quantity, gross, estimatedFees, net, roi, r, elapsedMinutes, action, tone, detail, stopHit, tp1Hit, tp2Hit, tp3Hit, timeStop };
  }, [trade, livePrice, clock, analysis]);

  function openNew() {
    const p = analysis?.prediction;
    setForm({
      direction: p?.direction ?? (analysis?.direction === "SHORT" ? "SHORT" : "LONG"),
      entry: String(livePrice || analysis?.current_price || ""),
      margin: "25",
      leverage: "5",
      stop: p?.stop_loss ? String(p.stop_loss) : "",
      tp1: p?.tp1 ? String(p.tp1) : "",
      tp2: p?.tp2 ? String(p.tp2) : "",
      tp3: p?.tp3 ? String(p.tp3) : "",
      feePctPerSide: "0.05",
    });
    setOpen(true);
  }

  function useExplodeXPlan() {
    const p = analysis?.prediction;
    if (!p) return;
    setForm((old) => ({ ...old, direction: p.direction, stop: String(p.stop_loss || ""), tp1: String(p.tp1 || ""), tp2: String(p.tp2 || ""), tp3: String(p.tp3 || "") }));
  }

  function save() {
    const next: ManualTrade = {
      symbol: safeSymbol,
      direction: form.direction,
      entry: Number(form.entry),
      margin: Number(form.margin),
      leverage: Number(form.leverage),
      stop: Number(form.stop),
      tp1: Number(form.tp1),
      tp2: Number(form.tp2),
      tp3: Number(form.tp3),
      feePctPerSide: Number(form.feePctPerSide || 0),
      openedAt: trade?.openedAt ?? Date.now(),
    };
    if (!(next.entry > 0 && next.margin > 0 && next.leverage > 0 && next.stop > 0)) return;
    setTrade(next);
    setOpen(false);
  }

  const toneClass = stats?.tone === "green" ? "border-emerald-500/35 bg-emerald-500/10" : stats?.tone === "red" ? "border-rose-500/35 bg-rose-500/10" : stats?.tone === "violet" ? "border-violet-500/35 bg-violet-500/10" : "border-amber-500/35 bg-amber-500/10";

  return <>
    <div className="fixed bottom-5 right-5 z-[80] w-[min(390px,calc(100vw-24px))]">
      {trade && stats ? (
        <div className={`overflow-hidden rounded-2xl border shadow-2xl shadow-black/50 backdrop-blur-xl ${toneClass}`}>
          <button onClick={() => setOpen(true)} className="w-full p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-black text-white"><Activity size={14} className="text-cyan-300"/> ESPEJO DE MI OPERACIÓN</div>
                <div className="mt-1 flex items-center gap-2"><span className={`font-black ${trade.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{trade.direction}</span><span className="text-xs text-slate-400">{safeSymbol} · {trade.leverage}x</span></div>
              </div>
              <Pencil size={15} className="text-slate-400" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Mini label="Ahora" value={fmt(livePrice)} />
              <Mini label="PnL neto est." value={money(stats.net)} good={stats.net >= 0} bad={stats.net < 0} />
              <Mini label="ROI margen" value={pct(stats.roi)} good={stats.roi >= 0} bad={stats.roi < 0} />
            </div>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[9px] font-black uppercase tracking-[.12em] text-slate-400">Qué hacer ahora</div>
              <div className="mt-1 font-black text-white">{stats.action}</div>
              <div className="mt-1 text-[11px] leading-4 text-slate-300/75">{stats.detail}</div>
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>R {stats.r.toFixed(2)}</span><span>{Math.floor(stats.elapsedMinutes)} min abierta</span><span>Margen ${trade.margin.toFixed(2)}</span></div>
          </button>
        </div>
      ) : (
        <button onClick={openNew} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-5 py-4 font-black text-emerald-100 shadow-2xl shadow-black/40 backdrop-blur-xl transition hover:bg-emerald-500/20">
          <Play size={17}/> Simular mi entrada real
        </button>
      )}
    </div>

    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => setOpen(false)}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-700 bg-[#07111d] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="flex items-center gap-2 text-lg font-black text-white"><DollarSign size={19} className="text-emerald-300"/> Simular mi operación real</div><p className="mt-1 text-xs text-slate-400">Copia aquí los datos de tu posición de Binance. Esto NO coloca, modifica ni cierra órdenes reales.</p></div>
          <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:text-white"><X size={16}/></button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950/50 p-2">
            <button onClick={() => setForm((x) => ({...x, direction:"LONG"}))} className={`flex items-center justify-center gap-2 rounded-xl p-3 font-black ${form.direction === "LONG" ? "bg-emerald-500/15 text-emerald-300" : "text-slate-500"}`}><ArrowUpRight size={16}/> LONG</button>
            <button onClick={() => setForm((x) => ({...x, direction:"SHORT"}))} className={`flex items-center justify-center gap-2 rounded-xl p-3 font-black ${form.direction === "SHORT" ? "bg-rose-500/15 text-rose-300" : "text-slate-500"}`}><ArrowDownRight size={16}/> SHORT</button>
          </div>
          <Input label="Precio real de entrada" value={form.entry} onChange={(v) => setForm((x)=>({...x,entry:v}))} hint={`Ahora ${fmt(livePrice)}`} />
          <Input label="Margen que usaste (USDT)" value={form.margin} onChange={(v) => setForm((x)=>({...x,margin:v}))} hint="Ej. 30 USDT de margen" />
          <Input label="Apalancamiento" value={form.leverage} onChange={(v) => setForm((x)=>({...x,leverage:v}))} hint="Ej. 5x, 10x, 20x" />
          <Input label="Comisión estimada por lado (%)" value={form.feePctPerSide} onChange={(v) => setForm((x)=>({...x,feePctPerSide:v}))} hint="Ajusta según tu cuenta; funding no incluido" />
          <Input label="Stop loss" value={form.stop} onChange={(v) => setForm((x)=>({...x,stop:v}))} />
          <Input label="TP1" value={form.tp1} onChange={(v) => setForm((x)=>({...x,tp1:v}))} />
          <Input label="TP2" value={form.tp2} onChange={(v) => setForm((x)=>({...x,tp2:v}))} />
          <Input label="TP3" value={form.tp3} onChange={(v) => setForm((x)=>({...x,tp3:v}))} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => setForm((x)=>({...x,entry:String(livePrice)}))} className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs font-bold text-cyan-200"><Zap size={13} className="mr-1 inline"/>Usar precio actual</button>
          <button onClick={useExplodeXPlan} className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs font-bold text-violet-200"><Target size={13} className="mr-1 inline"/>Usar SL/TP de ExplodeX</button>
        </div>

        {Number(form.entry)>0 && Number(form.margin)>0 && Number(form.leverage)>0 && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini label="Notional" value={`$${(Number(form.margin)*Number(form.leverage)).toFixed(2)}`} />
          <Mini label="Cantidad aprox." value={fmt((Number(form.margin)*Number(form.leverage))/Number(form.entry))} />
          <Mini label="Riesgo al stop" value={`$${(Math.abs(Number(form.entry)-Number(form.stop))*((Number(form.margin)*Number(form.leverage))/Number(form.entry))).toFixed(2)}`} bad />
          <Mini label="Precio actual" value={fmt(livePrice)} />
        </div>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-[11px] text-amber-200/75"><ShieldAlert size={14} className="mt-0.5 shrink-0"/><span>El PnL es una estimación con precio de mercado. La liquidación exacta, funding, slippage y comisiones reales dependen de Binance, tipo de margen y tu cuenta.</span></div>
          <div className="flex shrink-0 gap-2">
            {trade && <button onClick={() => { setTrade(null); setOpen(false); }} className="rounded-xl border border-rose-500/20 px-3 py-2 text-rose-300"><Trash2 size={15}/></button>}
            <button onClick={save} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950">{trade ? "Actualizar" : "Empezar seguimiento"}</button>
          </div>
        </div>
      </div>
    </div>}
  </>;
}

function Input({ label, value, onChange, hint }: { label: string; value: string; onChange: (value:string)=>void; hint?: string }) {
  return <label className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">{label}</span><input inputMode="decimal" value={value} onChange={(e)=>onChange(e.target.value)} className="mt-2 w-full bg-transparent font-mono text-base font-black text-white outline-none" placeholder="0" />{hint && <span className="mt-1 block text-[9px] text-slate-600">{hint}</span>}</label>;
}

function Mini({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-2.5"><div className="text-[9px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
