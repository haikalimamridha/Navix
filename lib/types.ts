// Core domain types for WayFinder

export interface ShipmentInput {
  product: string;

  origin_province: string;
  origin_city: string;

  destination_province: string;
  destination_city: string;

  weightKg: number;
  quantity?: number;

  shipDate: string; // free-form, e.g. "September 2026" or ISO date

  shippingMode?: string; // "Ocean (container)" | "Air" | "Rail" | "Truck"
  containerSize?: string; // "20ft" | "40ft" | "40ft HC" | "LCL" | "Pallets"

  specialRequirements?: string[]; // Refrigerated | Frozen | Standard (ambient) | Fragile | Hazardous | Organic
}

export interface DocItem {
  name: string;
  url: string;
}

export interface RegulatoryInfo {
  documents: DocItem[];
  requirements: string[];
  notes: string;
  sources: Source[];
}

// Result of the conversational intake: what we extracted, what's still missing,
// and the follow-up question to ask the user.
export interface IntakeResult {
  input: ShipmentInput;
  missing: string[]; // human-readable labels of required fields still missing
  missingFields: string[]; // field keys still missing (for quick-pick buttons)
  question: string | null; // follow-up to ask, or null when complete
  ready: boolean;
}

export type RiskCategory =
  | "commodity"
  | "freight"
  | "port"
  | "weather"
  | "geopolitical"
  | "supplier"
  | "regulatory";

export interface Source {
  title: string;
  url: string;
  snippet?: string;
}

export interface MaterialBreakdown {
  material: string;
  pct: number;
}

export interface RiskFactor {
  category: RiskCategory;
  score: number; // 0-100, higher = more risk
  label: string; // short headline
  detail: string; // one-paragraph explanation
  actionable: string; // concrete, time-bound insight or action
  trend: "up" | "down" | "flat";
  keyFindings: string[];
  sources: Source[];
}

export interface CostForecast {
  horizonDays: 30 | 60 | 90;
  productCostPct: number;
  freightCostPct: number;
  landedCostPct: number;
}

export interface RouteOption {
  method: string; // Ocean / Air / Rail / Truck
  cost: number; // IDR or USD depending on application convention
  transitDays: number;
  recommended: boolean;
  note: string;
}

export interface Alert {
  severity: "high" | "medium" | "low";
  title: string;
  impact: string;
}

export interface Recommendation {
  action: string;
  rationale: string;
}

export interface ActionItem {
  action: string; // imperative, concise
  deadline: string; // display label, e.g. "By Aug 31, 2026"
  dueDate: string | null; // ISO YYYY-MM-DD for sorting
  category: RiskCategory | "general";
  urgency: "high" | "medium" | "low";
  why: string; // one-line rationale
}

export interface DependencyNode {
  node: string;
  children: string[];
}

export interface DriverPoint {
  t: string; // period label, e.g. "W-9"
  v: number | null; // historical value
  f?: number | null; // forecast value
}

export interface DependencyDriver {
  name: string; // e.g. "Plastic Resin"
  unit: string; // e.g. "$/ton" or "IDR/kg"
  current: number; // latest live value
  changePct: number; // change over the window
  trend: "up" | "down" | "flat";
  impact: "high" | "medium" | "low"; // impact on this shipment
  affects: string; // short note: what it drives
  forecastPct: number; // projected ~60-day change
  forecastNote: string; // one-line forecast rationale
  priceLive: boolean; // true when current came from a live scrape
  series: DriverPoint[];
  sources: Source[]; // where the price came from
}

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
}

// One Bright Data web search that was executed during the analysis.
export interface SearchRecord {
  agent: string; // which agent ran it
  query: string;
  results: number; // sources returned
  mode: "live" | "mock";
}

export interface PortOption {
  name: string;
  congestionScore: number; // 0-100, higher = more congested
  waitDays: number; // estimated berth/dwell wait
  freightCost: number; // estimated freight cost to this port
  recommended: boolean;
  note: string;
  lat: number | null;
  lng: number | null;
  sources: Source[];
}

export interface PortRecommendation {
  recommended: string; // recommended Indonesian port
  rationale: string;
  options: PortOption[];
}

export interface AnalysisResult {
  input: ShipmentInput;

  productCategory: string;
  hsCodes: string[];
  materials: MaterialBreakdown[];

  dependencyGraph: DependencyNode[];
  drivers: DependencyDriver[];

  riskScore: number; // 0-100
  riskFactors: RiskFactor[];

  costForecasts: CostForecast[];
  expectedCostIncreasePct: number;
  expectedDelayDays: [number, number];

  routes: RouteOption[];

  alerts: Alert[];
  recommendations: Recommendation[];
  actionPlan: ActionItem[];

  executiveSummary: string;
  news: Source[];

//   geo: RouteGeo | null;

  portRecommendation: PortRecommendation | null;

  searches: SearchRecord[];

  generatedAt: string;
  dataMode: "live" | "mock";
}

// Server-sent event payloads streamed to the dashboard
export type AnalyzeEvent =
  | {
      type: "agent";
      id: string;
      name: string;
      status: "running" | "done" | "error";
      summary?: string;
    }
  | {
      type: "log";
      message: string;
    }
  | {
      type: "result";
      data: AnalysisResult;
    }
  | {
      type: "error";
      message: string;
    };