"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  FlaskConical,
  History,
  Save,
  ShieldAlert,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { getCandles, type Candle } from "@/lib/api";

type Direction = "LONG" | "SHORT";
type Outcome = "WIN" | "LOSS" | "UNRESOLVED" | "NO_ENTRY" | "AMBIGUOUS_CANDLE" | "AMBIGUOUS_TIME" | "OUT_OF_RANGE" | "ERROR";

type ExternalSignal = {
  id: string;
  source: string;
  sourceUrl?: string;
  rawText?: string;
  symbol: string;
  direction: Direction;
  confidence?: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  publishedAt: number;
  uncertaintyMinutes: number;
  horizonHours: number;
  createdAt: number;
};

type Evaluation = {
  outcome: Outcome;
  interval: string;
  entryTouched: boolean;
  entryTouchedAt?: number;
  firstBarrier?: "TP1" | "SL";
  firstBarrierAt?: number;
  highestTp: 0 | 1 | 2 | 3;
  tp1At?: number;
  tp2At?: number;
  tp3At?: number;
  stopAt?: number;
  mfePct?: number;
  maePct?: number;
  minutesToTp1?: number;
  minutesToStop?: number;
  reason?: string;
};

type StoredRow = ExternalSignal & { evaluation?: Evaluation; checkedAt?: number };

