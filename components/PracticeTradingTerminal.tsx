"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeTechnical, INDICATOR_HELP, type TechnicalRead, type CandleBar } from "@/lib/patternEngine";
import PracticeStatsLab from "@/components/PracticeStatsLab";
import PracticeReplayLab from "@/components/PracticeReplayLab";
import {
  Activity,
  BarChart3,
  Brush,
  ChevronDown,
  CircleDollarSign,
  Eraser,
  Gauge,
  HelpCircle,
  Magnet,
  MousePointer2,
  Sparkles,
  Layers3,
  LineChart,
  Minus,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Target,
  TrendingDown,
  TrendingUp,
  Triangle,
  X,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "https://explodex-backend-production.up.railway.app";

type Side = "LONG" | "SHORT";
type Interval = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

type PracticePosition = {
  id: number;
  symbol: string;
  side: Side;
  leverage: number;
  entry_price: number;
  mark_price: number;
  stop_loss: number;
  take_profit: number;
  tp2?: number | null;
  tp3?: number | null;
  margin_used: number;
  quantity: number;
  initial_quantity?: number;
  notional: number;
  risk_usdt: number;
  initial_risk_usdt?: number;
  liquidation_price?: number | null;
  liquidation_distance_pct?: number | null;
  partial_realized_pnl?: number;
  tp1_hit?: boolean;
  tp2_hit?: boolean;
  tp3_hit?: boolean;
  moved_to_be?: boolean;
  unrealized_pnl: number;
  roi_on_margin_pct: number;
  timeframe?: string | null;
  pattern?: string | null;
  opened_at?: string | null;
};

type PracticeOrder = {
  id: number;
  symbol: string;
  side: Side;
  order_type: "LIMIT";
  status: "PENDING";
  limit_price: number;
  stop_loss: number;
  take_profit: number;
  tp2?: number | null;
  tp3?: number | null;
  leverage: number;
  margin_used: number;
  timeframe?: string | null;
  pattern?: string | null;
  created_at?: string | null;
};

type PracticeSummary = {
  starting_balance: number;
  cash_balance: number;
  reserved_margin: number;
  pending_margin?: number;
  available_margin: number;
  unrealized_pnl: number;
  equity: number;
  realized_pnl: number;
  total_costs: number;
  open_positions: PracticePosition[];
  pending_orders?: PracticeOrder[];
  closed_trades: number;
  winners: number;
  losers: number;
  win_rate_pct?: number | null;
  performance?: {
    expectancy_usdt?: number;
    profit_factor?: number | null;
    average_r?: number | null;
    max_drawdown_pct?: number;
  };
};

type OrderForm = {
  side: Side;
  orderType: "MARKET" | "LIMIT";
  limitPrice: string;
  margin: string;
  leverage: string;
  stop: string;
  tp1: string;
  tp2: string;
  tp3: string;
  pattern: string;
  note: string;
};

const INTERVALS: Interval[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
const QUICK_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DYDXUSDT", "LINKUSDT", "ADAUSDT"];
const INDICATORS = ["EMA20/50/200", "VWAP", "RSI", "MACD", "ATR", "VOL", "BOLL", "SAR", "OBV", "KDJ", "CCI", "DMI"] as const;
type IndicatorName = typeof INDICATORS[number];

const PATTERNS = [
  "PULLBACK",
  "BREAKOUT_RETEST",
  "TRIANGULO_SIMETRICO",
  "TRIANGULO_ASCENDENTE",
  "TRIANGULO_DESCENDENTE",
  "HCH",
  "HCH_INVERTIDO",
  "DOBLE_TECHO",
  "DOBLE_SUELO",
  "BANDERA",
  "CUNA",
  "ABCD",
  "XABCD_ARMONICO",
  "CYPHER",
  "THREE_DRIVES",
  "ELLIOTT",
  "BARRIDO_LIQUIDEZ",
  "OTRO",
];

function fmt(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 8 });
}

function money(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "$0.00";
  return `${Number(value) >= 0 ? "" : "-"}$${Math.abs(Number(value)).toFixed(2)}`;
}

function normalizeSymbol(value: string) {
  let next = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!next) return "BTCUSDT";
  if (!next.endsWith("USDT")) next += "USDT";
  return next;
}

function sessionId() {
  if (typeof window === "undefined") return "";
  const key = "explodex:practice-session";
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `practice-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, value);
  return value;
}

function intervalFromPeriod(period: any): Interval {
  const span = Number(period?.span || 1);
  const type = String(period?.type || "minute");
  if (type === "day") return "1d";
  if (type === "hour") return span >= 4 ? "4h" : "1h";
  if (span >= 30) return "30m";
  if (span >= 15) return "15m";
  if (span >= 5) return "5m";
  if (span >= 3) return "3m";
  return "1m";
}

function periodFromInterval(interval: Interval) {
  if (interval.endsWith("d")) return { type: "day" as const, span: Number(interval.slice(0, -1)) };
  if (interval.endsWith("h")) return { type: "hour" as const, span: Number(interval.slice(0, -1)) };
  return { type: "minute" as const, span: Number(interval.slice(0, -1)) };
}


type RadarBias = "ALCISTA" | "BAJISTA" | "ESPERAR";
type AutoOverlay = {
  label: string;
  points: Array<{ timestamp: number; value: number }>;
};

type MarketInsight = {
  bias: RadarBias;
  score: number;
  confluence: number;
  maxConfluence: number;
  patterns: string[];
  summary: string;
  support: number;
  resistance: number;
  rsi: number;
  macdHist: number;
  volumeRatio: number;
  ema20: number;
  ema50: number;
  ema200: number;
  triggerUp: number;
  triggerDown: number;
  autoOverlays: AutoOverlay[];
};

type DeepScan = {
  direction: "LONG" | "SHORT" | "ESPERAR";
  weightedScore: number;
  agreement: number;
  total: number;
  rows: Array<{ interval: Interval; insight: MarketInsight }>;
  note: string;
};

type PrecisionScan = {
  direction: "LONG" | "SHORT" | "ESPERAR";
  agreement: number;
  total: number;
  rows: Array<{ interval: Interval; read: TechnicalRead }>;
  current: TechnicalRead | null;
};

type AiDirectionResult = {
  available: boolean;
  mode: "OPENAI_ON_DEMAND" | "TECHNICAL_ENGINE";
  model?: string | null;
  direction: "LONG" | "SHORT" | "WAIT";
  evidence_strength: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  entry: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  invalidation: number;
  breakout_level: number;
  projection_from: number;
  projection_to: number;
  reasons: string[];
  risks: string[];
  what_to_wait_for: string[];
};

function emaValues(values: number[], period: number) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out: number[] = [];
  let current = values[0];
  out.push(current);
  for (let i = 1; i < values.length; i++) {
    current = values[i] * alpha + current * (1 - alpha);
    out.push(current);
  }
  return out;
}

function rsiLast(values: number[], period = 14) {
  if (values.length <= period) return 50;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

function slope(values: number[]) {
  if (values.length < 2) return 0;
  const n = values.length;
  let sx=0, sy=0, sxy=0, sxx=0;
  values.forEach((v,i)=>{sx+=i;sy+=v;sxy+=i*v;sxx+=i*i;});
  const den = n*sxx-sx*sx;
  return den === 0 ? 0 : (n*sxy-sx*sy)/den;
}

function swingPeaks(rows: any[]) {
  const peaks: Array<{i:number;p:number;t:number}> = [];
  const troughs: Array<{i:number;p:number;t:number}> = [];
  for (let i=2;i<rows.length-2;i++) {
    const h=Number(rows[i].high), l=Number(rows[i].low);
    if (h>Number(rows[i-1].high)&&h>Number(rows[i-2].high)&&h>=Number(rows[i+1].high)&&h>=Number(rows[i+2].high)) peaks.push({i,p:h,t:Number(rows[i].timestamp ?? rows[i].time)});
    if (l<Number(rows[i-1].low)&&l<Number(rows[i-2].low)&&l<=Number(rows[i+1].low)&&l<=Number(rows[i+2].low)) troughs.push({i,p:l,t:Number(rows[i].timestamp ?? rows[i].time)});
  }
  return {peaks,troughs};
}

function analyzeMarket(rows: any[], interval: Interval): MarketInsight | null {
  const data = rows.slice(-300);
  if (data.length < 35) return null;
  const closes=data.map(r=>Number(r.close)), highs=data.map(r=>Number(r.high)), lows=data.map(r=>Number(r.low)), volumes=data.map(r=>Number(r.volume||0));
  const last=data[data.length-1], price=Number(last.close);
  const e20=emaValues(closes,20).at(-1) || price;
  const e50=emaValues(closes,50).at(-1) || price;
  const e200=emaValues(closes,200).at(-1) || price;
  const rsi=rsiLast(closes,14);
  const macdLine=emaValues(closes,12).map((v,i)=>v-(emaValues(closes,26)[i] ?? v));
  const macdSignal=emaValues(macdLine,9);
  const macdHist=(macdLine.at(-1)||0)-(macdSignal.at(-1)||0);
  const avgVol=volumes.slice(-21,-1).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(20,volumes.length-1));
  const volumeRatio=avgVol>0?Number(last.volume||0)/avgVol:1;
  const prior=data.slice(-31,-1);
  const resistance=Math.max(...prior.map(r=>Number(r.high)));
  const support=Math.min(...prior.map(r=>Number(r.low)));
  const recent=data.slice(-24);
  const half=Math.floor(recent.length/2);
  const upperStart=Math.max(...recent.slice(0,half).map(r=>Number(r.high)));
  const upperEnd=Math.max(...recent.slice(half).map(r=>Number(r.high)));
  const lowerStart=Math.min(...recent.slice(0,half).map(r=>Number(r.low)));
  const lowerEnd=Math.min(...recent.slice(half).map(r=>Number(r.low)));
  const tolerance=Math.max(price*0.003,1e-9);
  const patterns:string[]=[];
  const autoOverlays: AutoOverlay[]=[];
  const swingRows=data.slice(-60);
  const {peaks,troughs}=swingPeaks(swingRows);

  const upperFlat=Math.abs(upperEnd-upperStart)<=tolerance;
  const lowerFlat=Math.abs(lowerEnd-lowerStart)<=tolerance;
  const recentA=recent.slice(0,half), recentB=recent.slice(half);
  const topA=recentA.reduce((a,b)=>Number(a.high)>=Number(b.high)?a:b);
  const topB=recentB.reduce((a,b)=>Number(a.high)>=Number(b.high)?a:b);
  const lowA=recentA.reduce((a,b)=>Number(a.low)<=Number(b.low)?a:b);
  const lowB=recentB.reduce((a,b)=>Number(a.low)<=Number(b.low)?a:b);
  const triangleLines = () => {
    autoOverlays.push(
      {label:"Directriz superior",points:[
        {timestamp:Number(topA.timestamp??topA.time),value:Number(topA.high)},
        {timestamp:Number(topB.timestamp??topB.time),value:Number(topB.high)}
      ]},
      {label:"Directriz inferior",points:[
        {timestamp:Number(lowA.timestamp??lowA.time),value:Number(lowA.low)},
        {timestamp:Number(lowB.timestamp??lowB.time),value:Number(lowB.low)}
      ]}
    );
  };
  if(upperEnd<upperStart-tolerance*.35 && lowerEnd>lowerStart+tolerance*.35) { patterns.push("Triángulo simétrico / compresión"); triangleLines(); }
  else if(upperFlat && lowerEnd>lowerStart+tolerance*.35) { patterns.push("Triángulo ascendente posible"); triangleLines(); }
  else if(lowerFlat && upperEnd<upperStart-tolerance*.35) { patterns.push("Triángulo descendente posible"); triangleLines(); }

  if(peaks.length>=2){
    const a=peaks[peaks.length-2],b=peaks[peaks.length-1];
    if(b.i-a.i>=4 && Math.abs(a.p-b.p)/price<.005) {
      patterns.push("Doble techo posible");
      autoOverlays.push({label:"Doble techo",points:[{timestamp:a.t,value:a.p},{timestamp:b.t,value:b.p}]});
    }
  }
  if(troughs.length>=2){
    const a=troughs[troughs.length-2],b=troughs[troughs.length-1];
    if(b.i-a.i>=4 && Math.abs(a.p-b.p)/price<.005) {
      patterns.push("Doble suelo posible");
      autoOverlays.push({label:"Doble suelo",points:[{timestamp:a.t,value:a.p},{timestamp:b.t,value:b.p}]});
    }
  }
  if(peaks.length>=3){
    const p=peaks.slice(-3);
    if(p[1].p>p[0].p*1.004 && p[1].p>p[2].p*1.004 && Math.abs(p[0].p-p[2].p)/price<.008) {
      patterns.push("HCH posible");
      autoOverlays.push({label:"HCH",points:p.map(x=>({timestamp:x.t,value:x.p}))});
    }
  }
  if(troughs.length>=3){
    const p=troughs.slice(-3);
    if(p[1].p<p[0].p*.996 && p[1].p<p[2].p*.996 && Math.abs(p[0].p-p[2].p)/price<.008) {
      patterns.push("HCH invertido posible");
      autoOverlays.push({label:"HCH invertido",points:p.map(x=>({timestamp:x.t,value:x.p}))});
    }
  }

  const breakoutUp=price>resistance;
  const breakoutDown=price<support;
  if(breakoutUp) patterns.unshift("Ruptura alcista de resistencia");
  if(breakoutDown) patterns.unshift("Ruptura bajista de soporte");

  let score=0;
  if(price>e20) score++; else score--;
  if(e20>e50) score++; else score--;
  if(e50>e200) score++; else score--;
  if(rsi>=55) score++; else if(rsi<=45) score--;
  if(macdHist>0) score++; else if(macdHist<0) score--;
  const recentSlope=slope(closes.slice(-16));
  if(recentSlope>0) score++; else if(recentSlope<0) score--;
  if(volumeRatio>=1.2) score += Number(last.close)>=Number(last.open)?1:-1;
  if(breakoutUp) score+=2;
  if(breakoutDown) score-=2;
  if(patterns.includes("Doble suelo posible")||patterns.includes("HCH invertido posible")) score++;
  if(patterns.includes("Doble techo posible")||patterns.includes("HCH posible")) score--;

  const maxConfluence=9;
  const confluence=Math.min(maxConfluence,Math.abs(score));
  const bias:RadarBias=score>=3?"ALCISTA":score<=-3?"BAJISTA":"ESPERAR";
  const patternText=patterns[0] || "Sin patrón claro";
  const summary=bias==="ALCISTA"
    ? `Sesgo alcista en ${interval}. Vigila cierre/aceptación sobre ${fmt(resistance)}; soporte clave ${fmt(support)}. ${patternText}.`
    : bias==="BAJISTA"
      ? `Sesgo bajista en ${interval}. Vigila cierre/aceptación bajo ${fmt(support)}; resistencia clave ${fmt(resistance)}. ${patternText}.`
      : `Sin ventaja clara en ${interval}. Precio entre ${fmt(support)} y ${fmt(resistance)}; espera ruptura/retest. ${patternText}.`;

  return {bias,score,confluence,maxConfluence,patterns:patterns.slice(0,3),summary,support,resistance,rsi,macdHist,volumeRatio,ema20:e20,ema50:e50,ema200:e200,triggerUp:resistance,triggerDown:support,autoOverlays:autoOverlays.slice(0,4)};
}

async function fetchAnalysisBars(symbol: string, interval: Interval) {
  const normalize = (rows:any[]) => rows.map((row:any)=>({
    timestamp:Number(row.time??row.timestamp),
    open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Number(row.volume||0)
  })).filter((r:any)=>r.timestamp>0&&r.open>0&&r.close>0).sort((a:any,b:any)=>a.timestamp-b.timestamp);

  try {
    if(BASE_URL){
      const response=await fetch(`${BASE_URL}/api/v1/market/candles/${symbol}?interval=${interval}&limit=600`,{cache:"no-store"});
      if(response.ok){
        const payload=await response.json();
        const rows=normalize(payload.candles??[]);
        if(rows.length>=35)return rows;
      }
    }
  } catch {}

  try {
    const response=await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=600`,{cache:"no-store"});
    if(response.ok){
      const rows=await response.json();
      if(Array.isArray(rows)) return rows.map((r:any[])=>({
        timestamp:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[7]??r[5]??0)
      })).filter((r:any)=>r.timestamp>0&&r.open>0&&r.close>0);
    }
  } catch {}
  return [];
}

