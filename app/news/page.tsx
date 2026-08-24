import { Newspaper } from "lucide-react";
import { getOpportunities } from "@/lib/api";

export const dynamic = "force-dynamic";

function sentimentEs(value?: string) {
  switch ((value ?? "").toUpperCase()) {
    case "POSITIVE": return "POSITIVO";
    case "NEGATIVE": return "NEGATIVO";
    case "NEUTRAL": return "NEUTRAL";
    case "UNAVAILABLE": return "NO DISPONIBLE";
    case "NOT_CHECKED": return "SIN REVISAR";
    default: return value ?? "NEUTRAL";
  }
}

function directionEs(value?: string) {
  return value === "LONG" ? "ALCISTA (LONG)" : value === "SHORT" ? "BAJISTA (SHORT)" : value ?? "—";
}

export default async function NewsPage() {
  const data = await getOpportunities().catch(() => null);
  const groups = data?.groups ?? {};
  const rawItems = [
    ...(groups.elite ?? []),
    ...(groups.very_strong ?? []),
    ...(groups.strong ?? []),
    ...(groups.watch ?? []),
  ];

  const unique = new Map<string, (typeof rawItems)[number]>();
  for (const item of rawItems) {
    const current = unique.get(item.symbol);
    if (!current || Number(item.contextual_score ?? item.setup_score) > Number(current.contextual_score ?? current.setup_score)) {
      unique.set(item.symbol, item);
    }
  }

  const enriched = Array.from(unique.values()).filter((item) => item.news && item.news.sentiment !== "NOT_CHECKED");

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-300"><Newspaper size={16}/> Noticias</div>
      <h1 className="mt-2 text-3xl font-black text-white">Noticias y catalizadores</h1>
      <p className="mt-2 text-sm text-slate-400">Las noticias ahora se buscan en español. Sirven como filtro secundario y nunca sustituyen el análisis técnico, flujo, OI ni CoinGlass.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {enriched.map((item) => (
          <article key={item.symbol} className="rounded-3xl border border-slate-800 bg-slate-950/65 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black text-white">{item.symbol}</div>
                <div className="mt-1 text-sm text-slate-400">{directionEs(item.direction)} · Puntaje {Number(item.contextual_score ?? item.setup_score).toFixed(1)}</div>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">{sentimentEs(item.news?.sentiment)}</span>
            </div>
            <div className="mt-4 text-xs text-slate-500">Ajuste por noticias: {Number(item.news?.score_adjustment ?? 0).toFixed(1)} puntos</div>
            <div className="mt-4 space-y-3">
              {(item.news?.headlines ?? []).slice(0, 5).map((headline, index) => (
                <div key={`${item.symbol}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <div className="text-sm font-semibold text-slate-100">{headline.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{headline.source ?? "Fuente"}</div>
                </div>
              ))}
              {!item.news?.headlines?.length && <div className="text-sm text-slate-500">Sin titulares relevantes para mostrar.</div>}
            </div>
          </article>
        ))}
        {!enriched.length && <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-sm text-slate-500">Aún no hay candidatos enriquecidos con noticias.</div>}
      </div>
    </main>
  );
}
