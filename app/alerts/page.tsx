import { Bell, CircleAlert } from "lucide-react";
import { getAlerts } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const alerts = await getAlerts().catch(() => []);
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300"><Bell size={16}/> Centro de alertas</div>
      <h1 className="mt-2 text-3xl font-black text-white">Alertas pendientes</h1>
      <p className="mt-2 text-sm text-slate-400">Eventos generados por señales y operaciones paper.</p>

      <div className="mt-8 space-y-3">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><CircleAlert size={16} className="text-amber-300"/><h2 className="font-black text-white">{alert.title}</h2></div>
                <p className="mt-2 text-sm text-slate-300">{alert.message}</p>
              </div>
              <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-400">{alert.severity}</div>
            </div>
            <div className="mt-3 text-xs text-slate-600">{new Date(alert.created_at).toLocaleString("es-GT")}</div>
          </article>
        ))}
        {!alerts.length && <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">No hay alertas pendientes.</div>}
      </div>
    </main>
  );
}
