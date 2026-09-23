export const n=(v:any)=>Number(v)||0;
export const money=(v:any)=>v==null?"—":`${n(v).toFixed(2)} USDT`;
export const px=(v:any)=>v==null?"—":n(v).toLocaleString(undefined,{maximumSignificantDigits:9});
export const dt=(v:any)=>!v?"—":new Date(v).toLocaleString("es-GT",{dateStyle:"short",timeStyle:"short"});
export const move=(s:string,e:number,p:number)=>!e?0:((p-e)/e*100)*(s==="SHORT"?-1:1);
export const roe=(p:any,m:any)=>n(m)?n(p)/n(m)*100:null;
export const dur=(a:any,b:any)=>{if(!a)return"—";const m=Math.max(0,Math.round(((b?new Date(b):new Date()).getTime()-new Date(a).getTime())/6e4));return m>1439?`${(m/1440).toFixed(1)} d`:m>59?`${(m/60).toFixed(1)} h`:`${m} min`};
export const reason=(v:any)=>{if(v&&typeof v==="object")return v;try{return JSON.parse(v||"{}")}catch{return{}}};
export const parseReason=reason;
export function Side({v}:{v:string}){return <b className={v==="LONG"?"text-emerald-300":"text-rose-300"}>{v}</b>}
