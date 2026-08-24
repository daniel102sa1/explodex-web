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
  profit_factor: number | null;
  max_drawdown_pct: number;
  current_equity_usdt: number;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "";

async function api<T>(path: string): Promise<T> {
  if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL no está configurada");
  const response = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Backend ${response.status}: ${response.statusText}`);
  return response.json() as Promise<T>;
}

export async function getOpportunities(): Promise<OpportunityResponse> {
  return api<OpportunityResponse>("/api/v1/opportunities?limit=80");
}

export async function getMarketContext(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>("/api/v1/market/context");
}

export async function getPerformance(): Promise<Performance> {
  return api<Performance>("/api/v1/paper/performance");
}

export async function getRuntimeStatus(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>("/api/v1/runtime/status");
}
