import { analyzeTechnical, type CandleBar, type TechnicalRead } from "@/lib/patternEngine";

export type OpportunityStatus =
  "EN_ZONA" | "ESPERAR_CONFIRMACION" | "ESPERAR_RETEST" |
  "PRECIO_EXTENDIDO" | "INVALIDADA" | "DATOS_DESACTUALIZADOS";

export type PracticeOpportunity = {
  symbol:string;side:"LONG"|"SHORT";timeframe:"15m";status:OpportunityStatus;
  entryLow:number;entryHigh:number;entry:number;stop:number;takeProfit:number;
  trigger:number;currentPrice:number;netRiskReward:number;estimatedRoiPct:number;
  pattern:string;condition:string;reason:string;closedAt:number;measured:boolean;
  checks:string[];
};
const TIMEFRAME_MS=15*60*1000;
const FEE=.0005;
const SLIPPAGE=.0002;
const LEVERAGE=5;

// All conditions use completed candles. The last (potentially live) candle
// supplies only the current displayed price. Never use it to confirm a break.
export function findPracticeOpportunity(
  symbol:string,bars:CandleBar[],now=Date.now()
):PracticeOpportunity|null {
  const sorted=bars.filter(r=>r.timestamp>0&&r.open>0&&r.close>0&&r.high>=r.low)
    .slice().sort((a,b)=>a.timestamp-b.timestamp);
  if(sorted.length<65)return null;
  const completed=sorted.slice(0,-1);
  const last=completed.at(-1);
  if(!last)return null;
  const read=analyzeTechnical(completed,"15m");
  if(!read || !(read.price>0&&read.atr14>0))return null;
  const currentPrice=sorted.at(-1)!.close;
  const atr=read.atr14;
  const pattern=read.pattern;
  let side:"LONG"|"SHORT", entry:number, stop:number, tp:number, trigger:number;
  let name:string,measured=false,confirmation=false;
  const checks:string[]=[
    "EMA20/50: "+(read.ema20>read.ema50?"estructura alcista":"estructura bajista o mixta"),
    "Volumen de la última vela cerrada: "+read.volumeRatio.toFixed(2)+"× la media previa",
    "RSI: "+read.rsi.toFixed(1),
  ];

  if(pattern && (pattern.direction==="LONG"||pattern.direction==="SHORT") &&
    pattern.entry && pattern.stop && (pattern.tp2||pattern.tp1)){
    side=pattern.direction;
    entry=pattern.entry;
    stop=pattern.stop;
    // TP2 is the measured target in the existing geometry engine.
    tp=pattern.tp2 || pattern.tp1!;
    trigger=side==="LONG"?(pattern.breakoutLong||entry):(pattern.breakoutShort||entry);
    name=pattern.name;
    measured=Boolean(pattern.tp2);
    confirmation=side==="LONG"
      ? last.close>trigger&&read.trendScore>=2
      : last.close<trigger&&read.trendScore<=-2;
    checks.push(pattern.name+" · ruptura "+(confirmation?"confirmada en vela cerrada":"sin confirmar"));
  }else{
    // Without a confirmed geometric pattern, propose a *conditional* breakout
    // from prior 40-candle resistance/support only in a directional trend.
    if(read.trendScore>=4 && read.ema20>read.ema50 && read.macdHist>0 &&
      read.rsi>=50 && read.rsi<78){
      side="LONG";
      trigger=read.resistance+Math.max(.10*atr,.0004*read.price);
      entry=trigger+.05*atr;
      stop=trigger-.95*atr;
      tp=entry+Math.abs(entry-stop)*2;
      name="Ruptura de resistencia";
      confirmation=last.close>trigger && read.volumeRatio>=1.15;
    }else if(read.trendScore<=-4 && read.ema20<read.ema50 && read.macdHist<0 &&
      read.rsi<=50 && read.rsi>22){
      side="SHORT";
      trigger=read.support-Math.max(.10*atr,.0004*read.price);
      entry=trigger-.05*atr;
      stop=trigger+.95*atr;
      tp=entry-Math.abs(entry-stop)*2;
      name="Ruptura de soporte";
      confirmation=last.close<trigger && read.volumeRatio>=1.15;
    }else return null;
    checks.push("Cierre "+(confirmation?"confirmado":"pendiente")+" al "+(side==="LONG"?"superar resistencia":"perder soporte"));
    checks.push("Se exige volumen relativo ≥1,15× para activar la zona.");
  }
  const long=side==="LONG";
  if(!(entry>0&&stop>0&&tp>0&&trigger>0&&currentPrice>0))return null;
  if(long ? !(stop<entry&&tp>entry) : !(stop>entry&&tp<entry))return null;
  const feeRisk=(entry+stop)*FEE+entry*SLIPPAGE*2;
  const feeReward=(entry+tp)*FEE+entry*SLIPPAGE*2;
  const risk=Math.abs(entry-stop)+feeRisk;
  const reward=Math.abs(tp-entry)-feeReward;
  if(!(risk>0&&reward>0&&reward/risk>=1.25))return null;

  // Entry zone is intentionally narrow; never chase candles far from entry.
  const halfWidth=Math.max(.13*atr,.0004*entry);
  const entryLow=Math.max(.00000001,entry-halfWidth);
  const entryHigh=entry+halfWidth;
  const invalid=long?currentPrice<=stop:currentPrice>=stop;
  const extended=long?currentPrice>entryHigh+.55*atr:currentPrice<entryLow-.55*atr;
  const within=currentPrice>=entryLow&&currentPrice<=entryHigh;
  const crossed=long?currentPrice>=trigger:currentPrice<=trigger;
  let status:OpportunityStatus="ESPERAR_CONFIRMACION";
  let condition="Falta una vela de 15m cerrada fuera del nivel y, en las rupturas sin figura, volumen relativo ≥1,15×.";
  if(now-last.timestamp>TIMEFRAME_MS*3){
    status="DATOS_DESACTUALIZADOS";
    condition="Los datos están desactualizados; solicita una nueva revisión.";
  }else if(invalid){
    status="INVALIDADA";
    condition="El precio cruzó el nivel de invalidación/SL; descarta este escenario.";
  }else if(extended){
    status="PRECIO_EXTENDIDO";
    condition="El precio ya se alejó de la zona; no perseguir el movimiento.";
  }else if(confirmation&&within&&crossed){
    status="EN_ZONA";
    condition="Hay cierre confirmado y precio en zona. Revisa el retesteo, spread y liquidez antes de decidir.";
  }else if(confirmation){
    status="ESPERAR_RETEST";
    condition="Hay cierre confirmado, pero el precio no está dentro de la zona. Espera un retesteo sin perder la invalidación.";
  }
  return {
    symbol,side,timeframe:"15m",status,entryLow,entryHigh,entry,stop,takeProfit:tp,
    trigger,currentPrice,netRiskReward:reward/risk,
    estimatedRoiPct:(reward/entry)*LEVERAGE*100,
    pattern:name,condition,reason:
      (measured?"Objetivo geométrico medido. ":"Objetivo condicional 2R antes de costes. ")+
      "Costes estimados: 0,05 % de comisión y 0,02 % de deslizamiento por lado. "+
      "No incluye funding ni garantiza ejecución.",
    closedAt:last.timestamp,measured,checks,
  };
}

export function opportunityCanLoad(s:PracticeOpportunity):boolean{
  return s.status==="EN_ZONA";
}