const STORAGE_KEY = "explodex:external-signal-journal:v1";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function f(value: string | number | undefined, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function dtInputValue(ts = Date.now()) {
  const date = new Date(ts - new Date(ts).getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function parsePost(text: string) {
  const upper = text.toUpperCase();
  const symbolMatch = upper.match(/\$?([A-Z0-9]{2,20})\s*\/\s*USDT/) || upper.match(/\$([A-Z0-9]{2,20})USDT/);
  const directionMatch = upper.match(/\b(LONG|LARGO|SHORT|CORTO)\b/);
  const confMatch = text.match(/CONF(?:IANZA)?\s*[:]?\s*(\d{1,3})\s*%/i);
  const entryMatch = text.match(/ENTRADA\s*[:]?\s*([0-9.,]+)\s*(?:–|-|—|A)\s*([0-9.,]+)/i);
  const slMatch = text.match(/\bSL\s*[:]?\s*([0-9.,]+)/i) || text.match(/STOP(?:LOSS)?\s*[:]?\s*([0-9.,]+)/i);
  const tp1Match = text.match(/TP1\s*[:]?\s*([0-9.,]+)/i);
  const tp2Match = text.match(/TP2\s*[:]?\s*([0-9.,]+)/i);
  const tp3Match = text.match(/TP3\s*[:]?\s*([0-9.,]+)/i);
  return {
    symbol: symbolMatch ? `${symbolMatch[1]}USDT` : "",
    direction: directionMatch ? (directionMatch[1] === "SHORT" || directionMatch[1] === "CORTO" ? "SHORT" : "LONG") as Direction : undefined,
    confidence: confMatch ? f(confMatch[1]) : undefined,
    entryLow: entryMatch ? f(entryMatch[1]) : undefined,
    entryHigh: entryMatch ? f(entryMatch[2]) : undefined,
    stop: slMatch ? f(slMatch[1]) : undefined,
    tp1: tp1Match ? f(tp1Match[1]) : undefined,
    tp2: tp2Match ? f(tp2Match[1]) : undefined,
    tp3: tp3Match ? f(tp3Match[1]) : undefined,
  };
}

function intervalForAge(ageHours: number) {
  if (ageHours <= 24) return "5m";
  if (ageHours <= 72) return "15m";
  if (ageHours <= 300) return "1h";
  return null;
}

function evaluateFromStart(signal: ExternalSignal, candles: Candle[], startMs: number): Evaluation {
  const endMs = Math.min(Date.now(), startMs + signal.horizonHours * 3600_000);
  const rows = candles.filter((c) => c.time >= startMs && c.time <= endMs);
  if (!rows.length) return { outcome: "OUT_OF_RANGE", interval: "", entryTouched: false, highestTp: 0, reason: "No hay velas suficientes para ese rango temporal." };

  const entryLow = Math.min(signal.entryLow, signal.entryHigh);
  const entryHigh = Math.max(signal.entryLow, signal.entryHigh);
  const entryMid = (entryLow + entryHigh) / 2;
  let entryIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].low <= entryHigh && rows[i].high >= entryLow) { entryIndex = i; break; }
  }
  if (entryIndex < 0) return { outcome: "NO_ENTRY", interval: "", entryTouched: false, highestTp: 0, reason: "El precio no volvió a la zona de entrada dentro del horizonte." };

  let highestTp: 0 | 1 | 2 | 3 = 0;
  let tp1At: number | undefined;
  let tp2At: number | undefined;
  let tp3At: number | undefined;
  let stopAt: number | undefined;
  let firstBarrier: "TP1" | "SL" | undefined;
  let firstBarrierAt: number | undefined;
  let ambiguous = false;
  let best = entryMid;
  let worst = entryMid;

  for (let i = entryIndex; i < rows.length; i++) {
    const c = rows[i];
    const hitStop = signal.direction === "LONG" ? c.low <= signal.stop : c.high >= signal.stop;
    const hit1 = signal.direction === "LONG" ? c.high >= signal.tp1 : c.low <= signal.tp1;
    const hit2 = signal.tp2 ? (signal.direction === "LONG" ? c.high >= signal.tp2 : c.low <= signal.tp2) : false;
    const hit3 = signal.tp3 ? (signal.direction === "LONG" ? c.high >= signal.tp3 : c.low <= signal.tp3) : false;

    if (signal.direction === "LONG") { best = Math.max(best, c.high); worst = Math.min(worst, c.low); }
    else { best = Math.min(best, c.low); worst = Math.max(worst, c.high); }

    if (hit1 && !tp1At) tp1At = c.time;
    if (hit2 && !tp2At) tp2At = c.time;
    if (hit3 && !tp3At) tp3At = c.time;
    if (hitStop && !stopAt) stopAt = c.time;
    if (hit3) highestTp = 3; else if (hit2 && highestTp < 2) highestTp = 2; else if (hit1 && highestTp < 1) highestTp = 1;

    if (!firstBarrier) {
      if (hitStop && hit1) { ambiguous = true; break; }
      if (hit1) { firstBarrier = "TP1"; firstBarrierAt = c.time; }
      else if (hitStop) { firstBarrier = "SL"; firstBarrierAt = c.time; }
    }
  }

  const favorable = signal.direction === "LONG" ? (best - entryMid) / entryMid * 100 : (entryMid - best) / entryMid * 100;
  const adverse = signal.direction === "LONG" ? (entryMid - worst) / entryMid * 100 : (worst - entryMid) / entryMid * 100;
  const entryTouchedAt = rows[entryIndex].time;
  if (ambiguous) return { outcome: "AMBIGUOUS_CANDLE", interval: "", entryTouched: true, entryTouchedAt, highestTp, tp1At, tp2At, tp3At, stopAt, mfePct: favorable, maePct: adverse, reason: "TP1 y SL aparecen dentro de la misma vela; con OHLC no se puede saber cuál ocurrió primero." };

  const outcome: Outcome = firstBarrier === "TP1" ? "WIN" : firstBarrier === "SL" ? "LOSS" : "UNRESOLVED";
  return {
    outcome,
    interval: "",
    entryTouched: true,
    entryTouchedAt,
    firstBarrier,
    firstBarrierAt,
    highestTp,
    tp1At,
    tp2At,
    tp3At,
    stopAt,
    mfePct: favorable,
    maePct: adverse,
    minutesToTp1: tp1At ? (tp1At - entryTouchedAt) / 60000 : undefined,
    minutesToStop: stopAt ? (stopAt - entryTouchedAt) / 60000 : undefined,
  };
}

async function evaluateSignal(signal: ExternalSignal): Promise<Evaluation> {
  const ageHours = (Date.now() - signal.publishedAt + signal.uncertaintyMinutes * 60000) / 3600_000;
  const interval = intervalForAge(ageHours);
  if (!interval) return { outcome: "OUT_OF_RANGE", interval: "—", entryTouched: false, highestTp: 0, reason: "La señal es demasiado antigua para el histórico corto disponible en esta versión." };
  try {
    const candles = await getCandles(signal.symbol, interval, 300);
    const starts = signal.uncertaintyMinutes > 0
      ? [signal.publishedAt - signal.uncertaintyMinutes * 60000, signal.publishedAt, signal.publishedAt + signal.uncertaintyMinutes * 60000]
      : [signal.publishedAt];
    const results = starts.map((start) => evaluateFromStart(signal, candles, start));
    const signatures = new Set(results.map((r) => `${r.outcome}:${r.firstBarrier ?? "-"}:${r.highestTp}`));
    const center = results[Math.floor(results.length / 2)];
    if (signatures.size > 1) return { ...center, outcome: "AMBIGUOUS_TIME", interval, reason: "El resultado cambia dentro del margen de incertidumbre de la hora publicada." };
    return { ...center, interval };
  } catch (error) {
    return { outcome: "ERROR", interval, entryTouched: false, highestTp: 0, reason: error instanceof Error ? error.message : "Error al consultar velas" };
  }
}

