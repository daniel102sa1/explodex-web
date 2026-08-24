import { Bell } from "lucide-react";
import AlertFeed from "@/components/AlertFeed";

export const dynamic = "force-dynamic";

export default function AlertsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-300"><Bell size={16}/> Centro de alertas</div>
      <h1 className="mt-2 text-3xl font-black text-white">Predicciones y alertas</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
        Señales tempranas PREPARING, confirmaciones READY, entradas paper y eventos de salida. El feed se actualiza automáticamente y puede activar avisos del navegador.
      </p>
      <AlertFeed />
    </main>
  );
}
