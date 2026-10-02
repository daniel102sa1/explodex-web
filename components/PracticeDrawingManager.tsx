"use client";

export type UserDrawing={
  id:string;name:string;points:Array<{timestamp:number;value:number}>;
  lock?:boolean;mode?:string;styles?:any;
};
const colors=["#22d3ee","#34d399","#fb7185","#c084fc","#fbbf24","#f8fafc"];
export default function PracticeDrawingManager({drawings,selected,onSelect,onStyle,onLock,onClone,onDelete,
  onUndo,onRedo,onSave,onClose,canUndo,canRedo
}:{
  drawings:UserDrawing[];selected:string;onSelect:(s:string)=>void;
  onStyle:(id:string,color:string,width:number)=>void;onLock:(id:string)=>void;
  onClone:(id:string)=>void;onDelete:(id:string)=>void;onUndo:()=>void;onRedo:()=>void;
  onSave:()=>void;onClose:()=>void;canUndo:boolean;canRedo:boolean;
}){
  const current=drawings.find(x=>x.id===selected);
  return <section className="border-b border-slate-800 bg-[#06101b] px-3 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><b className="text-[11px] text-slate-100">Objetos y herramientas</b>
        <p className="mt-1 text-[9px] text-slate-500">Edita un dibujo sin borrar los demás. El historial de deshacer guarda hasta 20 pasos en memoria.</p></div>
      <div className="flex gap-1 text-[9px]">
        <button disabled={!canUndo} onClick={onUndo} className="rounded border border-slate-700 px-2 py-1.5 text-slate-200 disabled:opacity-30">↶ Deshacer</button>
        <button disabled={!canRedo} onClick={onRedo} className="rounded border border-slate-700 px-2 py-1.5 text-slate-200 disabled:opacity-30">↷ Rehacer</button>
        <button onClick={onSave} className="rounded border border-cyan-500/30 px-2 py-1.5 text-cyan-200">Guardar</button>
        <button onClick={onClose} className="rounded border border-slate-700 px-2 py-1.5 text-slate-400">Cerrar</button>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5">
      {drawings.map((d,i)=><button key={d.id} onClick={()=>onSelect(d.id)}
        className={"rounded-lg border px-2 py-1.5 text-[9px] "+
          (selected===d.id?"border-cyan-400/40 bg-cyan-400/10 text-cyan-100":"border-slate-700 text-slate-400")}>
        {i+1}. {d.name} · {d.points.length} puntos {d.lock?"🔒":""}
      </button>)}
      {!drawings.length&&<span className="text-[9px] text-slate-500">Aún no hay dibujos manuales.</span>}
    </div>
    {current&&<div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2 text-[9px]">
      <span className="text-slate-400">Color</span>
      {colors.map(col=><button key={col} title={col} aria-label={"Color "+col}
        onClick={()=>onStyle(current.id,col,2)}
        className="h-5 w-5 rounded-full border border-slate-500" style={{backgroundColor:col}}/>)}
      <button onClick={()=>onLock(current.id)} className="rounded border border-slate-700 px-2 py-1.5 text-slate-200">{current.lock?"Desbloquear":"Bloquear"}</button>
      <button onClick={()=>onClone(current.id)} className="rounded border border-slate-700 px-2 py-1.5 text-slate-200">Duplicar</button>
      <button onClick={()=>onDelete(current.id)} className="rounded border border-rose-500/25 px-2 py-1.5 text-rose-300">Eliminar este</button>
    </div>}
  </section>;
}
