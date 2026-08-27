"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, EyeOff, GraduationCap, RadioTower, SlidersHorizontal, Sparkles, Target, Zap } from "lucide-react";
import PriceChart, { type ChartPlan } from "@/components/PriceChart";
import { getCandles, type Candle } from "@/lib/api";
import { LOCKED_PLANS_EVENT, readLockedPlan } from "@/lib/lockedPlans";

type Interval = "1m" | "5m" | "15m";
type ViewMode = "BEGINNER" | "PRO";
type LevelKey = "entry" | "trigger" | "stop" | "targets" | "invalidation" | "myEntry";

const BINANCE_INTERVAL: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m" };
const OKX_INTERVAL: Record<Interval, string> = { "1m": "candle1m", "5m": "candle5m", "15m": "candle15m" };
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function okxId(symbol: string) {
  const value = symbol.toUpperCase();
  return `${value.endsWith("USDT") ? value.slice(0, -4) : value}-USDT-SWAP`;
}

function parseReason(value: unknown): Record<string, any> {
  if (value && typeof value === "object") return value as Record<string, any>;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return {}; }
  }
  return {};
}

function ema(values: number[], period: number) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const output: number[] = [];
  let current = values[0];
  output.push(current);
  for (let i = 1; i < values.length; i++) {
    current = values[i] * alpha + current * (1 - alpha);
    output.push(current);
  }
  return output;
}

function atr14(rows: Candle[]) {
  if (rows.length < 15) return 0;
  const tr: number[] = [];
  for (let i = Math.max(1, rows.length - 14); i < rows.length; i++) {
    const current = rows[i];
    const previous = rows[i - 1];
    tr.push(Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close)));
  }
  return tr.length ? tr.reduce((a, b) => a + b, 0) / tr.length : 0;
}

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function buildPullbackGuide(candles: Candle[], plan: ChartPlan | undefined, livePrice?: number | null) {
  const rows = candles.slice(-48);
  const direction = plan?.direction;
  if (!rows.length || !direction) {
    return {
      state: "NO_PLAN",
      label: "SIN PLAN ACTIVO",
      tone: "slate",
      score: 0,
      what: ["Esperar a que ExplodeX construya un plan con dirección, zona y trigger."],
      missing: ["Dirección y niveles técnicos."],
      avoid: ["No entrar solo porque una vela se mueve rápido."],
    };
  }

  const closes = rows.map((row, i) => i === rows.length - 1 && livePrice ? Number(livePrice) : Number(row.close));
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const e9 = ema9.at(-1) ?? closes.at(-1) ?? 0;
  const e21 = ema21.at(-1) ?? closes.at(-1) ?? 0;
  const last = Number(livePrice ?? rows.at(-1)?.close ?? 0);
  const lastCandle = rows.at(-1)!;
  const atr = atr14(rows);
  const recent = rows.slice(-20);
  const recentHigh = Math.max(...recent.map(x => x.high));
  const recentLow = Math.min(...recent.map(x => x.low));
  const long = direction === "LONG";
  const trendAligned = long ? e9 > e21 : e9 < e21;
  const favorableSideOf21 = long ? last >= e21 : last <= e21;
  const distance21Atr = atr > 0 ? Math.abs(last - e21) / atr : 99;
  const nearEma21 = distance21Atr <= 0.55;
  const entryLow = Math.min(Number(plan.entryLow || 0), Number(plan.entryHigh || 0));
  const entryHigh = Math.max(Number(plan.entryLow || 0), Number(plan.entryHigh || 0));
  const inEntry = entryLow > 0 && entryHigh > 0 && last >= entryLow && last <= entryHigh;
  const trigger = Number(plan.trigger || 0);
  const triggerHit = trigger > 0 && (long ? last >= trigger : last <= trigger);
  const invalidation = Number(plan.invalidation || plan.stop || 0);
  const invalidated = invalidation > 0 && (long ? last <= invalidation : last >= invalidation);
  const rejected = long
    ? lastCandle.close > lastCandle.open && lastCandle.low <= Math.min(e21, lastCandle.open)
    : lastCandle.close < lastCandle.open && lastCandle.high >= Math.max(e21, lastCandle.open);
  const swing = Math.max(recentHigh - recentLow, atr, 1e-12);
  const pullbackDepth = long ? (recentHigh - last) / swing : (last - recentLow) / swing;
  const extended = long ? last > recentHigh - swing * 0.08 : last < recentLow + swing * 0.08;

  let score = 0;
  score += trendAligned ? 28 : 0;
  score += favorableSideOf21 ? 12 : 0;
  score += nearEma21 ? 18 : 0;
  score += inEntry ? 16 : 0;
  score += rejected ? 14 : 0;
  score += triggerHit ? 12 : 0;
  if (pullbackDepth >= 0.12 && pullbackDepth <= 0.58) score += 10;
  if (extended && !inEntry) score -= 18;
  if (invalidated) score = 0;
  score = Math.max(0, Math.min(100, score));

  let state = "WAIT_PULLBACK";
  let label = "ESPERAR RETROCESO";
  let tone = "amber";
  if (invalidated) {
    state = "INVALIDATED"; label = "PLAN INVALIDADO"; tone = "rose";
  } else if (trendAligned && (nearEma21 || inEntry) && rejected && triggerHit && score >= 72) {
    state = "PULLBACK_CONFIRMED"; label = "PULLBACK CONFIRMADO"; tone = "emerald";
  } else if (trendAligned && (nearEma21 || inEntry) && score >= 48) {
    state = "PULLBACK_FORMING"; label = "PULLBACK EN FORMACIÓN"; tone = "cyan";
  } else if (extended) {
    state = "EXTENDED"; label = "SUBIDA EXTENDIDA · NO PERSEGUIR"; tone = "orange";
  } else if (!trendAligned) {
    state = "TREND_CONFLICT"; label = "TENDENCIA SIN ALINEAR"; tone = "slate";
  }

  const what: string[] = [];
  const missing: string[] = [];
  const avoid: string[] = [];
  if (trendAligned) what.push(`EMA 9/21 mantienen sesgo ${long ? "alcista" : "bajista"}.`);
  else missing.push("Alineación clara de EMA 9/21.");
  if (nearEma21) what.push("Precio cerca de EMA 21: zona típica de retroceso vigilable.");
  else if (!extended) missing.push("Acercamiento a EMA 21, soporte/retest o zona de entrada.");
  if (inEntry) what.push(`Precio dentro de zona teórica ${fmt(entryLow)}–${fmt(entryHigh)}.`);
  else if (entryLow > 0) missing.push("Regreso a la zona de entrada sin perseguir el precio.");
  if (rejected) what.push("La vela actual muestra intento de rechazo/reanudación.");
  else missing.push("Vela de rechazo/reanudación en la dirección del plan.");
  if (triggerHit) what.push(`Trigger ${fmt(trigger)} recuperado/tocado.`);
  else if (trigger > 0) missing.push(`Confirmar trigger ${fmt(trigger)}.`);
  if (extended) avoid.push("No perseguir una vela ya extendida; esperar retest.");
  if (invalidation > 0) avoid.push(`Si cruza invalidación ${fmt(invalidation)}, el plan deja de ser válido.`);
  avoid.push("No usar este score como probabilidad de que el precio necesariamente subirá/bajará.");

  return { state, label, tone, score, what, missing, avoid, ema9: e9, ema21: e21, atr, pullbackDepth };
}

