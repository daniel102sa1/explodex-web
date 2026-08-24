"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CircleAlert, Loader2, Wifi, WifiOff } from "lucide-react";

type AlertItem = {
  id: string;
  signal_id?: string | null;
  trade_id?: string | null;
  created_at: string;
  channel: string;
  severity: string;
  title: string;
  message: string;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

function tone(severity: string) {
  if (severity === "READY" || severity === "ENTRY") {
    return {
      card: "border-emerald-500/35 bg-emerald-500/5",
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      icon: "text-emerald-300",
    };
  }
  if (severity === "EARLY") {
    return {
      card: "border-amber-500/35 bg-amber-500/5",
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
      icon: "text-amber-300",
    };
  }
  if (severity === "EXIT" || severity === "STOP") {
    return {
      card: "border-rose-500/35 bg-rose-500/5",
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      icon: "text-rose-300",
    };
  }
  return {
    card: "border-slate-800 bg-slate-950/65",
    badge: "border-slate-700 text-slate-400",
    icon: "text-slate-400",
  };
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
      if (!BASE_URL) {
        if (mounted) {
          setConnected(false);
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${BASE_URL}/api/v1/alerts/pending?limit=100`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const payload = (await response.json()) as AlertItem[];

        if (!mounted) return;
        setAlerts(payload);
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
              new Notification(item.title, { body: item.message.slice(0, 220), tag: item.id });
            }
          });
        }
      } catch {
        if (mounted) {
          setConnected(false);
          setLoading(false);
        }
      } finally {
        if (mounted) timer = setTimeout(load, 5000);
      }
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const requestNotifications = async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  if (loading) {
    return (
      <div className="mt-8 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/65 p-5 text-sm text-slate-400">
        <Loader2 size={16} className="animate-spin" /> Cargando alertas del scanner…
      </div>
    );
  }

  return (
    <>
      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/65 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          {connected ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-rose-400" />}
          <span className="font-bold text-white">{connected ? "Alertas en vivo conectadas" : "Sin conexión al feed de alertas"}</span>
          <span className="text-slate-500">· refresco cada 5 s</span>
        </div>

        {notificationPermission !== "unsupported" && notificationPermission !== "granted" && (
          <button
            onClick={requestNotifications}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-bold text-amber-200 hover:bg-amber-500/15"
          >
            <BellRing size={16} /> Activar avisos del navegador
          </button>
        )}

        {notificationPermission === "granted" && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-bold text-emerald-300">
            <Bell size={14} /> Avisos del navegador activos
          </div>
        )}
      </section>

      <div className="mt-6 space-y-3">
        {alerts.map((alert) => {
          const colors = tone(alert.severity);
          return (
            <article key={alert.id} className={`rounded-2xl border p-4 ${colors.card}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <CircleAlert size={17} className={colors.icon} />
                    <h2 className="font-black text-white">{alert.title}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{alert.message}</p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-black ${colors.badge}`}>{alert.severity}</div>
              </div>
              <div className="mt-3 text-xs text-slate-600">{new Date(alert.created_at).toLocaleString("es-GT")}</div>
            </article>
          );
        })}

        {!alerts.length && (
          <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center">
            <div className="font-black text-white">Sin predicciones operables por ahora</div>
            <div className="mt-2 text-sm text-slate-500">El scanner seguirá revisando Binance. Aquí aparecerán PREPARING, READY, entradas y salidas cuando cumplan los filtros.</div>
          </div>
        )}
      </div>
    </>
  );
}
