import { Settings2, ShieldCheck } from "lucide-react";
import { getRuntimeStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const runtime = await getRuntimeStatus().catch(() => null);
  const scanner = runtime?.scanner ?? {};
  const manager = runtime?.paper_manager ?? {};
  const sync = runtime?.paper_sync ?? {};

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300"><Settings2 size={16}/> Configuración</div>
      <h1 className="mt-2 text-3xl font-black text-white">Estado y límites del sistema</h1>
      <p className="mt-2 text-sm text-slate-400">Vista inicial de configuración. Los cambios editables se habilitarán después de validar suficiente paper trading.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Scheduler" value={runtime?.scheduler_enabled ? "ACTIVO" : "INACTIVO"} />
        <Stat label="Scanner cada" value={scanner.interval_seconds ? `${scanner.interval_seconds}s` : "—"} />
        <Stat label="Deep limit" value={String(scanner.deep_limit ?? "—")} />
        <Stat label="Paper manager" value={manager.interval_seconds ? `${manager.interval_seconds}s` : "—"} />
        <Stat label="Paper sync" value={sync.interval_seconds ? `${sync.interval_seconds}s` : "—"} />
        <Stat label="Modo" value="PAPER" />
      </section>

      <section className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck size={18}/><h2 className="font-black">Protecciones activas en esta etapa</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {["Sin ejecución automática con dinero real", "Límite de operaciones paper simultáneas", "Filtro de riesgo y score mínimo", "Bloqueo por pérdida diaria", "No perseguir precio fuera de zona", "Stop y objetivos definidos por señal"].map((text) => <div key={text} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">{text}</div>)}
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <h2 className="text-lg font-black text-white">Próxima fase de ajustes editables</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">Después podremos controlar desde aquí riesgo por operación, máximo de posiciones, score mínimo, riesgo máximo, frecuencia del scanner y exclusiones de símbolos. Por ahora se mantienen fijados en backend para evitar cambios accidentales mientras calibramos.</p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div></div>; }
