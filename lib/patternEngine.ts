export type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export type CandleBar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OverlayGuide = {
  kind: "segment" | "horizontal";
  label: string;
  points: Array<{ timestamp: number; value: number }>;
  value?: number;
};

export type PatternScenario = {
  name: string;
  status: "FORMING" | "CONFIRMED_LONG" | "CONFIRMED_SHORT";
  confidence: number;
  direction: "LONG" | "SHORT" | "WAIT";
  breakoutLong: number | null;
  breakoutShort: number | null;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  invalidation: number | null;
  rationale: string[];
  overlays: OverlayGuide[];
};

export type TechnicalRead = {
  interval: Interval;
  price: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macdHist: number;
  volumeRatio: number;
  atr14: number;
  support: number;
  resistance: number;
  trendScore: number;
  pattern: PatternScenario | null;
  indicatorNotes: string[];
};

type Pivot = { index:number; timestamp:number; price:number };

function avg(values:number[]) {
  return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
}

function ema(values:number[], period:number) {
  if(!values.length) return [];
  const alpha=2/(period+1);
  const out:number[]=[];
  let v=values[0];
  out.push(v);
  for(let i=1;i<values.length;i++){v=values[i]*alpha+v*(1-alpha);out.push(v);}
  return out;
}

function rsi(values:number[], period=14) {
  if(values.length<=period) return 50;
  let gains=0,losses=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d;}
  let ag=gains/period, al=losses/period, result=al===0?100:100-100/(1+ag/al);
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1];
    ag=(ag*(period-1)+Math.max(d,0))/period;
    al=(al*(period-1)+Math.max(-d,0))/period;
    result=al===0?100:100-100/(1+ag/al);
  }
  return result;
}

function atr(rows:CandleBar[], period=14) {
  if(rows.length<2) return 0;
  const tr=rows.map((r,i)=>i===0?r.high-r.low:Math.max(r.high-r.low,Math.abs(r.high-rows[i-1].close),Math.abs(r.low-rows[i-1].close)));
  return avg(tr.slice(-Math.min(period,tr.length)));
}

function pivots(rows:CandleBar[], wing=5) {
  const highs:Pivot[]=[];
  const lows:Pivot[]=[];
  for(let i=wing;i<rows.length-wing;i++){
    let isHigh=true,isLow=true;
    for(let j=i-wing;j<=i+wing;j++){
      if(j===i) continue;
      if(rows[j].high>=rows[i].high) isHigh=false;
      if(rows[j].low<=rows[i].low) isLow=false;
      if(!isHigh&&!isLow) break;
    }
    if(isHigh) highs.push({index:i,timestamp:rows[i].timestamp,price:rows[i].high});
    if(isLow) lows.push({index:i,timestamp:rows[i].timestamp,price:rows[i].low});
  }
  return {highs,lows};
}

function regression(points:Pivot[]) {
  const n=points.length;
  if(n<2) return {slope:0,intercept:points[0]?.price||0,r2:0};
  const sx=points.reduce((a,p)=>a+p.index,0);
  const sy=points.reduce((a,p)=>a+p.price,0);
  const sxy=points.reduce((a,p)=>a+p.index*p.price,0);
  const sxx=points.reduce((a,p)=>a+p.index*p.index,0);
  const den=n*sxx-sx*sx;
  const slope=den===0?0:(n*sxy-sx*sy)/den;
  const intercept=(sy-slope*sx)/n;
  const mean=sy/n;
  const ssTot=points.reduce((a,p)=>a+(p.price-mean)**2,0);
  const ssRes=points.reduce((a,p)=>a+(p.price-(intercept+slope*p.index))**2,0);
  const r2=ssTot===0?1:Math.max(0,1-ssRes/ssTot);
  return {slope,intercept,r2};
}

function valueAt(line:{slope:number;intercept:number}, index:number) {
  return line.intercept+line.slope*index;
}

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}

