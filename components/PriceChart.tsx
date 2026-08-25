import type { Candle } from "@/lib/api";

export type ChartPlan = {
  direction?: "LONG" | "SHORT";
  trigger?: number;
  entryLow?: number;
  entryHigh?: number;
  invalidation?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  ready?: boolean;
};

function fmt(value: number) {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return value.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function emaSeries(values: number[], period: number) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out: number[] = [];
  let current = values[0];
  out.push(current);
  for (let i = 1; i < values.length; i++) {
    current = values[i] * alpha + current * (1 - alpha);
    out.push(current);
  }
  return out;
}

type RailItem = {
  key: string;
  label: string;
  value: number;
  stroke: string;
  dash?: string;
  priority: number;
  actualY: number;
  railY: number;
  visible: boolean;
  out: "up" | "down" | null;
};

export default function PriceChart({ candles, plan, livePrice }: { candles: Candle[]; plan?: ChartPlan; livePrice?: number }) {
  if (!candles.length) return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  const width = 1120;
  const height = 440;
  const priceHeight = 320;
  const volumeHeight = 74;
  const padLeft = 48;
  const padTop = 18;
  const gap = 18;
  const railWidth = 235;
  const railGap = 18;
  const plotRight = width - railWidth - railGap;
  const railX = plotRight + railGap;

  const visible = candles.slice(-96);
  const last = Number(livePrice || visible[visible.length - 1].close);
  const closes = visible.map((c, index) => index === visible.length - 1 && livePrice ? Number(livePrice) : Number(c.close));
  const ema9 = emaSeries(closes, 9);
  const ema21 = emaSeries(closes, 21);
  const ema9Now = ema9[ema9.length - 1] ?? last;
  const ema21Now = ema21[ema21.length - 1] ?? last;
  const emaGapPct = last ? ((ema9Now - ema21Now) / last) * 100 : 0;
  const emaBull = ema9Now > ema21Now;
  const emaBear = ema9Now < ema21Now;
  const previousDiff = ema9.length >= 2 && ema21.length >= 2 ? ema9[ema9.length - 2] - ema21[ema21.length - 2] : 0;
  const currentDiff = ema9Now - ema21Now;
  const bullishCross = previousDiff <= 0 && currentDiff > 0;
  const bearishCross = previousDiff >= 0 && currentDiff < 0;

  // Scale follows the market, not distant TP levels. Nearby EMAs naturally fit
  // inside the market range and distant targets stay in the right-side rail.
  const marketHigh = Math.max(...visible.map((c) => c.high), last, ema9Now, ema21Now);
  const marketLow = Math.min(...visible.map((c) => c.low), last, ema9Now, ema21Now);
  const marketSpan = Math.max(marketHigh - marketLow, Math.abs(marketHigh) * 0.001, 1e-9);
  let minPrice = marketLow - marketSpan * 0.10;
  let maxPrice = marketHigh + marketSpan * 0.10;

  const nearby = [plan?.trigger, plan?.entryLow, plan?.entryHigh]
    .filter((v): v is number => Number.isFinite(Number(v)) && Number(v) > 0)
    .filter((v) => v >= marketLow - marketSpan * 0.45 && v <= marketHigh + marketSpan * 0.45);
  if (nearby.length) {
    minPrice = Math.min(minPrice, ...nearby) - marketSpan * 0.04;
    maxPrice = Math.max(maxPrice, ...nearby) + marketSpan * 0.04;
  }

  const priceSpan = Math.max(maxPrice - minPrice, 1e-9);
  const maxVolume = Math.max(...visible.map((c) => c.volume), 1);
  const slot = (plotRight - padLeft) / Math.max(1, visible.length);
  const bodyWidth = Math.max(2, Math.min(8, slot * 0.62));
  const yPrice = (value: number) => padTop + ((maxPrice - value) / priceSpan) * (priceHeight - padTop * 2);
  const clampY = (y: number) => Math.max(padTop + 9, Math.min(priceHeight - padTop - 9, y));
  const first = visible[0].open;
  const change = first ? ((last - first) / first) * 100 : 0;

  const emaPath = (series: number[]) => series.map((value, index) => {
    const x = padLeft + slot * index + slot / 2;
    const y = yPrice(value);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");

  const trigger = Number(plan?.trigger || 0);
  const triggerDistancePct = trigger > 0 && last > 0
    ? (plan?.direction === "SHORT" ? ((last - trigger) / last) * 100 : ((trigger - last) / last) * 100)
    : null;

  const rawLevels = plan ? [
    { key: "now", label: "AHORA", value: last, stroke: "#f8fafc", dash: "2 4", priority: 100 },
    { key: "trigger", label: "TRIGGER", value: Number(plan.trigger || 0), stroke: "#a78bfa", dash: "6 5", priority: 90 },
    { key: "invalidation", label: "INVALIDACIÓN", value: Number(plan.invalidation || 0), stroke: "#fb923c", dash: "4 5", priority: 80 },
    { key: "stop", label: "STOP", value: Number(plan.stop || 0), stroke: "#fb7185", priority: 85 },
    { key: "tp1", label: "TP1", value: Number(plan.tp1 || 0), stroke: "#34d399", dash: "4 4", priority: 70 },
    { key: "tp2", label: "TP2", value: Number(plan.tp2 || 0), stroke: "#22d3ee", dash: "4 4", priority: 60 },
    { key: "tp3", label: "TP3", value: Number(plan.tp3 || 0), stroke: "#60a5fa", dash: "4 4", priority: 50 },
  ].filter((x) => Number.isFinite(x.value) && x.value > 0) : [
    { key: "now", label: "AHORA", value: last, stroke: "#f8fafc", dash: "2 4", priority: 100 },
  ];

  const railItems: RailItem[] = rawLevels.map((level) => {
    const actualY = yPrice(level.value);
    const out: RailItem["out"] = level.value > maxPrice ? "up" : level.value < minPrice ? "down" : null;
    return { ...level, actualY, railY: clampY(actualY), visible: out === null, out };
  });

  const sorted = [...railItems].sort((a, b) => a.railY - b.railY || b.priority - a.priority);
  const minGap = 23;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].railY - sorted[i - 1].railY < minGap) sorted[i].railY = sorted[i - 1].railY + minGap;
  }
  const overflow = sorted.length ? sorted[sorted.length - 1].railY - (priceHeight - padTop - 9) : 0;
  if (overflow > 0) sorted.forEach((item) => { item.railY -= overflow; });
  for (let i = sorted.length - 2; i >= 0; i--) {
    if (sorted[i + 1].railY - sorted[i].railY < minGap) sorted[i].railY = sorted[i + 1].railY - minGap;
  }
  const underflow = sorted.length ? (padTop + 9) - sorted[0].railY : 0;
  if (underflow > 0) sorted.forEach((item) => { item.railY += underflow; });

  const hasEntryZone = Boolean(plan && Number(plan.entryLow) > 0 && Number(plan.entryHigh) > 0);
  const entryLow = Number(plan?.entryLow || 0);
  const entryHigh = Number(plan?.entryHigh || 0);
  const entryMin = Math.min(entryLow, entryHigh);
  const entryMax = Math.max(entryLow, entryHigh);
  const entryVisible = hasEntryZone && entryMax >= minPrice && entryMin <= maxPrice;
  const entryTop = entryVisible ? clampY(yPrice(Math.min(entryMax, maxPrice))) : 0;
  const entryBottom = entryVisible ? clampY(yPrice(Math.max(entryMin, minPrice))) : 0;
  const entryStroke = plan?.ready ? "#34d399" : "#a78bfa";
  const entryFill = plan?.ready ? "rgba(52,211,153,.11)" : "rgba(167,139,250,.08)";
  const entryText = plan?.ready ? "#6ee7b7" : "#c4b5fd";
  const entryLabel = hasEntryZone ? `${plan?.ready ? "ENTRADA READY" : "ENTRADA"} ${fmt(entryMin)} – ${fmt(entryMax)}` : "";
  const entryOut = hasEntryZone ? entryMax < minPrice ? "down" : entryMin > maxPrice ? "up" : null : null;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <div className="font-semibold text-slate-300">Velas + volumen + EMA + plan</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-cyan-400"/>EMA 9 <b className="font-mono text-cyan-300">{fmt(ema9Now)}</b></span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-amber-400"/>EMA 21 <b className="font-mono text-amber-300">{fmt(ema21Now)}</b></span>
            <span className={`font-black ${emaBull ? "text-emerald-300" : emaBear ? "text-rose-300" : "text-slate-400"}`}>{bullishCross ? "CRUCE ALCISTA" : bearishCross ? "CRUCE BAJISTA" : emaBull ? "EMA ALCISTA" : emaBear ? "EMA BAJISTA" : "EMA NEUTRAL"} · gap {emaGapPct >= 0 ? "+" : ""}{emaGapPct.toFixed(3)}%</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          {triggerDistancePct != null && <div><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">Dist. trigger</div><div className={`font-mono text-xs font-black ${triggerDistancePct <= 0 ? "text-emerald-300" : "text-violet-300"}`}>{triggerDistancePct <= 0 ? "TOCADO" : `${triggerDistancePct.toFixed(3)}%`}</div></div>}
          <div><div className={`font-black ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div><div className="font-mono text-[11px] text-slate-500">Ahora {fmt(last)}</div></div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de velas con EMA 9, EMA 21, volumen y plan operativo">
        <rect x={plotRight + 7} y={0} width={railWidth + 8} height={priceHeight + 4} rx="10" fill="rgba(2,6,23,.40)" stroke="rgba(51,65,85,.45)" />
        <text x={railX} y={13} fill="#64748b" fontSize="9" fontWeight="800">NIVELES DEL PLAN</text>

        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1={padLeft} x2={plotRight} y1={padTop + (priceHeight-padTop*2)*ratio} y2={padTop + (priceHeight-padTop*2)*ratio} stroke="rgba(148,163,184,.09)" strokeWidth="1" />
        ))}

        {entryVisible && <>
          <rect x={padLeft} y={Math.min(entryTop,entryBottom)} width={plotRight-padLeft} height={Math.max(3,Math.abs(entryBottom-entryTop))} fill={entryFill} stroke={entryStroke} strokeOpacity=".38" strokeWidth="1" />
          <text x={padLeft+6} y={Math.max(12, Math.min(entryTop,entryBottom)-4)} fill={entryText} fontSize="9" fontWeight="800">{entryLabel}</text>
        </>}

        {visible.map((candle, index) => {
          const x = padLeft + slot * index + slot / 2;
          const yOpen = yPrice(candle.open);
          const yClose = yPrice(index === visible.length - 1 && livePrice ? Number(livePrice) : candle.close);
          const yHigh = yPrice(Math.max(candle.high, index === visible.length - 1 && livePrice ? Number(livePrice) : candle.high));
          const yLow = yPrice(Math.min(candle.low, index === visible.length - 1 && livePrice ? Number(livePrice) : candle.low));
          const close = index === visible.length - 1 && livePrice ? Number(livePrice) : candle.close;
          const bullish = close >= candle.open;
          const bodyY = Math.min(yOpen, yClose);
          const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
          const volH = (candle.volume / maxVolume) * volumeHeight;
          const volY = priceHeight + gap + (volumeHeight - volH);
          const cls = bullish ? "text-emerald-400" : "text-rose-400";
          return (
            <g key={`${candle.time}-${index}`} className={cls}>
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke="currentColor" strokeWidth="1.3" />
              <rect x={x-bodyWidth/2} y={bodyY} width={bodyWidth} height={bodyH} fill="currentColor" rx="0.7" />
              <rect x={x-bodyWidth/2} y={volY} width={bodyWidth} height={volH} fill="currentColor" opacity="0.27" rx="0.7" />
            </g>
          );
        })}

        <path d={emaPath(ema21)} fill="none" stroke="#fbbf24" strokeWidth="1.7" opacity=".82" vectorEffect="non-scaling-stroke" />
        <path d={emaPath(ema9)} fill="none" stroke="#22d3ee" strokeWidth="1.9" opacity=".92" vectorEffect="non-scaling-stroke" />

        {sorted.map((item) => {
          const exactY = clampY(item.actualY);
          const tag = `${item.out === "up" ? "↑ " : item.out === "down" ? "↓ " : ""}${item.label} ${fmt(item.value)}`;
          return <g key={item.key}>
            {item.visible && <line x1={padLeft} x2={plotRight} y1={item.actualY} y2={item.actualY} stroke={item.stroke} strokeWidth={item.key === "now" ? "1" : "1.15"} strokeDasharray={item.dash || undefined} opacity={item.key === "now" ? ".52" : ".78"} />}
            <path d={`M ${plotRight} ${exactY} L ${railX-7} ${item.railY}`} fill="none" stroke={item.stroke} strokeWidth="1" opacity=".5" />
            <circle cx={railX-7} cy={item.railY} r="2.4" fill={item.stroke} />
            <rect x={railX} y={item.railY-9} width={railWidth-26} height={18} rx="5" fill="rgba(3,7,18,.92)" stroke={item.stroke} strokeOpacity=".4" />
            <text x={railX+7} y={item.railY+3} fill={item.stroke} fontSize="9" fontWeight="800">{tag}</text>
          </g>;
        })}

        {hasEntryZone && !entryVisible && <g>
          <rect x={railX} y={priceHeight-22} width={railWidth-26} height={18} rx="5" fill="rgba(3,7,18,.92)" stroke={entryStroke} strokeOpacity=".45" />
          <text x={railX+7} y={priceHeight-10} fill={entryText} fontSize="9" fontWeight="800">{entryOut === "up" ? "↑ " : "↓ "}{entryLabel}</text>
        </g>}

        <line x1={padLeft} x2={plotRight} y1={priceHeight + gap - 6} y2={priceHeight + gap - 6} stroke="rgba(148,163,184,.16)" strokeWidth="1" />
      </svg>

      <div className="mt-1 flex justify-between pr-[22%] text-[10px] text-slate-600">
        <span>Low mercado {fmt(marketLow)}</span>
        <span>{visible.length} velas</span>
        <span>High mercado {fmt(marketHigh)}</span>
      </div>
    </div>
  );
}