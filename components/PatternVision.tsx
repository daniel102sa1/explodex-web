"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Eye, ScanSearch, ShieldAlert, Sparkles } from "lucide-react";
import { getCandles, type Candle, type LiveAnalysis, type PreMovePrediction } from "@/lib/api";

export type PatternOverlay = {
  name: string;
  bias: "LONG" | "SHORT" | "NEUTRAL";
  state: string;
  level?: number | null;
  score?: number | null;
};

type PatternItem = PatternOverlay & {
  source: string;
  evidence: string[];
};

function n(value: unknown, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function pretty(value: string) {
  return String(value || "—")
    .replaceAll("_", " ")
    .replace(/w/g, (x) => x.toUpperCase());
}

export function detectedPatterns(prediction?: PreMovePrediction | null): PatternItem[] {
  if (!prediction) return [];
  const p = prediction as any;
  const out: PatternItem[] = [];

  for (const row of p?.murphy_patterns?.patterns ?? []) {
    out.push({
      name: String(row?.name || "PATTERN"),
      bias: row?.bias === "LONG" ? "LONG" : row?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
      state: String(row?.state || (row?.confirmed ? "CONFIRMED" : "FORMING")),
      level: n(row?.level) || null,
      score: n(row?.confidence_score, 50),
      source: "Murphy / estructura",
      evidence: Array.isArray(row?.evidence) ? row.evidence.map(String) : [],
    });
  }

  for (const row of p?.professional_arsenal?.patterns?.patterns ?? []) {
    out.push({
      name: String(row?.name || "PATTERN"),
      bias: row?.bias === "LONG" ? "LONG" : row?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
      state: String(row?.confirmed ? "CONFIRMED" : row?.state || "FORMING"),
      level: n(row?.level) || null,
      score: n(row?.quality, 68),
      source: "Confluencia profesional",
      evidence: Array.isArray(row?.evidence) ? row.evidence.map(String) : [],
    });
  }

  for (const row of p?.technical_arsenal?.strat_price_action?.patterns ?? []) {
    out.push({
      name: String(row?.name || "STRAT"),
      bias: row?.bias === "LONG" ? "LONG" : row?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
      state: "DETECTED",
      level: null,
      score: n(row?.strength, 66),
      source: "Price Action 1/2/3",
      evidence: [String(row?.sequence || "")].filter(Boolean),
    });
  }

  const sweep = p?.technical_arsenal?.liquidity_sweep;
  if (sweep?.available && sweep?.event && sweep.event !== "NO_CONFIRMED_SWEEP") {
    out.push({
      name: String(sweep.event),
      bias: sweep?.bias === "LONG" ? "LONG" : sweep?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
      state: "CONFIRMED",
      level: sweep?.bias === "LONG" ? n(sweep?.prior_low) : n(sweep?.prior_high),
      score: 76,
      source: "Liquidez",
      evidence: [
        sweep?.swept_low ? "swept low" : "",
        sweep?.swept_high ? "swept high" : "",
        sweep?.low_reclaimed ? "low reclaimed" : "",
        sweep?.high_reclaimed ? "high rejected" : "",
      ].filter(Boolean),
    });
  }

  const amd = p?.technical_arsenal?.amd_market_story;
  if (amd?.available && amd?.phase && amd.phase !== "NO_CLEAR_AMD") {
    out.push({
      name: String(amd.phase),
      bias: amd?.bias === "LONG" ? "LONG" : amd?.bias === "SHORT" ? "SHORT" : "NEUTRAL",
      state: amd?.phase === "ACCUMULATION" ? "FORMING" : "DETECTED",
      level: null,
      score: amd?.phase === "ACCUMULATION" ? 58 : 72,
      source: "AMD",
      evidence: [
        amd?.accumulation_detected ? "accumulation" : "",
        amd?.swept_low ? "low manipulation" : "",
        amd?.swept_high ? "high manipulation" : "",
      ].filter(Boolean),
    });
  }

  const best = new Map<string, PatternItem>();
  for (const row of out) {
    const key = row.name.toUpperCase();
    const current = best.get(key);
    if (!current || n(row.score) > n(current.score)) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => n(b.score) - n(a.score));
}

export function topPatternOverlay(prediction?: PreMovePrediction | null): PatternOverlay | undefined {
  const top = detectedPatterns(prediction)[0];
  return top ? { name: top.name, bias: top.bias, state: top.state, level: top.level, score: top.score } : undefined;
}

export default function PatternVision({ symbol, analysis }: { symbol: string; analysis: LiveAnalysis }) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const patterns = useMemo(() => detectedPatterns(analysis.prediction), [analysis.prediction]);
  const top = patterns[0];
  const alternatives = patterns.slice(1, 5);

  useEffect(() => {
    let dead = false;
    getCandles(symbol, "5m", 96)
      .then((rows) => { if (!dead) setCandles(rows); })
      .catch(() => { if (!dead) setCandles([]); });
    return () => { dead = true; };
  }, [symbol, analysis.prediction]);

  if (!top) {
    return <section className="mt-3 rounded-3xl border border-slate-800 bg-slate-950/45 p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-slate-400"><ScanSearch size={15}/> Pattern Vision</div>
      <div className="mt-2 text-sm text-slate-500">Todavía no hay una figura suficientemente clara. ExplodeX sigue buscando estructura, sweep, retest, 1/2/3 y patrones clásicos.</div>
    </section>;
  }

  const tone = top.bias === "LONG" ? "text-emerald-300" : top.bias === "SHORT" ? "text-rose-300" : "text-slate-300";
  const confirmed = /CONFIRM|BROKEN|RETEST|DETECTED/i.test(top.state);

  return <section className="mt-3 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950/70 to-[#07101a]/75">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.12em] text-cyan-300"><ScanSearch size={15}/> Pattern Vision</div>
        <div className="mt-1 text-[11px] text-slate-500">Patrón ideal vs. forma detectada en el mercado real. La figura es evidencia; no abre una operación por sí sola.</div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${top.bias === "LONG" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : top.bias === "SHORT" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-slate-700 bg-slate-900 text-slate-400"}`}>{top.bias}</span>
        <span className="rounded-full border border-violet-500/25 bg-violet-500/[.07] px-2.5 py-1 text-[10px] font-black text-violet-200">{pretty(top.state)}</span>
      </div>
    </div>

    <div className="grid gap-3 p-4 xl:grid-cols-[.8fr_1.35fr_.85fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500"><Eye size={14}/> Así debería verse</div>
        <ReferencePattern name={top.name} bias={top.bias} />
        <div className="mt-3 text-sm font-black text-white">{pretty(top.name)}</div>
        <div className="mt-1 text-[10px] text-slate-500">{top.source}</div>
      </div>

      <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[.025] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500"><Activity size={14}/> Así lo ve ExplodeX ahora</div>
          <div className={`font-mono text-xs font-black ${tone}`}>{top.score != null ? `${n(top.score).toFixed(0)}/100` : "—"}</div>
        </div>
        <RealPatternChart candles={candles} pattern={top} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {alternatives.map((row) => <span key={row.name} className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[9px] font-bold text-slate-400">{pretty(row.name)} · {row.bias}</span>)}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.1em] text-slate-500">{confirmed ? <CheckCircle2 size={14} className="text-emerald-400"/> : <Sparkles size={14} className="text-amber-300"/>} Checklist</div>
        <div className="mt-3 space-y-2">
          {(top.evidence.length ? top.evidence : ["estructura compatible", "esperando confirmación adicional"]).slice(0, 6).map((item, i) =>
            <div key={i} className="flex items-start gap-2 text-xs text-slate-400"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-cyan-400"/><span>{pretty(item)}</span></div>
          )}
        </div>
        {top.level ? <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/[.05] p-2.5">
          <div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">Nivel clave detectado</div>
          <div className="mt-1 font-mono text-sm font-black text-violet-200">{n(top.level).toLocaleString(undefined,{maximumFractionDigits:8})}</div>
        </div> : null}
        <div className="mt-3 flex gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[.035] p-2.5 text-[10px] leading-4 text-slate-500"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-300"/> ExplodeX confirma la figura con volumen, liquidez, CVD, OI/funding, BTC, volatilidad y el gatillo antes de considerarla operable.</div>
      </div>
    </div>
  </section>;
}

function ReferencePattern({ name, bias }: { name: string; bias: PatternOverlay["bias"] }) {
  const key = name.toUpperCase();
  const stroke = bias === "LONG" ? "#34d399" : bias === "SHORT" ? "#fb7185" : "#94a3b8";
  const muted = "#64748b";

  let path = "M18 78 L42 58 L62 68 L84 42 L108 54 L136 28 L166 35 L202 18";
  let extra: React.ReactNode = null;

  if (key.includes("ASCENDING_TRIANGLE")) {
    path = "M18 84 L52 60 L78 72 L108 48 L132 58 L164 34 L205 34";
    extra = <line x1="42" y1="34" x2="210" y2="34" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("DESCENDING_TRIANGLE")) {
    path = "M18 24 L52 48 L78 34 L108 60 L136 48 L168 72 L205 72";
    extra = <line x1="42" y1="72" x2="210" y2="72" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("SYMMETRICAL_TRIANGLE")) {
    path = "M18 20 L52 78 L82 32 L110 68 L136 42 L160 60 L186 48 L210 52";
    extra = <><line x1="35" y1="24" x2="206" y2="50" stroke={muted}/><line x1="35" y1="80" x2="206" y2="50" stroke={muted}/></>;
  } else if (key.includes("RECTANGLE")) {
    path = "M18 68 L42 30 L66 66 L92 32 L120 67 L148 31 L174 65 L205 34";
    extra = <><line x1="25" y1="28" x2="210" y2="28" stroke={muted}/><line x1="25" y1="70" x2="210" y2="70" stroke={muted}/></>;
  } else if (key.includes("BULL_FLAG")) {
    path = "M20 82 L74 20 L94 34 L118 48 L142 38 L166 52 L188 42 L210 18";
    extra = <><line x1="82" y1="26" x2="188" y2="44" stroke={muted}/><line x1="94" y1="48" x2="188" y2="62" stroke={muted}/></>;
  } else if (key.includes("BEAR_FLAG")) {
    path = "M20 20 L74 82 L96 66 L118 54 L142 64 L166 50 L188 60 L210 82";
    extra = <><line x1="82" y1="70" x2="188" y2="52" stroke={muted}/><line x1="94" y1="86" x2="188" y2="70" stroke={muted}/></>;
  } else if (key.includes("DOUBLE_TOP")) {
    path = "M18 78 L58 28 L96 72 L136 30 L174 70 L210 84";
  } else if (key.includes("DOUBLE_BOTTOM")) {
    path = "M18 20 L58 74 L96 28 L136 72 L174 30 L210 18";
  } else if (key.includes("HEAD_AND_SHOULDERS") && !key.includes("INVERSE")) {
    path = "M18 76 L48 42 L76 68 L112 18 L144 68 L174 42 L210 80";
    extra = <line x1="60" y1="69" x2="185" y2="69" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("INVERSE_HEAD")) {
    path = "M18 22 L48 58 L76 32 L112 84 L144 32 L174 58 L210 20";
    extra = <line x1="60" y1="31" x2="185" y2="31" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("BREAKOUT_RETEST")) {
    path = "M18 72 L58 58 L92 62 L122 28 L148 48 L172 44 L210 16";
    extra = <line x1="28" y1="48" x2="210" y2="48" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("FAILED_BREAKOUT") || key.includes("RANGE_DEVIATION")) {
    path = "M18 68 L62 42 L96 64 L132 38 L160 12 L176 44 L210 62";
    extra = <line x1="28" y1="40" x2="210" y2="40" stroke={muted} strokeDasharray="5 4"/>;
  } else if (key.includes("SWEEP")) {
    path = bias === "LONG"
      ? "M18 42 L58 58 L92 46 L126 72 L144 88 L160 50 L190 38 L210 22"
      : "M18 62 L58 44 L92 56 L126 30 L144 12 L160 50 L190 64 L210 78";
  }

  return <svg viewBox="0 0 228 104" className="h-auto w-full rounded-xl bg-slate-950/70" role="img" aria-label={pretty(name)}>
    <rect x="1" y="1" width="226" height="102" rx="12" fill="transparent" stroke="rgba(51,65,85,.7)"/>
    {extra}
    <path d={path} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function RealPatternChart({ candles, pattern }: { candles: Candle[]; pattern: PatternItem }) {
  const rows = candles.slice(-72);
  if (rows.length < 10) return <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-600">Cargando mercado real…</div>;

  const w = 560, h = 190, pad = 14;
  const vals = rows.flatMap((r) => [r.high, r.low]);
  if (pattern.level) vals.push(pattern.level);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  const span = Math.max(hi - lo, Math.abs(hi) * .001, 1e-9);
  const x = (i: number) => pad + i * ((w - pad * 2) / Math.max(1, rows.length - 1));
  const y = (v: number) => pad + ((hi - v) / span) * (h - pad * 2);
  const path = rows.map((r, i) => `${i ? "L" : "M"} ${x(i).toFixed(2)} ${y(r.close).toFixed(2)}`).join(" ");
  const stroke = pattern.bias === "LONG" ? "#34d399" : pattern.bias === "SHORT" ? "#fb7185" : "#67e8f9";

  return <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full rounded-xl bg-slate-950/75" role="img" aria-label="Mercado real con patrón detectado">
    {[.25,.5,.75].map((r)=><line key={r} x1={pad} x2={w-pad} y1={pad+(h-pad*2)*r} y2={pad+(h-pad*2)*r} stroke="rgba(100,116,139,.13)"/>)}
    {pattern.level ? <><line x1={pad} x2={w-pad} y1={y(pattern.level)} y2={y(pattern.level)} stroke="#a78bfa" strokeDasharray="7 5" strokeWidth="1.5"/><text x={pad+4} y={Math.max(11,y(pattern.level)-5)} fill="#c4b5fd" fontSize="9" fontWeight="800">NIVEL {n(pattern.level).toFixed(4)}</text></> : null}
    <path d={path} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx={x(rows.length-1)} cy={y(rows.at(-1)!.close)} r="4" fill={stroke}/>
    <text x={w-pad-4} y={14} textAnchor="end" fill="#64748b" fontSize="9" fontWeight="700">5m · {rows.length} velas</text>
  </svg>;
}
