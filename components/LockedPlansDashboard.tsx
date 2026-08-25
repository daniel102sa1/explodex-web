"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  Crosshair,
  DollarSign,
  ExternalLink,
  Lock,
  Pencil,
  RefreshCcw,
  ShieldAlert,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { getPrice } from "@/lib/api";
import {
  LOCKED_PLANS_EVENT,
  readLockedPlans,
  removeLockedPlan,
  writeLockedPlan,
  type LockedPlan,
} from "@/lib/lockedPlans";

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function money(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function crossed(plan: LockedPlan, price: number, level: number, profit: boolean) {
  if (!(price > 0 && level > 0)) return false;
  if (plan.direction === "LONG") return profit ? price >= level : price <= level;
  return profit ? price <= level : price >= level;
}

function derive(plan: LockedPlan, price: number) {
  const entry = Number(plan.actualEntryPrice || (plan.entryLow + plan.entryHigh) / 2);
  const risk = Math.abs(entry - plan.stop);
  const favorable = plan.direction === "LONG" ? price - entry : entry - price;
  const r = risk > 0 ? favorable / risk : 0;
  const stop = crossed(plan, price, plan.stop, false);
  const invalid = crossed(plan, price, plan.invalidation, false);
  const tp1 = crossed(plan, price, plan.tp1, true);
  const tp2 = crossed(plan, price, plan.tp2, true);
  const tp3 = crossed(plan, price, plan.tp3, true);
  const entryAge = plan.enteredAt ? (Date.now() - plan.enteredAt) / 60000 : 0;
  const qty = plan.enteredAt && plan.marginUsdt && plan.leverage && entry > 0
    ? (plan.marginUsdt * plan.leverage) / entry
    : 0;
  const pnl = qty > 0
    ? (plan.direction === "LONG" ? price - entry : entry - price) * qty
    : null;

  let label = "FIJADO · SIN ENTRADA";
  let tone: "green" | "amber" | "red" | "violet" | "neutral" = "neutral";
  if (plan.enteredAt) {
    label = "MANTENER / VIGILAR";
    tone = r >= 0 ? "amber" : "red";
    if (stop || invalid) { label = "STOP / INVALIDADO"; tone = "red"; }
    else if (tp3) { label = "TP3 ALCANZADO"; tone = "green"; }
    else if (tp2) { label = "TP2 ALCANZADO"; tone = "green"; }
    else if (tp1) { label = "TP1 · PROTEGER"; tone = "violet"; }
    else if (entryAge >= plan.timeStopMinutes && r < 0.5) { label = "TIME STOP · REVISAR"; tone = "red"; }
    else if (r >= 0.5) { label = "MANTENER SEGÚN PLAN"; tone = "green"; }
  }
  return { entry, r, pnl, label, tone, age: entryAge };
}

type EditState = {
  entry: string;
  margin: string;
  leverage: string;
  notes: string;
};

export default function LockedPlansDashboard() {
  const [plans, setPlans] = useState<LockedPlan[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<LockedPlan | null>(null);
  const [form, setForm] = useState<EditState>({ entry: "", margin: "", leverage: "", notes: "" });

  const loadPlans = useCallback(() => setPlans(readLockedPlans()), []);

  useEffect(() => {
    loadPlans();
    const storage = () => loadPlans();
    window.addEventListener("storage", storage);
    window.addEventListener(LOCKED_PLANS_EVENT, storage as EventListener);
    return () => {
      window.removeEventListener("storage", storage);
      window.removeEventListener(LOCKED_PLANS_EVENT, storage as EventListener);
    };
  }, [loadPlans]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const current = readLockedPlans().slice(0, 30);
      const entries = await Promise.all(current.map(async (plan) => {
        try {
          const p = await getPrice(plan.symbol);
          return [plan.symbol, Number(p.price || 0)] as const;
        } catch {
          return [plan.symbol, 0] as const;
        }
      }));
      if (!cancelled) setPrices(Object.fromEntries(entries.filter(([, p]) => p > 0)));
    }
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [plans.length]);

  const summary = useMemo(() => {
    let entered = 0;
    let positive = 0;
    let warnings = 0;
    for (const p of plans) {
      if (!p.enteredAt) continue;
      entered++;
      const price = prices[p.symbol] || 0;
      if (!price) continue;
      const d = derive(p, price);
      if (d.r > 0) positive++;
      if (d.tone === "red") warnings++;
    }
    return { entered, positive, warnings };
  }, [plans, prices]);

  function beginEdit(plan: LockedPlan) {
    setEditing(plan);
    setForm({
      entry: plan.actualEntryPrice ? String(plan.actualEntryPrice) : "",
      margin: plan.marginUsdt ? String(plan.marginUsdt) : "",
      leverage: plan.leverage ? String(plan.leverage) : "",
      notes: plan.notes || "",
    });
  }

  function saveEdit() {
    if (!editing) return;
    const entry = Number(form.entry);
    const margin = Number(form.margin);
    const leverage = Number(form.leverage);
    const next: LockedPlan = {
      ...editing,
      actualEntryPrice: entry > 0 ? entry : undefined,
      marginUsdt: margin > 0 ? margin : undefined,
      leverage: leverage > 0 ? leverage : undefined,
      notes: form.notes.trim() || undefined,
      enteredAt: entry > 0 ? (editing.enteredAt || Date.now()) : editing.enteredAt,
    };
    writeLockedPlan(next);
    setEditing(null);
    loadPlans();
  }

  function markEntered(plan: LockedPlan) {
    const price = prices[plan.symbol] || (plan.entryLow + plan.entryHigh) / 2;
    writeLockedPlan({ ...plan, actualEntryPrice: price, enteredAt: Date.now() });
    loadPlans();
  }

  function remove(plan: LockedPlan) {
    removeLockedPlan(plan.symbol);
    loadPlans();
  }

  return <main className="mx-auto min-h-screen max-w-[1500px] px-4 py-6 sm:px-6">
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-cyan-300"><Lock size={17}/> Mis planes fijados</div>
        <h1 className="mt-2 text-3xl font-black text-white">Tesis que no cambian con cada recálculo</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Aquí conservas el plan original, registras tu entrada real y vuelves a la moneda para decidir si mantener, proteger o salir. No conecta ni modifica órdenes en Binance.</p>
      </div>
      <button onClick={loadPlans} className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-xs font-bold text-slate-300"><RefreshCcw size={14}/> Actualizar lista</button>
    </header>

    <section className="mb-5 grid gap-3 sm:grid-cols-4">
      <Summary label="Planes fijados" value={String(plans.length)} />
      <Summary label="Con entrada" value={String(summary.entered)} />
      <Summary label="R positivo" value={String(summary.positive)} good />
      <Summary label="Requieren atención" value={String(summary.warnings)} bad={summary.warnings > 0} />
    </section>

    {!plans.length ? <section className="rounded-3xl border border-dashed border-slate-800 bg-slate-950/35 p-10 text-center">
      <Lock size={30} className="mx-auto text-slate-600"/>
      <div className="mt-3 font-black text-white">Todavía no tienes planes fijados</div>
      <p className="mt-2 text-sm text-slate-500">Abre una moneda, revisa su setup y usa “Fijar este plan”. Luego aparecerá aquí automáticamente.</p>
      <Link href="/scanner" className="mt-4 inline-flex rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-2 text-sm font-black text-cyan-200">Ir al Scanner</Link>
    </section> : <section className="grid gap-4 xl:grid-cols-2">
      {plans.map((plan) => {
        const price = prices[plan.symbol] || 0;
        const d = price ? derive(plan, price) : null;
        const tone = d?.tone === "green" ? "border-emerald-500/25" : d?.tone === "red" ? "border-rose-500/25" : d?.tone === "violet" ? "border-violet-500/25" : "border-slate-800";
        return <article key={plan.symbol} className={`rounded-3xl border bg-[#07111d]/80 p-4 ${tone}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><span className="text-xl font-black text-white">{plan.symbol}</span><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${plan.direction === "LONG" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-rose-500/20 bg-rose-500/5 text-rose-300"}`}>{plan.direction === "LONG" ? <ArrowUpRight size={11}/> : <ArrowDownRight size={11}/>} {plan.direction}</span></div>
              <div className="mt-1 text-[10px] text-slate-500">{plan.predictionType.replaceAll("_", " ")} · fijado {new Date(plan.lockedAt).toLocaleString()}</div>
            </div>
            <div className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${d?.tone === "green" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : d?.tone === "red" ? "border-rose-500/20 bg-rose-500/5 text-rose-300" : d?.tone === "violet" ? "border-violet-500/20 bg-violet-500/5 text-violet-300" : "border-slate-800 text-slate-400"}`}>{d?.label ?? "PRECIO NO DISPONIBLE"}</div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Mini icon={<Activity size={12}/>} label="Ahora" value={price ? fmt(price) : "—"} />
            <Mini icon={<Crosshair size={12}/>} label="Entrada real" value={plan.actualEntryPrice ? fmt(plan.actualEntryPrice) : "SIN REGISTRAR"} />
            <Mini icon={<Target size={12}/>} label="R actual" value={d && plan.enteredAt ? `${d.r >= 0 ? "+" : ""}${d.r.toFixed(2)}R` : "—"} good={Boolean(d && d.r > 0)} bad={Boolean(d && d.r < 0)} />
            <Mini icon={<DollarSign size={12}/>} label="PnL est." value={d?.pnl == null ? "—" : money(d.pnl)} good={Boolean(d && d.pnl != null && d.pnl > 0)} bad={Boolean(d && d.pnl != null && d.pnl < 0)} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Level label="Trigger" value={plan.trigger} />
            <Level label="Stop" value={plan.stop} bad />
            <Level label="TP1" value={plan.tp1} good />
            <Level label="TP2" value={plan.tp2} good />
            <Level label="TP3" value={plan.tp3} good />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Mini icon={<DollarSign size={12}/>} label="Margen" value={plan.marginUsdt ? `$${plan.marginUsdt.toFixed(2)}` : "—"} />
            <Mini icon={<Activity size={12}/>} label="Apalancamiento" value={plan.leverage ? `${plan.leverage}x` : "—"} />
            <Mini icon={<Clock3 size={12}/>} label="Tiempo abierta" value={plan.enteredAt ? `${Math.floor((Date.now() - plan.enteredAt) / 60000)} min` : "SIN ENTRADA"} />
          </div>

          {plan.notes && <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs leading-5 text-slate-400">{plan.notes}</div>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/coin/${plan.symbol}`} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950"><ExternalLink size={13}/> Abrir análisis</Link>
            <button onClick={() => beginEdit(plan)} className="inline-flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs font-bold text-violet-200"><Pencil size={13}/> Editar entrada</button>
            {!plan.enteredAt && <button onClick={() => markEntered(plan)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs font-bold text-emerald-200"><Crosshair size={13}/> Entré al precio actual</button>}
            <button onClick={() => remove(plan)} className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs font-bold text-rose-200"><Trash2 size={13}/> Liberar</button>
          </div>
        </article>;
      })}
    </section>}

    {editing && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={() => setEditing(null)}>
      <div className="w-full max-w-xl rounded-3xl border border-slate-700 bg-[#07111d] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-black text-white">Editar {editing.symbol}</div><div className="mt-1 text-xs text-slate-500">Registra los datos reales de tu operación. No modifica Binance.</div></div><button onClick={() => setEditing(null)} className="rounded-lg border border-slate-800 p-2 text-slate-400"><X size={15}/></button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Precio real de entrada" value={form.entry} onChange={(v) => setForm((x) => ({ ...x, entry: v }))} placeholder={fmt(prices[editing.symbol] || editing.entryLow)} />
          <Field label="Margen usado (USDT)" value={form.margin} onChange={(v) => setForm((x) => ({ ...x, margin: v }))} placeholder="Ej. 25" />
          <Field label="Apalancamiento" value={form.leverage} onChange={(v) => setForm((x) => ({ ...x, leverage: v }))} placeholder="Ej. 5" />
          <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><div className="text-[9px] uppercase tracking-[.08em] text-slate-500">Precio vivo</div><div className="mt-2 font-mono text-base font-black text-white">{fmt(prices[editing.symbol])}</div></div>
        </div>
        <label className="mt-3 block rounded-xl border border-slate-800 bg-slate-950/45 p-3"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">Nota personal</span><textarea value={form.notes} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} rows={3} className="mt-2 w-full resize-none bg-transparent text-sm text-slate-200 outline-none" placeholder="Ej. Entré después del reclaim, reducir si pierde EMA21..." /></label>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[.035] p-3 text-[11px] leading-5 text-amber-100/70"><ShieldAlert size={14} className="mt-0.5 shrink-0"/>PnL mostrado es estimado con el precio consultado. Comisiones, funding, slippage y liquidación real dependen de Binance y de tu tipo de margen.</div>
        <div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-300">Cancelar</button><button onClick={saveEdit} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950">Guardar operación</button></div>
      </div>
    </div>}
  </main>;
}

function Summary({ label, value, good=false, bad=false }: { label:string; value:string; good?:boolean; bad?:boolean }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"><div className="text-[9px] uppercase tracking-[.1em] text-slate-500">{label}</div><div className={`mt-1 text-2xl font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
function Mini({ label, value, icon, good=false, bad=false }: { label:string; value:string; icon:React.ReactNode; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/45 p-2.5"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[.07em] text-slate-600">{icon}{label}</div><div className={`mt-1 font-mono text-xs font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
function Level({ label, value, good=false, bad=false }: { label:string; value:number; good?:boolean; bad?:boolean }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-2"><div className="text-[8px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-[11px] font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-slate-200"}`}>{fmt(value)}</div></div>;
}
function Field({ label, value, onChange, placeholder }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  return <label className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><span className="text-[9px] uppercase tracking-[.08em] text-slate-500">{label}</span><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-2 w-full bg-transparent font-mono text-base font-black text-white outline-none placeholder:text-slate-700" /></label>;
}
