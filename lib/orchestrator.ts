import type {
  AnalysisResult,
  AnalyzeEvent,
  ShipmentInput,
} from "@/lib/types";

const CATEGORY_WEIGHTS: Record<string, number> = {
  commodity: 1.0,
  freight: 1.2,
  port: 1.0,
  weather: 0.8,
  geopolitical: 1.1,
  supplier: 0.9,
  regulatory: 0.7,
};

// function weightedRiskScore(factors: RiskFactor[]): number {
//   let num = 0;
//   let den = 0;
//   for (const f of factors) {
//     const w = CATEGORY_WEIGHTS[f.category] ?? 1;
//     num += f.score * w;
//     den += w;
//   }
//   return den ? Math.round(num / den) : 50;
// }

export async function runAnalysis(
  input: ShipmentInput,
  send: (event: AnalyzeEvent) => void,
): Promise<AnalysisResult> {
  // ==========================================
  // 1. START
  // ==========================================

  send({
    type: "log",
    message: "Starting supply chain risk analysis...",
  });

  // ==========================================
  // 2. PRODUCT INTELLIGENCE
  // ==========================================

  send({
    type: "agent",
    id: "product",
    name: "Product Intelligence",
    status: "running",
  });

  await delay(500);

  send({
    type: "agent",
    id: "product",
    name: "Product Intelligence",
    status: "done",
    summary: `Analyzed product: ${input.product}`,
  });

  // ==========================================
  // 3. FREIGHT INTELLIGENCE
  // ==========================================

  send({
    type: "agent",
    id: "freight",
    name: "Freight Intelligence",
    status: "running",
  });

  await delay(500);

  send({
    type: "agent",
    id: "freight",
    name: "Freight Intelligence",
    status: "done",
    summary: `Evaluated ${input.shippingMode ?? "shipping"} route`,
  });

  // ==========================================
  // 4. ROUTE INTELLIGENCE
  // ==========================================

  send({
    type: "agent",
    id: "route",
    name: "Route Intelligence",
    status: "running",
  });

  await delay(500);

  const origin =
    `${input.origin_city}, ${input.origin_province}`;

  const destination =
    `${input.destination_city}, ${input.destination_province}`;

  send({
    type: "agent",
    id: "route",
    name: "Route Intelligence",
    status: "done",
    summary: `${origin} → ${destination}`,
  });

  // ==========================================
  // 5. WEATHER INTELLIGENCE
  // ==========================================

  send({
    type: "agent",
    id: "weather",
    name: "Weather Intelligence",
    status: "running",
  });

  await delay(500);

  send({
    type: "agent",
    id: "weather",
    name: "Weather Intelligence",
    status: "done",
    summary: "Checked potential weather disruption",
  });

  // ==========================================
  // 6. CALCULATE RISK
  // ==========================================

  send({
    type: "log",
    message: "Calculating overall shipment risk...",
  });

  await delay(300);

  const riskScore = calculateRisk(input);

  const riskLevel =
    riskScore >= 75
      ? "CRITICAL"
      : riskScore >= 50
        ? "HIGH"
        : riskScore >= 25
          ? "MEDIUM"
          : "LOW";

  const expectedDelayDays =
    riskLevel === "CRITICAL"
      ? 7
      : riskLevel === "HIGH"
        ? 4
        : riskLevel === "MEDIUM"
          ? 2
          : 0;

  const expectedCostIncreasePercent =
    riskLevel === "CRITICAL"
      ? 15
      : riskLevel === "HIGH"
        ? 10
        : riskLevel === "MEDIUM"
          ? 5
          : 2;

  // ==========================================
  // 7. RECOMMENDATION
  // ==========================================

  const recommendation =
    riskLevel === "CRITICAL"
      ? "Consider delaying or rerouting the shipment."
      : riskLevel === "HIGH"
        ? "Monitor the route closely and consider an alternative route."
        : riskLevel === "MEDIUM"
          ? "Continue monitoring logistics and weather conditions."
          : "Shipment conditions currently appear relatively stable.";

  // ==========================================
  // 8. FINAL RESULT
  // ==========================================

  send({
    type: "log",
    message: "Risk analysis completed.",
  });

  return {
    input,
    riskScore,
    expectedDelayDays,
    expectedCostIncreasePercent,
    recommendation,
    dataMode: "Mock",
  };
}

// ==========================================
// SIMPLE RISK CALCULATION
// ==========================================

function calculateRisk(
  input: ShipmentInput,
): number {
  let score = 20;

  // Heavy shipment
  if (input.weightKg > 10000) {
    score += 10;
  }

  // Large quantity
  if ((input.quantity ?? 0) > 5000) {
    score += 10;
  }

  // Shipping mode
  if (input.shippingMode === "Truck") {
    score += 10;
  }

  // Special handling
  if (
    input.specialRequirements?.includes(
      "Hazardous",
    )
  ) {
    score += 20;
  }

  if (
    input.specialRequirements?.includes(
      "Fragile",
    )
  ) {
    score += 5;
  }

  return Math.min(score, 100);
}

// ==========================================
// DELAY HELPER
// ==========================================

function delay(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}