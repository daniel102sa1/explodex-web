import { Settings2, ShieldCheck, Network, DatabaseZap, Activity, Server, WalletCards, Newspaper } from "lucide-react";
import { getCoinGlassStatus, getHealth, getRuntimeStatus } from "@/lib/api";

export const dynamic = "force-dynamic";

function statusTone(ok: boolean | null | undefined) {
  if (ok === true) return "border-emerald-500/25 bg-emerald-500/5 text-emerald-300";
  if (ok === false) return "border-rose-500/25 bg-rose-500/5 text-rose-300";
  return "border-amber-500/25 bg-amber-500/5 text-amber-200";
}

function statusText(ok: boolean | null | undefined, good = "OK", bad = "FALLO") {
  if (ok === true) return good;
  if (ok === false) return bad;
  return "SIN DATOS";
}

export default async function SettingsPage() {
  const [runtime, coinglass, health] = await Promise.all([
    getRuntimeStatus().catch(() => null),
    getCoinGlassStatus(true).catch(() => null),
    getHealth().catch(() => null),
  ]);
  const scanner = runtime?.scanner ?? {};
  const manager = runtime?.paper_manager ?? {};
  const sync = runtime?.paper_sync ?? {};
  const marketSource = health?.market_data_source ?? runtime?.market_data_source ?? "—";

  const scannerHealthy = scanner.last_ok === true;
  const paperManagerHealthy = manager.last_ok === true || manager.last_ok == null;
  const paperSyncHealthy = sync.last_ok === true || sync.last_ok == null;
  const coinGlassHealthy = Boolean(coinglass?.configured && coinglass?.last_http_status === 200 && !coinglass?.last_error);
  const dbHealthy = health?.database === true;
  const exchangeHealthy = Boolean(marketSource && marketSource !== "unknown" && marketSource !== "—");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-300"><Settings2 size={16}/> Configuración</div>
      <h1 className="mt-2 text-3xl font-black text-white">Estado y límites del sistema</h1>
      <p className="mt-2 text-sm text-slate-400">Diagnóstico real de motores, fuentes de datos y protecciones antes de cualquier uso con capital real.</p>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Diagnostic icon={<DatabaseZap size={17}/>} label="Base de datos" value={statusText(dbHealthy)} ok={dbHealthy} sub={health?.status === "ok" ? "PostgreSQL responde" : "Revisar conexión"}/>
        <Diagnostic icon={<Server size={17}/>} label="Fuente de mercado" value={exchangeHealthy ? "CONECTADA" : "FALLO"} ok={exchangeHealthy} sub={String(marketSource)}/>
        <Diagnostic icon={<Activity size={17}/>} label="Scanner" value={statusText(scanner.last_ok, "ÚLTIMO CICLO OK", "ÚLTIMO CICLO FALLÓ")} ok={scanner.last_ok} sub={scanner.running ? "Escaneando ahora" : `Cada ${scanner.interval_seconds ?? "—"}s`}/>
        <Diagnostic icon={<Network size={17}/>} label="CoinGlass" value={coinGlassHealthy ? "CONECTADO" : coinglass?.configured ? "DEGRADADO" : "NO CONFIGURADO"} ok={coinGlassHealthy} sub={`HTTP ${coinglass?.last_http_status ?? "—"} · ${coinglass?.requests_last_60s ?? 0}/${coinglass?.safe_rate_limit_per_minute ?? "—"} req/min`}/>
        <Diagnostic icon={<WalletCards size={17}/>} label="Paper manager" value={statusText(manager.last_ok, "OK", "FALLO")} ok={paperManagerHealthy} sub={manager.running ? "Gestionando posiciones" : `Cada ${manager.interval_seconds ?? "—"}s`}/>
        <Diagnostic icon={<WalletCards size={17}/>} label="Paper sync" value={statusText(sync.last_ok, "OK", "FALLO")} ok={paperSyncHealthy} sub={sync.running ? "Sincronizando" : `Cada ${sync.interval_seconds ?? "—"}s`}/>
        <Diagnostic icon={<ShieldCheck size={17}/>} label="Modo" value="PAPER" ok={health?.paper_trading_only !== false} sub="Sin dinero real"/>
        <Diagnostic icon={<Newspaper size={17}/>} label="Noticias" value="ACTIVAS" ok={true} sub="Filtro secundario en español"/>
      </section>

      {(scanner.last_error || manager.last_error || sync.last_error || health?.provider_warning || coinglass?.last_error) && (
        <section className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h2 className="font-black text-amber-200">Errores o advertencias recientes</h2>
          <div className="mt-3 space-y-2 text-xs leading-5 text-amber-100/90">
            {scanner.last_error && <div><b>Scanner:</b> {scanner.last_error}</div>}
            {manager.last_error && <div><b>Paper manager:</b> {manager.last_error}</div>}
            {sync.last_error && <div><b>Paper sync:</b> {sync.last_error}</div>}
            {health?.provider_warning && <div><b>Proveedor principal:</b> {health.provider_warning}</div>}
            {coinglass?.last_error && <div><b>CoinGlass:</b> {coinglass.last_error}</div>}
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Scheduler" value={runtime?.scheduler_enabled ? "ACTIVO" : "INACTIVO"} />
        <Stat label="Scanner cada" value={scanner.interval_seconds ? `${scanner.interval_seconds}s` : "—"} />
        <Stat label="Deep limit" value={String(scanner.deep_limit ?? "—")} />
        <Stat label="Paper manager" value={manager.interval_seconds ? `${manager.interval_seconds}s` : "—"} />
        <Stat label="Paper sync" value={sync.interval_seconds ? `${sync.interval_seconds}s` : "—"} />
        <Stat label="Fuente" value={String(marketSource)} />
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
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">CoinGlass confirma OI, taker, funding y liquidaciones. El NetFlow directo requiere un plan superior, así que no se simula.</div>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2 text-emerald-300"><ShieldCheck size={18}/><h2 className="font-black">Protecciones activas en esta etapa</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {["Sin ejecución automática con dinero real", "Límite de operaciones paper simultáneas", "Filtro de riesgo y score mínimo", "Bloqueo por pérdida diaria", "No perseguir precio fuera de zona", "Stop y objetivos definidos por señal", "CoinGlass obligatorio para READY cuando está configurado", "Conflicto multi-exchange puede vetar la señal", "Datos faltantes no se inventan", "Score no se presenta como probabilidad de ganar"].map((text) => <div key={text} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">{text}</div>)}
        </div>
      </section>
    </main>
  );
}

function Diagnostic({ icon, label, value, ok, sub }: { icon: React.ReactNode; label: string; value: string; ok: boolean | null | undefined; sub: string }) {
  return <div className={`rounded-2xl border p-4 ${statusTone(ok)}`}><div className="flex items-center gap-2 text-xs uppercase tracking-[0.12em] opacity-80">{icon}{label}</div><div className="mt-2 text-lg font-black">{value}</div><div className="mt-1 text-xs opacity-70">{sub}</div></div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4"><div className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div></div>; }
