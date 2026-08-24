export interface ShipmentInput {
  product: string;
  origin_province: string;
  origin_city: string;
  destination_province: string;
  destination_city: string;
  weightKg: number;
  quantity?: number;
  shipDate: string;
  shippingMode?: string; // "Ocean (container)" | "Air" | "Rail" | "Truck"
  specialRequirements?: string[]; // Refrigerated | Frozen | Standard (ambient) | Fragile | Hazardous | Organic
}

export type AnalyzeEvent =
  | { type: "agent"; id: string; name: string; status: "running" | "done" | "error"; summary?: string }
  | { type: "log"; message: string }
  | { type: "result"; data: AnalysisResult }
  | { type: "error"; message: string };

export interface AnalysisResult {
  input: ShipmentInput;

  riskScore: number;
  
  expectedDelayDays: number;
  expectedCostIncreasePercent: number;

  recommendation: string;

  dataMode?: "Live" | "Mock";
}