function confBucket(conf?: number) {
  if (conf == null) return "SIN CONF";
  if (conf >= 90) return "90+";
  if (conf >= 85) return "85–89";
  if (conf >= 80) return "80–84";
  return "<80";
}

function outcomeLabel(outcome?: Outcome) {
  const map: Record<Outcome, string> = {
    WIN: "TP1 ANTES QUE SL",
    LOSS: "SL ANTES QUE TP1",
    UNRESOLVED: "SIN RESOLVER",
    NO_ENTRY: "NO ENTRÓ EN ZONA",
    AMBIGUOUS_CANDLE: "VELA AMBIGUA",
    AMBIGUOUS_TIME: "HORA AMBIGUA",
    OUT_OF_RANGE: "FUERA DE RANGO",
    ERROR: "ERROR",
  };
  return outcome ? map[outcome] : "SIN COMPROBAR";
}

export default function ExternalSignalJournal() {
  const [rows, setRows] = useState<StoredRow[]>([]);
  const [rawText, setRawText] = useState("");
  const [form, setForm] = useState({ source: "612 Ceros", sourceUrl: "", symbol: "", direction: "LONG" as Direction, confidence: "", entryLow: "", entryHigh: "", stop: "", tp1: "", tp2: "", tp3: "", publishedAt: dtInputValue(), uncertaintyMinutes: "30", horizonHours: "24" });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setRows(JSON.parse(saved)); } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); } catch {} }, [rows]);

  function parseNow() {
    const p = parsePost(rawText);
    setForm((x) => ({ ...x,
      symbol: p.symbol || x.symbol,
      direction: p.direction || x.direction,
      confidence: p.confidence != null ? String(p.confidence) : x.confidence,
      entryLow: p.entryLow != null ? String(p.entryLow) : x.entryLow,
      entryHigh: p.entryHigh != null ? String(p.entryHigh) : x.entryHigh,
      stop: p.stop != null ? String(p.stop) : x.stop,
      tp1: p.tp1 != null ? String(p.tp1) : x.tp1,
      tp2: p.tp2 != null ? String(p.tp2) : x.tp2,
      tp3: p.tp3 != null ? String(p.tp3) : x.tp3,
    }));
  }

  async function saveAndCheck() {
    const symbol = form.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "") + "USDT";
    const signal: ExternalSignal = {
      id: uid(), source: form.source.trim() || "Externa", sourceUrl: form.sourceUrl.trim() || undefined, rawText: rawText.trim() || undefined,
      symbol, direction: form.direction, confidence: form.confidence ? f(form.confidence) : undefined,
      entryLow: f(form.entryLow), entryHigh: f(form.entryHigh), stop: f(form.stop), tp1: f(form.tp1), tp2: form.tp2 ? f(form.tp2) : undefined, tp3: form.tp3 ? f(form.tp3) : undefined,
      publishedAt: new Date(form.publishedAt).getTime(), uncertaintyMinutes: Math.max(0, f(form.uncertaintyMinutes)), horizonHours: Math.max(1, f(form.horizonHours, 24)), createdAt: Date.now(),
    };
    if (!(signal.entryLow > 0 && signal.entryHigh > 0 && signal.stop > 0 && signal.tp1 > 0 && signal.publishedAt > 0)) return;
    setBusyId(signal.id);
    const evaluation = await evaluateSignal(signal);
    setRows((current) => [{ ...signal, evaluation, checkedAt: Date.now() }, ...current]);
    setBusyId(null);
  }

  async function recheck(row: StoredRow) {
    setBusyId(row.id);
    const evaluation = await evaluateSignal(row);
    setRows((current) => current.map((x) => x.id === row.id ? { ...x, evaluation, checkedAt: Date.now() } : x));
    setBusyId(null);
  }

  const stats = useMemo(() => {
    const buckets = ["80–84", "85–89", "90+"];
    return buckets.map((bucket) => {
      const group = rows.filter((r) => confBucket(r.confidence) === bucket && ["WIN", "LOSS"].includes(r.evaluation?.outcome || ""));
      const wins = group.filter((r) => r.evaluation?.outcome === "WIN").length;
      return { bucket, n: group.length, wins, losses: group.length - wins, rate: group.length ? wins / group.length * 100 : null };
    });
  }, [rows]);

  return <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
    <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[.035] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-cyan-300"><FlaskConical size={17}/> Validación histórica externa</div><h1 className="mt-2 text-3xl font-black text-white">¿El “Conf 89%” realmente funciona?</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Guarda señales públicas, reconstruye la hora y comprueba con velas qué ocurrió primero. El objetivo es medir al trader sin seleccionar solo sus victorias.</p></div>
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[.04] px-4 py-3 text-xs text-amber-200"><ShieldAlert size={14} className="mr-2 inline"/>TP1 antes de SL es un resultado histórico, no garantía futura.</div>
      </div>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-3xl border border-slate-800 bg-[#07111d]/80 p-5">
        <div className="text-lg font-black text-white">1. Pega la publicación</div>
        <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="$AKE/USDT - LONG · Conf 91%\nEntrada: ...\nSL: ...\nTP1: ..." className="mt-3 min-h-48 w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-200 outline-none focus:border-cyan-500/30" />
        <button onClick={parseNow} className="mt-3 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-xs font-black text-cyan-100">Extraer datos automáticamente</button>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-[#07111d]/80 p-5">
        <div className="text-lg font-black text-white">2. Confirma fecha, hora y plan</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input label="Fuente" value={form.source} onChange={(v) => setForm((x) => ({ ...x, source: v }))} />
          <Input label="URL opcional" value={form.sourceUrl} onChange={(v) => setForm((x) => ({ ...x, sourceUrl: v }))} />
          <Input label="Símbolo" value={form.symbol} onChange={(v) => setForm((x) => ({ ...x, symbol: v }))} />
          <label className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">Dirección</span><select value={form.direction} onChange={(e) => setForm((x) => ({ ...x, direction: e.target.value as Direction }))} className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none"><option className="bg-slate-950">LONG</option><option className="bg-slate-950">SHORT</option></select></label>
          <Input label="Conf %" value={form.confidence} onChange={(v) => setForm((x) => ({ ...x, confidence: v }))} />
          <Input label="Entrada baja" value={form.entryLow} onChange={(v) => setForm((x) => ({ ...x, entryLow: v }))} />
          <Input label="Entrada alta" value={form.entryHigh} onChange={(v) => setForm((x) => ({ ...x, entryHigh: v }))} />
          <Input label="SL" value={form.stop} onChange={(v) => setForm((x) => ({ ...x, stop: v }))} />
          <Input label="TP1" value={form.tp1} onChange={(v) => setForm((x) => ({ ...x, tp1: v }))} />
          <Input label="TP2" value={form.tp2} onChange={(v) => setForm((x) => ({ ...x, tp2: v }))} />
          <Input label="TP3" value={form.tp3} onChange={(v) => setForm((x) => ({ ...x, tp3: v }))} />
          <label className="col-span-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">Fecha/hora de publicación</span><input type="datetime-local" value={form.publishedAt} onChange={(e) => setForm((x) => ({ ...x, publishedAt: e.target.value }))} className="mt-2 w-full bg-transparent text-sm font-black text-white outline-none" /></label>
          <Input label="Incertidumbre ± min" value={form.uncertaintyMinutes} onChange={(v) => setForm((x) => ({ ...x, uncertaintyMinutes: v }))} />
          <Input label="Horizonte horas" value={form.horizonHours} onChange={(v) => setForm((x) => ({ ...x, horizonHours: v }))} />
        </div>
        <button onClick={saveAndCheck} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950"><Save size={14}/> Guardar y comprobar</button>
      </section>
    </div>

    <section className="mt-5 rounded-3xl border border-slate-800 bg-[#07111d]/80 p-5">
      <div className="flex items-center gap-2 text-lg font-black text-white"><BarChart3 size={18} className="text-violet-300"/> ¿La confianza publicada se traduce en acierto?</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">{stats.map((s) => <div key={s.bucket} className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"><div className="text-xs font-black text-slate-400">CONF {s.bucket}</div><div className="mt-2 font-mono text-2xl font-black text-white">{s.rate == null ? "—" : `${s.rate.toFixed(1)}%`}</div><div className="mt-1 text-[10px] text-slate-500">{s.n} resueltas · {s.wins} TP1 primero · {s.losses} SL primero</div></div>)}</div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Solo cuenta señales donde hubo entrada y se pudo determinar inequívocamente TP1 vs SL. Horas/velas ambiguas y señales sin resolver se excluyen del porcentaje.</p>
    </section>

    <section className="mt-5 rounded-3xl border border-slate-800 bg-[#07111d]/80 p-5">
      <div className="flex items-center gap-2 text-lg font-black text-white"><History size={18} className="text-cyan-300"/> Journal</div>
      <div className="mt-4 space-y-3">{rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Aún no has guardado señales externas.</div> : rows.map((row) => <SignalRow key={row.id} row={row} busy={busyId === row.id} onRecheck={() => recheck(row)} onDelete={() => setRows((x) => x.filter((v) => v.id !== row.id))} />)}</div>
    </section>
  </main>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="rounded-xl border border-slate-800 bg-slate-950/50 p-3"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full bg-transparent font-mono text-sm font-black text-white outline-none" /></label>;
}

