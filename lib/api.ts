export type Opportunity = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  state: string;
  setup_score: number;
  risk_score: number;
  contextual_score?: number;
  contextual_risk_score?: number;
  current_price: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  expected_move_min_pct?: number;
  expected_move_max_pct?: number;
  expected_duration_min_minutes?: number;
  expected_duration_max_minutes?: number;
  tier?: string;
  label?: string;
  historical_win_rate_pct?: number | null;
  probability_status?: string;
  market_regime?: string;
  news?: {
    sentiment?: string;
    score_adjustment?: number;
    headlines?: Array<{ title: string; source?: string; url?: string }>;
  };
};

export type OpportunityResponse = {
  warning?: string;
  best_opportunity?: Opportunity | null;
  market_context?: Record<string, unknown>;
  calibration?: CalibrationResponse;
  groups?: {
    elite?: Opportunity[];
    very_strong?: Opportunity[];
    strong?: Opportunity[];
    watch?: Opportunity[];
    no_trade?: Opportunity[];
  };
};

export type Performance = {
  closed_trades: number;
  wins: number;
  losses: number;
  win_rate_pct: number | null;
  net_pnl_usdt: number;
  gross_profit_usdt?: number;
  gross_loss_usdt?: number;
  expectancy_usdt_per_trade?: number | null;
  average_r?: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number;
  current_equity_usdt: number;
  starting_equity_usdt?: number;
  ready_for_real_money?: boolean;
};

export type PaperTrade = {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  status: string;
  leverage?: number;
  risk_pct?: number;
  entry_price: number;
  exit_price?: number | null;
  quantity?: number;
  notional_usdt?: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  opened_at: string;
  closed_at?: string | null;
  pnl_usdt?: number | null;
  pnl_pct?: number | null;
  r_multiple?: number | null;
  fees_usdt?: number | null;
  close_reason?: string | null;
};

export type CalibrationBucket = {
  score_bucket: string;
  closed_trades: number;
  wins: number;
  observed_win_rate_pct: number | null;
  net_pnl_usdt: number;
  average_r: number | null;
  calibration_status: string;
  can_show_as_probability_estimate: boolean;
};

export type CalibrationResponse = {
  total_closed_paper_trades: number;
  important?: string;
  buckets: CalibrationBucket[];
};

