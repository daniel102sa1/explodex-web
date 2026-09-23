import R from"./ClosedRow";

export default function X({rows}:{rows:any[]}){
  const heads=["Activo","Dir.","Entrada","Salida","Precio %","Neto","ROE","R","MFE","MAE","Apertura","Cierre","Duración","Motivo","Lane / setup","Generación"];
  return <div className="terminal-panel overflow-x-auto">
    <table className="min-w-[1700px] w-full text-xs">
      <thead><tr>{heads.map(x=><th key={x} className="p-3 text-left text-slate-600">{x}</th>)}</tr></thead>
      <tbody>{rows.map(r=><R key={r.id} r={r}/>)}</tbody>
    </table>
    {!rows.length&&<div className="p-8 text-center text-slate-600">Sin operaciones cerradas.</div>}
  </div>
}