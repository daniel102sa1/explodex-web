import Link from "next/link";
import { Activity, BarChart3, Bell, Bot, Gauge, Layers3, LineChart, Newspaper, WalletCards } from "lucide-react";

const items = [
  { href: "/", label: "Inicio", icon: Gauge },
  { href: "/scanner", label: "Scanner", icon: Activity },
  { href: "/paper", label: "Paper", icon: WalletCards },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/market", label: "Mercado", icon: LineChart },
  { href: "/news", label: "Noticias", icon: Newspaper },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/settings", label: "Ajustes", icon: Layers3 },
];

export default function AppNav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#071018]/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="mr-2 inline-flex shrink-0 items-center gap-2 font-black text-white">
          <Bot size={19} className="text-emerald-400" /> ExplodeX
        </Link>
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:text-white"
          >
            <Icon size={15} /> {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