export default function PracticeTradingTerminal() {
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const wsCleanupRef = useRef<(() => void) | null>(null);
  const barsRef = useRef<any[]>([]);
  const lastInsightAtRef = useRef(0);
  const [symbolInput, setSymbolInput] = useState("BTCUSDT");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setIntervalValue] = useState<Interval>("5m");
  const [livePrice, setLivePrice] = useState(0);
  const [marketInsight, setMarketInsight] = useState<MarketInsight | null>(null);
  const [deepScan, setDeepScan] = useState<DeepScan | null>(null);
  const [precisionScan, setPrecisionScan] = useState<PrecisionScan | null>(null);
  const [aiDirection, setAiDirection] = useState<AiDirectionResult | null>(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [askingAi, setAskingAi] = useState(false);
  const aiCacheRef = useRef<{ symbol: string; interval: Interval; at: number; price: number; result: AiDirectionResult } | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [strongMagnet, setStrongMagnet] = useState(true);
  const [showExplain, setShowExplain] = useState(false);
  const [indicatorCategory, setIndicatorCategory] = useState<"principal"|"momentum"|"riesgo">("principal");
  const [indicatorSet, setIndicatorSet] = useState<Set<IndicatorName>>(
    new Set(["EMA20/50/200", "VOL"])
  );
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [targetRoi, setTargetRoi] = useState("5");
  const [feePerSide, setFeePerSide] = useState("0.05");
  const levelSignatureRef = useRef("");
  const summaryRef = useRef<PracticeSummary | null>(null);
  const closedCountRef = useRef(-1);
  const syncingRef = useRef(false);
  const [journalCount, setJournalCount] = useState(0);
  const [replaySnapshot, setReplaySnapshot] = useState<CandleBar[] | null>(null);
  const [sid, setSid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [chartReady, setChartReady] = useState(false);
  const [showOrder, setShowOrder] = useState(true);
  const [marginPct, setMarginPct] = useState(0);
  const [showTpSl, setShowTpSl] = useState(false);
  const [bottomTab, setBottomTab] = useState<"positions" | "orders" | "history" | "stats">("positions");
  const [form, setForm] = useState<OrderForm>({
    side: "LONG",
    orderType: "MARKET",
    limitPrice: "",
    margin: "25",
    leverage: "3",
    stop: "",
    tp1: "",
    tp2: "",
    tp3: "",
    pattern: "PULLBACK",
    note: "",
  });

  useEffect(() => setSid(sessionId()), []);

  // Local backup, linked to the same browser session as the PAPER backend.
  function journalKey() { return `explodex:practice-journal:${sid}`; }
  function mergeJournal(remote: any[]) {
    if (!sid) return remote;
    try {
      const saved = JSON.parse(window.localStorage.getItem(journalKey()) || "[]");
      const unique = new Map<string, any>();
      for (const item of [...(Array.isArray(saved) ? saved : []), ...remote]) {
        if (item?.id != null) unique.set(String(item.id), item);
      }
      const rows = Array.from(unique.values()).sort((a,b) => (
        (Date.parse(b.closed_at || b.created_at || b.opened_at || "") || 0) -
        (Date.parse(a.closed_at || a.created_at || a.opened_at || "") || 0)
      )).slice(0, 2000);
      window.localStorage.setItem(journalKey(), JSON.stringify(rows));
      setJournalCount(rows.length);
      return rows;
    } catch { return remote; }
  }
  useEffect(() => {
    if (!sid) return;
    try {
      const rows = JSON.parse(window.localStorage.getItem(journalKey()) || "[]");
      if (Array.isArray(rows)) { setHistory(rows); setJournalCount(rows.length); }
    } catch {}
  }, [sid]);

  function exportJournal() {
    if (!history.length) { setMessage("Todavía no hay operaciones cerradas para exportar."); return; }
    const cols = ["id","symbol","side","leverage","entry_price","exit_price","net_pnl","r_multiple","pattern","close_reason","opened_at","closed_at"];
    const csv = [cols.join(","), ...history.map(row => cols.map(key =>
      '"' + String(row[key] ?? "").replaceAll('"','""') + '"'
    ).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "ExplodeX-diario-PAPER.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  // At rest the chart uses its own websocket; PostgreSQL is queried only for
  // meaningful account changes and once when returning to the tab.
  const loadPractice = useCallback(async () => {
    if (!BASE_URL || !sid) return;
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/summary?session_id=${encodeURIComponent(sid)}`, { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as PracticeSummary;
      summaryRef.current = next;
      setSummary(next);
      if (closedCountRef.current !== next.closed_trades) {
        const historyResponse = await fetch(
          `${BASE_URL}/api/v1/practice/history?session_id=${encodeURIComponent(sid)}&limit=500`,
          { cache: "no-store" }
        );
        if (historyResponse.ok) {
          setHistory(mergeJournal((await historyResponse.json()).rows ?? []));
          closedCountRef.current = next.closed_trades;
        }
      }
    } catch {}
  }, [sid]);

  const syncPractice = useCallback(async () => {
    if (!BASE_URL || !sid || syncingRef.current) return;
    syncingRef.current = true;
    try {
      // No open trades or limit orders = no POST, no candlestick downloads,
      // no needless last_synced_at writes to PostgreSQL.
      if ((summaryRef.current?.open_positions?.length ?? 0) > 0 ||
          (summaryRef.current?.pending_orders?.length ?? 0) > 0) {
        await fetch(`${BASE_URL}/api/v1/practice/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid }),
          cache: "no-store",
        });
      }
      await loadPractice();
    } catch {} finally { syncingRef.current = false; }
  }, [sid, loadPractice]);

  useEffect(() => {
    if (!sid) return;
    void loadPractice();
    // Sync only while the user is viewing the simulator and has live trades.
    // The old implementation synced and re-read history every 3.5 seconds.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" &&
          ((summaryRef.current?.open_positions?.length ?? 0) > 0 ||
           (summaryRef.current?.pending_orders?.length ?? 0) > 0)) {
        void syncPractice();
      }
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncPractice();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sid, syncPractice, loadPractice]);

  useEffect(() => {
    let disposed = false;
    let localChart: any = null;

    async function boot() {
      if (!chartElRef.current) return;
      const kc = await import("klinecharts");
      if (disposed || !chartElRef.current) return;

      try {
        kc.registerIndicator({
          name: "EXPLODEX_VWAP",
          shortName: "VWAP",
          series: "price",
          figures: [{ key: "vwap", title: "VWAP: ", type: "line" }],
          calc: (rows: any[]) => {
            let cumulativePv = 0;
            let cumulativeVolume = 0;
            const output: Record<number, { vwap: number }> = {};
            for (const row of rows) {
              const volume = Number(row.volume || 0);
              const typical = (Number(row.high) + Number(row.low) + Number(row.close)) / 3;
              cumulativePv += typical * volume;
              cumulativeVolume += volume;
              output[Number(row.timestamp)] = {
                vwap: cumulativeVolume > 0 ? cumulativePv / cumulativeVolume : Number(row.close),
              };
            }
            return output;
          },
        } as any);
      } catch {}

      try {
        kc.registerIndicator({
          name: "EXPLODEX_ATR",
          shortName: "ATR14",
          series: "normal",
          calcParams: [14],
          figures: [{ key: "atr", title: "ATR: ", type: "line" }],
          calc: (rows: any[], indicator: any) => {
            const period = Number(indicator?.calcParams?.[0] || 14);
            const output: Record<number, { atr: number }> = {};
            let previousClose = 0;
            let atr = 0;
            rows.forEach((row: any, index: number) => {
              const high = Number(row.high || 0);
              const low = Number(row.low || 0);
              const close = Number(row.close || 0);
              const tr = index === 0
                ? high - low
                : Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
              atr = index === 0 ? tr : index < period ? (atr * index + tr) / (index + 1) : (atr * (period - 1) + tr) / period;
              output[Number(row.timestamp)] = { atr };
              previousClose = close;
            });
            return output;
          },
        } as any);
      } catch {}

      const registerPositionOverlay = (name: string, label: string) => {
        try {
          kc.registerOverlay({
            name,
            totalStep: 4,
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: true,
            needDefaultYAxisFigure: true,
            mode: "weak_magnet",
            modeSensitivity: 8,
            createPointFigures: ({ coordinates, overlay }: any) => {
              if (!Array.isArray(coordinates) || coordinates.length < 3) return [];
              const points = overlay?.points || [];
              const entry = Number(points?.[0]?.value || 0);
              const stop = Number(points?.[1]?.value || 0);
              const target = Number(points?.[2]?.value || 0);
              const risk = Math.abs(entry - stop);
              const reward = Math.abs(target - entry);
              const rr = risk > 0 ? reward / risk : 0;
              const x1 = Math.min(coordinates[0].x, coordinates[2].x);
              const x2 = Math.max(coordinates[0].x, coordinates[2].x);
              return [
                { type: "line", attrs: { coordinates: [{ x: x1, y: coordinates[0].y }, { x: x2, y: coordinates[0].y }] }, styles: { color: "#22d3ee", size: 1.5 } },
                { type: "line", attrs: { coordinates: [{ x: x1, y: coordinates[1].y }, { x: x2, y: coordinates[1].y }] }, styles: { color: "#fb7185", size: 1.5 } },
                { type: "line", attrs: { coordinates: [{ x: x1, y: coordinates[2].y }, { x: x2, y: coordinates[2].y }] }, styles: { color: "#34d399", size: 1.5 } },
                { type: "text", attrs: { x: x1 + 6, y: coordinates[0].y - 7, text: `${label} · R:R 1:${rr.toFixed(2)}` }, styles: { color: "#e2e8f0", size: 11 } },
              ];
            },
          } as any);
        } catch {}
      };
      registerPositionOverlay("EXPLODEX_LONG_POSITION", "LONG");
      registerPositionOverlay("EXPLODEX_SHORT_POSITION", "SHORT");
      // Draggable chart levels for open PAPER trades.
      try {
        kc.registerOverlay({
          name: "EXPLODEX_MANAGED_LEVEL",
          totalStep: 2,
          needDefaultYAxisFigure: true,
          needDefaultPointFigure: false,
          mode: "normal",
          createPointFigures: ({ coordinates, overlay, bounding }: any) => {
            if (!coordinates?.length) return [];
            const level = overlay?.extendData || {};
            const color = level.kind === "SL" ? "#fb7185" : level.kind === "ENTRY" ? "#67e8f9" : "#34d399";
            const y = coordinates[0].y;
            const width = Number(bounding?.width || 1600);
            return [
              { type: "line", attrs: { coordinates: [{x: 0, y}, {x: width, y}] }, styles: { color, size: 1.5, style: level.kind === "ENTRY" ? "dashed" : "solid" } },
              { type: "text", attrs: { x: 8, y: y - 5, text: `${level.label || level.kind} · ${Number(overlay?.points?.[0]?.value || 0).toPrecision(7)}` }, styles: { color, size: 10 } },
            ];
          },
        } as any);
      } catch {}


      const registerPolylinePattern = (name: string, label: string, totalStep: number) => {
        try {
          kc.registerOverlay({
            name,
            totalStep,
            needDefaultPointFigure: true,
            needDefaultXAxisFigure: true,
            needDefaultYAxisFigure: true,
            mode: "weak_magnet",
            modeSensitivity: 8,
            createPointFigures: ({ coordinates }: any) => {
              if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
              return [
                { type: "line", attrs: { coordinates }, styles: { color: "#c084fc", size: 1.8 } },
                { type: "text", attrs: { x: coordinates[0].x + 6, y: coordinates[0].y - 8, text: label }, styles: { color: "#e9d5ff", size: 11 } },
              ];
            },
          } as any);
        } catch {}
      };
      registerPolylinePattern("EXPLODEX_ABCD", "ABCD", 5);
      registerPolylinePattern("EXPLODEX_XABCD", "XABCD / armónico", 6);
      registerPolylinePattern("EXPLODEX_HCH", "HCH / neckline", 7);
      registerPolylinePattern("EXPLODEX_ELLIOTT", "Elliott 1-2-3-4-5", 6);
      registerPolylinePattern("EXPLODEX_THREE_DRIVES", "Three Drives", 7);

      try {
        kc.registerOverlay({
          name: "EXPLODEX_FIB_EXTENSION",
          totalStep: 4,
          needDefaultPointFigure: true,
          needDefaultXAxisFigure: true,
          needDefaultYAxisFigure: true,
          mode: "weak_magnet",
          modeSensitivity: 8,
          createPointFigures: ({ coordinates, overlay }: any) => {
            if (!Array.isArray(coordinates) || coordinates.length < 3) return [];
            const points = overlay?.points || [];
            const a = Number(points?.[0]?.value || 0);
            const b = Number(points?.[1]?.value || 0);
            const cPrice = Number(points?.[2]?.value || 0);
            const delta = b - a;
            const ratios = [1, 1.272, 1.618];
            const x1 = coordinates[2].x;
            const x2 = x1 + Math.max(140, Math.abs(coordinates[1].x - coordinates[0].x));
            const pixelDelta = coordinates[1].y - coordinates[0].y;
            const figures: any[] = [
              { type: "line", attrs: { coordinates: [coordinates[0], coordinates[1], coordinates[2]] }, styles: { color: "#a78bfa", size: 1.4, style: "dashed" } },
            ];
            for (const ratio of ratios) {
              const projected = cPrice + delta * ratio;
              const yy = coordinates[2].y + pixelDelta * ratio;
              figures.push({ type: "line", attrs: { coordinates: [{ x: x1, y: yy }, { x: x2, y: yy }] }, styles: { color: "#c084fc", size: 1, style: "dashed" } });
              figures.push({ type: "text", attrs: { x: x2 + 5, y: yy - 3, text: `${ratio} · ${fmt(projected)}` }, styles: { color: "#e9d5ff", size: 10 } });
            }
            return figures;
          },
        } as any);
      } catch {}

      try {
        kc.registerOverlay({
          name: "EXPLODEX_MEASURE",
          totalStep: 3,
          needDefaultPointFigure: true,
          needDefaultXAxisFigure: true,
          needDefaultYAxisFigure: true,
          mode: "weak_magnet",
          modeSensitivity: 8,
          createPointFigures: ({ coordinates, overlay }: any) => {
            if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
            const points = overlay?.points || [];
            const a = Number(points?.[0]?.value || 0);
            const b = Number(points?.[1]?.value || 0);
            const pct = a ? ((b - a) / a) * 100 : 0;
            const delta = b - a;
            return [
              { type: "line", attrs: { coordinates }, styles: { color: "#fbbf24", size: 1.5, style: "dashed" } },
              { type: "text", attrs: { x: coordinates[1].x + 6, y: coordinates[1].y - 7, text: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% · Δ ${fmt(delta)}` }, styles: { color: "#fde68a", size: 11 } },
            ];
          },
        } as any);
      } catch {}

      localChart = kc.init(chartElRef.current, {
        locale: "en-US",
        timezone: "America/Guatemala",
        styles: {
          grid: {
            horizontal: { show: true, size: 1, color: "#17202b", style: "dashed" },
            vertical: { show: false, size: 1, color: "#111827", style: "dashed" },
          },
        },
        layout: {
          pane: { minHeight: 70, dragEnabled: true },
          yAxis: { position: "right", inside: false, scrollZoomEnabled: true },
        },
      } as any);
      chartRef.current = localChart;
      if (!localChart) return;

      localChart.setDataLoader({
        getBars: async ({ type, symbol: chartSymbol, period, callback }: any) => {
          const ticker = normalizeSymbol(chartSymbol?.ticker || symbol);
          const requestedInterval = intervalFromPeriod(period);

          const normalizeBars = (rows: any[]) => rows
            .map((row: any) => ({
              timestamp: Number(row.time ?? row.timestamp),
              open: Number(row.open),
              high: Number(row.high),
              low: Number(row.low),
              close: Number(row.close),
              volume: Number(row.volume || 0),
            }))
            .filter((row: any) => Number.isFinite(row.timestamp) && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)
            .sort((a: any, b: any) => a.timestamp - b.timestamp);

          let bars: any[] = [];

          // 1) ExplodeX API first. If Railway is waking up, do not leave the
          // chart with only the live websocket candle.
          try {
            const response = await fetch(
              `${BASE_URL}/api/v1/market/candles/${ticker}?interval=${requestedInterval}&limit=600`,
              { cache: "no-store" }
            );
            if (response.ok) {
              const payload = await response.json();
              bars = normalizeBars(payload.candles ?? []);
            }
          } catch {}

          // 2) Direct Binance Futures historical fallback.
          if (bars.length < 20) {
            try {
              const response = await fetch(
                `https://fapi.binance.com/fapi/v1/klines?symbol=${encodeURIComponent(ticker)}&interval=${encodeURIComponent(requestedInterval)}&limit=600`,
                { cache: "no-store" }
              );
              if (response.ok) {
                const rows = await response.json();
                if (Array.isArray(rows)) {
                  bars = rows.map((row: any[]) => ({
                    timestamp: Number(row[0]),
                    open: Number(row[1]),
                    high: Number(row[2]),
                    low: Number(row[3]),
                    close: Number(row[4]),
                    volume: Number(row[7] ?? row[5] ?? 0),
                  })).filter((row: any) => row.timestamp > 0 && row.open > 0 && row.close > 0);
                }
              }
            } catch {}
          }

          // 3) OKX swap fallback when Binance REST is unavailable.
          if (bars.length < 20) {
            try {
              const base = ticker.replace(/USDT$/, "");
              const okxBar = requestedInterval === "1d"
                ? "1D"
                : requestedInterval.endsWith("h")
                  ? requestedInterval.replace("h", "H")
                  : requestedInterval;
              const response = await fetch(
                `https://www.okx.com/api/v5/market/history-candles?instId=${base}-USDT-SWAP&bar=${okxBar}&limit=600`,
                { cache: "no-store" }
              );
              if (response.ok) {
                const payload = await response.json();
                const rows = Array.isArray(payload?.data) ? payload.data : [];
                bars = rows.map((row: any[]) => ({
                  timestamp: Number(row[0]),
                  open: Number(row[1]),
                  high: Number(row[2]),
                  low: Number(row[3]),
                  close: Number(row[4]),
                  volume: Number(row[7] ?? row[6] ?? row[5] ?? 0),
                })).filter((row: any) => row.timestamp > 0 && row.open > 0 && row.close > 0)
                  .sort((a: any, b: any) => a.timestamp - b.timestamp);
              }
            } catch {}
          }

          if (bars.length) {
            barsRef.current = bars.slice(-300);
            setLivePrice(Number(bars[bars.length - 1].close || 0));
            setMarketInsight(analyzeMarket(barsRef.current, requestedInterval));
          }
          callback(bars, { forward: false, backward: false });
        },
        subscribeBar: ({ symbol: chartSymbol, period, callback }: any) => {
          wsCleanupRef.current?.();
          const ticker = normalizeSymbol(chartSymbol?.ticker || symbol);
          const requestedInterval = intervalFromPeriod(period);
          let disposedWs = false;
          let gotBinance = false;
          let ws: WebSocket | null = null;
          let fallbackTimer: number | null = null;

          const push = (bar: any) => {
            if (disposedWs) return;
            const next = barsRef.current.slice();
            const lastRow = next[next.length - 1];
            if (lastRow && Number(lastRow.timestamp) === Number(bar.timestamp)) next[next.length - 1] = bar;
            else next.push(bar);
            barsRef.current = next.slice(-300);
            setLivePrice(Number(bar.close || 0));
            const now = Date.now();
            if (now - lastInsightAtRef.current > 1200) {
              lastInsightAtRef.current = now;
              setMarketInsight(analyzeMarket(barsRef.current, requestedInterval));
            }
            callback(bar);
          };

          const connectOkx = () => {
            if (disposedWs) return;
            try { ws?.close(); } catch {}
            const base = ticker.replace(/USDT$/, "");
            const channel = requestedInterval === "1d"
              ? "candle1D"
              : requestedInterval.endsWith("h")
                ? `candle${requestedInterval.replace("h", "H")}`
                : `candle${requestedInterval}`;
            ws = new WebSocket("wss://ws.okx.com:8443/ws/v5/business");
            ws.onopen = () => ws?.send(JSON.stringify({
              op: "subscribe",
              args: [{ channel, instId: `${base}-USDT-SWAP` }],
            }));
            ws.onmessage = (event) => {
              try {
                const row = JSON.parse(event.data)?.data?.[0];
                if (!Array.isArray(row) || row.length < 6) return;
                push({
                  timestamp: Number(row[0]),
                  open: Number(row[1]),
                  high: Number(row[2]),
                  low: Number(row[3]),
                  close: Number(row[4]),
                  volume: Number(row[7] ?? row[6] ?? row[5] ?? 0),
                });
              } catch {}
            };
          };

          try {
            ws = new WebSocket(`wss://fstream.binance.com/ws/${ticker.toLowerCase()}@kline_${requestedInterval}`);
            ws.onmessage = (event) => {
              gotBinance = true;
              try {
                const k = JSON.parse(event.data)?.k;
                if (!k) return;
                push({
                  timestamp: Number(k.t),
                  open: Number(k.o),
                  high: Number(k.h),
                  low: Number(k.l),
                  close: Number(k.c),
                  volume: Number(k.q ?? k.v ?? 0),
                });
              } catch {}
            };
            ws.onerror = () => { if (!gotBinance) connectOkx(); };
            ws.onclose = () => { if (!disposedWs && !gotBinance) connectOkx(); };
            fallbackTimer = window.setTimeout(() => { if (!gotBinance) connectOkx(); }, 5000);
          } catch {
            connectOkx();
          }

          const cleanup = () => {
            disposedWs = true;
            if (fallbackTimer != null) window.clearTimeout(fallbackTimer);
            try { ws?.close(); } catch {}
          };
          wsCleanupRef.current = cleanup;
        },
        unsubscribeBar: () => {
          wsCleanupRef.current?.();
          wsCleanupRef.current = null;
        },
      });

      localChart.setSymbol({ ticker: symbol, pricePrecision: 6, volumePrecision: 4 });
      localChart.setPeriod(periodFromInterval(interval));
      setChartReady(true);
    }

    boot();
    return () => {
      disposed = true;
      wsCleanupRef.current?.();
      wsCleanupRef.current = null;
      if (localChart) {
        try { localChart.dispose?.(); } catch {}
      }
      chartRef.current = null;
      setChartReady(false);
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setSymbol({ ticker: symbol, pricePrecision: 6, volumePrecision: 4 });
    chart.setPeriod(periodFromInterval(interval));
    chart.resetData?.();
    window.setTimeout(() => restoreDrawings(false), 700);
  }, [symbol, interval]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const name of ["EMA", "EXPLODEX_VWAP", "EXPLODEX_ATR", "RSI", "MACD", "VOL", "BOLL", "SAR", "OBV", "KDJ", "CCI", "DMI"]) {
      try { chart.removeIndicator({ name }); } catch {}
    }
    if (indicatorSet.has("EMA20/50/200")) {
      try { chart.createIndicator({ name: "EMA", paneId: "candle_pane", calcParams: [20, 50, 200] }, true); } catch {}
    }
    if (indicatorSet.has("VWAP")) {
      try { chart.createIndicator({ name: "EXPLODEX_VWAP", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("BOLL")) {
      try { chart.createIndicator({ name: "BOLL", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("SAR")) {
      try { chart.createIndicator({ name: "SAR", paneId: "candle_pane" }, true); } catch {}
    }
    if (indicatorSet.has("VOL")) {
      try { chart.createIndicator({ name: "VOL", paneId: "volume_pane" }); } catch {}
    }
    if (indicatorSet.has("RSI")) {
      try { chart.createIndicator({ name: "RSI", paneId: "rsi_pane", calcParams: [14] }); } catch {}
    }
    if (indicatorSet.has("MACD")) {
      try { chart.createIndicator({ name: "MACD", paneId: "macd_pane", calcParams: [12, 26, 9] }); } catch {}
    }
    if (indicatorSet.has("ATR")) {
      try { chart.createIndicator({ name: "EXPLODEX_ATR", paneId: "atr_pane", calcParams: [14] }); } catch {}
    }
    if (indicatorSet.has("OBV")) {
      try { chart.createIndicator({ name: "OBV", paneId: "obv_pane" }); } catch {}
    }
    if (indicatorSet.has("KDJ")) {
      try { chart.createIndicator({ name: "KDJ", paneId: "kdj_pane", calcParams: [9, 3, 3] }); } catch {}
    }
    if (indicatorSet.has("CCI")) {
      try { chart.createIndicator({ name: "CCI", paneId: "cci_pane", calcParams: [20] }); } catch {}
    }
    if (indicatorSet.has("DMI")) {
      try { chart.createIndicator({ name: "DMI", paneId: "dmi_pane", calcParams: [14, 6] }); } catch {}
    }
  }, [indicatorSet, chartReady]);

  function toggleIndicator(name: IndicatorName) {
    setIndicatorSet((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const drawLabels: Record<string, { label: string; hint: string }> = {
    segment: { label: "Línea de tendencia", hint: "Haz clic en dos swings. Con imán fuerte se ajusta a máximos/mínimos de las velas." },
    rayLine: { label: "Rayo de tendencia", hint: "Marca dos puntos; la línea se proyecta hacia la derecha." },
    horizontalStraightLine: { label: "Soporte / resistencia", hint: "Haz clic sobre el nivel que quieres conservar como referencia." },
    fibonacciLine: { label: "Fibonacci", hint: "Marca inicio y fin del impulso; ajusta los puntos si hace falta." },
    parallelStraightLine: { label: "Canal paralelo", hint: "Marca la directriz y luego el ancho del canal." },
    EXPLODEX_FIB_EXTENSION: { label: "Extensión Fibonacci", hint: "Marca A → B → C para proyectar objetivos." },
    EXPLODEX_MEASURE: { label: "Regla / recorrido", hint: "Marca inicio y final del movimiento para medirlo." },
    EXPLODEX_LONG_POSITION: { label: "Long Position", hint: "Marca entrada, stop y objetivo para visualizar el R:R." },
    EXPLODEX_SHORT_POSITION: { label: "Short Position", hint: "Marca entrada, stop y objetivo para visualizar el R:R." },
    brush: { label: "Dibujo libre", hint: "Dibuja libremente sobre el gráfico." },
  };

  function draw(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    const meta = drawLabels[name] || { label: name, hint: "Marca los puntos de la herramienta sobre el gráfico." };
    setActiveTool(meta.label);
    setMessage(meta.hint);
    try {
      chart.createOverlay({
        name,
        groupId: "practice-user",
        mode: strongMagnet ? "strong_magnet" : "weak_magnet",
        modeSensitivity: strongMagnet ? 18 : 10,
        onDrawStart: () => {
          setMessage(meta.hint);
          return false;
        },
        onDrawEnd: () => {
          setActiveTool(null);
          setMessage(`${meta.label} lista. Puedes arrastrar sus puntos para afinarla.`);
          return false;
        },
      });
    } catch {
      setActiveTool(null);
      setMessage(`No se pudo activar ${meta.label}.`);
    }
  }

  function drawPrecisionPattern(read: TechnicalRead | null) {
    const chart = chartRef.current;
    const pattern = read?.pattern;
    if (!chart || !pattern) return;
    try { chart.removeOverlay({ groupId: "pattern-engine" }); } catch {}
    const bars = barsRef.current;
    const startTs = Number(bars[Math.max(0, bars.length - 100)]?.timestamp || pattern.overlays[0]?.points[0]?.timestamp || Date.now());
    const endTs = Number(bars.at(-1)?.timestamp || Date.now());
    const colorFor = (label: string) => label.includes("SL") || label.includes("Invalid")
      ? "#fb7185"
      : label.includes("TP")
        ? "#34d399"
        : label.includes("Entrada")
          ? "#f8fafc"
          : "#22d3ee";
    for (const guide of pattern.overlays) {
      const points = guide.kind === "horizontal"
        ? [{ timestamp: startTs, value: Number(guide.value) }, { timestamp: endTs, value: Number(guide.value) }]
        : guide.points;
      if (points.length < 2) continue;
      for (let i = 0; i < points.length - 1; i++) {
        try {
          chart.createOverlay({
            name: "segment",
            groupId: "pattern-engine",
            lock: true,
            points: [points[i], points[i + 1]],
            styles: { line: { color: colorFor(guide.label), size: 2, style: guide.kind === "horizontal" ? "dashed" : "solid" } },
          });
        } catch {}
      }
    }
    setMessage(`${pattern.name} dibujado automáticamente con pivotes 5/5. Revisa que los swings coincidan visualmente antes de usar el plan.`);
  }


  function intervalMilliseconds(value: Interval) {
    if (value.endsWith("d")) return Number(value.slice(0, -1)) * 86_400_000;
    if (value.endsWith("h")) return Number(value.slice(0, -1)) * 3_600_000;
    return Number(value.slice(0, -1)) * 60_000;
  }

  function drawAiProjection(result: AiDirectionResult) {
    const chart = chartRef.current;
    const bars = barsRef.current;
    if (!chart || !bars.length) return;
    try { chart.removeOverlay({ groupId: "ai-direction" }); } catch {}

    const lastTs = Number(bars.at(-1)?.timestamp || Date.now());
    const futureTs = lastTs + intervalMilliseconds(interval) * 18;
    const from = Number(result.projection_from || livePrice || bars.at(-1)?.close || 0);
    const to = Number(result.projection_to || 0);
    const isLong = result.direction === "LONG";
    const isShort = result.direction === "SHORT";
    const projectionColor = isLong ? "#34d399" : isShort ? "#fb7185" : "#fbbf24";

    if (from > 0 && to > 0 && from !== to) {
      try {
        chart.createOverlay({
          name: "segment",
          groupId: "ai-direction",
          lock: true,
          points: [{ timestamp: lastTs, value: from }, { timestamp: futureTs, value: to }],
          styles: { line: { color: projectionColor, size: 3, style: "dashed" } },
        });
      } catch {}
    }

    const levels = [
      ["ENTRY", result.entry, "#f8fafc"],
      ["SL", result.stop_loss, "#fb7185"],
      ["TP1", result.tp1, "#6ee7b7"],
      ["TP2", result.tp2, "#34d399"],
      ["TP3", result.tp3, "#22d3ee"],
    ] as Array<[string, number, string]>;

    for (const [label, value, color] of levels) {
      if (!(Number(value) > 0)) continue;
      try {
        chart.createOverlay({
          name: "segment",
          groupId: "ai-direction",
          lock: true,
          points: [{ timestamp: lastTs, value }, { timestamp: futureTs, value }],
          styles: { line: { color, size: label === "ENTRY" ? 1.5 : 1.2, style: "dashed" } },
        });
      } catch {}
    }

    setMessage(
      result.direction === "WAIT"
        ? "La lectura no tiene dirección suficiente: marqué el escenario como ESPERAR."
        : `${result.available ? "IA" : "Motor técnico"} dibujó una proyección ${result.direction} con SL/TP. Es un escenario de práctica, no una certeza.`
    );
  }

  async function askAiDirection() {
    if (!BASE_URL || !sid) {
      setMessage("Espera a que la sesión demo se conecte.");
      return;
    }
    const cached = aiCacheRef.current;
    if (cached && cached.symbol === symbol && cached.interval === interval &&
        Date.now() - cached.at < 120_000 && cached.price > 0 &&
        Math.abs(livePrice - cached.price) / cached.price < .001) {
      setAiDirection(cached.result);
      drawAiProjection(cached.result);
      setMessage("Análisis reutilizado durante 2 minutos para no gastar otra consulta de IA.");
      return;
    }
    setAskingAi(true);
    setMessage("");
    try {
      const current = precisionScan?.current ?? analyzeTechnical(barsRef.current, interval);
      const fallbackScan: PrecisionScan | null = current ? {
        direction: current.trendScore >= 2 ? "LONG" : current.trendScore <= -2 ? "SHORT" : "ESPERAR",
        agreement: 1,
        total: 1,
        rows: [{ interval, read: current }],
        current,
      } : null;
      const scan = precisionScan ?? fallbackScan;
      const payload = {
        session_id: sid,
        symbol,
        interval,
        engine_direction: scan?.direction ?? "ESPERAR",
        current,
        multi_timeframe: (scan?.rows ?? []).map(row => ({
          interval: row.interval,
          trend_score: row.read.trendScore,
          price: row.read.price,
          ema20: row.read.ema20,
          ema50: row.read.ema50,
          ema200: row.read.ema200,
          rsi: row.read.rsi,
          macd_hist: row.read.macdHist,
          volume_ratio: row.read.volumeRatio,
          atr14: row.read.atr14,
          support: row.read.support,
          resistance: row.read.resistance,
          pattern: row.read.pattern ? {name:row.read.pattern.name,status:row.read.pattern.status,direction:row.read.pattern.direction} : null,
        })),
        recent_candles: barsRef.current.slice(-36).map(row => ({
          timestamp:row.timestamp,open:row.open,high:row.high,low:row.low,close:row.close,volume:row.volume
        })),
        recent_trades: history.slice(0, 10).map(row => ({
          symbol:row.symbol, side:row.side, timeframe:row.timeframe, pattern:row.pattern,
          entry_price:row.entry_price,exit_price:row.exit_price,net_pnl:row.net_pnl,
          r_multiple:row.r_multiple,close_reason:row.close_reason
        })),
      };
      const response = await fetch(`${BASE_URL}/api/v1/practice/ai-direction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Backend ${response.status}`);
      const result = await response.json() as AiDirectionResult;
      aiCacheRef.current = {symbol,interval,at:Date.now(),price:livePrice,result};
      setAiDirection(result);
      drawAiProjection(result);

      if (result.direction !== "WAIT" && result.stop_loss > 0 && result.tp1 > 0) {
        const side: Side = result.direction === "LONG" ? "LONG" : "SHORT";
        setForm(x => ({
          ...x,
          side,
          stop: String(Number(result.stop_loss.toPrecision(10))),
          tp1: String(Number(result.tp1.toPrecision(10))),
          tp2: String(Number(result.tp2.toPrecision(10))),
          tp3: String(Number(result.tp3.toPrecision(10))),
          note: `${result.available ? "IA OpenAI" : "Motor técnico"}: ${result.summary}`,
        }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo obtener la lectura.");
    } finally {
      setAskingAi(false);
    }
  }


  function drawRadarPatterns(insight: MarketInsight | null) {
    const chart=chartRef.current;
    if(!chart||!insight)return;
    try{chart.removeOverlay({groupId:"radar-auto"});}catch{}
    for(const overlay of insight.autoOverlays){
      if(overlay.points.length<2)continue;
      if(overlay.points.length===2){
        try{chart.createOverlay({name:"segment",groupId:"radar-auto",lock:true,points:overlay.points});}catch{}
      } else {
        for(let i=0;i<overlay.points.length-1;i++){
          try{chart.createOverlay({name:"segment",groupId:"radar-auto",lock:true,points:[overlay.points[i],overlay.points[i+1]]});}catch{}
        }
      }
    }
    if(insight.autoOverlays.length){
      setMessage(`Radar dibujó ${insight.autoOverlays.length} estructura(s) posibles. Son guías automáticas: valida los swings antes de operar.`);
    }
  }

  async function analyzeEverything() {
    setAnalyzingAll(true);
    setMessage("");
    try {
      const frames: Array<{ interval: Interval; weight: number }> = [
        { interval: "5m", weight: 1 },
        { interval: "15m", weight: 2 },
        { interval: "1h", weight: 3 },
        { interval: "4h", weight: 4 },
      ];
      const rows = await Promise.all(frames.map(async item => {
        const bars = item.interval === interval && barsRef.current.length >= 60
          ? barsRef.current
          : await fetchAnalysisBars(symbol, item.interval);
        return { item, read: analyzeTechnical(bars, item.interval) };
      }));
      const valid = rows.filter((x): x is { item: { interval: Interval; weight: number }; read: TechnicalRead } => Boolean(x.read));

      let weighted = 0;
      let totalWeight = 0;
      for (const row of valid) {
        let score = row.read.trendScore;
        if (row.read.pattern?.direction === "LONG") score += 4;
        if (row.read.pattern?.direction === "SHORT") score -= 4;
        weighted += score * row.item.weight;
        totalWeight += row.item.weight;
      }
      const normalized = totalWeight ? weighted / totalWeight : 0;
      let direction: PrecisionScan["direction"] = normalized >= 2 ? "LONG" : normalized <= -2 ? "SHORT" : "ESPERAR";

      const current = analyzeTechnical(barsRef.current, interval);
      if (current?.pattern?.direction === "LONG") direction = "LONG";
      if (current?.pattern?.direction === "SHORT") direction = "SHORT";

      const agreement = valid.filter(row =>
        direction === "LONG" ? row.read.trendScore > 0 :
        direction === "SHORT" ? row.read.trendScore < 0 :
        Math.abs(row.read.trendScore) <= 2
      ).length;
      const next: PrecisionScan = {
        direction,
        agreement,
        total: valid.length,
        rows: valid.map(x => ({ interval: x.item.interval, read: x.read })),
        current,
      };
      setPrecisionScan(next);

      if (current?.pattern) {
        drawPrecisionPattern(current);
        const p = current.pattern;
        if (p.direction !== "WAIT" && p.entry && p.stop && p.tp1 && p.tp2 && p.tp3) {
          const confirmedSide: Side = p.direction === "LONG" ? "LONG" : "SHORT";
          setForm(x => ({
            ...x,
            side: confirmedSide,
            stop: String(Number(p.stop!.toPrecision(10))),
            tp1: String(Number(p.tp1!.toPrecision(10))),
            tp2: String(Number(p.tp2!.toPrecision(10))),
            tp3: String(Number(p.tp3!.toPrecision(10))),
            pattern: p.name.toUpperCase().replaceAll(" ", "_").replaceAll("-", "_").slice(0, 40),
            note: `Patrón confirmado: ${p.name}. ${p.rationale.join(" ")}`,
          }));
          setMessage(`${p.name} CONFIRMADO ${p.direction}. Dibujé la figura y cargué SL/TP medidos en el ticket demo; revísalos antes de ejecutar.`);
        } else {
          setMessage(`${p.name} EN FORMACIÓN. Dibujé la estructura; aún no cargo una entrada porque falta confirmar la ruptura.`);
        }
      } else {
        try { chartRef.current?.removeOverlay({ groupId: "pattern-engine" }); } catch {}
        setMessage(`Análisis completo: ${direction}. No encontré una figura suficientemente limpia en ${interval.toUpperCase()}; usa soporte/resistencia y la alineación multi-TF.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar el análisis.");
    } finally {
      setAnalyzingAll(false);
    }
  }

  function drawTriangle() {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.createOverlay({
        name: "segment",
        groupId: "practice-user",
        mode: strongMagnet ? "strong_magnet" : "weak_magnet",
        modeSensitivity: strongMagnet ? 18 : 10,
        onDrawEnd: () => {
          window.setTimeout(() => {
            try {
              chart.createOverlay({
                name: "segment",
                groupId: "practice-user",
                mode: strongMagnet ? "strong_magnet" : "weak_magnet",
                modeSensitivity: strongMagnet ? 18 : 10,
                onDrawEnd: () => {
                  setActiveTool(null);
                  setMessage("Triángulo manual listo. Puedes arrastrar los cuatro extremos para ajustar las directrices.");
                  return false;
                },
              });
            } catch {}
          }, 120);
          return false;
        },
      });
      setActiveTool("Triángulo · 2 directrices");
      setMessage("Triángulo: marca primero dos pivotes de la directriz superior; luego dos pivotes de la inferior. El imán ayuda a enganchar los swings.");
    } catch {}
  }

  function drawingKey() {
    return `explodex:practice-drawings:${symbol}:${interval}`;
  }

  function saveDrawings() {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      const rows = (chart.getOverlays({ groupId: "practice-user" }) ?? []).map((item: any) => ({
        name: item.name,
        points: item.points,
        groupId: "practice-user",
        mode: item.mode || "weak_magnet",
      }));
      window.localStorage.setItem(drawingKey(), JSON.stringify(rows));
      setMessage(`${rows.length} dibujo(s) guardados para ${symbol} ${interval}.`);
    } catch {
      setMessage("No pude guardar los dibujos.");
    }
  }

  function restoreDrawings(showMessage = true) {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      chart.removeOverlay({ groupId: "practice-user" });
      const raw = window.localStorage.getItem(drawingKey());
      const rows = raw ? JSON.parse(raw) : [];
      for (const row of Array.isArray(rows) ? rows : []) {
        if (!row?.name || !Array.isArray(row.points)) continue;
        chart.createOverlay({
          name: row.name,
          points: row.points,
          groupId: "practice-user",
          mode: row.mode || "weak_magnet",
        });
      }
      if (showMessage) setMessage(`${rows.length || 0} dibujo(s) restaurados.`);
    } catch {
      if (showMessage) setMessage("No pude restaurar los dibujos.");
    }
  }

  function clearDrawings() {
    try { chartRef.current?.removeOverlay({ groupId: "practice-user" }); } catch {}
    window.localStorage.removeItem(drawingKey());
    setMessage("Dibujos borrados para esta moneda y temporalidad.");
  }

  const riskPreview = useMemo(() => {
    const margin = Number(form.margin || 0);
    const leverage = Number(form.leverage || 0);
    const stop = Number(form.stop || 0);
    const target = Number(form.tp1 || 0);
    const entry = form.orderType === "LIMIT" ? Number(form.limitPrice || 0) : livePrice;
    if (!(entry > 0 && margin > 0 && leverage > 0 && stop > 0)) return null;
    const notional = margin * leverage;
    const qty = notional / entry;
    const risk = Math.abs(entry - stop) * qty;
    const reward = target > 0 ? Math.abs(target - entry) * qty : 0;
    const equity = Number(summary?.equity || 1000);
    const maintenance = 0.005;
    const liquidation = form.side === "LONG"
      ? Math.max(0, entry * (1 - 1 / leverage + maintenance))
      : entry * (1 + 1 / leverage - maintenance);
    return {
      entry,
      notional,
      qty,
      risk,
      reward,
      rr: risk > 0 ? reward / risk : 0,
      riskPct: equity > 0 ? risk / equity * 100 : 0,
      liquidation,
    };
  }, [form.margin, form.leverage, form.stop, form.tp1, form.orderType, form.limitPrice, form.side, livePrice, summary?.equity]);

  function buildPlanForSide(side: Side) {
    const entry = form.orderType === "LIMIT" && Number(form.limitPrice) > 0 ? Number(form.limitPrice) : livePrice;
    if (!(entry > 0)) return null;

    const rawStop = Number(form.stop || 0);
    const rawTp1 = Number(form.tp1 || 0);
    const rawTp2 = Number(form.tp2 || 0);
    const rawTp3 = Number(form.tp3 || 0);
    const valid = side === "LONG"
      ? rawStop > 0 && rawStop < entry && rawTp1 > entry
      : rawStop > entry && rawTp1 > 0 && rawTp1 < entry;

    if (valid) {
      return {
        entry,
        stop: rawStop,
        tp1: rawTp1,
        tp2: rawTp2 > 0 ? rawTp2 : rawTp1,
        tp3: rawTp3 > 0 ? rawTp3 : (rawTp2 > 0 ? rawTp2 : rawTp1),
        auto: false,
      };
    }

    const stop = side === "LONG" ? entry * .99 : entry * 1.01;
    const risk = Math.abs(entry - stop);
    return {
      entry,
      stop,
      tp1: side === "LONG" ? entry + risk * 1.5 : entry - risk * 1.5,
      tp2: side === "LONG" ? entry + risk * 2 : entry - risk * 2,
      tp3: side === "LONG" ? entry + risk * 3 : entry - risk * 3,
      auto: true,
    };
  }

  async function openTrade(sideOverride?: Side) {
    if (!BASE_URL || !sid) return;
    const side = sideOverride ?? form.side;
    const plan = buildPlanForSide(side);
    if (!plan) {
      setMessage("Todavía no hay precio de mercado para abrir la práctica.");
      return;
    }

    setForm(x => ({
      ...x,
      side,
      stop: String(Number(plan.stop.toPrecision(10))),
      tp1: String(Number(plan.tp1.toPrecision(10))),
      tp2: String(Number(plan.tp2.toPrecision(10))),
      tp3: String(Number(plan.tp3.toPrecision(10))),
    }));
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          symbol,
          side,
          order_type: form.orderType,
          limit_price: form.orderType === "LIMIT" ? Number(form.limitPrice) : null,
          margin: Number(form.margin),
          leverage: Number(form.leverage),
          stop_loss: plan.stop,
          take_profit: plan.tp1,
          tp2: plan.tp2,
          tp3: plan.tp3,
          timeframe: interval,
          pattern: form.pattern,
          note: form.note || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo abrir");
      if (payload.order_id) {
        setMessage(`LIMIT ${payload.side} colocada a ${fmt(payload.limit_price)} · margen ficticio reservado.`);
      } else {
        const warning = Array.isArray(payload.warnings) && payload.warnings.length
          ? " · Ojo: revisa riesgo, apalancamiento o liquidación."
          : "";
        setMessage(`Demo ${payload.side} abierta a ${fmt(payload.entry_price)}${plan.auto ? " · SL/TP automático aplicado." : ""}${warning}`);
      }
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo abrir la operación demo.");
    } finally {
      setBusy(false);
    }
  }

  function setExamplePlan(side: Side = form.side) {
    if (!(livePrice > 0)) return;
    const entry = form.orderType === "LIMIT" && Number(form.limitPrice) > 0 ? Number(form.limitPrice) : livePrice;
    const stop = side === "LONG" ? entry * .99 : entry * 1.01;
    const risk = Math.abs(entry - stop);
    const tp1 = side === "LONG" ? entry + risk * 1.5 : entry - risk * 1.5;
    const tp2 = side === "LONG" ? entry + risk * 2 : entry - risk * 2;
    const tp3 = side === "LONG" ? entry + risk * 3 : entry - risk * 3;
    setForm(x => ({
      ...x,
      side,
      stop: String(Number(stop.toPrecision(10))),
      tp1: String(Number(tp1.toPrecision(10))),
      tp2: String(Number(tp2.toPrecision(10))),
      tp3: String(Number(tp3.toPrecision(10))),
    }));
  }

  function setMarginFromPct(pct: number) {
    if (!summary) {
      setMessage("La cuenta ficticia todavía está conectando. Espera un momento y vuelve a mover el porcentaje.");
      return;
    }
    const available = Math.max(0, Number(summary.available_margin || 0));
    const margin = available * pct / 100;
    setMarginPct(pct);
    setForm(x => ({ ...x, margin: margin > 0 ? String(Number(margin.toFixed(2))) : "0" }));
  }

  async function moveToBreakEven(id: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/${id}/break-even`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo mover a BE");
      setMessage(`Stop movido a break-even: ${fmt(payload.stop_loss)}.`);
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo mover a BE.");
    } finally {
      setBusy(false);
    }
  }

  async function partialClose(id: number, fraction: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/${id}/partial-close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, fraction }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo cerrar parcial");
      setMessage(`Cierre parcial ${Math.round(fraction * 100)}% · PnL neto ${money(payload.net_pnl)}.`);
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar parcial.");
    } finally {
      setBusy(false);
    }
  }

  async function applyFormLevels(id: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/${id}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          stop_loss: form.stop ? Number(form.stop) : null,
          take_profit: form.tp1 ? Number(form.tp1) : null,
          tp2: form.tp2 ? Number(form.tp2) : null,
          tp3: form.tp3 ? Number(form.tp3) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudieron actualizar niveles");
      setMessage("SL/TP de la posición actualizados desde el formulario.");
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar niveles.");
    } finally {
      setBusy(false);
    }
  }


  // A level is committed once on mouse release, never on every mouse move.
  async function commitDraggedLevel(p: PracticePosition, kind: "SL"|"TP1"|"TP2"|"TP3", price: number) {
    if (busy || !sid || !Number.isFinite(price) || price <= 0) return;
    const valid = kind === "SL"
      ? (p.side === "LONG" ? price < p.entry_price : price > p.entry_price)
      : (p.side === "LONG" ? price > p.entry_price : price < p.entry_price);
    if (!valid) {
      setMessage(`${kind} inválido: debe estar del lado correcto de la entrada ${fmt(p.entry_price)}.`);
      levelSignatureRef.current = "";
      await loadPractice();
      return;
    }
    setBusy(true);
    setMessage(`Guardando ${kind} de ${p.symbol}…`);
    try {
      const levels = {
        stop_loss: kind === "SL" ? price : p.stop_loss,
        take_profit: kind === "TP1" ? price : p.take_profit,
        tp2: kind === "TP2" ? price : (p.tp2 ?? p.take_profit),
        tp3: kind === "TP3" ? price : (p.tp3 ?? p.tp2 ?? p.take_profit),
      };
      const response = await fetch(`${BASE_URL}/api/v1/practice/${p.id}/modify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, ...levels }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.detail || "No se pudo guardar el nivel.");
      setMessage(`${kind} de ${p.symbol} actualizado a ${fmt(price)}.`);
      levelSignatureRef.current = "";
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo modificar el nivel.");
      levelSignatureRef.current = "";
      await loadPractice();
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;
    const positions = (summary?.open_positions ?? []).filter(p => p.symbol === symbol);
    const signature = symbol + ":" + interval + "|" + positions.map(p =>
      [p.id,p.entry_price,p.stop_loss,p.take_profit,p.tp2,p.tp3].join(":")).join("|");
    if (levelSignatureRef.current === signature) return;
    levelSignatureRef.current = signature;
    try { chart.removeOverlay({ groupId: "practice-managed" }); } catch {}
    const timestamp = Number(barsRef.current.at(-1)?.timestamp || Date.now());
    for (const p of positions) {
      const levels: Array<{kind:"ENTRY"|"SL"|"TP1"|"TP2"|"TP3";price:number}> = [
        {kind:"ENTRY",price:p.entry_price}, {kind:"SL",price:p.stop_loss},
        {kind:"TP1",price:p.take_profit},
        ...(p.tp2 ? [{kind:"TP2" as const,price:p.tp2}] : []),
        ...(p.tp3 ? [{kind:"TP3" as const,price:p.tp3}] : []),
      ];
      for (const {kind,price} of levels) {
        if (!(Number(price) > 0)) continue;
        try {
          chart.createOverlay({
            name: "EXPLODEX_MANAGED_LEVEL", groupId: "practice-managed",
            lock: kind === "ENTRY", zLevel: 10, mode: "normal",
            points: [{timestamp,value:price}],
            extendData: {kind,label:`${p.side} #${p.id} ${kind}`},
            onRightClick: (event:any) => { event?.preventDefault?.(); return true; },
            onPressedMoveEnd: (event:any) => {
              if (kind === "ENTRY") return true;
              const value = Number(event?.overlay?.points?.[0]?.value);
              if (Number.isFinite(value)) void commitDraggedLevel(p,kind,value);
              return false;
            },
          });
        } catch {}
      }
    }
  }, [summary?.open_positions, symbol, interval, chartReady, sid]);

  const roiPlanner = useMemo(() => {
    const entry = form.orderType === "LIMIT" ? Number(form.limitPrice) : livePrice;
    const leverage = Number(form.leverage);
    const margin = Number(form.margin);
    const roi = Number(targetRoi);
    const fee = Number(feePerSide) / 100;
    if (!(entry > 0 && leverage > 0 && margin > 0 && roi > 0 && fee >= 0 && fee < 1)) return null;
    // Solve entry and exit fees to target a NET return on initial margin.
    const longTp = (entry * (1 + fee) + entry * roi / (100 * leverage)) / (1 - fee);
    const shortTp = (entry * (1 - fee) - entry * roi / (100 * leverage)) / (1 + fee);
    return {entry,longTp,shortTp,longMove:(longTp/entry-1)*100,shortMove:(1-shortTp/entry)*100};
  }, [form.orderType,form.limitPrice,form.leverage,form.margin,targetRoi,feePerSide,livePrice]);

  function applyRoiTarget(side: Side) {
    if (!roiPlanner) return;
    const target = side === "LONG" ? roiPlanner.longTp : roiPlanner.shortTp;
    if (!(target > 0)) { setMessage("TP inválido: reduce el ROI o el apalancamiento."); return; }
    const entry = roiPlanner.entry;
    const delta = target - entry;
    const stop = Number(form.stop);
    const correctStop = stop > 0 && (side === "LONG" ? stop < entry : stop > entry);
    setShowTpSl(true);
    setForm(x => ({
      ...x,side,
      stop: correctStop ? x.stop : String(Number((entry - delta / 2).toPrecision(10))),
      tp1: String(Number(target.toPrecision(10))),
      tp2: String(Number((entry + delta * 1.5).toPrecision(10))),
      tp3: String(Number((entry + delta * 2).toPrecision(10))),
    }));
    setMessage(`TP1 ${side} para ROI neto estimado ${targetRoi}%: ${fmt(target)}. Revisa SL, comisión y liquidación.`);
  }

  async function cancelOrder(id: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/orders/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo cancelar");
      setMessage("Orden LIMIT demo cancelada.");
      await syncPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cancelar la orden.");
    } finally {
      setBusy(false);
    }
  }

  async function closeTrade(id: number) {
    if (!BASE_URL || !sid) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid, reason: "USER_CLOSE" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.detail || "No se pudo cerrar");
      setMessage(`Operación cerrada. PnL neto ${money(payload.net_pnl)}.`);
      await loadPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar.");
    } finally {
      setBusy(false);
    }
  }

  async function resetAccount() {
    if (!BASE_URL || !sid || !window.confirm("¿Reiniciar tu cuenta de práctica a 1,000 USDT y borrar su historial?")) return;
    setBusy(true);
    try {
      const response = await fetch(`${BASE_URL}/api/v1/practice/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!response.ok) throw new Error("No se pudo reiniciar");
      window.localStorage.removeItem(journalKey());
      closedCountRef.current = -1;
      setHistory([]); setJournalCount(0);
      setMessage("Cuenta de práctica reiniciada a 1,000 USDT.");
      await loadPractice();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reiniciar.");
    } finally {
      setBusy(false);
    }
  }

  const selectedOpen = (summary?.open_positions ?? []).filter((p) => p.symbol === symbol);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#050b14] shadow-2xl shadow-black/30">
      {/* Market header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-[#08111d]/95 px-2.5 py-2">
        <form
          className="flex min-w-[220px] flex-1 items-center gap-1.5 lg:max-w-[360px]"
          onSubmit={(event) => {
            event.preventDefault();
            const next = normalizeSymbol(symbolInput);
            setSymbolInput(next);
            setSymbol(next);
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700/70 bg-[#030812] px-3 py-2">
            <Search size={14} className="shrink-0 text-slate-500"/>
            <input
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-xs font-black uppercase text-white outline-none"
              placeholder="BTCUSDT"
            />
          </label>
          <button className="rounded-lg bg-cyan-400 px-3 py-2 text-[10px] font-black text-slate-950 hover:bg-cyan-300">IR</button>
        </form>

        <div className="hidden items-center gap-1 overflow-x-auto xl:flex">
          {QUICK_SYMBOLS.map((pair) => (
            <button
              key={pair}
              onClick={() => { setSymbolInput(pair); setSymbol(pair); }}
              className={`rounded-md border px-2 py-1.5 text-[9px] font-black transition ${
                symbol === pair
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-slate-800 bg-slate-950/30 text-slate-600 hover:text-slate-300"
              }`}
            >
              {pair.replace("USDT","")}
            </button>
          ))}
        </div>

        <div className="order-3 flex w-full gap-1 overflow-x-auto lg:order-none lg:w-auto">
          {INTERVALS.map((value) => (
            <button
              key={value}
              onClick={() => setIntervalValue(value)}
              className={`shrink-0 rounded-lg border px-2.5 py-2 text-[10px] font-black transition ${
                interval === value
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200 shadow-sm shadow-cyan-500/10"
                  : "border-slate-800 bg-slate-950/50 text-slate-500 hover:text-slate-200"
              }`}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden text-right md:block">
            <div className="text-[8px] font-black uppercase tracking-[.14em] text-slate-600">Equity demo</div>
            <div className="font-mono text-sm font-black text-white">{money(summary?.equity ?? 1000)}</div>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-[8px] font-black uppercase tracking-[.14em] text-slate-600">Disponible</div>
            <div className="font-mono text-sm font-black text-cyan-200">{money(summary?.available_margin ?? 1000)}</div>
          </div>
          <div className="border-l border-slate-800 pl-4 text-right">
            <div className="font-mono text-xl font-black tracking-tight text-white">{fmt(livePrice)}</div>
            <div className="flex items-center justify-end gap-1 text-[8px] font-black uppercase tracking-[.14em] text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"/> {symbol} LIVE
            </div>
          </div>
        </div>
      </div>

      {/* Main trading desk */}
      <div className="grid min-h-[680px] lg:grid-cols-[58px_minmax(0,1fr)_330px] 2xl:grid-cols-[64px_minmax(0,1fr)_360px]">
        {/* Compact drawing toolbar */}
        <aside className="flex flex-row gap-1 overflow-x-auto border-b border-slate-800 bg-[#060d17] p-2 lg:flex-col lg:items-center lg:overflow-visible lg:border-b-0 lg:border-r">
          <DeskTool icon={<MousePointer2 size={17}/>} label="Cursor / mover gráfico" onClick={() => { setActiveTool(null); setMessage("Cursor activo: arrastra el gráfico, usa la rueda para zoom y selecciona una herramienta cuando quieras dibujar."); }} active={!activeTool}/>
          <DeskTool icon={<Magnet size={17}/>} label={strongMagnet ? "Imán fuerte ON" : "Imán suave"} onClick={() => { setStrongMagnet(v => !v); setMessage(strongMagnet ? "Imán cambiado a suave." : "Imán fuerte activado: las herramientas buscarán máximos/mínimos de las velas."); }} active={strongMagnet}/>
          <DeskSeparator/>
          <DeskTool icon={<LineChart size={17}/>} label="Línea de tendencia" onClick={() => draw("segment")} active={activeTool === "Línea de tendencia"}/>
          <DeskTool icon={<TrendingUp size={17}/>} label="Rayo de tendencia" onClick={() => draw("rayLine")} active={activeTool === "Rayo de tendencia"}/>
          <DeskTool icon={<Minus size={17}/>} label="Soporte / resistencia" onClick={() => draw("horizontalStraightLine")} active={activeTool === "Soporte / resistencia"}/>
          <DeskTool icon={<Triangle size={17}/>} label="Triángulo" onClick={drawTriangle} active={activeTool === "Triángulo · 2 directrices"}/>
          <DeskSeparator/>
          <DeskTool icon={<Activity size={16}/>} label="Fibonacci retroceso" onClick={() => draw("fibonacciLine")}/>
          <DeskTool icon={<Layers3 size={16}/>} label="Fibonacci extensión" onClick={() => draw("EXPLODEX_FIB_EXTENSION")}/>
          <DeskTool icon={<Layers3 size={16}/>} label="Canal paralelo" onClick={() => draw("parallelStraightLine")}/>
          <DeskTool icon={<Target size={16}/>} label="Medir %" onClick={() => draw("EXPLODEX_MEASURE")}/>
          <DeskSeparator/>
          <DeskTool icon={<TrendingUp size={16}/>} label="Long Position" onClick={() => draw("EXPLODEX_LONG_POSITION")}/>
          <DeskTool icon={<TrendingDown size={16}/>} label="Short Position" onClick={() => draw("EXPLODEX_SHORT_POSITION")}/>
          <DeskTool icon={<Activity size={16}/>} label="ABCD" onClick={() => draw("EXPLODEX_ABCD")}/>
          <DeskTool icon={<Activity size={16}/>} label="XABCD / armónico" onClick={() => draw("EXPLODEX_XABCD")}/>
          <DeskTool icon={<Activity size={16}/>} label="HCH / neckline" onClick={() => draw("EXPLODEX_HCH")}/>
          <DeskTool icon={<Brush size={16}/>} label="Dibujo libre" onClick={() => draw("brush")}/>
          <DeskSeparator/>
          <DeskTool icon={<Save size={16}/>} label="Guardar dibujos" onClick={saveDrawings}/>
          <DeskTool icon={<RefreshCcw size={16}/>} label="Cargar dibujos" onClick={() => restoreDrawings(true)}/>
          <DeskTool icon={<Eraser size={16}/>} label="Borrar dibujos" onClick={clearDrawings} danger/>
        </aside>

        {/* Chart */}
        <section className="min-w-0 bg-[#050b14]">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/80 bg-[#07101a] px-2 py-1.5">
            <button onClick={() => {
              const rows = barsRef.current.slice(-220);
              if (rows.length < 65) { setMessage("Carga al menos 65 velas antes de iniciar Replay."); return; }
              setReplaySnapshot(rows.map(row => ({
                timestamp:Number(row.timestamp),open:Number(row.open),high:Number(row.high),
                low:Number(row.low),close:Number(row.close),volume:Number(row.volume)
              })));
            }} title="Practicar sin base de datos con hasta 220 velas ya cargadas" className="mr-1 shrink-0 rounded-lg border border-cyan-400/25 bg-cyan-400/[.05] px-2 py-1 text-[9px] font-black text-cyan-200">▶ REPLAY LOCAL</button>
            <span className="mr-1 shrink-0 text-[8px] font-black uppercase tracking-[.15em] text-slate-500">Indicadores</span>
            {(["principal","momentum","riesgo"] as const).map(group => (
              <button key={group} onClick={()=>setIndicatorCategory(group)}
                className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${indicatorCategory === group ? "bg-cyan-400/15 text-cyan-200" : "text-slate-600 hover:text-slate-300"}`}>
                {group==="principal"?"Precio":group==="momentum"?"Osciladores":"Riesgo"} 
              </button>
            ))}
            <span className="mx-1 h-4 shrink-0 border-l border-slate-800"/>
            {INDICATORS.filter(name => indicatorCategory === "principal"
              ? ["EMA20/50/200","VWAP","VOL","BOLL"].includes(name)
              : indicatorCategory === "momentum"
                ? ["RSI","MACD","KDJ","CCI","DMI","OBV"].includes(name)
                : ["ATR","SAR"].includes(name)).map((name) => (
              <button
                key={name}
                onClick={() => toggleIndicator(name)}
                title={name === "EMA20/50/200" ? INDICATOR_HELP.EMA : name === "RSI" ? INDICATOR_HELP.RSI : name === "MACD" ? INDICATOR_HELP.MACD : name === "VOL" ? INDICATOR_HELP.VOLUME : name === "ATR" ? INDICATOR_HELP.ATR : name === "BOLL" ? INDICATOR_HELP.BOLL : name}
                className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-black transition ${
                  indicatorSet.has(name)
                    ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
                    : "border-slate-800 bg-slate-950/30 text-slate-600 hover:text-slate-300"
                }`}
              >
                {name}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 text-[9px]">
              <button onClick={() => setShowExplain(v => !v)} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-black ${showExplain ? "border-cyan-400/25 bg-cyan-400/[.06] text-cyan-200" : "border-slate-800 text-slate-600"}`}><HelpCircle size={11}/> Explicar</button>
              <span className="hidden rounded-md border border-slate-800 px-2 py-1 text-slate-600 lg:inline">Rueda = zoom · arrastra = mover</span>
            </div>
          </div>

          {activeTool && <div className="flex items-center justify-between gap-2 border-b border-cyan-400/15 bg-cyan-400/[.04] px-3 py-2 text-[10px] text-cyan-100"><span><b>{activeTool}</b> activa · {strongMagnet ? "imán fuerte" : "imán suave"} · marca los puntos directamente sobre las velas</span><button onClick={() => setActiveTool(null)} className="rounded-md border border-cyan-400/20 px-2 py-1 text-[9px] font-black">Cursor</button></div>}

          <PrecisionAssistant
            scan={precisionScan}
            aiDirection={aiDirection}
            analyzing={analyzingAll}
            askingAi={askingAi}
            showExplain={showExplain}
            onAnalyze={analyzeEverything}
            onAskAi={askAiDirection}
            onToggleExplain={() => setShowExplain(v => !v)}
            onDraw={() => drawPrecisionPattern(precisionScan?.current ?? null)}
            onDrawLong={() => draw("EXPLODEX_LONG_POSITION")}
            onDrawShort={() => draw("EXPLODEX_SHORT_POSITION")}
          />

          <div className="relative">
            {!chartReady && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[#050b14]/80 backdrop-blur-sm">
                <div className="rounded-xl border border-cyan-400/20 bg-slate-950/90 px-4 py-3 text-xs font-bold text-cyan-200">Cargando gráfico…</div>
              </div>
            )}
            <div ref={chartElRef} className="h-[600px] min-h-[520px] w-full bg-[#050b14] xl:h-[640px] 2xl:h-[720px]"/>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 bg-[#07101a] px-3 py-1.5 text-[9px] text-slate-600">
            <div className="flex gap-3">
              <span>{symbol}</span>
              <span>{interval.toUpperCase()}</span>
              <span className="text-emerald-400">● mercado vivo</span>
            </div>
            <div className="flex gap-3">
              <span>PAPER ONLY</span>
              <span>SL/TP arrastrables · diario con copia local</span>
            </div>
          </div>
        </section>

        {/* Futures-style order ticket */}
        <aside className="border-t border-slate-800 bg-[#090d12] lg:border-l lg:border-t-0">
          <div className="border-b border-slate-800/80 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.14em] text-slate-500"><span>Futuros demo · PAPER</span><span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.05] px-2 py-0.5 text-[8px] text-emerald-300">Saldo inicial $1,000</span></div>
                <div className="mt-1 flex items-center gap-2 text-sm font-black text-white">
                  {symbol}
                  <span className="rounded-md border border-slate-700 bg-slate-950/70 px-1.5 py-0.5 text-[8px] text-slate-400">{interval.toUpperCase()}</span>
                </div>
              </div>
              <button onClick={() => setShowOrder(v => !v)} className="rounded-lg border border-slate-800 p-2 text-slate-500 hover:text-white">
                <ChevronDown size={14} className={showOrder ? "rotate-180" : ""}/>
              </button>
            </div>
          </div>

          {showOrder && <div className="max-h-[740px] overflow-y-auto">
            <div className="border-b border-slate-800/80 p-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center justify-between rounded-xl bg-[#171b20] px-3 py-2.5">
                  <span className="text-[10px] font-black text-slate-200">Aislado</span>
                  <span className="text-[9px] text-slate-600">PAPER</span>
                </div>
                <label className="flex min-w-[105px] items-center gap-1 rounded-xl bg-[#171b20] px-3 py-2.5">
                  <input
                    value={form.leverage}
                    onChange={(e) => setForm(x => ({...x, leverage:String(Math.max(1,Math.min(20,Number(e.target.value)||1)))}))}
                    inputMode="numeric"
                    className="w-10 bg-transparent text-right font-mono text-xs font-black text-cyan-300 outline-none"
                  />
                  <span className="text-xs font-black text-cyan-300">x</span>
                  <span className="ml-auto text-[8px] text-slate-600">1–20x</span>
                </label>
              </div>
            </div>

            <div className="border-b border-slate-800/80 px-3 pt-3">
              <div className="grid grid-cols-2">
                {(["MARKET","LIMIT"] as const).map(kind => (
                  <button
                    key={kind}
                    onClick={() => setForm(x => ({...x, orderType:kind, limitPrice:kind === "MARKET" ? "" : (x.limitPrice || String(Number(livePrice.toPrecision(10))))}))}
                    className={`border-b-2 px-2 pb-2.5 text-[11px] font-black transition ${
                      form.orderType === kind ? "border-cyan-300 text-white" : "border-transparent text-slate-600"
                    }`}
                  >{kind === "MARKET" ? "Mercado" : "Límite"}</button>
                ))}
              </div>
            </div>

            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-600">Disponible</span>
                <b className="font-mono text-slate-200">{summary ? `${money(summary.available_margin).replace("$","")} USDT` : "Conectando…"}</b>
              </div>

              {form.orderType === "LIMIT" && (
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-bold text-slate-500">Precio</span>
                  <div className="flex items-center rounded-xl bg-[#171b20] px-3 py-3">
                    <input value={form.limitPrice} onChange={(e)=>setForm(x=>({...x,limitPrice:e.target.value}))} inputMode="decimal" className="min-w-0 flex-1 bg-transparent font-mono text-sm font-black text-white outline-none"/>
                    <span className="text-[10px] font-bold text-slate-500">USDT</span>
                  </div>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[9px] font-bold text-slate-500">Cantidad / margen</span>
                <div className="flex items-center rounded-xl bg-[#171b20] px-3 py-3">
                  <input
                    value={form.margin}
                    onChange={(e)=>{setMarginPct(0);setForm(x=>({...x,margin:e.target.value}))}}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm font-black text-white outline-none"
                  />
                  <span className="text-[10px] font-bold text-slate-500">USDT</span>
                </div>
              </label>

              <div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={marginPct}
                  onChange={(e)=>setMarginFromPct(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
                <div className="mt-1 flex justify-between">
                  {[0,25,50,75,100].map(pct => (
                    <button key={pct} onClick={()=>setMarginFromPct(pct)} className={`text-[9px] font-bold ${marginPct===pct?"text-cyan-300":"text-slate-600 hover:text-slate-300"}`}>{pct}%</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-[#0d1117] p-2.5">
                <div>
                  <div className="text-[8px] uppercase tracking-[.1em] text-slate-600">Valor posición</div>
                  <div className="mt-1 font-mono text-[11px] font-black text-white">{money(Number(form.margin||0)*Number(form.leverage||1))}</div>
                </div>
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-[.1em] text-slate-600">Precio mercado</div>
                  <div className="mt-1 font-mono text-[11px] font-black text-white">{fmt(livePrice)}</div>
                </div>
              </div>

              <button
                onClick={()=>setShowTpSl(v=>!v)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#0d1117] px-3 py-2.5 text-left"
              >
                <span className="flex items-center gap-2 text-[10px] font-black text-slate-300">
                  <span className={`grid h-4 w-4 place-items-center rounded border ${showTpSl?"border-cyan-400 bg-cyan-400 text-slate-950":"border-slate-600"}`}>{showTpSl?"✓":""}</span>
                  TP / SL
                </span>
                <span className="text-[8px] text-slate-600">{showTpSl ? "Manual" : "Auto al abrir"}</span>
              </button>

              {showTpSl && <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-[#0d1117] p-2">
                <TradeInput label="Stop Loss" value={form.stop} onChange={(v)=>setForm(x=>({...x,stop:v}))}/>
                <TradeInput label="TP1" value={form.tp1} onChange={(v)=>setForm(x=>({...x,tp1:v}))}/>
                <TradeInput label="TP2" value={form.tp2} onChange={(v)=>setForm(x=>({...x,tp2:v}))}/>
                <TradeInput label="TP3" value={form.tp3} onChange={(v)=>setForm(x=>({...x,tp3:v}))}/>
                <button onClick={()=>setExamplePlan("LONG")} className="rounded-lg border border-emerald-400/15 px-2 py-2 text-[8px] font-black text-emerald-300">Plan LONG auto</button>
                <button onClick={()=>setExamplePlan("SHORT")} className="rounded-lg border border-rose-400/15 px-2 py-2 text-[8px] font-black text-rose-300">Plan SHORT auto</button>
              </div>}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={()=>openTrade("LONG")}
                  disabled={busy || !(Number(form.margin)>0)}
                  className="rounded-2xl bg-emerald-400 px-3 py-4 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-300 disabled:opacity-35"
                >
                  Abrir Largo
                </button>
                <button
                  onClick={()=>openTrade("SHORT")}
                  disabled={busy || !(Number(form.margin)>0)}
                  className="rounded-2xl bg-rose-500 px-3 py-4 text-sm font-black text-white shadow-lg shadow-rose-500/10 transition hover:bg-rose-400 disabled:opacity-35"
                >
                  Abrir Corto
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[9px]">
                <div className="rounded-lg border border-slate-800 px-2 py-2">
                  <span className="text-slate-600">Coste</span>
                  <b className="float-right font-mono text-slate-300">{money(Number(form.margin||0))}</b>
                </div>
                <div className="rounded-lg border border-slate-800 px-2 py-2">
                  <span className="text-slate-600">Máximo</span>
                  <b className="float-right font-mono text-slate-300">{money(summary?.available_margin ?? 0)}</b>
                </div>
              </div>

              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[.035] p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black text-cyan-200">
                  <span>Calculadora de TP por ROI</span><span className="text-[8px] text-slate-500">Estimación · PAPER</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TradeInput label="ROI objetivo (%)" value={targetRoi} onChange={setTargetRoi}/>
                  <TradeInput label="Comisión por lado (%)" value={feePerSide} onChange={setFeePerSide}/>
                </div>
                {roiPlanner && <div className="mt-2 space-y-2 text-[9px] text-slate-400">
                  <div>Movimiento LONG: <b className="font-mono text-white">{roiPlanner.longMove.toFixed(3)}%</b> · SHORT: <b className="font-mono text-white">{roiPlanner.shortMove.toFixed(3)}%</b></div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={()=>applyRoiTarget("LONG")} className="rounded-lg border border-emerald-400/25 bg-emerald-400/[.08] px-2 py-2 font-black text-emerald-300">TP LONG {fmt(roiPlanner.longTp)}</button>
                    <button disabled={roiPlanner.shortTp<=0} onClick={()=>applyRoiTarget("SHORT")} className="rounded-lg border border-rose-400/25 bg-rose-400/[.08] px-2 py-2 font-black text-rose-300 disabled:opacity-30">TP SHORT {fmt(roiPlanner.shortTp)}</button>
                  </div>
                  <p className="leading-4 text-slate-600">Incluye comisiones estimadas de entrada y salida; no incluye funding, spread ni deslizamiento.</p>
                </div>}
              </div>

              {riskPreview && <div className="grid grid-cols-3 gap-1">
                <CompactMetric label="Riesgo SL" value={money(riskPreview.risk)} tone="bad"/>
                <CompactMetric label="% equity" value={`${riskPreview.riskPct.toFixed(2)}%`} tone={riskPreview.riskPct>.5?"warn":undefined}/>
                <CompactMetric label="R:R" value={riskPreview.rr>0?`1:${riskPreview.rr.toFixed(2)}`:"Auto"}/>
              </div>}

              <div className="text-center text-[8px] leading-4 text-slate-700">
                Dinero ficticio · no envía órdenes a Binance · máximo 20x en práctica.
              </div>
            </div>
          </div>}
        </aside>
      </div>

      {/* Positions / orders / journal dock */}
      <section className="border-t border-slate-800/80 bg-[#060d17]">
        <div className="flex items-center gap-1 border-b border-slate-800/80 px-2 py-1.5">
          <DockTab active={bottomTab === "positions"} label={`Posiciones (${summary?.open_positions?.length ?? 0})`} onClick={() => setBottomTab("positions")}/>
          <DockTab active={bottomTab === "orders"} label={`LIMIT (${summary?.pending_orders?.length ?? 0})`} onClick={() => setBottomTab("orders")}/>
          <DockTab active={bottomTab === "history"} label={`Historial (${history.length})`} onClick={() => setBottomTab("history")}/>
          <DockTab active={bottomTab === "stats"} label="Estadísticas · Coach" onClick={() => setBottomTab("stats")}/>
          <button onClick={exportJournal} className="ml-auto rounded-lg border border-slate-700 px-2 py-1 text-[9px] font-bold text-cyan-200 hover:border-cyan-400/40">Exportar CSV ({journalCount})</button>
          <div className="hidden gap-4 pr-2 text-[9px] text-slate-600 md:flex">
            <span>WR {summary?.win_rate_pct == null ? "—" : `${summary.win_rate_pct}%`}</span>
            <span>Realizado {money(summary?.realized_pnl ?? 0)}</span>
            <button onClick={resetAccount} disabled={busy} className="font-bold text-rose-400 hover:text-rose-300"><RotateCcw size={11} className="mr-1 inline"/>Reset $1,000</button>
          </div>
        </div>

        <div className="max-h-[290px] min-h-[145px] overflow-auto p-2">
          {bottomTab === "positions" && (
            <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
              {(summary?.open_positions ?? []).map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-800 bg-[#040a12] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${p.side === "LONG" ? "text-emerald-300" : "text-rose-300"}`}>{p.side}</span>
                        <span className="text-xs font-black text-white">{p.symbol}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[8px] font-black text-slate-400">{p.leverage}x</span>
                      </div>
                      <div className="mt-1 text-[8px] uppercase tracking-wide text-slate-600">{p.pattern || "MANUAL"} · {p.timeframe || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-sm font-black ${p.unrealized_pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{money(p.unrealized_pnl)}</div>
                      <div className="text-[8px] text-slate-500">{p.roi_on_margin_pct >= 0 ? "+" : ""}{p.roi_on_margin_pct.toFixed(2)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    <Tiny label="Entrada" value={fmt(p.entry_price)}/>
                    <Tiny label="Mark" value={fmt(p.mark_price)}/>
                    <Tiny label="SL" value={fmt(p.stop_loss)} tone="bad"/>
                    <Tiny label="TP1" value={fmt(p.take_profit)} tone="good"/>
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1">
                    <ActionButton label="BE" onClick={() => moveToBreakEven(p.id)} disabled={busy || p.moved_to_be}/>
                    <ActionButton label="25%" onClick={() => partialClose(p.id,.25)} disabled={busy}/>
                    <ActionButton label="50%" onClick={() => partialClose(p.id,.5)} disabled={busy}/>
                    <ActionButton label="SL/TP" onClick={() => applyFormLevels(p.id)} disabled={busy || !form.stop || !form.tp1}/>
                    <ActionButton label="Cerrar" onClick={() => closeTrade(p.id)} disabled={busy} danger/>
                  </div>
                </div>
              ))}
              {!summary?.open_positions?.length && <EmptyDock text="No tienes posiciones demo abiertas."/>}
            </div>
          )}

          {bottomTab === "orders" && (
            <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
              {(summary?.pending_orders ?? []).map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-800 bg-[#040a12] p-3">
                  <div className="flex justify-between gap-3">
                    <div><span className={o.side === "LONG" ? "text-emerald-300" : "text-rose-300"}>{o.side}</span> <b className="text-white">{o.symbol}</b> <span className="text-[9px] text-slate-600">{o.leverage}x</span></div>
                    <button onClick={() => cancelOrder(o.id)} disabled={busy} className="text-[9px] font-black text-rose-300">Cancelar</button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    <Tiny label="LIMIT" value={fmt(o.limit_price)}/>
                    <Tiny label="SL" value={fmt(o.stop_loss)} tone="bad"/>
                    <Tiny label="TP1" value={fmt(o.take_profit)} tone="good"/>
                    <Tiny label="Margen" value={money(o.margin_used)}/>
                  </div>
                </div>
              ))}
              {!summary?.pending_orders?.length && <EmptyDock text="No hay órdenes LIMIT pendientes."/>}
            </div>
          )}

          {bottomTab === "stats" && <PracticeStatsLab history={history}/>}

          {bottomTab === "history" && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-[10px]">
                <thead className="text-[8px] font-black uppercase tracking-[.1em] text-slate-600">
                  <tr><th className="px-2 py-2 text-left">Par</th><th>Setup</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>PnL</th><th>R</th><th>Motivo</th></tr>
                </thead>
                <tbody>
                  {history.slice(0,20).map((row) => (
                    <tr key={row.id} className="border-t border-slate-900/80 text-center">
                      <td className="px-2 py-2 text-left font-black text-white">{row.symbol}</td>
                      <td className="text-slate-500">{(row.pattern || "MANUAL").replaceAll("_"," ")}</td>
                      <td className={row.side === "LONG" ? "text-emerald-300" : "text-rose-300"}>{row.side}</td>
                      <td>{fmt(row.entry_price)}</td>
                      <td>{fmt(row.exit_price)}</td>
                      <td className={Number(row.net_pnl) >= 0 ? "text-emerald-300" : "text-rose-300"}>{money(row.net_pnl)}</td>
                      <td>{row.r_multiple == null ? "—" : Number(row.r_multiple).toFixed(2)+"R"}</td>
                      <td className="text-slate-600">{row.close_reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!history.length && <EmptyDock text="Aún no hay operaciones cerradas."/>}
            </div>
          )}
        </div>
      </section>

      {replaySnapshot && <PracticeReplayLab candles={replaySnapshot} symbol={symbol} interval={interval} sessionId={sid} onClose={() => setReplaySnapshot(null)}/>}

      {message && (
        <div className="fixed bottom-5 left-1/2 z-[90] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-xl border border-cyan-500/30 bg-slate-950/95 px-4 py-3 text-xs font-bold text-cyan-100 shadow-2xl">
          <Target size={14}/>{message}<button onClick={() => setMessage("")}><X size={14} className="text-slate-500"/></button>
        </div>
      )}
    </div>
  );
}

function PrecisionAssistant({
  scan,
  aiDirection,
  analyzing,
  askingAi,
  showExplain,
  onAnalyze,
  onAskAi,
  onToggleExplain,
  onDraw,
  onDrawLong,
  onDrawShort,
}: {
  scan: PrecisionScan | null;
  aiDirection: AiDirectionResult | null;
  analyzing: boolean;
  askingAi: boolean;
  showExplain: boolean;
  onAnalyze: () => void;
  onAskAi: () => void;
  onToggleExplain: () => void;
  onDraw: () => void;
  onDrawLong: () => void;
  onDrawShort: () => void;
}) {
  const current = scan?.current ?? null;
  const pattern = current?.pattern ?? null;

  if (!scan) {
    return (
      <div className="border-b border-slate-800/80 bg-[#060e18] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-black text-white"><Sparkles size={14} className="text-cyan-300"/> Asistente técnico ExplodeX</div>
            <div className="mt-1 text-[9px] text-slate-500">Detecta figuras con pivotes 5/5, compara 5m · 15m · 1h · 4h y solo arma SL/TP cuando existe confirmación.</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={onDrawLong} className="rounded-xl border border-emerald-400/25 bg-emerald-400/[.06] px-3 py-2.5 text-[9px] font-black text-emerald-200">↗ POSICIÓN LONG</button>
            <button onClick={onDrawShort} className="rounded-xl border border-rose-400/25 bg-rose-400/[.06] px-3 py-2.5 text-[9px] font-black text-rose-200">↘ POSICIÓN SHORT</button>
            <button onClick={onAnalyze} disabled={analyzing} className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-[10px] font-black text-cyan-100 shadow-sm shadow-cyan-500/10 disabled:opacity-50">
              {analyzing ? "ANALIZANDO…" : "⚡ ANALIZAR TODO"}
            </button>
            <button onClick={onAskAi} disabled={askingAi} className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-[10px] font-black text-violet-100 disabled:opacity-50">
              {askingAi ? "PENSANDO…" : "🤖 DIME PARA DÓNDE VA"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const directionTone = scan.direction === "LONG"
    ? "border-emerald-400/25 bg-emerald-400/[.06] text-emerald-200"
    : scan.direction === "SHORT"
      ? "border-rose-400/25 bg-rose-400/[.06] text-rose-200"
      : "border-amber-400/25 bg-amber-400/[.05] text-amber-200";

  const stateLabel = !pattern
    ? "SIN FIGURA LIMPIA"
    : pattern.status === "FORMING"
      ? "EN FORMACIÓN · ESPERAR RUPTURA"
      : pattern.status === "CONFIRMED_LONG"
        ? "RUPTURA LONG CONFIRMADA"
        : "RUPTURA SHORT CONFIRMADA";

  return (
    <div className="border-b border-slate-800/80 bg-[#060e18] p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button onClick={onDrawLong} className="rounded-lg border border-emerald-400/25 bg-emerald-400/[.05] px-3 py-2 text-[9px] font-black text-emerald-200">↗ POSICIÓN LONG</button>
        <button onClick={onDrawShort} className="rounded-lg border border-rose-400/25 bg-rose-400/[.05] px-3 py-2 text-[9px] font-black text-rose-200">↘ POSICIÓN SHORT</button>
        <button onClick={onAnalyze} disabled={analyzing} className="rounded-lg border border-cyan-400/25 bg-cyan-400/[.06] px-3 py-2 text-[9px] font-black text-cyan-100 disabled:opacity-40">{analyzing ? "ANALIZANDO…" : "⚡ ANALIZAR TODO"}</button>
        <button onClick={onAskAi} disabled={askingAi} className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-[9px] font-black text-violet-100 disabled:opacity-40">{askingAi ? "PENSANDO…" : "🤖 DIME PARA DÓNDE VA"}</button>
        {aiDirection && <span className={`rounded-lg border px-3 py-2 text-[9px] font-black ${aiDirection.direction === "LONG" ? "border-emerald-400/20 text-emerald-300" : aiDirection.direction === "SHORT" ? "border-rose-400/20 text-rose-300" : "border-amber-400/20 text-amber-300"}`}>{aiDirection.available ? "IA" : "MOTOR"}: {aiDirection.direction}</span>}
      </div>
      {aiDirection && <div className="mb-2 rounded-xl border border-violet-400/15 bg-violet-400/[.03] px-3 py-2"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="text-[8px] font-black uppercase tracking-[.12em] text-violet-300">{aiDirection.available ? "OpenAI bajo demanda" : "Fallback técnico · IA no configurada"}</div><div className="mt-1 text-[10px] leading-4 text-slate-300">{aiDirection.summary}</div></div><div className="grid grid-cols-4 gap-1"><Tiny label="Entrada" value={fmt(aiDirection.entry)}/><Tiny label="SL" value={fmt(aiDirection.stop_loss)} tone="bad"/><Tiny label="TP2" value={fmt(aiDirection.tp2)} tone="good"/><Tiny label="Fuerza" value={aiDirection.evidence_strength}/></div></div></div>}
      <div className="grid gap-2 xl:grid-cols-[210px_minmax(0,1fr)_330px]">
        <div className={`rounded-xl border p-3 ${directionTone}`}>
          <div className="text-[8px] font-black uppercase tracking-[.13em] opacity-65">Contexto multi-temporal</div>
          <div className="mt-1 text-lg font-black">{scan.direction}</div>
          <div className="mt-1 text-[9px] opacity-80">{scan.agreement}/{scan.total} temporalidades acompañan el contexto</div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {scan.rows.map(row => (
              <div key={row.interval} className="rounded-md border border-white/10 bg-black/10 px-1 py-1 text-center">
                <div className="text-[8px] font-black">{row.interval.toUpperCase()}</div>
                <div className={`mt-0.5 text-[7px] ${row.read.trendScore > 1 ? "text-emerald-200" : row.read.trendScore < -1 ? "text-rose-200" : "text-amber-200"}`}>
                  {row.read.trendScore > 1 ? "↑" : row.read.trendScore < -1 ? "↓" : "↔"}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#040a12] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[.13em] text-slate-600">Figura actual</div>
              <div className="mt-1 text-sm font-black text-white">{pattern?.name ?? "No detectada"}</div>
              <div className={`mt-1 inline-flex rounded-md border px-2 py-1 text-[8px] font-black ${
                pattern?.status === "CONFIRMED_LONG" ? "border-emerald-400/20 text-emerald-300" :
                pattern?.status === "CONFIRMED_SHORT" ? "border-rose-400/20 text-rose-300" :
                "border-amber-400/20 text-amber-300"
              }`}>{stateLabel}</div>
            </div>
            <div className="flex gap-1">
              <button onClick={onDraw} disabled={!pattern} className="rounded-lg border border-violet-400/20 bg-violet-400/[.05] px-2.5 py-2 text-[8px] font-black text-violet-200 disabled:opacity-30">DIBUJAR EXACTO</button>
              <button onClick={onAnalyze} disabled={analyzing} className="rounded-lg border border-cyan-400/20 px-2.5 py-2 text-[8px] font-black text-cyan-200 disabled:opacity-40">{analyzing ? "…" : "REANALIZAR"}</button>
            </div>
          </div>

          {pattern ? (
            <div className="mt-3">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Tiny label="Calidad geom." value={pattern.confidence + "/100"}/>
                <Tiny label="Ruptura ↑" value={fmt(pattern.breakoutLong)} tone="good"/>
                <Tiny label="Ruptura ↓" value={fmt(pattern.breakoutShort)} tone="bad"/>
                <Tiny label="Invalidación" value={fmt(pattern.invalidation)}/>
              </div>
              {pattern.status === "FORMING" ? (
                <div className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/[.04] p-2 text-[9px] leading-4 text-amber-100/80">
                  La figura todavía no decide dirección. Escenario LONG si confirma por arriba de <b>{fmt(pattern.breakoutLong)}</b>; escenario SHORT si confirma por debajo de <b>{fmt(pattern.breakoutShort)}</b>. No se precarga una entrada antes de la ruptura.
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-5 gap-1">
                  <Tiny label="Entrada" value={fmt(pattern.entry)}/>
                  <Tiny label="SL" value={fmt(pattern.stop)} tone="bad"/>
                  <Tiny label="TP1" value={fmt(pattern.tp1)} tone="good"/>
                  <Tiny label="TP2 medido" value={fmt(pattern.tp2)} tone="good"/>
                  <Tiny label="TP3 ext." value={fmt(pattern.tp3)} tone="good"/>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {pattern.rationale.map((reason, i) => <span key={i} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-[8px] text-slate-400">{reason}</span>)}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-[9px] leading-4 text-slate-500">No hay una figura con geometría suficientemente limpia ahora. El contexto multi-TF sirve como orientación, pero no es un gatillo de entrada.</div>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#040a12] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[8px] font-black uppercase tracking-[.13em] text-slate-600">Indicadores · qué están diciendo</div>
            <button onClick={onToggleExplain} className="inline-flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-[8px] font-black text-slate-500 hover:text-cyan-200"><HelpCircle size={10}/>{showExplain ? "Ocultar" : "Explicar"}</button>
          </div>
          {current ? <div className="mt-2 grid grid-cols-4 gap-1">
            <Tiny label="RSI" value={current.rsi.toFixed(1)}/>
            <Tiny label="VOL" value={current.volumeRatio.toFixed(2)+"x"}/>
            <Tiny label="ATR" value={fmt(current.atr14)}/>
            <Tiny label="EMA20" value={fmt(current.ema20)}/>
          </div> : null}
          {showExplain && current && <div className="mt-2 space-y-1.5">
            {current.indicatorNotes.map((note,i)=><div key={i} className="rounded-md border border-slate-800/70 bg-slate-950/50 px-2 py-1.5 text-[8px] leading-4 text-slate-400">{note}</div>)}
            <details className="rounded-md border border-slate-800/70 px-2 py-1.5 text-[8px] text-slate-500"><summary className="cursor-pointer font-black text-slate-400">¿Qué hace cada indicador?</summary><div className="mt-2 space-y-1.5"><p><b>EMA:</b> {INDICATOR_HELP.EMA}</p><p><b>RSI:</b> {INDICATOR_HELP.RSI}</p><p><b>MACD:</b> {INDICATOR_HELP.MACD}</p><p><b>Volumen:</b> {INDICATOR_HELP.VOLUME}</p><p><b>ATR:</b> {INDICATOR_HELP.ATR}</p></div></details>
          </div>}
        </div>
      </div>
      <div className="mt-2 text-[8px] text-slate-700">“Calidad geom.” mide qué tan bien encajan los pivotes con la figura; no es probabilidad de ganar ni recomendación de inversión.</div>
    </div>
  );
}

function MarketRadar({ insight, interval, deepScan, analyzing, onAnalyze, onDraw }: { insight: MarketInsight | null; interval: Interval; deepScan: DeepScan | null; analyzing: boolean; onAnalyze: () => void; onDraw: () => void }) {
  if (!insight) {
    return <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 bg-[#07101a] px-3 py-2 text-[9px] text-slate-600"><span>Radar ExplodeX: cargando suficientes velas para leer estructura…</span><button onClick={onAnalyze} disabled={analyzing} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[.06] px-3 py-1.5 font-black text-cyan-200">{analyzing?"ANALIZANDO…":"ANALIZAR TODO"}</button></div>;
  }
  const tone = insight.bias === "ALCISTA"
    ? "border-emerald-400/20 bg-emerald-400/[.05] text-emerald-200"
    : insight.bias === "BAJISTA"
      ? "border-rose-400/20 bg-rose-400/[.05] text-rose-200"
      : "border-amber-400/20 bg-amber-400/[.04] text-amber-200";
  return (
    <div className="border-b border-slate-800/80 bg-[#060e18] px-2 py-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={onAnalyze} disabled={analyzing} className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-black text-cyan-100 disabled:opacity-50">{analyzing?"ANALIZANDO 5m · 15m · 1h · 4h…":"⚡ ANALIZAR TODO"}</button>
          <button onClick={onDraw} disabled={!insight.autoOverlays.length} className="rounded-lg border border-violet-400/20 bg-violet-400/[.05] px-3 py-2 text-[9px] font-black text-violet-200 disabled:opacity-30">DIBUJAR FIGURA</button>
        </div>
        {deepScan&&<div className={`rounded-lg border px-3 py-2 text-[10px] font-black ${deepScan.direction==="LONG"?"border-emerald-400/25 bg-emerald-400/[.06] text-emerald-200":deepScan.direction==="SHORT"?"border-rose-400/25 bg-rose-400/[.06] text-rose-200":"border-amber-400/25 bg-amber-400/[.05] text-amber-200"}`}>MULTI-TF: {deepScan.direction} · {deepScan.agreement}/{deepScan.total} alineadas</div>}
      </div>
      {deepScan&&<div className="mb-2 grid gap-1 md:grid-cols-4">{deepScan.rows.map(row=><div key={row.interval} className="rounded-lg border border-slate-800 bg-slate-950/35 px-2 py-1.5 text-[9px]"><b className="text-white">{row.interval.toUpperCase()}</b><span className={`ml-2 font-black ${row.insight.bias==="ALCISTA"?"text-emerald-300":row.insight.bias==="BAJISTA"?"text-rose-300":"text-amber-300"}`}>{row.insight.bias}</span><div className="mt-0.5 truncate text-slate-600">{row.insight.patterns[0]||"sin patrón claro"}</div></div>)}</div>}
      <div className="grid gap-2 2xl:grid-cols-[170px_minmax(0,1fr)_360px]">
        <div className={`rounded-lg border px-3 py-2 ${tone}`}>
          <div className="text-[8px] font-black uppercase tracking-[.14em] opacity-70">Radar ExplodeX · {interval.toUpperCase()}</div>
          <div className="mt-1 text-sm font-black">{insight.bias}</div>
          <div className="mt-1 text-[9px] opacity-75">Confluencia {insight.confluence}/{insight.maxConfluence} · no es probabilidad</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
          <div className="text-[8px] font-black uppercase tracking-[.12em] text-slate-600">Lectura técnica</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-300">{insight.summary}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(insight.patterns.length ? insight.patterns : ["Sin patrón claro"]).map((p) => <span key={p} className="rounded-md border border-violet-400/15 bg-violet-400/[.04] px-1.5 py-0.5 text-[8px] font-bold text-violet-200">{p}</span>)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <Tiny label="RSI" value={insight.rsi.toFixed(1)}/>
          <Tiny label="VOL" value={insight.volumeRatio.toFixed(2)+"x"}/>
          <Tiny label="R ↑" value={fmt(insight.triggerUp)} tone="good"/>
          <Tiny label="S ↓" value={fmt(insight.triggerDown)} tone="bad"/>
        </div>
      </div>
    </div>
  );
}

function DeskTool({ icon, label, onClick, danger=false, active=false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition ${active ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200 shadow-sm shadow-cyan-500/10" :
danger
          ? "border-rose-500/15 text-rose-400 hover:bg-rose-500/10"
          : "border-transparent text-slate-500 hover:border-cyan-400/20 hover:bg-cyan-400/[.06] hover:text-cyan-200"
      }`}
    >
      {icon}
    </button>
  );
}

function DeskSeparator() {
  return <div className="mx-1 h-8 w-px shrink-0 bg-slate-800 lg:my-1 lg:h-px lg:w-8"/>;
}

function CompactMetric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  return <div className="rounded-lg border border-slate-800 bg-[#040a12] px-2 py-2 text-center"><div className="text-[7px] font-black uppercase tracking-[.1em] text-slate-600">{label}</div><div className={`mt-1 truncate font-mono text-[10px] font-black ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : tone === "warn" ? "text-amber-300" : "text-white"}`}>{value}</div></div>;
}

function TradeInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return <label className="rounded-lg border border-slate-800 bg-[#040a12] px-2.5 py-2"><span className="text-[7px] font-black uppercase tracking-[.11em] text-slate-600">{label}</span><div className="mt-1 flex items-center gap-1"><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-xs font-black text-white outline-none" placeholder="0"/>{suffix && <span className="text-[9px] text-slate-600">{suffix}</span>}</div></label>;
}

function DockTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-md px-3 py-1.5 text-[9px] font-black transition ${active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-600 hover:text-slate-300"}`}>{label}</button>;
}

function Tiny({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="rounded-md border border-slate-800/80 bg-slate-950/50 px-1.5 py-1.5"><div className="text-[7px] uppercase text-slate-700">{label}</div><div className={`mt-0.5 truncate font-mono text-[9px] font-black ${tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-rose-300" : "text-slate-200"}`}>{value}</div></div>;
}

function ActionButton({ label, onClick, disabled, danger=false }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`rounded-md border py-1.5 text-[8px] font-black disabled:opacity-30 ${danger ? "border-rose-500/20 text-rose-300" : "border-slate-800 text-slate-400 hover:border-cyan-400/20 hover:text-cyan-200"}`}>{label}</button>;
}

function EmptyDock({ text }: { text: string }) {
  return <div className="col-span-full grid min-h-[110px] place-items-center rounded-xl border border-dashed border-slate-800 text-[10px] text-slate-600">{text}</div>;
}

function Tool({ icon, label, onClick, danger=false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[10px] font-bold ${danger ? "border-rose-500/20 text-rose-300" : "border-slate-800 text-slate-400 hover:border-cyan-500/25 hover:text-cyan-200"}`}>{icon}<span>{label}</span></button>;
}

function Stat({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return <div className="terminal-panel p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.12em] text-slate-500">{icon}{title}</div><div className="mt-2 text-2xl font-black text-white">{value}</div><div className="mt-1 text-[10px] text-slate-600">{detail}</div></div>;
}

function PracticeStep({ n, title, text }: { n: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-3"><div className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-400/10 text-[10px] font-black text-cyan-300">{n}</span><span className="text-xs font-black text-white">{title}</span></div><div className="mt-2 text-[10px] leading-5 text-slate-500">{text}</div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="rounded-xl border border-slate-800 bg-slate-950/45 p-3"><span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-600">{label}</span><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full bg-transparent font-mono text-sm font-black text-white outline-none" placeholder="0"/></label>;
}

function Mini({ label, value, good=false, bad=false }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2"><div className="text-[8px] uppercase tracking-[.08em] text-slate-600">{label}</div><div className={`mt-1 font-mono text-[11px] font-black ${good ? "text-emerald-300" : bad ? "text-rose-300" : "text-white"}`}>{value}</div></div>;
}
