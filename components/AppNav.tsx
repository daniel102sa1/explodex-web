"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, GraduationCap, PauseCircle } from "lucide-react";

export default function AppNav() {
  const pathname = usePathname();
  const active = pathname === "/practice" || pathname.startsWith("/practice/");

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#071018]/95 shadow-lg shadow-black/10 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <Link href="/practice" className="inline-flex shrink-0 items-center gap-2 font-black text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
            <Bot size={18} className="text-cyan-300" />
          </span>
          <span>ExplodeX</span>
          <span className="hidden rounded-full border border-cyan-500/20 bg-cyan-500/[.05] px-2 py-1 text-[9px] font-black uppercase tracking-[.13em] text-cyan-200 sm:inline-flex">
            Trading Lab
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/practice"
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition ${
              active
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"
                : "border-slate-800 bg-slate-950/70 text-slate-300"
            }`}
          >
            <GraduationCap size={15}/> Práctica
          </Link>
          <span className="hidden items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[9px] font-bold text-slate-500 md:inline-flex">
            <PauseCircle size={13}/> demás módulos pausados
          </span>
        </div>
      </div>
    </nav>
  );
}
