"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BellRing,
  CircleAlert,
  Loader2,
  ShieldCheck,
  Target,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

type AlertItem = {
  id: string;
  signal_id?: string | null;
  trade_id?: string | null;
  created_at: string;
  channel: string;
  severity: string;
  title: string;
  message: string;
  symbol?: string | null;
  direction?: "LONG" | "SHORT" | null;
  signal_state?: string | null;
  setup_score?: number | null;
  risk_score?: number | null;
  entry_low?: number | null;
  entry_high?: number | null;
  stop_loss?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function quality(alert: AlertItem) {
  const score = Number(alert.setup_score ?? 0);
  const risk = Number(alert.risk_score ?? 100);
  const ready = alert.severity === "READY" || alert.severity === "ENTRY";
  if (ready && score >= 90 && risk <= 25) return { label: "READY A+", tier: "elite" as const };
  if (ready && score >= 85 && risk <= 35) return { label: "READY A", tier: "ready" as const };
  if (ready) return { label: "READY", tier: "ready" as const };
  if (alert.severity === "ACTIVATED") return { label: "ACTIVADO", tier: "activated" as const };
  if (alert.severity === "EARLY") return { label: "PREACTIVACIÓN", tier: "early" as const };
  if (alert.severity === "EXIT" || alert.severity === "STOP") return { label: alert.severity === "STOP" ? "STOP" : "SALIDA", tier: "danger" as const };
  return { label: alert.severity, tier: "neutral" as const };
}

function tone(tier: ReturnType<typeof quality>["tier"]) {
  if (tier === "elite") return { card: "border-emerald-300/55 bg-emerald-400/[.10] shadow-[0_0_35px_rgba(52,211,153,.08)]", badge: "border-emerald-300/45 bg-emerald-300/15 text-emerald-100", icon: "text-emerald-200" };
  if (tier === "ready") return { card: "border-emerald-500/35 bg-emerald-500/[.06]", badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: "text-emerald-300" };
  if (tier === "activated") return { card: "border-violet-500/35 bg-violet-500/[.06]", badge: "border-violet-500/30 bg-violet-500/10 text-violet-200", icon: "text-violet-300" };
  if (tier === "early") return { card: "border-amber-500/35 bg-amber-500/[.05]", badge: "border-amber-500/30 bg-amber-500/10 text-amber-200", icon: "text-amber-300" };
  if (tier === "danger") return { card: "border-rose-500/35 bg-rose-500/[.06]", badge: "border-rose-500/30 bg-rose-500/10 text-rose-300", icon: "text-rose-300" };
  return { card: "border-slate-800 bg-slate-950/65", badge: "border-slate-700 text-slate-400", icon: "text-slate-400" };
}

export default function AlertFeed() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const knownIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (!BASE_URL) { if (mounted) { setConnected(false); setLoading(false); } return; }
      try {
        const response = await fetch(`${BASE_URL}/api/v1/alerts/pending?limit=100`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as AlertItem[];
        if (!mounted) return;
        setAlerts(payload.slice().reverse());
        setConnected(true);
        setLoading(false);

        if (!initialized.current) {
          payload.forEach((item) => knownIds.current.add(item.id));
          initialized.current = true;
        } else {
          const incoming = payload.filter((item) => !knownIds.current.has(item.id));
          incoming.forEach((item) => {
            knownIds.current.add(item.id);
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              const q = quality(item);
              const symbolText = item.symbol ? `${item.symbol} · ` : "";
              const notification = new Notification(`${symbolText}${q.label}`, {
                body: `${item.direction ?? ""} · Entrada ${fmt(item.entry_low)}–${fmt(item.entry_high)} · SL ${fmt(item.stop_loss)} · TP1 ${fmt(item.tp1)}`.slice(0, 220),
                tag: item.id,
              });
              notification.onclick = () => {
                window.focus();
                if (item.symbol) window.location.href = `/coin/${item.symbol}`;
                notification.close();
              };
            }
          });
        }
      } catch {
        if (mounted) { setConnected(false); setLoading(false); }
      } finally {
        if (mounted) timer = setTimeout(load, 5000);
      }
    };
    load();
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, []);

  const requestNotifications = async () => {
    if (!("Notification" in window)) { setNotificationPermission("unsupported"); return; }
    setNotificationPermission(await Notification.requestPermission());
  };

  if (loading) return <div className="mt-8 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/65 p-5 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> Cargando alertas del scanner…</div>;

  return <>
    <section className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/65 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm">{connected ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-rose-400" />}<span className="font-bold text-white">{connected ? "Alertas en vivo conectadas" : "Sin conexión al feed"}</span><span className="text-slate-500">· 5 s</span></div>
      {notificationPermission !== "unsupported" && notificationPermission !== "granted" && <button onClick={requestNotifications} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-200"><BellRing size={16} /> Activar avisos</button>}
      {notificationPermission === "granted" && <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-bold text-emerald-300"><Bell size={14} /> Avisos activos</div>}
    </section>

    <div className="mt-5 grid gap-3 xl:grid-cols-2">
      {alerts.map((alert) => {
        const q = quality(alert);
        const colors = tone(q.tier);
        const card = <article className={`h-full rounded-2xl border p-4 transition hover:-translate-y-[1px] hover:brightness-110 ${colors.card}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {q.tier === "elite" ? <ShieldCheck size={18} className={colors.icon}/> : <CircleAlert size={17} className={colors.icon}/>} 
                <h2 className="font-black text-white">{alert.symbol ?? alert.title}</h2>
                {alert.direction && <span className={`inline-flex items-center gap-1 text-xs font-black ${alert.direction === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{alert.direction === "LONG" ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {alert.direction}</span>}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-300">{alert.message}</p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[10px] font-black ${colors.badge}`}>{q.label}</div>
          </div>

          {(alert.entry_low || alert.stop_loss || alert.tp1) && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <PlanCell label="Entrada" value={alert.entry_low && alert.entry_high ? `${fmt(alert.entry_low)} – ${fmt(alert.entry_high)}` : fmt(alert.entry_low)} icon={<Target size={11}/>} />
            <PlanCell label="Stop loss" value={fmt(alert.stop_loss)} danger />
            <PlanCell label="TP1" value={fmt(alert.tp1)} good />
            <PlanCell label="TP2" value={fmt(alert.tp2)} good />
            <PlanCell label="TP3" value={fmt(alert.tp3)} good />
            <PlanCell label="Setup / riesgo" value={`${Number(alert.setup_score ?? 0).toFixed(1)} / ${Number(alert.risk_score ?? 0).toFixed(1)}`} icon={<Zap size={11}/>} />
          </div>}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[.04] pt-3">
            <span className="text-[10px] text-slate-600">{new Date(alert.created_at).toLocaleString("es-GT")}</span>
            {alert.symbol && <span className="inline-flex items-center gap-1 text-[10px] font-black text-cyan-300">Abrir gráfica viva <ArrowRight size={11}/></span>}
          </div>
        </article>;
        return alert.symbol ? <Link key={alert.id} href={`/coin/${alert.symbol}`} className="block">{card}</Link> : <div key={alert.id}>{card}</div>;
      })}
      {!alerts.length && <div className="col-span-full rounded-2xl border border-dashed border-slate-800 p-10 text-center"><div className="font-black text-white">Sin preactivaciones nuevas por ahora</div><div className="mt-2 text-sm text-slate-500">Aquí aparecerán PREACTIVACIÓN, ACTIVADO, READY, entradas, TP, time-stop e invalidaciones. Que no haya alerta también es una decisión válida: NO TRADE.</div></div>}
    </div>

    <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-[11px] leading-5 text-slate-500">
      <b className="text-emerald-300">Verde</b> = setup READY según reglas del sistema, no garantía. <b className="text-amber-200">Amarillo</b> = preparación. <b className="text-violet-200">Violeta</b> = trigger/activación/retest. <b className="text-rose-300">Rojo</b> = salida, stop, conflicto o invalidación.
    </div>
  </>;
}

function PlanCell({ label, value, good = false, danger = false, icon }: { label: string; value: string; good?: boolean; danger?: boolean; icon?: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-800/80 bg-black/15 p-2.5"><div className="flex items-center gap-1 text-[9px] uppercase tracking-[.08em] text-slate-600">{icon}{label}</div><div className={`mt-1 font-mono text-[11px] font-black ${good ? "text-emerald-300" : danger ? "text-rose-300" : "text-slate-200"}`}>{value}</div></div>;
}