function makeTriangle(rows:CandleBar[], highs:Pivot[], lows:Pivot[]):PatternScenario|null {
  const price=rows.at(-1)?.close||0;
  const recentHighs=highs.filter(p=>p.index>=Math.max(0,rows.length-180)).slice(-4);
  const recentLows=lows.filter(p=>p.index>=Math.max(0,rows.length-180)).slice(-4);
  if(recentHighs.length<2||recentLows.length<2||price<=0) return null;

  const hi=regression(recentHighs);
  const lo=regression(recentLows);
  const hiNorm=hi.slope/price;
  const loNorm=lo.slope/price;
  const flat=.00022;
  const directional=.00008;

  let name="";
  if(Math.abs(hiNorm)<=flat&&loNorm>directional) name="Triángulo ascendente";
  else if(Math.abs(loNorm)<=flat&&hiNorm<-directional) name="Triángulo descendente";
  else if(hiNorm<-directional&&loNorm>directional) name="Triángulo simétrico";
  else return null;

  const left=Math.max(Math.min(recentHighs[0].index,recentLows[0].index),rows.length-180);
  const right=rows.length-1;
  const topLeft=valueAt(hi,left),botLeft=valueAt(lo,left);
  const topNow=valueAt(hi,right),botNow=valueAt(lo,right);
  const gapLeft=topLeft-botLeft,gapNow=topNow-botNow;
  if(!(gapLeft>0&&gapNow>0&&gapNow<gapLeft*.9)) return null;

  const touches=Math.min(4,recentHighs.length)+Math.min(4,recentLows.length);
  const confidence=clamp(Math.round(
    45 + Math.min(20,(touches-4)*5) + Math.min(15,(hi.r2+lo.r2)*7.5) + Math.min(20,(1-gapNow/gapLeft)*40)
  ),45,92);

  const atrNow=atr(rows);
  const buffer=Math.max(atrNow*.12,price*.0007);
  const close=price;
  const confirmedLong=close>topNow+buffer;
  const confirmedShort=close<botNow-buffer;

  const baseHeight=Math.max(
    Math.max(...rows.slice(left,Math.min(rows.length,left+Math.max(20,Math.floor((right-left)*.35)))).map(r=>r.high))-
    Math.min(...rows.slice(left,Math.min(rows.length,left+Math.max(20,Math.floor((right-left)*.35)))).map(r=>r.low)),
    gapLeft
  );

  let status:PatternScenario["status"]="FORMING";
  let direction:PatternScenario["direction"]="WAIT";
  let entry:number|null=null,stop:number|null=null,tp1:number|null=null,tp2:number|null=null,tp3:number|null=null,invalidation:number|null=null;
  const rationale:string[]=[
    `${recentHighs.length} pivotes altos y ${recentLows.length} pivotes bajos 5/5`,
    `Compresión: rango reducido ${Math.round((1-gapNow/gapLeft)*100)}%`,
  ];

  if(confirmedLong){
    status="CONFIRMED_LONG";direction="LONG";entry=close;
    stop=Math.min(botNow, recentLows.at(-1)?.price||botNow)-buffer;
    invalidation=stop;
    tp1=entry+baseHeight*.5;tp2=entry+baseHeight;tp3=entry+baseHeight*1.272;
    rationale.push("Cierre por encima de la directriz superior");
  } else if(confirmedShort){
    status="CONFIRMED_SHORT";direction="SHORT";entry=close;
    stop=Math.max(topNow, recentHighs.at(-1)?.price||topNow)+buffer;
    invalidation=stop;
    tp1=entry-baseHeight*.5;tp2=entry-baseHeight;tp3=entry-baseHeight*1.272;
    rationale.push("Cierre por debajo de la directriz inferior");
  } else {
    rationale.push("Aún no hay ruptura confirmada; el patrón sigue en formación");
  }

  const highA=recentHighs[0],highB=recentHighs.at(-1)!;
  const lowA=recentLows[0],lowB=recentLows.at(-1)!;
  const overlays:OverlayGuide[]=[
    {kind:"segment",label:"Directriz superior",points:[{timestamp:highA.timestamp,value:highA.price},{timestamp:highB.timestamp,value:highB.price}]},
    {kind:"segment",label:"Directriz inferior",points:[{timestamp:lowA.timestamp,value:lowA.price},{timestamp:lowB.timestamp,value:lowB.price}]},
  ];
  if(entry&&stop&&tp2){
    overlays.push(
      {kind:"horizontal",label:"Entrada",points:[{timestamp:rows[right].timestamp,value:entry}],value:entry},
      {kind:"horizontal",label:"SL",points:[{timestamp:rows[right].timestamp,value:stop}],value:stop},
      {kind:"horizontal",label:"TP medido",points:[{timestamp:rows[right].timestamp,value:tp2}],value:tp2},
    );
  }

  return {
    name,status,confidence,direction,
    breakoutLong:topNow+buffer,breakoutShort:botNow-buffer,
    entry,stop,tp1,tp2,tp3,invalidation,rationale,overlays
  };
}

