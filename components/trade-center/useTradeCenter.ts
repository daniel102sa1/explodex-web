"use client";
import{useEffect,useState}from"react";
const B=process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/,"")||"";
export type TradeScope="arsenal"|"all";

export function useTradeCenter(scope:TradeScope="arsenal"){
  const[s,setS]=useState<any>(null),[h,setH]=useState<any[]>([]),[g,setG]=useState<any[]>([]),[c,setC]=useState<any[]>([]),[e,setE]=useState("");
  useEffect(()=>{
    let x=false;
    setS(null);setH([]);setG([]);setC([]);
    async function load(){
      try{
        const q=encodeURIComponent(scope);
        const paths=[
          `summary?scope=${q}`,
          `history?limit=500&scope=${q}`,
          `signal-history?limit=500&scope=${q}`,
          `equity-curve?limit=500&scope=${q}`,
        ];
        const r=await Promise.all(paths.map(p=>fetch(`${B}/api/v1/paper-trading/${p}`,{cache:"no-store"})));
        if(r.some(v=>!v.ok))throw Error("backend");
        const j=await Promise.all(r.map(v=>v.json()));
        if(!x){setS(j[0]);setH(j[1].rows||[]);setG(j[2].rows||[]);setC(j[3].points||[]);setE("")}
      }catch(z){if(!x)setE(String(z))}
    }
    load();
    const t=setInterval(load,1e4);
    return()=>{x=true;clearInterval(t)}
  },[scope]);
  return{s,h,g,c,e}
}
