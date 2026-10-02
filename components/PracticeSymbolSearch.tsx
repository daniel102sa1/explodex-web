"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const API=process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/,"")||
  "https://explodex-backend-production.up.railway.app";
const CACHE_KEY="explodex:practice:symbols:v1";
const QUICK=["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT","LINKUSDT","ADAUSDT"];
const COIN_NAMES:Record<string,string>={
  BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", XRP:"XRP", BNB:"BNB",
  DOGE:"Dogecoin", ADA:"Cardano", LINK:"Chainlink", AVAX:"Avalanche",
  DOT:"Polkadot", LTC:"Litecoin", BCH:"Bitcoin Cash", TRX:"TRON",
  NEAR:"NEAR Protocol", SUI:"Sui", TON:"Toncoin", ICP:"Internet Computer",
  APT:"Aptos", ARB:"Arbitrum", OP:"Optimism", ATOM:"Cosmos", FIL:"Filecoin",
  PEPE:"Pepe", WIF:"dogwifhat", SHIB:"Shiba Inu", PENGU:"Pudgy Penguins",
  DYDX:"dYdX", ONDO:"Ondo", HBAR:"Hedera", XLM:"Stellar", ETC:"Ethereum Classic",
  AAVE:"Aave", FET:"Fetch.ai", ENA:"Ethena", RENDER:"Render", UNI:"Uniswap",
  INJ:"Injective", SEI:"Sei", JUP:"Jupiter", PENDLE:"Pendle", ZEC:"Zcash",
};
function safe(value:string){return value.toUpperCase().replace(/[^A-Z0-9]/g,"");}
function validateSymbols(value:unknown){
  if(!Array.isArray(value))return [];
  return [...new Set(value.filter((v):v is string=>typeof v==="string"&&/^[A-Z0-9]+USDT$/.test(v)))].sort();
}