function SignalRow({ row, busy, onRecheck, onDelete }: { row: StoredRow; busy: boolean; onRecheck: () => void; onDelete: () => void }) {
  const e = row.evaluation;
  const positive = e?.outcome === "WIN";
  const negative = e?.outcome === "LOSS";
  const ambiguous = e?.outcome === "AMBIGUOUS_CANDLE" || e?.outcome === "AMBIGUOUS_TIME";
  const border = positive ? "border-emerald-500/25" : negative ? "border-rose-500/25" : ambiguous ? "border-amber-500/25" : "border-slate-800";
  return <div className={`rounded-2xl border ${border} bg-slate-950/45 p-4`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><span className="font-black text-white">{row.symbol}</span><span className={`inline-flex items-center gap-1 text-xs font-black ${row.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{row.direction === "LONG" ? <TrendingUp size={13}/> : <TrendingDown size={13}/>} {row.direction}</span>{row.confidence != null && <span className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2 py-0.5 text-[10px] font-black text-violet-200">Conf {row.confidence}%</span>}</div><div className="mt-1 text-[10px] text-slate-500">{row.source} · {new Date(row.publishedAt).toLocaleString()} {row.uncertaintyMinutes ? `±${row.uncertaintyMinutes} min` : "· hora exacta"}</div></div>
      <div className={`rounded-full border px-3 py-1 text-[10px] font-black ${positive ? "border-emerald-500/25 text-emerald-300" : negative ? "border-rose-500/25 text-rose-300" : "border-slate-700 text-slate-300"}`}>{outcomeLabel(e?.outcome)}</div>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <Mini label="Entrada" value={`${fmt(row.entryLow)}–${fmt(row.entryHigh)}`} />
      <Mini label="SL" value={fmt(row.stop)} bad />
      <Mini label="TP1" value={fmt(row.tp1)} good />
      <Mini label="TP máximo" value={e ? `TP${e.highestTp}` : "—"} good={Boolean(e?.highestTp)} />
      <Mini label="MFE" value={e?.mfePct == null ? "—" : `+${e.mfePct.toFixed(2)}%`} good />
      <Mini label="MAE" value={e?.maePct == null ? "—" : `-${e.maePct.toFixed(2)}%`} bad />
      <Mini label="TP1 tiempo" value={e?.minutesToTp1 == null ? "—" : `${Math.round(e.minutesToTp1)} min`} />
      <Mini label="Resolución" value={e?.interval || "—"} />
    </div>
    {e?.reason && <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-200/80"><AlertTriangle size={13} className="mt-1 shrink-0"/>{e.reason}</div>}
    <div className="mt-3 flex flex-wrap gap-2"><button onClick={onRecheck} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] font-black text-cyan-200"><Clock3 size={12}/>{busy ? "Comprobando..." : "Recomprobar"}</button><button onClick={onDelete} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[10px] font-black text-rose-200"><Trash2 size={12}/>Eliminar</button></div>
  </div>;
}

function Mini({ label, value, good=false, bad=false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