export type AlertItem = {
  id: string;
  signal_id?: string | null;
  trade_id?: string | null;
  created_at: string;
  channel: string;
  severity: string;
  title: string;
  message: string;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CoinGlassStatus = {
  enabled: boolean;
  configured: boolean;
  base_url?: string;
  plan?: string;
  safe_rate_limit_per_minute?: number;
  requests_last_60s?: number;
  total_requests_since_boot?: number;
  total_cache_hits_since_boot?: number;
  last_ok_at?: string | null;
  last_http_status?: number | null;
  last_error?: string | null;
};

export type HealthStatus = {
  status: string;
  database?: boolean;
  paper_trading_only?: boolean;
  scheduler_enabled?: boolean;
  market_data_source?: string;
  provider_warning?: string | null;
  coinglass?: CoinGlassStatus;
};

export type CoinGlassEnrichment = {
  available?: boolean;
  configured?: boolean;
  critical_complete?: boolean;
  errors?: string[];
  open_interest?: {
    available?: boolean;
    open_interest_usd?: number;
    change_5m_pct?: number;
    change_15m_pct?: number;
    change_30m_pct?: number;
    change_1h_pct?: number;
    change_4h_pct?: number;
    change_24h_pct?: number;
    exchanges?: Array<Record<string, any>>;
  };
  taker?: {
    available?: boolean;
    buy_ratio_pct?: number;
    sell_ratio_pct?: number;
    buy_volume_usd?: number;
    sell_volume_usd?: number;
    buy_sell_ratio?: number;
    exchanges?: Array<Record<string, any>>;
  };
  funding?: {
    available?: boolean;
    median_rate_pct?: number;
    max_rate_pct?: number;
    min_rate_pct?: number;
    exchanges?: Array<Record<string, any>>;
  };
  liquidations?: {
    available?: boolean;
    long_1h?: number;
    short_1h?: number;
    long_4h?: number;
    short_4h?: number;
    total_1h?: number;
    total_4h?: number;
    short_minus_long_imbalance_1h?: number;
    exchanges?: Array<Record<string, any>>;
  };
};

export type LiveAnalysis = {
  symbol: string;
  source: string;
  provider_warning?: string | null;
  data_quality: "FULL" | "TRADE_GRADE" | "LIMITED";
  availability: Record<string, boolean>;
  coinglass?: CoinGlassEnrichment;
  current_open_interest: number;
  direction: "LONG" | "SHORT";
  state: string;
  setup_score: number;
  local_setup_score_before_coinglass?: number;
  long_score: number;
  short_score: number;
  risk_score: number;
  local_risk_score_before_coinglass?: number;
  current_price: number;
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  expected_move_min_pct: number;
  expected_move_max_pct: number;
  expected_duration_min_minutes: number;
  expected_duration_max_minutes: number;
  components: Record<string, number>;
  metrics: Record<string, any>;
  btc_context: Record<string, any>;
  risk_policy?: {
    paper_only?: boolean;
    coinglass_required_for_ready?: boolean;
    score_is_probability?: boolean;
  };
  note?: string;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

async function api<T>(path: string): Promise<T> {
  if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL no está configurada");
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Backend ${response.status}: ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function getHealth(): Promise<HealthStatus> {
  return api<HealthStatus>("/health");
}

export async function getOpportunities(): Promise<OpportunityResponse> {
  return api<OpportunityResponse>("/api/v1/opportunities?limit=100");
}

export async function getMarketContext(): Promise<Record<string, any>> {
  return api<Record<string, any>>("/api/v1/market/context");
}

export async function getPerformance(): Promise<Performance> {
  return api<Performance>("/api/v1/paper/performance");
}

export async function getRuntimeStatus(): Promise<Record<string, any>> {
  return api<Record<string, any>>("/api/v1/runtime/status");
}

export async function getCoinGlassStatus(probe = false): Promise<CoinGlassStatus> {
  return api<CoinGlassStatus>(`/api/v1/coinglass/status${probe ? "?probe=true" : ""}`);
}

export async function getCoinGlass(symbol: string): Promise<CoinGlassEnrichment> {
  return api<CoinGlassEnrichment>(`/api/v1/coinglass/${encodeURIComponent(symbol)}`);
}

export async function getPaperOpen(): Promise<PaperTrade[]> {
  return api<PaperTrade[]>("/api/v1/paper/open?limit=100");
}

export async function getPaperHistory(): Promise<PaperTrade[]> {
  return api<PaperTrade[]>("/api/v1/paper/history?limit=200");
}

export async function getCalibration(): Promise<CalibrationResponse> {
  return api<CalibrationResponse>("/api/v1/calibration");
}

export async function getAlerts(): Promise<AlertItem[]> {
  return api<AlertItem[]>("/api/v1/alerts/pending?limit=100");
}

export async function getNews(symbol: string): Promise<Record<string, any>> {
  return api<Record<string, any>>(`/api/v1/news/${encodeURIComponent(symbol)}`);
}

export async function getPrice(symbol: string): Promise<{ symbol: string; price: string; source?: string }> {
  return api<{ symbol: string; price: string; source?: string }>(`/api/v1/market/price/${encodeURIComponent(symbol)}`);
}

export async function getLiveAnalysis(symbol: string): Promise<LiveAnalysis> {
  return api<LiveAnalysis>(`/api/v1/analysis/${encodeURIComponent(symbol)}`);
}

export async function getCandles(symbol: string, interval = "15m", limit = 96): Promise<Candle[]> {
  const allowed = new Set(["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"]);
  const safeInterval = allowed.has(interval) ? interval : "15m";
  const safeSymbol = symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;
  const payload = await api<{ candles: Candle[] }>(`/api/v1/market/candles/${encodeURIComponent(safeSymbol)}?interval=${encodeURIComponent(safeInterval)}&limit=${Math.max(20, Math.min(limit, 300))}`);
  return payload.candles ?? [];
}