function makeDouble(rows:CandleBar[], highs:Pivot[], lows:Pivot[]):PatternScenario|null {
  const price=rows.at(-1)?.close||0;
  const aH=highs.slice(-2),aL=lows.slice(-2);
  const atrNow=atr(rows),tol=Math.max(price*.006,atrNow*.35);
  const latestTs=rows.at(-1)?.timestamp||0;

  if(aH.length===2&&aH[1].index-aH[0].index>=8&&Math.abs(aH[0].price-aH[1].price)<=tol){
    const between=lows.filter(p=>p.index>aH[0].index&&p.index<aH[1].index);
    if(between.length){
      const neck=Math.min(...between.map(p=>p.price));
      const height=avg(aH.map(p=>p.price))-neck;
      const confirmed=price<neck-Math.max(atrNow*.1,price*.0006);
      return {
        name:"Doble techo",status:confirmed?"CONFIRMED_SHORT":"FORMING",confidence:clamp(Math.round(70-Math.abs(aH[0].price-aH[1].price)/tol*20),50,88),
        direction:confirmed?"SHORT":"WAIT",breakoutLong:null,breakoutShort:neck,
        entry:confirmed?price:null,stop:confirmed?Math.max(...aH.map(p=>p.price))+atrNow*.12:null,
        tp1:confirmed?price-height*.5:null,tp2:confirmed?neck-height:null,tp3:confirmed?neck-height*1.272:null,
        invalidation:Math.max(...aH.map(p=>p.price))+atrNow*.12,
        rationale:[confirmed?"Neckline rota":"Neckline aún intacta","Dos máximos equivalentes separados por swing"],
        overlays:[
          {kind:"segment",label:"Doble techo",points:aH.map(p=>({timestamp:p.timestamp,value:p.price}))},
          {kind:"horizontal",label:"Neckline",points:[{timestamp:latestTs,value:neck}],value:neck}
        ]
      };
    }
  }
  if(aL.length===2&&aL[1].index-aL[0].index>=8&&Math.abs(aL[0].price-aL[1].price)<=tol){
    const between=highs.filter(p=>p.index>aL[0].index&&p.index<aL[1].index);
    if(between.length){
      const neck=Math.max(...between.map(p=>p.price));
      const height=neck-avg(aL.map(p=>p.price));
      const confirmed=price>neck+Math.max(atrNow*.1,price*.0006);
      return {
        name:"Doble suelo",status:confirmed?"CONFIRMED_LONG":"FORMING",confidence:clamp(Math.round(70-Math.abs(aL[0].price-aL[1].price)/tol*20),50,88),
        direction:confirmed?"LONG":"WAIT",breakoutLong:neck,breakoutShort:null,
        entry:confirmed?price:null,stop:confirmed?Math.min(...aL.map(p=>p.price))-atrNow*.12:null,
        tp1:confirmed?price+height*.5:null,tp2:confirmed?neck+height:null,tp3:confirmed?neck+height*1.272:null,
        invalidation:Math.min(...aL.map(p=>p.price))-atrNow*.12,
        rationale:[confirmed?"Neckline rota":"Neckline aún intacta","Dos mínimos equivalentes separados por swing"],
        overlays:[
          {kind:"segment",label:"Doble suelo",points:aL.map(p=>({timestamp:p.timestamp,value:p.price}))},
          {kind:"horizontal",label:"Neckline",points:[{timestamp:latestTs,value:neck}],value:neck}
        ]
      };
    }
  }
  return null;
}