function toneClasses(tone: string) {
  if (tone === "emerald") return "border-emerald-400/30 bg-emerald-400/[.07] text-emerald-200";
  if (tone === "cyan") return "border-cyan-400/30 bg-cyan-400/[.07] text-cyan-100";
  if (tone === "orange") return "border-orange-400/30 bg-orange-400/[.07] text-orange-100";
  if (tone === "rose") return "border-rose-400/30 bg-rose-400/[.07] text-rose-100";
  if (tone === "amber") return "border-amber-400/30 bg-amber-400/[.07] text-amber-100";
  return "border-slate-700 bg-slate-900/50 text-slate-300";
}

export default function LiveCandleChart({ symbol, plan, livePrice }: { symbol: string; plan?: ChartPlan; livePrice?: number | null }) {
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("CARGANDO");
  const [savedPlan, setSavedPlan] = useState<ChartPlan | undefined>(plan);
  const [actualEntry, setActualEntry] = useState<number | undefined>();
  const [viewMode, setViewMode] = useState<ViewMode>("BEGINNER");
  const [showControls, setShowControls] = useState(false);
  const [levels, setLevels] = useState<Record<LevelKey, boolean>>({ entry: true, trigger: true, stop: true, targets: true, invalidation: true, myEntry: true });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => { if (plan) setSavedPlan(plan); }, [plan]);

  useEffect(() => {
    const refresh = () => {
      const locked = readLockedPlan(symbol);
      const value = Number(locked?.actualEntryPrice || 0);
      setActualEntry(value > 0 ? value : undefined);
    };
    refresh();
    const onCustom = () => refresh();
    const onStorage = (event: StorageEvent) => { if (!event.key || event.key.includes(symbol.toUpperCase())) refresh(); };
    window.addEventListener(LOCKED_PLANS_EVENT, onCustom as EventListener);
    window.addEventListener("storage", onStorage);
    const timer = setInterval(refresh, 2000);
    return () => { window.removeEventListener(LOCKED_PLANS_EVENT, onCustom as EventListener); window.removeEventListener("storage", onStorage); clearInterval(timer); };
  }, [symbol]);

  useEffect(() => {
    if (plan || !BASE_URL) return;
    let cancelled = false;
    async function loadPlan() {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/signals/active?limit=100`, { cache: "no-store" });
        if (!response.ok) return;
        const rows = await response.json() as Array<Record<string, any>>;
        const row = rows.filter((item) => String(item.symbol).toUpperCase() === symbol.toUpperCase()).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (!row || cancelled) return;
        const reason = parseReason(row.reason);
        const prediction = parseReason(reason.prediction);
        setSavedPlan({
          direction: String(row.direction) === "SHORT" ? "SHORT" : "LONG",
          trigger: Number(prediction.trigger_price || 0) || undefined,
          entryLow: Number(prediction.entry_low || row.entry_low || 0) || undefined,
          entryHigh: Number(prediction.entry_high || row.entry_high || 0) || undefined,
          invalidation: Number(prediction.invalidation_price || 0) || undefined,
          stop: Number(prediction.stop_loss || row.stop_loss || 0) || undefined,
          tp1: Number(prediction.tp1 || row.tp1 || 0) || undefined,
          tp2: Number(prediction.tp2 || row.tp2 || 0) || undefined,
          tp3: Number(prediction.tp3 || row.tp3 || 0) || undefined,
        });
      } catch {}
    }
    loadPlan();
    const timer = setInterval(loadPlan, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [symbol, plan]);

  useEffect(() => {
    let disposed = false;
    let gotBinance = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    function merge(next: Candle) {
      setCandles((current) => {
        const copy = [...current];
        const last = copy[copy.length - 1];
        if (last && last.time === next.time) copy[copy.length - 1] = next;
        else if (!last || next.time > last.time) copy.push(next);
        return copy.slice(-96);
      });
    }
    function connectOkx() {
      if (disposed) return;
      try { socketRef.current?.close(); } catch {}
      const ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/business");
      socketRef.current = ws;
      setSource("OKX WS");
      ws.onopen = () => ws.send(JSON.stringify({ op: "subscribe", args: [{ channel: OKX_INTERVAL[interval], instId: okxId(symbol) }] }));
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          for (const row of payload?.data ?? []) {
            if (!Array.isArray(row) || row.length < 6) continue;
            merge({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[7] ?? row[6] ?? row[5] ?? 0) });
          }
        } catch {}
      };
    }
    async function start() {
      try { const initial = await getCandles(symbol, interval, 96); if (!disposed) setCandles(initial); } catch { if (!disposed) setCandles([]); }
      if (disposed) return;
      const ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${BINANCE_INTERVAL[interval]}`);
      socketRef.current = ws;
      setSource("BINANCE WS");
      ws.onmessage = (event) => {
        gotBinance = true;
        try {
          const k = JSON.parse(event.data)?.k;
          if (!k) return;
          merge({ time: Number(k.t), open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.q ?? k.v ?? 0) });
        } catch {}
      };
      ws.onerror = () => { if (!gotBinance) connectOkx(); };
      ws.onclose = () => { if (!disposed && !gotBinance) connectOkx(); };
      fallbackTimer = setTimeout(() => { if (!gotBinance) connectOkx(); }, 6000);
    }
    start();
    return () => { disposed = true; if (fallbackTimer) clearTimeout(fallbackTimer); try { socketRef.current?.close(); } catch {} };
  }, [symbol, interval]);

  const basePlan = useMemo<ChartPlan | undefined>(() => {
    const base = plan ?? savedPlan;
    if (!base && !actualEntry) return undefined;
    return { ...(base ?? {}), actualEntry };
  }, [plan, savedPlan, actualEntry]);

  const chartPlan = useMemo<ChartPlan | undefined>(() => {
    if (!basePlan) return undefined;
    return {
      ...basePlan,
      entryLow: levels.entry ? basePlan.entryLow : undefined,
      entryHigh: levels.entry ? basePlan.entryHigh : undefined,
      trigger: levels.trigger ? basePlan.trigger : undefined,
      stop: levels.stop ? basePlan.stop : undefined,
      tp1: levels.targets ? basePlan.tp1 : undefined,
      tp2: levels.targets ? basePlan.tp2 : undefined,
      tp3: levels.targets ? basePlan.tp3 : undefined,
      invalidation: levels.invalidation ? basePlan.invalidation : undefined,
      actualEntry: levels.myEntry ? basePlan.actualEntry : undefined,
    };
  }, [basePlan, levels]);

  const guide = useMemo(() => buildPullbackGuide(candles, basePlan, livePrice), [candles, basePlan, livePrice]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-950/70 to-[#06101b]/80 shadow-2xl shadow-black/10">
      <div className="border-b border-slate-800/80 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-white"><RadioTower size={14} className="text-emerald-400"/> {symbol} · mercado en vivo</div>
            <div className="mt-1 text-[10px] text-slate-600">WebSocket · {source} · lectura de pullback y plan superpuesto</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-800 bg-black/20 p-1">
              <button onClick={() => setViewMode("BEGINNER")} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-black ${viewMode === "BEGINNER" ? "bg-cyan-400/10 text-cyan-200" : "text-slate-500"}`}><GraduationCap size={12}/> Fácil</button>
              <button onClick={() => setViewMode("PRO")} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${viewMode === "PRO" ? "bg-violet-400/10 text-violet-200" : "text-slate-500"}`}>Pro</button>
            </div>
            <button onClick={() => setShowControls(v => !v)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] font-black text-slate-300"><SlidersHorizontal size={12}/> Qué mostrar <ChevronDown size={12}/></button>
            <div className="flex gap-1">{(["1m", "5m", "15m"] as Interval[]).map((value) => <button key={value} onClick={() => setIntervalValue(value)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${interval === value ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-500"}`}>{value}</button>)}</div>
          </div>
        </div>

        {showControls && <div className="mt-3 grid gap-2 rounded-2xl border border-slate-800 bg-black/20 p-3 sm:grid-cols-2 lg:grid-cols-6">
          {([
            ["entry","Zona entrada"],["trigger","Trigger"],["stop","Stop"],["targets","TP1/2/3"],["invalidation","Invalidación"],["myEntry","Mi entrada"]
          ] as Array<[LevelKey,string]>).map(([key,label]) => <button key={key} onClick={() => setLevels(old => ({...old,[key]:!old[key]}))} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-black ${levels[key] ? "border-cyan-400/20 bg-cyan-400/[.05] text-cyan-100" : "border-slate-800 text-slate-600"}`}><span>{label}</span>{levels[key] ? <Eye size={12}/> : <EyeOff size={12}/>}</button>)}
        </div>}
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div><PriceChart candles={candles} plan={chartPlan} livePrice={livePrice ?? undefined} /></div>
        <aside className="space-y-3">
          <div className={`rounded-2xl border p-4 ${toneClasses(guide.tone)}`}>
            <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em]"><Sparkles size={13}/> Lectura ExplodeX</div><div className="font-mono text-xs font-black">{guide.score}/100</div></div>
            <div className="mt-2 text-lg font-black">{guide.label}</div>
            <div className="mt-1 text-[10px] opacity-70">Score técnico de calidad del contexto; no es probabilidad.</div>
          </div>

          <GuideBlock icon={<Target size={13}/>} title="Qué buscar" rows={guide.what} empty="Todavía no hay confirmaciones claras." />
          <GuideBlock icon={<Zap size={13}/>} title="Qué falta" rows={guide.missing} empty="No falta una confirmación técnica principal." />
          <GuideBlock icon={<EyeOff size={13}/>} title="Qué evitar" rows={guide.avoid} />

          {viewMode === "BEGINNER" ? <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500">Explícamelo fácil</div>
            <p className="mt-2 text-xs leading-5 text-slate-300">{guide.state === "PULLBACK_CONFIRMED" ? "La tendencia sigue alineada, el precio regresó a una zona vigilable y ya mostró una señal de reanudación. Es una entrada potencial mejor ubicada que perseguir una subida." : guide.state === "PULLBACK_FORMING" ? "La tendencia sigue alineada y el precio está regresando a una zona interesante, pero todavía falta confirmación. Vigílalo; no es entrada lista todavía." : guide.state === "EXTENDED" ? "El movimiento puede seguir, pero comprar/vender ahora sería perseguir precio. Mejor esperar un retroceso y nueva confirmación." : guide.state === "INVALIDATED" ? "El precio cruzó la invalidación del plan. Este plan ya no debe tratarse como una oportunidad válida." : "Todavía no hay una entrada clara. Espera estructura, zona y confirmación en vez de adivinar."}</p>
          </div> : <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4 text-[10px] leading-5 text-slate-500">EMA9 {fmt(guide.ema9)} · EMA21 {fmt(guide.ema21)} · ATR14 {fmt(guide.atr)} · profundidad pullback {(Number(guide.pullbackDepth || 0) * 100).toFixed(0)}%</div>}
        </aside>
      </div>
    </section>
  );
}

function GuideBlock({ icon, title, rows, empty }: { icon: React.ReactNode; title: string; rows: string[]; empty?: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500">{icon}{title}</div><div className="mt-2 space-y-1.5 text-xs leading-5 text-slate-400">{rows.length ? rows.map((row,i)=><div key={i}>• {row}</div>) : <div className="text-slate-600">{empty ?? "—"}</div>}</div></div>;
}
