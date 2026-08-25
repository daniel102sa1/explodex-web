"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, BarChart3, Bell, Bot, Gauge, Layers3, LineChart, Lock, Newspaper, RadioTower, WalletCards } from "lucide-react";
import { LOCKED_PLANS_EVENT, readLockedPlans } from "@/lib/lockedPlans";

const items = [
  { href: "/", label: "Inicio", icon: Gauge },
  { href: "/terminal", label: "Terminal", icon: RadioTower },
  { href: "/scanner", label: "Scanner", icon: Activity },
  { href: "/plans", label: "Planes", icon: Lock },
  { href: "/paper", label: "Paper", icon: WalletCards },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/market", label: "Mercado", icon: LineChart },
  { href: "/news", label: "Noticias", icon: Newspaper },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/settings", label: "Ajustes", icon: Layers3 },
];

export default function AppNav() {
  const pathname = usePathname();
  const [planCount, setPlanCount] = useState(0);

  useEffect(() => {
    const refresh = () => setPlanCount(readLockedPlans().length);
    refresh();
    const timer = window.setInterval(refresh, 2000);
    window.addEventListener("storage", refresh);
    window.addEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", refresh);
      window.removeEventListener(LOCKED_PLANS_EVENT, refresh as EventListener);
    };
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#071018]/95 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="mr-2 inline-flex shrink-0 items-center gap-2 font-black text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <Bot size={18} className="text-emerald-400" />
          </span>
          <span>ExplodeX</span>
          <span className="hidden items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300 lg:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
          </span>
        </Link>

        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                active
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200 shadow-sm shadow-emerald-950/40"
                  : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:text-white"
              }`}
            >
              <Icon size={15} /> {label}
              {href === "/plans" && planCount > 0 && <span className="ml-0.5 rounded-full bg-cyan-400/15 px-1.5 py-0.5 font-mono text-[9px] font-black text-cyan-200">{planCount}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
