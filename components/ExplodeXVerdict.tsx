"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CheckCircle2, Clock3, ShieldX, Target, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { getCandles, getLiveAnalysis, type Candle, type LiveAnalysis } from "@/lib/api";
import { buildVerdictFusion, type VerdictDirection, type VerdictFusion } from "@/lib/verdictFusion";
import { appendVerdictJournal, getVerdictProfileStats } from "@/lib/verdictJournal";

type Verdict = "ENTER" | "WAIT" | "NO_TRADE";

type VerdictSample = {
  at: number;
  direction: VerdictDirection;
  candidate: boolean;
  passCount: number;
  confidence: number;
};

type EntryLatch = {
  direction: VerdictDirection;
  openedAt: number;
  expiresAt: number;
  entryLow: number;
  entryHigh: number;
  stop: number;
  tp1: number;
};

const HISTORY_PREFIX = "explodex:verdict-history:";
const LATCH_PREFIX = "explodex:verdict-latch:";

function formatPrice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 5 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function readHistory(symbol: string): VerdictSample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`${HISTORY_PREFIX}${symbol}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-8) : [];
  } catch {
    return [];
  }
}

function saveHistory(symbol: string, rows: VerdictSample[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(`${HISTORY_PREFIX}${symbol}`, JSON.stringify(rows.slice(-8))); } catch {}
}

function readLatch(symbol: string): EntryLatch | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${LATCH_PREFIX}${symbol}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EntryLatch;
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
      localStorage.removeItem(`${LATCH_PREFIX}${symbol}`);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveLatch(symbol: string, latch: EntryLatch | null) {
  if (typeof window === "undefined") return;
  try {
    if (!latch) localStorage.removeItem(`${LATCH_PREFIX}${symbol}`);
    else localStorage.setItem(`${LATCH_PREFIX}${symbol}`, JSON.stringify(latch));
  } catch {}
}

export default function ExplodeXVerdict({ symbol }: { symbol: string }) {
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const [analysis, setAnalysis] = useState<LiveAnalysis | null>(null);
  const [m1, setM1] = useState<Candle[]>([]);
  const [m5, setM5] = useState<Candle[]>([]);
  const [m15, setM15] = useState<Candle[]>([]);
  const [history, setHistory] = useState<VerdictSample[]>([]);
  const [latch, setLatch] = useState<EntryLatch | null>(null);
  const previousVerdict = useRef<Verdict | null>(null);

  useEffect(() => {
    setHistory(readHistory(safeSymbol));
    setLatch(readLatch(safeSymbol));
  }, [safeSymbol]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, c1, c5, c15] = await Promise.all([
          getLiveAnalysis(safeSymbol, true),
          getCandles(safeSymbol, "1m", 72),
          getCandles(safeSymbol, "5m", 72),
          getCandles(safeSymbol, "15m", 72),
        ]);
        if (!cancelled) {
          setAnalysis(a);
          setM1(c1);
          setM5(c5);
          setM15(c15);
        }
      } catch {}
    }
    load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [safeSymbol]);

  const fusion: VerdictFusion | null = useMemo(() => {
    if (!analysis || m1.length < 30 || m5.length < 30 || m15.length < 30) return null;
    return buildVerdictFusion(analysis, m1, m5, m15);
  }, [analysis, m1, m5, m15]);

  useEffect(() => {
    if (!fusion) return;
    const last = history.at(-1);
    if (last && Date.now() - last.at < 8_000) return;
    const next = [...history, {
      at: Date.now(),
      direction: fusion.direction,
      candidate: fusion.candidateEnter,
      passCount: fusion.passCount,
      confidence: fusion.technicalConfidence,
    }].slice(-8);
    setHistory(next);
    saveHistory(safeSymbol, next);
  }, [fusion, history, safeSymbol]);

  const view = useMemo(() => {
    if (!fusion || !analysis) return null;

    const exactHistory = getVerdictProfileStats({
      lockCount: fusion.passCount,
      burst: fusion.burstDetected,
      fastTrack: fusion.fastTrack,
      direction: fusion.direction,
    });
    const lockHistory = getVerdictProfileStats({ lockCount: fusion.passCount });
    const empirical = exactHistory.sample >= 30 ? exactHistory : lockHistory;
    const historicalWeak = empirical.sample >= 30 && empirical.status === "WEAK";

    const last = history.at(-1);
    const previousCandidateSameDirection = Boolean(last && last.candidate && last.direction === fusion.direction);
    const prior2 = history.slice(-2);
    const priorDirectionLocked = prior2.length === 2 && prior2[0].direction === prior2[1].direction ? prior2[0].direction : null;
    const firstFlipAgainstLock = Boolean(priorDirectionLocked && priorDirectionLocked !== fusion.direction);

    const activeLatch = latch && latch.expiresAt > Date.now() ? latch : null;
    const latchStopHit = activeLatch
      ? activeLatch.direction === "LONG" ? fusion.price <= activeLatch.stop : fusion.price >= activeLatch.stop
      : false;
    const last2OppositeLatch = activeLatch && prior2.length === 2 ? prior2.every((x) => x.direction !== activeLatch.direction) : false;
    const severeSoftBlock = fusion.trapRisk >= 75 || fusion.decayRisk >= 82;
    const latchStillNear = activeLatch ? fusion.inZone || fusion.nearZone : false;

    let verdict: Verdict = "WAIT";
    let title = "ESPERAR";
    let reason = "Todavía falta completar la confirmación.";
    let next = "No entrar hasta que el sistema habilite la zona.";
    let useLatch = false;

    if (fusion.hardBlock || latchStopHit) {
      verdict = "NO_TRADE";
      title = "NO TRADE";
      reason = latchStopHit ? "El plan bloqueado alcanzó su stop original." : (fusion.hardBlockReason ?? "Existe un bloqueo duro.");
      next = "Esperar un setup nuevo; no ampliar el stop ni rescatar una tesis invalidada.";
    } else if (activeLatch && last2OppositeLatch) {
      verdict = "WAIT";
      title = "PLAN EN REEVALUACIÓN";
      reason = "La dirección contraria ya apareció en dos lecturas consecutivas.";
      next = "No agregar exposición hasta que vuelva a estabilizarse.";
    } else if (activeLatch && severeSoftBlock) {
      verdict = "WAIT";
      title = "VENTANA SUSPENDIDA";
      reason = fusion.trapRisk >= 75 ? "Aumentó demasiado el riesgo de falsa ruptura." : "El impulso muestra agotamiento extremo.";
      next = "Esperar reclaim o una nueva confirmación antes de entrar.";
    } else if (activeLatch && latchStillNear) {
      verdict = "ENTER";
      title = "ENTRADA VIGENTE · PAPER";
      reason = "La ventana ya fue confirmada y sigue dentro del rango permitido sin bloqueo duro.";
      next = `Ventana bloqueada hasta ${new Date(activeLatch.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.`;
      useLatch = true;
    } else if (activeLatch && !latchStillNear) {
      verdict = "WAIT";
      title = "SE ESCAPÓ LA ZONA";
      reason = "La entrada fue válida, pero el precio ya salió de la zona razonable.";
      next = "No perseguir. Esperar retest o un setup nuevo.";
    } else if (fusion.candidateEnter && historicalWeak) {
      verdict = "WAIT";
      title = "ESPERAR · HISTORIAL DÉBIL";
      reason = `Este perfil tiene ${empirical.sample} casos y un win rate histórico de ${(empirical.winRatePct ?? 0).toFixed(1)}%.`;
      next = "Veto suave: esperar una entrada de mayor calidad. El historial no invalida la dirección por sí solo.";
    } else if (fusion.fastTrack && !firstFlipAgainstLock) {
      verdict = "ENTER";
      title = fusion.burstDetected ? "ENTRAR AHORA · BURST · PAPER" : "ENTRAR AHORA · PAPER";
      reason = `FAST TRACK: ${fusion.passCount}/6 candados y confianza técnica ${fusion.technicalConfidence.toFixed(0)}/100.`;
      next = fusion.burstDetected ? `Aceleración ${fusion.accelerationScore.toFixed(0)}/100; respetar zona y stop.` : "Todos los filtros fuertes coinciden; respetar stop y riesgo.";
    } else if (fusion.candidateEnter && previousCandidateSameDirection && !firstFlipAgainstLock) {
      verdict = "ENTER";
      title = "ENTRAR AHORA · PAPER";
      reason = `Confirmación persistente: ${fusion.passCount}/6 candados en lecturas consecutivas.`;
      next = "La señal sobrevivió la segunda lectura; respetar el plan original.";
    } else if (fusion.candidateEnter) {
      verdict = "WAIT";
      title = "CONFIRMANDO 1/2";
      reason = firstFlipAgainstLock
        ? `Direction Lock todavía conserva ${priorDirectionLocked}; una sola lectura contraria no basta.`
        : `Hay ${fusion.passCount}/6 candados, pero falta una segunda lectura para evitar falsa confirmación.`;
      next = fusion.burstDetected ? `⚡ Burst ${fusion.accelerationScore.toFixed(0)}/100 detectado; la siguiente lectura decide.` : "Mantener la moneda visible; la siguiente lectura decide.";
    } else if (!fusion.locks.entry) {
      verdict = "WAIT";
      title = fusion.chase ? "ESPERAR RETEST" : "ESPERAR ZONA";
      reason = fusion.chase ? "La dirección puede ser correcta, pero la entrada actual está perseguida." : "El precio todavía no ofrece una entrada de calidad suficiente.";
      next = `Zona ${formatPrice(fusion.entryLow)}–${formatPrice(fusion.entryHigh)} · calidad ${fusion.entryQuality.toFixed(0)}/100.`;
    } else if (!fusion.locks.trap) {
      verdict = "WAIT";
      title = "ESPERAR · POSIBLE TRAMPA";
      reason = `Riesgo de falsa ruptura ${fusion.trapRisk.toFixed(0)}/100.`;
      next = "Esperar aceptación/reclaim antes de habilitar entrada.";
    } else if (!fusion.locks.momentum) {
      verdict = "WAIT";
      title = "ESPERAR · IMPULSO CANSADO";
      reason = `Decay ${fusion.decayRisk.toFixed(0)}/100; puede ser una entrada tardía.`;
      next = "Esperar retest o nueva aceleración.";
    } else {
      verdict = "WAIT";
      title = "ESPERAR";
      reason = `${fusion.passCount}/6 candados. Todavía falta confluencia suficiente.`;
      next = `MTF ${fusion.mtfStrength.toFixed(0)} · flujo ${fusion.flowStrength.toFixed(0)} · entrada ${fusion.entryQuality.toFixed(0)}.`;
    }

    const displayed = useLatch && activeLatch
      ? { direction: activeLatch.direction, entryLow: activeLatch.entryLow, entryHigh: activeLatch.entryHigh, stop: activeLatch.stop, tp1: activeLatch.tp1 }
      : { direction: fusion.direction, entryLow: fusion.entryLow, entryHigh: fusion.entryHigh, stop: fusion.stop, tp1: fusion.tp1 };

    return {
      verdict,
      title,
      reason,
      next,
      ...displayed,
      price: fusion.price,
      passCount: fusion.passCount,
      confidence: fusion.technicalConfidence,
      trapRisk: fusion.trapRisk,
      decayRisk: fusion.decayRisk,
      accelerationScore: fusion.accelerationScore,
      burstDetected: fusion.burstDetected,
      fastTrack: fusion.fastTrack,
      rr1: fusion.rr1,
      empiricalSample: empirical.sample,
      empiricalRate: empirical.winRatePct,
      shouldOpenLatch: verdict === "ENTER" && !activeLatch,
      shouldClearLatch: Boolean(activeLatch && (fusion.hardBlock || latchStopHit || severeSoftBlock || last2OppositeLatch)),
    };
  }, [fusion, analysis, history, latch]);

  useEffect(() => {
    if (!view) return;
    if (view.shouldClearLatch && latch) {
      setLatch(null);
      saveLatch(safeSymbol, null);
      return;
    }
    if (view.shouldOpenLatch && !latch) {
      const nextLatch: EntryLatch = {
        direction: view.direction,
        openedAt: Date.now(),
        expiresAt: Date.now() + 90_000,
        entryLow: view.entryLow,
        entryHigh: view.entryHigh,
        stop: view.stop,
        tp1: view.tp1,
      };
      setLatch(nextLatch);
      saveLatch(safeSymbol, nextLatch);
    }
  }, [view, latch, safeSymbol]);

  useEffect(() => {
    if (!view) return;
    appendVerdictJournal({
      symbol: safeSymbol,
      verdict: view.verdict,
      direction: view.direction,
      price: view.price,
      entryLow: view.entryLow,
      entryHigh: view.entryHigh,
      stop: view.stop,
      tp1: view.tp1,
      rr1: view.rr1,
      lockCount: view.passCount,
      technicalConfidence: view.confidence,
      trapRisk: view.trapRisk,
      decayRisk: view.decayRisk,
      accelerationScore: view.accelerationScore,
      fastTrack: view.fastTrack,
      reason: view.reason,
    });
  }, [view, safeSymbol]);

  useEffect(() => {
    if (!view) return;
    const previous = previousVerdict.current;
    if (view.verdict === "ENTER" && previous !== "ENTER") {
      try {
        document.title = `🟢 ENTRAR ${safeSymbol} · ExplodeX`;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(`ExplodeX · ${safeSymbol}`, {
            body: `${view.direction} habilitado · entrada ${formatPrice(view.entryLow)}–${formatPrice(view.entryHigh)} · LOCK ${view.passCount}/6${view.burstDetected ? " · BURST" : ""}`,
          });
        }
      } catch {}
    }
    previousVerdict.current = view.verdict;
  }, [view, safeSymbol]);

  if (!view) return null;

  const frame = view.verdict === "ENTER"
    ? "border-emerald-400/45 bg-emerald-500/[.10] shadow-emerald-950/30"
    : view.verdict === "NO_TRADE"
      ? "border-rose-400/45 bg-rose-500/[.09] shadow-rose-950/30"
      : "border-amber-400/35 bg-amber-500/[.075] shadow-amber-950/25";
  const titleTone = view.verdict === "ENTER" ? "text-emerald-200" : view.verdict === "NO_TRADE" ? "text-rose-200" : "text-amber-200";
  const Icon = view.verdict === "ENTER" ? CheckCircle2 : view.verdict === "NO_TRADE" ? ShieldX : Clock3;
  const DirIcon = view.direction === "LONG" ? TrendingUp : TrendingDown;

  return <section className="sticky top-[68px] z-30 mx-auto max-w-[1500px] px-4 pt-3">
    <div className={`rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${frame}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/20 ${titleTone}`}><Icon size={22}/></div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[.18em] text-slate-400">ExplodeX VERDICT · árbitro central</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <div className={`text-2xl font-black sm:text-3xl ${titleTone}`}>{view.title}</div>
              {view.burstDetected && <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-2.5 py-1 text-[10px] font-black text-yellow-200"><Zap size={12}/> BURST {view.accelerationScore.toFixed(0)}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-200">
              <span className={`inline-flex items-center gap-1 font-black ${view.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}><DirIcon size={15}/>{view.direction}</span>
              <span>·</span><span>{view.reason}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6 xl:min-w-[790px]">
          <Mini label="AHORA" value={formatPrice(view.price)} />
          <Mini label="ENTRADA" value={`${formatPrice(view.entryLow)}–${formatPrice(view.entryHigh)}`} />
          <Mini label="STOP" value={formatPrice(view.stop)} bad />
          <Mini label="TP1" value={formatPrice(view.tp1)} good />
          <Mini label="LOCK" value={`${view.passCount}/6`} good={view.passCount >= 5} />
          <Mini label="CONF. TÉCNICA" value={`${view.confidence.toFixed(0)}/100`} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[11px]">
        <span className="font-semibold text-slate-300"><Target size={13} className="mr-1.5 inline"/>{view.next}</span>
        <span className="inline-flex items-center gap-1.5 text-slate-500"><Bell size={12}/>Actualiza ~10 s · trampa {view.trapRisk.toFixed(0)} · decay {view.decayRisk.toFixed(0)} · accel {view.accelerationScore.toFixed(0)}{view.empiricalSample >= 30 && view.empiricalRate != null ? ` · hist ${view.empiricalRate.toFixed(1)}%/${view.empiricalSample}` : ""}. No es garantía.</span>
      </div>
    </div>
  </section>;
}

function Mini({ label, value, good=false, bad=false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-2.5"><div className="text-[8px] font-black uppercase tracking-[.08em] text-slate-500">{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