function makeHeadShoulders(rows:CandleBar[], highs:Pivot[], lows:Pivot[]):PatternScenario|null {
  const price=rows.at(-1)?.close||0;
  const hs=highs.slice(-3);
  const ls=lows.slice(-3);
  const atrNow=atr(rows);
  if(hs.length===3){
    const shouldersClose=Math.abs(hs[0].price-hs[2].price)<=Math.max(price*.01,atrNow*.6);
    if(shouldersClose&&hs[1].price>hs[0].price+atrNow*.35&&hs[1].price>hs[2].price+atrNow*.35){
      const neckLows=lows.filter(p=>p.index>hs[0].index&&p.index<hs[2].index);
      if(neckLows.length>=2){
        const neck=avg(neckLows.slice(-2).map(p=>p.price));
        const height=hs[1].price-neck;
        const confirmed=price<neck-Math.max(atrNow*.1,price*.0006);
        return {
          name:"Hombro-Cabeza-Hombro",status:confirmed?"CONFIRMED_SHORT":"FORMING",confidence:confirmed?86:74,
          direction:confirmed?"SHORT":"WAIT",breakoutLong:null,breakoutShort:neck,
          entry:confirmed?price:null,stop:confirmed?hs[2].price+atrNow*.15:null,
          tp1:confirmed?price-height*.5:null,tp2:confirmed?neck-height:null,tp3:confirmed?neck-height*1.272:null,
          invalidation:hs[1].price+atrNow*.15,
          rationale:[confirmed?"Neckline rota":"Neckline aún intacta","Cabeza superior a ambos hombros"],
          overlays:[
            {kind:"segment",label:"HCH",points:hs.map(p=>({timestamp:p.timestamp,value:p.price}))},
            {kind:"segment",label:"Neckline",points:neckLows.slice(-2).map(p=>({timestamp:p.timestamp,value:p.price}))}
          ]
        };
      }
    }
  }
  if(ls.length===3){
    const shouldersClose=Math.abs(ls[0].price-ls[2].price)<=Math.max(price*.01,atrNow*.6);
    if(shouldersClose&&ls[1].price<ls[0].price-atrNow*.35&&ls[1].price<ls[2].price-atrNow*.35){
      const neckHighs=highs.filter(p=>p.index>ls[0].index&&p.index<ls[2].index);
      if(neckHighs.length>=2){
        const neck=avg(neckHighs.slice(-2).map(p=>p.price));
        const height=neck-ls[1].price;
        const confirmed=price>neck+Math.max(atrNow*.1,price*.0006);
        return {
          name:"HCH invertido",status:confirmed?"CONFIRMED_LONG":"FORMING",confidence:confirmed?86:74,
          direction:confirmed?"LONG":"WAIT",breakoutLong:neck,breakoutShort:null,
          entry:confirmed?price:null,stop:confirmed?ls[2].price-atrNow*.15:null,
          tp1:confirmed?price+height*.5:null,tp2:confirmed?neck+height:null,tp3:confirmed?neck+height*1.272:null,
          invalidation:ls[1].price-atrNow*.15,
          rationale:[confirmed?"Neckline rota":"Neckline aún intacta","Cabeza inferior a ambos hombros"],
          overlays:[
            {kind:"segment",label:"HCH invertido",points:ls.map(p=>({timestamp:p.timestamp,value:p.price}))},
            {kind:"segment",label:"Neckline",points:neckHighs.slice(-2).map(p=>({timestamp:p.timestamp,value:p.price}))}
          ]
        };
      }
    }
  }
  return null;
}

