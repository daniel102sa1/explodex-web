"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

type Coach = {
  state?: string;
  title?: string;
  message?: string;
  health_score?: number;
  direction?: "LONG" | "SHORT" | string;
  analysis_direction?: string;
  direction_aligned?: boolean;
  entry_price?: number;
  mark_price?: number;
  move_pct?: number;
  unrealized_pnl?: number;
  pnl_on_notional_pct?: number;
  approx_margin_roi_pct?: number;
  leverage?: number;
  locks_passed?: number;
  technical_confidence?: number;
  trap_risk?: number;
  decay_risk?: number;
  acceleration_score?: number;
  flow_strength?: number;
  mtf_strength?: number;
  prediction_phase?: string;
  entry_zone_state?: string;
  entry_zone_quality?: number | null;
  invalidated?: boolean;
  protective_orders?: {
    stop_prices?: number[];
    target_prices?: number[];
    has_protective_stop?: boolean;
    has_take_profit?: boolean;
  };
  next_watch?: string[];
  note?: string;
};

type Position = {
  symbol?: string;
  direction?: string;
  position_amount?: number;
  entry_price?: number;
  mark_price?: number;
  unrealized_pnl?: number;
  liquidation_price?: number;
  notional?: number;
  leverage?: number;
  margin_type?: string;
};

type CoachRow = {
  position?: Position;
  coach?: Coach;
  open_orders?: Array<Record<string, unknown>>;
  analysis_available?: boolean;
  analysis_error?: string | null;
  analysis?: Record<string, any> | null;
};

type CoachResponse = {
  mode?: string;
  configured?: boolean;
  position_count?: number;
  shown?: number;
  positions?: CoachRow[];
  note?: string;
};

