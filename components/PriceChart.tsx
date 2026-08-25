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

export default function PriceChart({ candles, plan, livePrice }: { candles: Candle[]; plan?: ChartPlan; livePrice?: number }) {
  if (!candles.length) return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  const width = 960;
  const height = 420;
  const priceHeight = 310;
  const volumeHeight = 74;
  const padX = 52;
  const padTop = 18;
  const gap = 18;

  const visible = candles.slice(-96);
  const last = Number(livePrice || visible[visible.length - 1].close);
  const chartPlanValues = plan ? [plan.trigger, plan.entryLow, plan.entryHigh, plan.invalidation, plan.stop, plan.tp1, plan.tp2, plan.tp3].filter((v): v is number => Number.isFinite(Number(v)) && Number(v) > 0) : [];
  const highs = [...visible.map((c) => c.high), ...chartPlanValues, last];
  const lows = [...visible.map((c) => c.low), ...chartPlanValues, last];
  let minPrice = Math.min(...lows);
  let maxPrice = Math.max(...highs);
  const rawSpan = Math.max(maxPrice - minPrice, Math.abs(maxPrice) * 0.0001, 1e-9);
  minPrice -= rawSpan * 0.04;
  maxPrice += rawSpan * 0.04;
  const priceSpan = Math.max(maxPrice - minPrice, 1e-9);
  const maxVolume = Math.max(...visible.map((c) => c.volume), 1);
  const slot = (width - padX * 2) / Math.max(1, visible.length);
  const bodyWidth = Math.max(2, Math.min(8, slot * 0.62));

  const yPrice = (value: number) => padTop + ((maxPrice - value) / priceSpan) * (priceHeight - padTop * 2);
  const first = visible[0].open;
  const change = first ? ((last - first) / first) * 100 : 0;

  const planLines = plan ? [
    { key: "trigger", label: "TRIGGER", value: plan.trigger, stroke: "#a78bfa", dash: "6 5" },
    { key: "invalidation", label: "INVALIDACIÓN", value: plan.invalidation, stroke: "#fb923c", dash: "4 5" },
    { key: "stop", label: "STOP", value: plan.stop, stroke: "#fb7185", dash: "" },
    { key: "tp1", label: "TP1", value: plan.tp1, stroke: "#34d399", dash: "4 4" },
    { key: "tp2", label: "TP2", value: plan.tp2, stroke: "#22d3ee", dash: "4 4" },
    { key: "tp3", label: "TP3", value: plan.tp3, stroke: "#60a5fa", dash: "4 4" },
  ].filter((line): line is { key: string; label: string; value: number; stroke: string; dash: string } => Number.isFinite(Number(line.value)) && Number(line.value) > 0) : [];

  const hasEntryZone = Boolean(plan && Number(plan.entryLow) > 0 && Number(plan.entryHigh) > 0);
  const entryTop = hasEntryZone ? yPrice(Math.max(Number(plan!.entryLow), Number(plan!.entryHigh))) : 0;
  const entryBottom = hasEntryZone ? yPrice(Math.min(Number(plan!.entryLow), Number(plan!.entryHigh))) : 0;
  const entryStroke = plan?.ready ? "#34d399" : "#a78bfa";
  const entryFill = plan?.ready ? "rgba(52,211,153,.10)" : "rgba(167,139,250,.09)";
  const entryText = plan?.ready ? "#6ee7b7" : "#c4b5fd";
  const entryLow = Number(plan?.entryLow || 0);
  const entryHigh = Number(plan?.entryHigh || 0);
  const entryLabel = hasEntryZone
    ? `${plan?.ready ? "ENTRADA READY" : "ZONA DE ENTRADA"} ${fmt(Math.min(entryLow, entryHigh))} – ${fmt(Math.max(entryLow, entryHigh))}`
    : "";

  const yLive = yPrice(last);
  const trigger = Number(plan?.trigger || 0);
  const triggerDistancePct = trigger > 0 && last > 0
    ? (plan?.direction === "SHORT" ? ((last - trigger) / last) * 100 : ((trigger - last) / last) * 100)
    : null;

  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <div className="font-semibold text-slate-300">Velas + volumen {plan ? "+ plan" : ""}</div>
          <div className="mt-1 text-[11px] text-slate-500">OHLC real · última vela y precio actual en vivo</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          {triggerDistancePct != null && <div><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">Dist. trigger</div><div className={`font-mono text-xs font-black ${triggerDistancePct <= 0 ? "text-emerald-300" : "text-violet-300"}`}>{triggerDistancePct <= 0 ? "TOCADO" : `${triggerDistancePct.toFixed(3)}%`}</div></div>}
          <div><div className={`font-black ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div><div className="mono-number text-[11px] text-slate-500">Ahora {fmt(last)}</div></div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de velas, volumen, precio vivo y plan operativo">
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1={padX} x2={width-padX} y1={padTop + (priceHeight-padTop*2)*ratio} y2={padTop + (priceHeight-padTop*2)*ratio} stroke="rgba(148,163,184,.09)" strokeWidth="1" />
        ))}

        {hasEntryZone && <>
          <rect x={padX} y={Math.min(entryTop,entryBottom)} width={width-padX*2} height={Math.max(3,Math.abs(entryBottom-entryTop))} fill={entryFill} stroke={entryStroke} strokeOpacity=".38" strokeWidth="1" />
          <text x={padX+6} y={Math.min(entryTop,entryBottom)-4} fill={entryText} fontSize="10" fontWeight="800">{entryLabel}</text>
        </>}

        {visible.map((candle, index) => {
          const x = padX + slot * index + slot / 2;
          const yOpen = yPrice(candle.open);
          const yClose = yPrice(candle.close);
          const yHigh = yPrice(candle.high);
          const yLow = yPrice(candle.low);
          const bullish = candle.close >= candle.open;
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

        {planLines.map((line) => {
          const y = yPrice(line.value);
          const label = `${line.label} ${fmt(line.value)}`;
          return <g key={line.key}>
            <line x1={padX} x2={width-padX} y1={y} y2={y} stroke={line.stroke} strokeWidth="1.2" strokeDasharray={line.dash || undefined} opacity="0.9" />
            <rect x={width-padX-145} y={y-9} width={142} height={17} rx="4" fill="rgba(3,7,18,.91)" stroke={line.stroke} strokeOpacity=".42" />
            <text x={width-padX-139} y={y+3} fill={line.stroke} fontSize="9" fontWeight="800">{label}</text>
          </g>;
        })}

        <g>
          <line x1={padX} x2={width-padX} y1={yLive} y2={yLive} stroke="#f8fafc" strokeWidth="1" strokeDasharray="2 4" opacity=".6" />
          <circle cx={width-padX-4} cy={yLive} r="3.2" fill="#f8fafc" opacity=".95" />
          <rect x={width-padX-125} y={yLive-10} width={121} height={19} rx="5" fill="#0f172a" stroke="#64748b" strokeOpacity=".55" />
          <text x={width-padX-119} y={yLive+3} fill="#f8fafc" fontSize="9" fontWeight="800">AHORA {fmt(last)}</text>
        </g>

        <line x1={padX} x2={width-padX} y1={priceHeight + gap - 6} y2={priceHeight + gap - 6} stroke="rgba(148,163,184,.16)" strokeWidth="1" />
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>Low {fmt(minPrice)}</span>
        <span>{visible.length} velas</span>
        <span>High {fmt(maxPrice)}</span>
      </div>
    </div>
  );
}