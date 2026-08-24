import { Settings2, ShieldCheck, Network, DatabaseZap } from "lucide-react";
import { getCoinGlassStatus, getRuntimeStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [runtime, coinglass] = await Promise.all([
    getRuntimeStatus().catch(() => null),
    getCoinGlassStatus().catch(() => null),
  ]);
  const scanner = runtime?.scanner ?? {};
  const manager = runtime?.paper_manager ?? {};
  const sync = runtime?.paper_sync ?? {};

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300"><Settings2 size={16}/> Configuración</div>
      <h1 className="mt-2 text-3xl font-black text-white">Estado y límites del sistema</h1>
      <p className="mt-2 text-sm text-slate-400">Estado de los motores, fuentes de datos y protecciones antes de cualquier uso con capital real.</p>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Scheduler" value={runtime?.scheduler_enabled ? "ACTIVO" : "INACTIVO"} />
        <Stat label="Scanner cada" value={scanner.interval_seconds ? `${scanner.interval_seconds}s` : "—"} />
        <Stat label="Deep limit" value={String(scanner.deep_limit ?? "—")} />
        <Stat label="Paper manager" value={manager.interval_seconds ? `${manager.interval_seconds}s` : "—"} />
        <Stat label="Paper sync" value={sync.interval_seconds ? `${sync.interval_seconds}s` : "—"} />
        <Stat label="Modo" value="PAPER" />
      </section>

      <section className="mt-8 rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
        <div className="flex items-center gap-2 text-violet-200"><Network size={18}/><h2 className="font-black text-white">CoinGlass API</h2></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Estado" value={coinglass?.configured ? "CONECTADO" : "NO CONFIGURADO"} />
          <Stat label="Plan" value={coinglass?.plan ?? "—"} />
          <Stat label="Uso 60s" value={`${coinglass?.requests_last_60s ?? 0}/${coinglass?.safe_rate_limit_per_minute ?? "—"}`} />
          <Stat label="Último HTTP" value={String(coinglass?.last_http_status ?? "—")} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">La clave API vive solo en Railway; nunca se expone en el frontend.</div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">CoinGlass confirma OI/taker/funding/liquidaciones; no crea una entrada por sí solo.</div>
        </div>
        {coinglass?.last_error && <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">Último error CoinGlass: {coinglass.last_error}</div>}
      </section>

      <section className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck size={18}/><h2 className="font-black">Protecciones activas en esta etapa</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {["Sin ejecución automática con dinero real", "Límite de operaciones paper simultáneas", "Filtro de riesgo y score mínimo", "Bloqueo por pérdida diaria", "No perseguir precio fuera de zona", "Stop y objetivos definidos por señal", "CoinGlass obligatorio para READY cuando está configurado", "Conflicto multi-exchange puede vetar la señal"].map((text) => <div key={text} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">{text}</div>)}
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
        <div className="flex items-center gap-2"><DatabaseZap size={18} className="text-cyan-300"/><h2 className="text-lg font-black text-white">Próxima fase de ajustes editables</h2></div>
        <p className="mt-2 text-sm leading-6 text-slate-400">Después podremos controlar desde aquí riesgo por operación, máximo de posiciones, score mínimo, riesgo máximo, frecuencia del scanner y exclusiones de símbolos. Por ahora se mantienen fijados en backend para evitar cambios accidentales mientras calibramos.</p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div></div>; }