type StatusResponse = {
  configured?: boolean;
  read_only?: boolean;
  probe_ok?: boolean;
  probe_error?: string | null;
  binance_code?: number | null;
};

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const x = Number(value);
  if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(x) >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return x.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function pct(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const x = Number(value);
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`;
}

function stateTone(state?: string) {
  switch (state) {
    case "STRENGTHENING": return "border-emerald-500/30 bg-emerald-500/[.07] text-emerald-200";
    case "HEALTHY": return "border-cyan-500/25 bg-cyan-500/[.06] text-cyan-200";
    case "NORMAL_PULLBACK": return "border-amber-500/25 bg-amber-500/[.06] text-amber-100";
    case "DETERIORATING": return "border-orange-500/30 bg-orange-500/[.06] text-orange-200";
    case "THESIS_DAMAGED": return "border-rose-500/30 bg-rose-500/[.07] text-rose-200";
    default: return "border-slate-700 bg-slate-900/50 text-slate-300";
  }
}

export default function BinanceLivePositionCoach() {
  const [data, setData] = useState<CoachResponse | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    async function load() {
      if (!BASE_URL) {
        if (!dead) {
          setError("NEXT_PUBLIC_API_BASE_URL no está configurada.");
          setLoading(false);
        }
        return;
      }
      try {
        const [statusResponse, coachResponse] = await Promise.all([
          fetch(`${BASE_URL}/api/v1/binance-user/status?probe=true`, { cache: "no-store" }),
          fetch(`${BASE_URL}/api/v1/binance-user/coach?limit=8`, { cache: "no-store" }),
        ]);
        const statusPayload = await statusResponse.json().catch(() => ({}));
        if (!dead) setStatus(statusPayload);
        if (!coachResponse.ok) {
          const payload = await coachResponse.json().catch(() => ({}));
          const detail = payload?.detail;
          const message = typeof detail === "string" ? detail : detail?.message || `Backend ${coachResponse.status}`;
          throw new Error(message);
        }
        const coachPayload = await coachResponse.json();
        if (!dead) {
          setData(coachPayload);
          setError(null);
          setLastUpdate(Date.now());
        }
      } catch (exc) {
        if (!dead) setError(exc instanceof Error ? exc.message : String(exc));
      } finally {
        if (!dead) setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { dead = true; window.clearInterval(timer); };
  }, []);

  const rows = useMemo(() => data?.positions ?? [], [data]);

  return <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-5">
    <header className="mb-4 flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-300"><WalletCards size={14}/> Binance · solo lectura</div>
        <h1 className="mt-1 text-3xl font-black text-white">Mis posiciones · Live Coach</h1>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">ExplodeX lee tus posiciones Futures y las cruza con estructura, LOCKS, momentum, flujo, riesgo de trampa y zona de entrada. No puede abrir, cerrar ni modificar órdenes.</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-[10px] text-slate-500">
        {lastUpdate ? `Actualizado ${new Date(lastUpdate).toLocaleTimeString()}` : loading ? "Conectando…" : "Sin actualización"}
      </div>
    </header>

    <section className="mb-4 grid gap-3 sm:grid-cols-3">
      <Info label="Conexión" value={status?.probe_ok ? "BINANCE OK" : status?.configured ? "CONFIGURADA" : "NO CONFIGURADA"} good={Boolean(status?.probe_ok)} />
      <Info label="Modo" value={status?.read_only ? "SOLO LECTURA" : "REVISAR"} good={Boolean(status?.read_only)} />
      <Info label="Posiciones abiertas" value={String(data?.position_count ?? 0)} />
    </section>

    {error && <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/[.05] p-4 text-sm text-rose-200">
      <div className="flex items-center gap-2 font-black"><AlertTriangle size={16}/> No pude leer las posiciones de Binance</div>
      <div className="mt-1 text-xs text-rose-200/80">{error}</div>
      {status?.probe_error && <div className="mt-2 text-[10px] text-slate-500">Probe: {status.probe_error}{status.binance_code != null ? ` · código ${status.binance_code}` : ""}</div>}
    </div>}

    {!loading && !error && rows.length === 0 && <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-10 text-center">
      <CheckCircle2 className="mx-auto text-emerald-400" size={28}/>
      <div className="mt-3 text-lg font-black text-white">Conectado · no hay posiciones Futures abiertas</div>
      <div className="mt-1 text-xs text-slate-500">Cuando abras una posición en Binance aparecerá aquí y ExplodeX empezará a analizarla.</div>
    </div>}

    <div className="space-y-4">
      {rows.map((row, index) => <PositionCard key={`${row.position?.symbol ?? "position"}-${index}`} row={row}/>) }
    </div>

    <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-[10px] leading-5 text-slate-500">
      <ShieldCheck size={14} className="mt-0.5 shrink-0"/> El health score es un estado técnico de 0–100, no una probabilidad. El coach no te ordena mantener, cerrar, aumentar tamaño ni mover el stop.
    </div>
  </main>;
}

function PositionCard({ row }: { row: CoachRow }) {
  const p = row.position ?? {};
  const c = row.coach ?? {};
  const long = String(p.direction ?? c.direction) === "LONG";
  const pnl = num(p.unrealized_pnl ?? c.unrealized_pnl);
  const stopPrices = c.protective_orders?.stop_prices ?? [];
  const targetPrices = c.protective_orders?.target_prices ?? [];

  return <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/55">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${long ? "border-emerald-500/25 bg-emerald-500/[.07] text-emerald-300" : "border-rose-500/25 bg-rose-500/[.07] text-rose-300"}`}>
          {long ? <TrendingUp size={19}/> : <TrendingDown size={19}/>} 
        </div>
        <div><div className="text-xl font-black text-white">{p.symbol ?? "—"}</div><div className="text-[10px] font-black text-slate-500">{p.direction ?? "—"} · {p.leverage ?? c.leverage ?? 1}x · {p.margin_type ?? "—"}</div></div>
      </div>
      <div className={`rounded-xl border px-3 py-2 text-xs font-black ${stateTone(c.state)}`}>{c.title ?? c.state ?? "VIGILAR"}</div>
    </div>

    <div className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Entrada" value={fmt(p.entry_price ?? c.entry_price)}/>
        <Metric label="Mark" value={fmt(p.mark_price ?? c.mark_price)}/>
        <Metric label="Movimiento" value={pct(c.move_pct)} positive={num(c.move_pct) >= 0}/>
        <Metric label="PnL" value={`${pnl >= 0 ? "+" : ""}${pnl.toFixed(3)} USDT`} positive={pnl >= 0}/>
        <Metric label="ROI aprox." value={pct(c.approx_margin_roi_pct)} positive={num(c.approx_margin_roi_pct) >= 0}/>
        <Metric label="Health" value={`${num(c.health_score).toFixed(0)}/100`}/>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-800 bg-black/15 p-4">
        <div className="text-sm font-black text-white">{c.message ?? "Analizando posición…"}</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6 text-[10px] text-slate-500">
          <span>LOCKS <b className="text-slate-300">{c.locks_passed ?? 0}/6</b></span>
          <span>Conf. técnica <b className="text-slate-300">{num(c.technical_confidence).toFixed(0)}/100</b></span>
          <span>Trap <b className="text-slate-300">{num(c.trap_risk).toFixed(0)}/100</b></span>
          <span>Decay <b className="text-slate-300">{num(c.decay_risk).toFixed(0)}/100</b></span>
          <span>Aceleración <b className="text-slate-300">{num(c.acceleration_score).toFixed(0)}/100</b></span>
          <span>Zona <b className="text-slate-300">{c.entry_zone_state ?? "N/D"}</b></span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Protección detectada en Binance</div>
          <div className="mt-2 text-xs text-slate-500">Stop: <b className={stopPrices.length ? "text-emerald-300" : "text-amber-200"}>{stopPrices.length ? stopPrices.map(fmt).join(" · ") : "No detectado"}</b></div>
          <div className="mt-1 text-xs text-slate-500">TP: <b className="text-slate-300">{targetPrices.length ? targetPrices.map(fmt).join(" · ") : "No detectado"}</b></div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">Qué está vigilando ExplodeX</div>
          <div className="mt-2 space-y-1 text-xs text-slate-500">{(c.next_watch ?? []).length ? c.next_watch!.map((item, i) => <div key={i}>• {item}</div>) : <div>Sin alertas técnicas relevantes en esta lectura.</div>}</div>
        </div>
      </div>

      {!row.analysis_available && row.analysis_error && <div className="mt-3 flex items-center gap-2 text-[10px] text-amber-300"><RefreshCw size={12}/> Posición leída; análisis de mercado temporalmente no disponible: {row.analysis_error}</div>}
    </div>
  </section>;
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-sm font-black ${positive === true ? "text-emerald-300" : positive === false ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}

function Info({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 text-lg font-black ${good ? "text-emerald-300" : "text-white"}`}>{value}</div></div>;
}
