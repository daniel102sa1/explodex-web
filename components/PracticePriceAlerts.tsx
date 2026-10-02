"use client";
import { useEffect, useRef, useState } from "react";
type Alert={id:string;symbol:string;level:number;direction:"above"|"below";created:number;triggered?:number};
const KEY="explodex:practice:price-alerts:v1";
export default function PracticePriceAlerts({symbol,price,onSelect,onClose}:{
  symbol:string;price:number;onSelect:(s:string)=>void;onClose:()=>void;
}){
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [level,setLevel]=useState(""),[direction,setDirection]=useState<"above"|"below">("above");
  const [notice,setNotice]=useState("");
  const last=useRef<{symbol:string;price:number}>({symbol,price:0});
  useEffect(()=>{
    try{const x=JSON.parse(localStorage.getItem(KEY)||"[]");
      if(Array.isArray(x))setAlerts(x.filter((v:any)=>v&&typeof v.symbol==="string"&&v.level>0).slice(0,20));}catch{}
  },[]);
  function save(next:Alert[]){setAlerts(next);try{localStorage.setItem(KEY,JSON.stringify(next.slice(0,20)));}catch{}}
  useEffect(()=>{
    if(!price||price<=0)return;
    const previous=last.current;
    last.current={symbol,price};
    if(previous.symbol!==symbol || previous.price<=0)return;
    const crossed=alerts.filter(a=>!a.triggered&&a.symbol===symbol&&(
      a.direction==="above"?(previous.price<a.level&&price>=a.level):(previous.price>a.level&&price<=a.level)));
    if(!crossed.length)return;
    const now=Date.now();
    setNotice(crossed.map(a=>a.symbol+" "+(a.direction==="above"?"subió sobre":"bajó de")+" "+a.level).join(" · "));
    save(alerts.map(a=>crossed.some(x=>x.id===a.id)?{...a,triggered:now}:a));
    if(typeof Notification!=="undefined"&&Notification.permission==="granted"){
      crossed.forEach(a=>{try{new Notification("ExplodeX · alerta local",{
        body:a.symbol+" "+(a.direction==="above"?"subió sobre":"bajó de")+" "+a.level});}catch{}});
    }
  },[symbol,price,alerts]);
  function add(){
    const p=Number(level);
    if(!(p>0)||!Number.isFinite(p))return;
    if(alerts.length>=20){setNotice("Máximo de 20 alertas en este navegador.");return;}
    save([...alerts,{id:Date.now()+"-"+Math.random().toString(36).slice(2),symbol,level:p,direction,created:Date.now()}]);
    setLevel("");setNotice("Alerta armada. Se activará al cruzar el precio, mientras el gráfico de esa moneda esté abierto.");
  }
  async function requestPermission(){
    if(typeof Notification==="undefined"){setNotice("Este navegador no admite notificaciones.");return;}
    const granted=await Notification.requestPermission();
    setNotice(granted==="granted"?"Notificaciones permitidas; el gráfico debe permanecer abierto.":"Se mostrarán solo avisos dentro del gráfico.");
  }
  return <section className="border-b border-slate-800 bg-[#07101a] p-3">
    <div className="mb-2 flex flex-wrap justify-between gap-2">
      <div><b className="text-xs text-white">Alertas de precio · locales</b>
        <p className="mt-1 text-[9px] text-slate-500">Solo se comprueban en la moneda cuyo gráfico está abierto. Sin tareas de Railway ni alertas con la pestaña cerrada.</p></div>
      <button onClick={onClose} className="rounded border border-slate-700 px-2 py-1 text-[9px] text-slate-400">Cerrar</button>
    </div>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <select aria-label="Condición de alerta" value={direction} onChange={e=>setDirection(e.target.value as "above"|"below")}
        className="rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200">
        <option value="above">Cruza arriba</option><option value="below">Cruza abajo</option>
      </select>
      <input aria-label="Nivel de alerta" type="number" step="any" value={level} onChange={e=>setLevel(e.target.value)}
        placeholder={price?String(price):"Precio"} className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"/>
      <button onClick={add} className="rounded bg-cyan-400 px-3 py-2 text-[10px] font-black text-slate-950">Crear para {symbol}</button>
      <button onClick={()=>void requestPermission()} className="rounded border border-slate-700 px-2 py-2 text-[10px] text-slate-300">Permitir avisos</button>
    </div>
    {notice&&<p role="status" className="mb-2 text-[10px] text-amber-200">{notice}</p>}
    <div className="flex flex-wrap gap-1">
      {alerts.map(a=><div key={a.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-[9px]">
        <button onClick={()=>onSelect(a.symbol)} className="text-slate-200">{a.symbol} {a.direction==="above"?"↑":"↓"} {a.level}
          {a.triggered&&<span className="ml-1 text-emerald-300">✓ activada</span>}</button>
        <button title="Eliminar alerta" onClick={()=>save(alerts.filter(x=>x.id!==a.id))} className="text-rose-400">×</button>
      </div>)}
      {!alerts.length&&<span className="text-[9px] text-slate-500">No hay alertas guardadas.</span>}
    </div>
  </section>;
}