export default function PracticeSymbolSearch({
  value, selected, onInput, onSelect
}:{
  value:string;selected:string;onInput:(value:string)=>void;onSelect:(symbol:string)=>void;
}){
  const root=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false);
  const [catalog,setCatalog]=useState<string[]>([]);
  const [source,setSource]=useState("");
  const [loading,setLoading]=useState(true);
  const [active,setActive]=useState(0);
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    let cached:{at:number;symbols:string[];source:string}|null=null;
    try {
      cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
      if(cached&&Array.isArray(cached.symbols)&&cached.symbols.length){
        setCatalog(validateSymbols(cached.symbols));setSource(cached.source||"CACHE");
        setLoading(false);
      }
    }catch{}
    if(cached?.at&&Date.now()-cached.at<900_000)return;
    const controller=new AbortController();
    fetch(API+"/api/v1/practice/symbols",{signal:controller.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error("Catálogo HTTP "+r.status);return r.json();})
      .then(data=>{
        if(cancelled)return;
        const symbols=validateSymbols(data.symbols);
        if(!symbols.length)throw Error("La fuente no devolvió pares activos.");
        setCatalog(symbols);setSource(String(data.source||"MARKET"));setError("");
        try{localStorage.setItem(CACHE_KEY,JSON.stringify({at:Date.now(),symbols,source:data.source}));}catch{}
      })
      .catch(e=>{if(!cancelled&&e?.name!=="AbortError"&&!cached?.symbols?.length)
        setError("Catálogo temporalmente no disponible. Mostrando monedas frecuentes.");})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;controller.abort();};
  },[]);
  useEffect(()=>{
    const close=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[]);
  const options=useMemo(()=>{
    const list=catalog.length?catalog:QUICK;
    const q=safe(value);
    if(!q||q===safe(selected)) {
      const popular=QUICK.filter(s=>list.includes(s));
      return [...new Set([...popular,...list])].slice(0,40);
    }
    return list.filter(s=>s.includes(q)||COIN_NAMES[s.slice(0,-4)]?.toUpperCase().includes(q))
      .sort((a,b)=>{
        const sa=a.startsWith(q)?0:a.includes(q)?1:2;
        const sb=b.startsWith(q)?0:b.includes(q)?1:2;
        return sa-sb||a.localeCompare(b);
      }).slice(0,40);
  },[catalog,value,selected]);
  function pick(pair:string){
    setError("");setOpen(false);setActive(0);onInput(pair);onSelect(pair);
    input.current?.blur();
  }
  function submit(){
    const q=safe(value);
    const all=catalog.length?catalog:QUICK;
    const exact=all.find(s=>s===q||s===q+"USDT");
    const first=options[active]||options[0];
    if(exact)pick(exact);
    else if(first)pick(first);
    else setError("No se encontró esa moneda entre los futuros USDT disponibles.");
  }
  return <div ref={root} className="relative min-w-[220px] flex-1 lg:max-w-[365px]">
    <form className="flex items-stretch gap-1.5" onSubmit={e=>{e.preventDefault();submit();}}>
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700/70 bg-[#030812] px-3">
        <Search size={14} className="shrink-0 text-slate-500"/>
        <input ref={input} role="combobox" aria-label="Buscar criptomonedas" aria-autocomplete="list"
          aria-expanded={open} aria-controls="explodex-symbol-options"
          value={value} onFocus={()=>{setOpen(true);setActive(0);}}
          onChange={e=>{onInput(e.target.value);setActive(0);setOpen(true);setError("");}}
          onKeyDown={e=>{
            if(e.key==="ArrowDown"){e.preventDefault();setOpen(true);setActive(n=>Math.min(n+1,options.length-1));}
            if(e.key==="ArrowUp"){e.preventDefault();setActive(n=>Math.max(0,n-1));}
            if(e.key==="Escape"){setOpen(false);input.current?.blur();}
          }}
          className="w-full min-w-0 bg-transparent py-2 text-xs font-black uppercase text-white outline-none"
          placeholder="Buscar BTC, SOL, XRP…" autoComplete="off"/>
        <button type="button" aria-label={open?"Cerrar lista de monedas":"Abrir lista de monedas"}
          onClick={()=>{setOpen(x=>!x);input.current?.focus();}} className="text-slate-500 hover:text-cyan-200"><ChevronDown size={14}/></button>
      </div>
      <button type="submit" className="rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-black text-slate-950 hover:bg-cyan-300">IR</button>
    </form>
    {open&&<div id="explodex-symbol-options" role="listbox"
      className="absolute left-0 top-[calc(100%+6px)] z-[80] max-h-[335px] w-[min(90vw,370px)] overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1522] p-1 shadow-2xl shadow-black/70">
      <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-[#0b1522] px-2 py-2 text-[9px] text-slate-500">
        <span>{loading?"Cargando monedas…":catalog.length?catalog.length+" futuros USDT":"Monedas frecuentes"}</span>
        <span>{source==="OKX_FALLBACK"?"OKX":source==="BINANCE_FUTURES"?"Binance":source||"Demo"}</span>
      </div>
      {options.length?options.map((s,i)=>{
        const base=s.slice(0,-4);
        return <button type="button" key={s} role="option" aria-selected={s===selected}
          onMouseEnter={()=>setActive(i)} onClick={()=>pick(s)}
          className={"flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs "+
            (i===active?"bg-cyan-400/10 text-white":"text-slate-300 hover:bg-slate-800/70")}>
          <span><b className="text-sm">{base}</b><span className="ml-2 text-[10px] text-slate-500">{COIN_NAMES[base]||"Criptomoneda"}</span></span>
          <span className="text-[10px] text-slate-600">/ USDT</span>
        </button>;
      }):<div className="px-3 py-4 text-xs text-amber-200">Sin coincidencias. Prueba otro símbolo.</div>}
      {error&&<p className="px-3 py-2 text-[10px] text-amber-300">{error}</p>}
    </div>}
  </div>;
}
