import type { Candle } from "@/lib/api";

export default function PriceChart({ candles }: { candles: Candle[] }) {
  if (!candles.length) return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  const width = 960;
  const height = 420;
  const priceHeight = 310;
  const volumeHeight = 74;
  const padX = 36;
  const padTop = 18;
  const gap = 18;

  const visible = candles.slice(-96);
  const highs = visible.map((c) => c.high);
  const lows = visible.map((c) => c.low);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceSpan = Math.max(maxPrice - minPrice, Math.abs(maxPrice) * 0.0001, 1e-9);
  const maxVolume = Math.max(...visible.map((c) => c.volume), 1);
  const slot = (width - padX * 2) / Math.max(1, visible.length);
  const bodyWidth = Math.max(2, Math.min(8, slot * 0.62));

  const yPrice = (value: number) => padTop + ((maxPrice - value) / priceSpan) * (priceHeight - padTop * 2);
  const first = visible[0].open;
  const last = visible[visible.length - 1].close;
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <div className="font-semibold text-slate-300">Velas + volumen</div>
          <div className="mt-1 text-xs text-slate-500">OHLC real del proveedor activo</div>
        </div>
        <div className="text-right">
          <div className={`font-black ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</div>
          <div className="text-xs text-slate-500">Último {last.toLocaleString(undefined,{maximumSignificantDigits:8})}</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de velas y volumen">
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line key={ratio} x1={padX} x2={width-padX} y1={padTop + (priceHeight-padTop*2)*ratio} y2={padTop + (priceHeight-padTop*2)*ratio} stroke="rgba(148,163,184,.10)" strokeWidth="1" />
        ))}

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
              <rect x={x-bodyWidth/2} y={volY} width={bodyWidth} height={volH} fill="currentColor" opacity="0.32" rx="0.7" />
            </g>
          );
        })}

        <line x1={padX} x2={width-padX} y1={priceHeight + gap - 6} y2={priceHeight + gap - 6} stroke="rgba(148,163,184,.16)" strokeWidth="1" />
      </svg>

      <div className="mt-1 flex justify-between text-xs text-slate-500">
        <span>Low {minPrice.toLocaleString(undefined,{maximumSignificantDigits:8})}</span>
        <span>{visible.length} velas</span>
        <span>High {maxPrice.toLocaleString(undefined,{maximumSignificantDigits:8})}</span>
      </div>
    </div>
  );
}
