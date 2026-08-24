import type { Candle } from "@/lib/api";

export default function PriceChart({ candles }: { candles: Candle[] }) {
  if (!candles.length) return <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Sin datos de gráfico.</div>;

  const width = 900;
  const height = 320;
  const pad = 20;
  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = Math.max(max - min, Math.abs(max) * 0.0001, 1e-9);
  const points = closes.map((value, index) => {
    const x = pad + (index / Math.max(1, closes.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const first = closes[0];
  const last = closes[closes.length - 1];
  const change = first ? ((last - first) / first) * 100 : 0;

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-950/65 p-4">
      <div className="mb-3 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-slate-300">Precio reciente</span>
        <span className={`font-bold ${change >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{change >= 0 ? "+" : ""}{change.toFixed(2)}%</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Gráfico de precio">
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1={pad} x2={width-pad} y1={height*ratio} y2={height*ratio} stroke="rgba(148,163,184,.12)" strokeWidth="1" />)}
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" className={change >= 0 ? "text-emerald-400" : "text-rose-400"} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{min.toLocaleString(undefined,{maximumSignificantDigits:8})}</span><span>{last.toLocaleString(undefined,{maximumSignificantDigits:8})}</span><span>{max.toLocaleString(undefined,{maximumSignificantDigits:8})}</span></div>
    </div>
  );
}