export function analyzeTechnical(rows:CandleBar[], interval:Interval):TechnicalRead|null {
  const data=rows.slice(-600);
  if(data.length<60) return null;
  const closes=data.map(r=>r.close),volumes=data.map(r=>r.volume),price=data.at(-1)!.close;
  const e20=ema(closes,20).at(-1)||price,e50=ema(closes,50).at(-1)||price,e200=ema(closes,200).at(-1)||price;
  const r=rsi(closes),e12=ema(closes,12),e26=ema(closes,26),macd=e12.map((v,i)=>v-(e26[i]??v)),signal=ema(macd,9),hist=(macd.at(-1)||0)-(signal.at(-1)||0);
  const avgVol=avg(volumes.slice(-21,-1)),volumeRatio=avgVol>0?volumes.at(-1)!/avgVol:1;
  const atr14=atr(data);
  const prior=data.slice(-41,-1);
  const support=Math.min(...prior.map(r=>r.low)),resistance=Math.max(...prior.map(r=>r.high));
  const {highs,lows}=pivots(data,5);

  const candidates=[
    makeTriangle(data,highs,lows),
    makeHeadShoulders(data,highs,lows),
    makeDouble(data,highs,lows),
  ].filter((x):x is PatternScenario=>Boolean(x)).sort((a,b)=>b.confidence-a.confidence);
  const pattern=candidates[0]||null;

  let trendScore=0;
  trendScore += price>e20?1:-1;
  trendScore += e20>e50?1:-1;
  trendScore += e50>e200?1:-1;
  trendScore += r>=55?1:r<=45?-1:0;
  trendScore += hist>0?1:hist<0?-1:0;
  trendScore += volumeRatio>=1.2?(data.at(-1)!.close>=data.at(-1)!.open?1:-1):0;

  const notes:string[]=[];
  notes.push(`EMA: ${price>e20&&e20>e50?"precio y medias cortas ordenadas al alza":price<e20&&e20<e50?"precio y medias cortas ordenadas a la baja":"medias mezcladas / transición"}.`);
  notes.push(`RSI 14 = ${r.toFixed(1)}: ${r>60?"momentum alcista":r<40?"momentum bajista":"zona neutral"}.`);
  notes.push(`MACD histograma = ${hist.toFixed(6)}: ${hist>0?"momentum positivo":"momentum negativo"}.`);
  notes.push(`Volumen = ${volumeRatio.toFixed(2)}x su media de 20 velas: ${volumeRatio>=1.2?"hay expansión relativa":"sin expansión clara"}.`);

  return {interval,price,ema20:e20,ema50:e50,ema200:e200,rsi:r,macdHist:hist,volumeRatio,atr14,support,resistance,trendScore,pattern,indicatorNotes:notes};
}

export const INDICATOR_HELP:Record<string,string>={
  EMA:"EMA20/50/200 ayuda a ver dirección y estructura de tendencia. No es una señal por sí sola.",
  RSI:"RSI mide momentum de 0 a 100. Sobre 50 favorece momentum alcista; bajo 50, bajista. 70/30 no significa vender/comprar automáticamente.",
  MACD:"MACD compara medias exponenciales para ver cambio de momentum. El histograma positivo/negativo indica qué lado tiene más impulso relativo.",
  VOLUME:"Volumen sirve para validar interés. Una ruptura con volumen superior a su media suele ser más convincente que una ruptura sin participación.",
  ATR:"ATR mide volatilidad, no dirección. Sirve para dimensionar buffers, stops e invalidaciones.",
  BOLL:"Bandas de Bollinger muestran volatilidad alrededor de una media. Contracción puede preceder expansión, pero no define dirección por sí sola.",
};
