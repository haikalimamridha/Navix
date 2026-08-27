// WayFinder agent layer.
//
// Each intelligence agent (commodity, freight, port, weather, geopolitical,
// supplier, regulatory) issues live Bright Data web searches and then reasons
// over the retrieved sources with OpenAI to produce a structured RiskFactor.
// A product agent decomposes the item into raw-material exposure, and a synthesis
// agent fuses everything into forecasts, routes, alerts, and an executive summary.

import { bdSearch } from "./brightdata";
import { jsonCompletion, textCompletion } from "./openai";
import type {
  ActionItem,
  Alert,
  CostForecast,
  DependencyDriver,
  IntakeResult,
  MaterialBreakdown,
  PortOption,
  PortRecommendation,
  Recommendation,
  RiskCategory,
  RiskFactor,
  RouteOption,
  ShipmentInput,
  Source,
  RegulatoryInfo,
  DocItem,
} from "./types";

// ---------------------------------------------------------------------------
// Product + material decomposition agent (Agents 1 & 2)
// ---------------------------------------------------------------------------

export interface ProductProfile {
  productCategory: string;
  hsCodes: string[];
  materials: MaterialBreakdown[];
  dependencies: string[];
  sources: Source[];
}

export async function productAgent(input: ShipmentInput): Promise<ProductProfile> {
  const sources = await bdSearch(`${input.product} materials composition manufacturing HS code Indonesia`, 4);
  const compactSources = sources .slice(0, 3) .map(compactSource);

  const guess = guessMaterials(input.product);
  const fallback: ProductProfile = {
    productCategory: input.product,
    hsCodes: [],
    materials: guess.materials,
    dependencies: guess.dependencies,
    sources,
  };

    const result = await jsonCompletion<ProductProfile>({
      system:
          "You are a product analysis and bill-of-materials expert for Indonesian supply chains. " +
          "Given a product, identify its category, likely HS (Harmonized System) codes, the raw-material " +
          "composition by approximate weight percentage (must sum to ~100), and upstream commodity, " +
          "manufacturing, and logistics dependencies that affect its landed cost in Indonesia. " +
          "Consider Indonesian import and domestic supply-chain context when relevant. " +
          "productCategory MUST be concise: 2-4 words, no semicolons or clauses (e.g. 'Frozen shrimp', 'Plastic furniture'). " +
          "Respond ONLY with JSON.",
      user:
          `Product: ${input.product}\nOrigin: ${input.origin_city}, ${input.origin_province}, Indonesia\nDestination: ${input.destination_city}, ${input.destination_province}, Indonesia\n` +
          `Approx weight (kg): ${input.weightKg}\n\n` +
          `Reference snippets from the web:\n${ compactSources.length > 0 ? compactSources .map( (s) => `- ${s.title}: ${s.snippet}` + (s.url ? ` (${s.url})` : ""), ) .join("\n") : "(no fresh web results)" }\n\n` +
          `Return JSON of shape:\n` +
          `{"productCategory": string, "hsCodes": string[], "materials": [{"material": string, "pct": number}], ` +
          `"dependencies": string[]}`,
      fallback,
      agent: "product",
      maxTokens: 1000
    });

  // attach sources + normalize material percentages    
  const total = result.materials?.reduce((a:number, m:MaterialBreakdown) => a + (m.pct || 0), 0) || 0;
  const materials =
    total > 0
      ? result.materials.map((m:MaterialBreakdown) => ({ material: m.material, pct: Math.round((m.pct / total) * 100) }))
      : fallback.materials;

  return {
    productCategory: result.productCategory || input.product,
    hsCodes: result.hsCodes?.slice(0, 4) || [],
    materials,
    dependencies: result.dependencies?.length ? result.dependencies : fallback.dependencies,
    sources,
  };
}

// ---------------------------------------------------------------------------
// Generic intelligence agent (Agents 3-8 + regulatory)
// ---------------------------------------------------------------------------

export interface IntelSpec {
  id: string;
  name: string;
  category: RiskCategory;
  queries: string[];
  focus: string; // what this agent assesses
}

export async function intelAgent(spec: IntelSpec, context: string): Promise<{ factor: RiskFactor; sources: Source[] }> {
  // Fan out the searches for this agent in parallel.
  const results = await Promise.all(spec.queries.map((q) => bdSearch(q, 3)));
  const sources = dedupeSources(results.flat()).slice(0, 5);

  const fallback = heuristicFactor(spec, sources);

  const factor = await jsonCompletion<RiskFactor>({
    system:
      `You are the ${spec.name} for an Indonesian supply-chain risk platform. You assess ${spec.focus}. ` +
      `Score risk 0-100 (0 = calm/no risk, 100 = severe disruption likely). Be decisive, quantitative, and specific to the shipment location and date. ` +
      `The MOST IMPORTANT field is "actionable": ONE concrete, time-bound sentence the shipper can act on — ` +
      `Mention the relevant month, date, location, event, or recommended action when possible. ` +
      `Do not give vague advice or generic statements. ` +
      `Use Indonesian logistics, ports, regulations, weather, suppliers, and trade context ` +
      `when the shipment involves Indonesia. ` +
      `Respond ONLY with JSON.`,
    user:
      `Shipment context: ${context}\n\n` +
      `Live web findings:\n${sources.map((s) => `- ${s.title}: ${s.snippet ?? ""}`).join("\n") || "(no fresh results)"}\n\n` +
      `Return JSON: {"score": number, "label": string (3-5 word headline), ` +
      `"actionable": string (one concrete, time-bound action/insight), "detail": string (2-3 sentences), ` +
      `"trend": "up"|"down"|"flat", "keyFindings": string[] (2-4 bullets)}`,
    fallback,
    agent: "product",
    maxTokens: 800,
  });

  return {
    factor: {
      category: spec.category,
      score: clamp(Math.round(factor.score ?? 50)),
      label: factor.label || fallback.label,
      detail: factor.detail || fallback.detail,
      actionable: factor.actionable || fallback.actionable,
      trend: factor.trend || "flat",
      keyFindings: (factor.keyFindings?.length ? factor.keyFindings : fallback.keyFindings).slice(0, 4),
      sources,
    },
    sources,
  };
}

export function buildIntelSpecs(input: ShipmentInput, profile: ProductProfile): IntelSpec[] {
    const materialList = profile.materials.map((m) => m.material).join(", ");

    const origin = `${input.origin_city}, ${input.origin_province}, Indonesia`;
    const destination = `${input.destination_city}, ${input.destination_province}, Indonesia`;

    const currentYear = new Date().getFullYear();
    return [
        {
        id: "commodity",
        name: "Commodity Intelligence Agent",
        category: "commodity",
        focus: `raw-material cost exposure (${materialList})`,
        queries: [
            `${profile.materials[0]?.material || "raw material"} price trend Indonesia ${currentYear}`,
            `${materialList} commodity price Indonesia forecast ${currentYear}`,
        ],
        },
        {
        id: "freight",
        name: "Freight Intelligence Agent",
        category: "freight",
        focus: "domestic freight rates, transportation capacity, fuel costs, and route disruptions in Indonesia",
        queries: [
            `${origin} to ${destination} freight shipping rates ${input.shippingMode || ""} ${currentYear}`,
            `Indonesia domestic freight rates logistics cost forecast ${currentYear}`,
        ],
        },
        {
        id: "port",
        name: "Port Intelligence Agent",
        category: "port",
        focus: "Indonesian port congestion, vessel queues, container dwell time, throughput, and operational disruptions",
        queries: [
            `${destination} port congestion delays vessel queue ${currentYear}`,
            `${origin} port congestion throughput dwell time ${currentYear}`,
        ],
        },
        {
        id: "weather",
        name: "Weather Intelligence Agent",
        category: "weather",
        focus: "weather conditions, flooding, heavy rainfall, storms, landslides, and other seasonal disruptions affecting the Indonesian route",
        queries: [
            `weather forecast ${origin} ${destination} shipping logistics ${input.shipDate}`,
            `Indonesia extreme weather flood storm rainfall supply chain disruption ${currentYear}`,
        ],
        },
        {
        id: "geopolitical",
        name: "Geopolitical Intelligence Agent",
        category: "geopolitical",
        focus: "Indonesian trade policy, government regulations, fuel policy, regional geopolitical risks, and events affecting logistics",
        queries: [
            `Indonesia trade policy logistics transportation regulation ${currentYear}`,
            `Indonesia geopolitical risk supply chain logistics ${currentYear}`,
        ],
        },
        {
        id: "supplier",
        name: "Supplier Intelligence Agent",
        category: "supplier",
        focus: "supplier/manufacturing health in the origin region",
        queries: [
            `${input.origin_province} manufacturing PMI factory output ${profile.productCategory} ${currentYear}`,
            `${input.origin_city} ${profile.productCategory} supplier factory disruption strike closure`,
        ],
        },
        {
        id: "regulatory",
        name: "Regulatory Intelligence Agent",
        category: "regulatory",
        focus: "Indonesian customs, import regulations, domestic trade compliance, HS classification, and product-specific requirements",
        queries: [
            `Indonesia customs HS code ${profile.productCategory} import regulation ${currentYear}`,
            `Indonesia tariff classification ${profile.productCategory} HS code ${currentYear}`,
        ],
        },
    ];
}

export async function intelBatchAgent(
  specs: IntelSpec[],
  context: string,
): Promise<RiskFactor[]> {
  console.log(
    `[intelBatch] Starting ${specs.length} intelligence categories...`,
  );

  // -------------------------------------------------------------------------
  // 1. Run ALL Bright Data searches in parallel
  // -------------------------------------------------------------------------

  const searchResults = await Promise.all(
    specs.map(async (spec) => {
      console.log(
        `[intelBatch:${spec.id}] Starting ${spec.queries.length} searches...`,
      );

      const results = await Promise.all(
        spec.queries.map(async (query) => {
          try {
            const sources = await bdSearch(query, 3);

            console.log(
              `[intelBatch:${spec.id}] "${query}" -> ${sources.length} sources`,
            );

            return sources;
          } catch (error) {
            console.error(
              `[intelBatch:${spec.id}] Search failed:`,
              error,
            );

            // Jangan biarkan satu search menggagalkan seluruh pipeline.
            return [];
          }
        }),
      );

      // ---------------------------------------------------------------------
      // Deduplicate + validate sources
      // ---------------------------------------------------------------------

      const sources = dedupeSources(
        results
          .flat()
          .filter(
            (source) =>
              source &&
              typeof source.url === "string" &&
              source.url.trim().length > 0 &&
              (
                source.title?.trim().length > 0 ||
                (source.snippet?.trim().length ?? 0) > 0
              ),
          ),
      ).slice(0, 5);

      console.log(
        `[intelBatch:${spec.id}] ${sources.length} valid sources`,
      );

      return {
        spec,
        sources,
      };
    }),
  );

  // -------------------------------------------------------------------------
  // 2. Build deterministic fallbacks
  // -------------------------------------------------------------------------

  const fallbacks = searchResults.map(({ spec, sources }) =>
    heuristicFactor(spec, sources),
  );

  // -------------------------------------------------------------------------
  // 3. Prepare intelligence input for ONE LLM call
  // -------------------------------------------------------------------------
  function compactIntelSource(source: Source) {
    return {
      title: (source.title ?? "").trim().slice(0, 140),
      snippet: (source.snippet ?? "").trim().slice(0, 280),
      url: (source.url ?? "").trim().slice(0, 300),
    };
  } 

  const intelligenceInput = searchResults
    .map(({ spec, sources }, index) => {
      const compactSources = sources.slice(0, 2).map((source) => ({
        title: (source.title ?? "").trim().slice(0, 120),
        snippet: (source.snippet ?? "").trim().slice(0, 220),
        url: (source.url ?? "").trim().slice(0, 220),
      }));

      const findings =
        compactSources.length > 0
          ? compactSources
              .map(
                (s, sourceIndex) =>
                  `${sourceIndex + 1}. ${s.title}: ${s.snippet}` +
                  (s.url ? ` [${s.url}]` : ""),
              )
              .join("\n")
          : "(no fresh results)";

      return (
        `CATEGORY ${index + 1}\n` +
        `id:${spec.id}\n` +
        `category:${spec.category}\n` +
        `focus:${spec.focus}\n` +
        `findings:\n${findings}`
      );
    })
    .join("\n\n");
    console.log( `[intelBatch] compact input chars=${intelligenceInput.length}`, );

  // -------------------------------------------------------------------------
  // 4. Deterministic fallback
  // -------------------------------------------------------------------------

  const fallback = {
    factors: fallbacks.map((factor, index) => ({
      category: specs[index].category,
      score: factor.score,
      label: factor.label,
      actionable: factor.actionable,
      detail: factor.detail,
      trend: factor.trend,
      keyFindings: factor.keyFindings,
    })),
  };

  // -------------------------------------------------------------------------
  // 5. ONE LLM call for ALL intelligence categories
  // -------------------------------------------------------------------------
  const compactContext = context.slice(0, 1200);
  console.log(
    `[intelBatch] Sending ${specs.length} categories in ONE LLM call...`,
  );

  let response: {
    factors: Array<{
      category: RiskCategory;
      score: number;
      label: string;
      actionable: string;
      detail: string;
      trend: "up" | "down" | "flat";
      keyFindings: string[];
    }>;
  };

  try {
    response = await jsonCompletion<{
      factors: Array<{
        category: RiskCategory;
        score: number;
        label: string;
        actionable: string;
        detail: string;
        trend: "up" | "down" | "flat";
        keyFindings: string[];
      }>;
    }>({
      system:
        `You are the central intelligence engine for an Indonesian supply-chain risk platform.
        Analyze ALL provided intelligence categories in one pass.
        For every category, assess risk from 0-100:
        - 0 = calm / no meaningful risk
        - 100 = severe disruption likely
        Rules:
        - Base the assessment ONLY on the provided live web findings and shipment context.
        - Do not invent facts, prices, dates, regulations, disruptions, or statistics.
        - If evidence is weak or unavailable, give a conservative score and explicitly reflect the uncertainty.
        - Be specific to the shipment location and ship date.
        - "actionable" MUST be exactly ONE concrete, time-bound action or insight.
        - "detail" must contain 2-3 concise sentences.
        - "label" must be a concise 3-5 word headline.
        - "trend" MUST be exactly "up", "down", or "flat".
        - "keyFindings" must contain 2-4 concise findings.

        Return exactly one factor for every requested category.
        Never omit a category.
        Never add an unknown category.
        Respond ONLY with valid JSON.`,

      user:
        `Shipment context: ${compactContext}  Intelligence categories and live findings:  ${intelligenceInput}  Return exactly:

        {
          "factors": [
            {
              "category": "commodity",
              "score": 0,
              "label": "3-5 word headline",
              "actionable": "one concrete time-bound action",
              "detail": "2-3 sentences",
              "trend": "up",
              "keyFindings": ["finding 1", "finding 2"]
            }
          ]
        }`,

      fallback,
    agent: "intelBatch",
    maxTokens: 2000,
  });

    console.log(
      `[intelBatch] LLM returned ${
        Array.isArray(response?.factors)
          ? response.factors.length
          : 0
      } factors`,
    );
  } catch (error) {
    console.error(
      `[intelBatch] LLM failed, using deterministic fallback:`,
      error,
    );

    response = fallback
    agent: "intelBatch"
    maxTokens: 1200
  }

  // -------------------------------------------------------------------------
  // 6. Validate and normalize LLM output
  // -------------------------------------------------------------------------

  const validCategories = new Set(
    specs.map((spec) => spec.category),
  );

  const normalizedFactors = Array.isArray(response?.factors)
    ? response.factors.filter(
        (factor) =>
          factor &&
          validCategories.has(factor.category),
      )
    : [];

  // -------------------------------------------------------------------------
  // 7. Merge LLM result with fallback
  // -------------------------------------------------------------------------

  const finalFactors = specs.map((spec, index) => {
    const fallbackFactor = fallbacks[index];

    const factor = normalizedFactors.find(
      (item) => item.category === spec.category,
    );

    // Tidak ada hasil LLM untuk kategori ini.
    if (!factor) {
      console.warn(
        `[intelBatch:${spec.id}] Missing LLM factor -> fallback`,
      );

      return {
        ...fallbackFactor,
        sources: searchResults[index].sources,
      };
    }

    // -----------------------------------------------------------------------
    // Validate score
    // -----------------------------------------------------------------------

    const rawScore = Number(factor.score);

    const score = Number.isFinite(rawScore)
      ? clamp(Math.round(rawScore))
      : fallbackFactor.score;

    // -----------------------------------------------------------------------
    // Validate trend
    // -----------------------------------------------------------------------

    const trend =
      factor.trend === "up" ||
      factor.trend === "down" ||
      factor.trend === "flat"
        ? factor.trend
        : fallbackFactor.trend;

    // -----------------------------------------------------------------------
    // Validate strings
    // -----------------------------------------------------------------------

    const label =
      typeof factor.label === "string" &&
      factor.label.trim().length > 0
        ? factor.label.trim()
        : fallbackFactor.label;

    const detail =
      typeof factor.detail === "string" &&
      factor.detail.trim().length > 0
        ? factor.detail.trim()
        : fallbackFactor.detail;

    const actionable =
      typeof factor.actionable === "string" &&
      factor.actionable.trim().length > 0
        ? factor.actionable.trim()
        : fallbackFactor.actionable;

    // -----------------------------------------------------------------------
    // Validate key findings
    // -----------------------------------------------------------------------

    const keyFindings =
      Array.isArray(factor.keyFindings)
        ? factor.keyFindings
            .filter(
              (finding): finding is string =>
                typeof finding === "string" &&
                finding.trim().length > 0,
            )
            .map((finding) => finding.trim())
            .slice(0, 4)
        : [];

    return {
      category: spec.category,
      score,
      label,
      detail,
      actionable,
      trend,
      keyFindings:
        keyFindings.length > 0
          ? keyFindings
          : fallbackFactor.keyFindings.slice(0, 4),
      sources: searchResults[index].sources,
    };
  });

  // -------------------------------------------------------------------------
  // 8. Final diagnostics
  // -------------------------------------------------------------------------

  const liveSourceCount = searchResults.reduce(
    (total, result) => total + result.sources.length,
    0,
  );

  const fallbackCount = finalFactors.filter((factor, index) => {
    const llmFactor = normalizedFactors.find(
      (item) => item.category === specs[index].category,
    );

    return !llmFactor;
  }).length;

  console.log(
    `[intelBatch] Completed: ${finalFactors.length}/${specs.length} factors`,
  );

  console.log(
    `[intelBatch] Live sources: ${liveSourceCount}`,
  );

  console.log(
    `[intelBatch] Fallback factors: ${fallbackCount}`,
  );

  return finalFactors;
}

// ---------------------------------------------------------------------------
// Port Recommendation Agent

export async function portRecommenderAgent(
  input: ShipmentInput,
): Promise<PortRecommendation | null> {
  // ============================================================
  // LLM #1 — Select realistic port candidates
  // ============================================================
  const candidates = await jsonCompletion<{ ports: string[] }>({
    system:
      "You are an Indonesian maritime logistics routing expert. " +
      "Given an inland or domestic shipment in Indonesia, identify realistic " +
      "seaports that can serve the destination. " +
      "Prioritize major Indonesian commercial ports and nearby alternatives. " +
      "Consider the destination city/province when selecting ports. " +
      "Return only ports that are geographically realistic for the shipment. " +
      "Use the format 'Port Name, City, Indonesia'. " +
      "Return JSON only.",
    user:
      `Origin province: ${input.origin_province}\n` +
      `Origin city: ${input.origin_city}\n` +
      `Destination province: ${input.destination_province}\n` +
      `Destination city: ${input.destination_city}\n` +
      `Shipping mode: ${input.shippingMode || "not specified"}\n\n` +
      `Return JSON with 3-4 realistic Indonesian seaports. ` +
      `The most suitable port for the destination should be first.\n` +
      `Example: {"ports":["Tanjung Perak, Surabaya, Indonesia","Tanjung Emas, Semarang, Indonesia"]}`,
    fallback: {
      ports: [
        "Tanjung Perak, Surabaya, Indonesia",
        "Tanjung Emas, Semarang, Indonesia",
        "Tanjung Priok, Jakarta, Indonesia",
      ],
    },
    agent: "portrecommendercandidates"
  });

  const ports = (candidates.ports || [])
    .filter(Boolean)
    .slice(0, 4);

  if (!ports.length) return null;

  const currentYear = new Date().getFullYear();

  // ============================================================
  // Bright Data — Search all ports in parallel
  // NO LLM CALL HERE
  // ============================================================
  const portResearch = await Promise.all(
    ports.map(async (port: string) => {
      const sources = await bdSearch(
        `${port} Indonesia port congestion dwell time vessel queue delays ${currentYear}`,
        3,
      );

      // Compact sources to reduce LLM payload size
      const compactSources = sources.slice(0, 3).map((x) => ({
        title: x.title?.slice(0, 160) ?? "",
        snippet: x.snippet?.trim().slice(0, 500) ?? "",
        url: x.url ?? "",
      }));

      return {
        port,
        sources,
        compactSources,
      };
    }),
  );

  // ============================================================
  // LLM #2 — Analyze ALL ports + select best + rationale
  // ============================================================
  const analysis = await jsonCompletion<{
    ports: Array<{
      name: string;
      congestionScore: number;
      waitDays: number;
      note: string;
    }>;
    recommended: string;
    rationale: string;
  }>({
    system:
      "You are an Indonesian port operations analyst and logistics advisor. " +
      "Analyze all provided Indonesian port candidates using ONLY the supplied web findings. " +
      "For each port, estimate congestion from 0-100 and likely waiting time in days. " +
      "Do not invent precise operational statistics when evidence is unavailable. " +
      "When evidence is limited, use conservative estimates. " +
      "Then select the best port based primarily on congestion and waiting time. " +
      "The recommended port should be one of the provided candidates. " +
      "Return JSON only.",

    user:
      `Shipment:\n` +
      `Origin: ${input.origin_city}, ${input.origin_province}\n` +
      `Destination: ${input.destination_city}, ${input.destination_province}\n` +
      `Shipping mode: ${input.shippingMode || "not specified"}\n\n` +

      `Port candidates and web findings:\n` +

      portResearch
        .map(
          ({ port, compactSources }) =>
            `PORT: ${port}\n` +
            `${
              compactSources.length
                ? compactSources
                    .map(
                      (x) =>
                        `- ${x.title}: ${x.snippet}`,
                    )
                    .join("\n")
                : "- No fresh web findings available"
            }`,
        )
        .join("\n\n") +

      `\n\nReturn JSON in exactly this structure:\n` +
      `{"ports":[` +
      `{"name":"Port Name","congestionScore":50,"waitDays":3,"note":"short note"}` +
      `],"recommended":"Port Name","rationale":"1-2 concise sentences comparing the recommended port with alternatives."}`,

    fallback: {
      ports: ports.map((port) => ({
        name: port,
        congestionScore: 50,
        waitDays: 3,
        note: `${port}: conditions mixed.`,
      })),
      recommended: ports[0],
      rationale:
        `${ports[0]} is the primary candidate for the destination; ` +
        `current congestion evidence is limited, so alternatives should be monitored.`,
    },
    agent: "portrecommenderanalyze",
    maxTokens: 600
    
  });

  // ============================================================
  // Normalize LLM output
  // ============================================================
  const analyzedPorts = Array.isArray(analysis.ports)
    ? analysis.ports
    : [];

  const scored: Omit<
    PortOption,
    "recommended" | "lat" | "lng" | "freightCost"
  >[] = ports.map((port) => {
    const result = analyzedPorts.find(
      (p) =>
        p.name?.toLowerCase().trim() ===
        port.toLowerCase().trim(),
    );

    return {
      name: port,
      congestionScore: clamp(
        Math.round(result?.congestionScore ?? 50),
      ),
      waitDays: Math.max(
        0,
        Math.round(result?.waitDays ?? 3),
      ),
      note:
        result?.note ||
        `${port}: conditions mixed.`,
      sources:
        portResearch.find((x) => x.port === port)?.sources || [],
    };
  });

  // ============================================================
  // Select best port deterministically
  // ============================================================
  const best =
    scored.find(
      (p) =>
        p.name === analysis.recommended,
    ) ??
    [...scored].sort(
      (a, b) =>
        a.congestionScore - b.congestionScore ||
        a.waitDays - b.waitDays,
    )[0];

  if (!best) return null;

  const options: PortOption[] = scored.map((p) => ({
    ...p,
    recommended: p.name === best.name,
    freightCost: 0,
    lat: null,
    lng: null,
  }));

  return {
    recommended: best.name,
    rationale:
      analysis.rationale ||
      `${best.name} is the recommended port based on the available congestion and waiting-time evidence.`,
    options,
  };
}

// ---------------------------------------------------------------------------
// Regulatory Agent — analyze Indonesian domestic shipping regulations,
// product compliance, documentation, and special handling requirements.
// ---------------------------------------------------------------------------

export async function regulatoryAgent(
  input: ShipmentInput,
  profile: ProductProfile,
): Promise<RegulatoryInfo | null> {
  const special = (input.specialRequirements ?? []).filter(
    (r: string) => r && r !== "Standard (ambient)",
  );

  const origin = `${input.origin_city}, ${input.origin_province}, Indonesia`;
  const destination = `${input.destination_city}, ${input.destination_province}, Indonesia`;

  const currentYear = new Date().getFullYear();

  // 1. Search Indonesian domestic regulatory information
  const queries: string[] = [
    `Indonesia domestic transportation regulations ${profile.productCategory} ${currentYear}`,
    `${profile.productCategory} Indonesia domestic shipping requirements ${currentYear}`,
    `${profile.productCategory} Indonesia transport compliance ${special.length ? special.join(" ") : ""}`,
  ];

  const results = await Promise.all(
    queries.map((q: string) => bdSearch(q, 3)),
  );

  const sources = dedupeSources(results.flat()).slice(0, 6);

  // 2. Fallback
  const fallback: RegulatoryInfo = {
    documents: [
      { name: "Surat Jalan", url: "" },
      { name: "Commercial Invoice", url: "" },
      { name: "Packing List", url: "" },
    ],
    requirements: [],
    notes:
      "Check Indonesian domestic transportation regulations and product-specific " +
      "compliance requirements before shipment.",
    sources,
  };

  // 3. Analyze Indonesian domestic regulations
  const result = await jsonCompletion<RegulatoryInfo>({
    system:
      "You are an Indonesian domestic logistics and regulatory compliance expert. " +
      "Analyze the shipment using the provided web findings. Identify relevant " +
      "Indonesian domestic transportation regulations, product compliance " +
      "requirements, required shipping documents, and special handling requirements. " +
      "This shipment is entirely within Indonesia. " +
      "Do NOT discuss import duties, export duties, Section 301, anti-dumping duties, " +
      "or foreign customs requirements. " +
      "Focus only on regulations applicable to domestic movement within Indonesia. " +
      "Consider the shipping mode, product type, origin, destination, and special " +
      "handling requirements. " +
      "For each document, provide an official Indonesian government or regulatory URL " +
      "only when a reliable URL is available. Never invent or guess URLs. " +
      "Respond ONLY with valid JSON.",

    user:
      `Product: ${profile.productCategory}\n` +
      `HS code: ${profile.hsCodes[0] || "(not specified)"}\n` +
      `Origin: ${origin}\n` +
      `Destination: ${destination}\n` +
      `Shipping mode: ${input.shippingMode || "not specified"}\n` +
      `Special handling: ${special.length ? special.join(", ") : "none"}\n\n` +
      `Web findings:\n` +
      `${
        sources
          .map(
            (s: Source) =>
              `- ${s.title} (${s.url}): ${s.snippet ?? ""}`,
          )
          .join("\n") || "(no fresh results)"
      }\n\n` +
      `Return JSON:\n` +
      `{\n` +
      `  "documents": [{"name": string, "url": string}],\n` +
      `  "requirements": string[],\n` +
      `  "notes": string\n` +
      `}`,

    fallback,
    agent: "regulatory"
    });

  // 4. Normalize documents
  const rawDocuments =
    Array.isArray(result.documents) && result.documents.length
      ? result.documents
      : fallback.documents;

  const documents = rawDocuments
    .filter(
      (d: DocItem) =>
        d &&
        typeof d.name === "string" &&
        d.name.trim().length > 0,
    )
    .slice(0, 8)
    .map((d: DocItem) => ({
      name: d.name.trim(),
      url:
        typeof d.url === "string" &&
        /^https?:\/\//.test(d.url)
          ? d.url
          : "",
    }));

  // 5. Return normalized result
  return {
    documents,
    requirements: (result.requirements ?? [])
      .filter((r: string) => typeof r === "string" && r.trim().length > 0)
      .slice(0, 8),
    notes: result.notes || fallback.notes,
    sources,
  };
}

// ---------------------------------------------------------------------------
// Conversational intake — extract fields, merge with what we already know,
// and ask for whatever required info is still missing.
// ---------------------------------------------------------------------------

export const SHIP_MODES = ["Ocean (container)", "Air", "Rail", "Truck"];
export const SPECIAL_REQS = ["Standard (ambient)", "Refrigerated", "Frozen", "Fragile", "Hazardous", "Organic"];

function normalizeMode(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (/container|kontainer|ocean|sea|laut|kapal|fcl|lcl|vessel|ship|pelni|ro-ro|roro/.test(m)) return "Ocean (container)";
  if (/air|udara|plane|pesawat|flight|penerbangan|cargo udara/.test(m)) return "Air";
  if (/rail|kereta|kereta api|train|rel/.test(m)) return "Rail";
  if (/truck|truk|road|jalan|lorry|ground|darat|pickup|pick-up|fuso|wingbox|wing box/.test(m)) return "Truck";
  return "";
}

function normalizeReqs(raw: string): string[] {
  const m = (raw || "").toLowerCase();
  const out: string[] = [];
  if (/frozen|freeze|freezer|deep freeze|beku|dibekukan|pembekuan/.test(m)) out.push("Frozen");
  if (/refrigerat|reefer|chilled|cold[\s-]?chain|cool|dingin|pendingin|berpendingin|rantai dingin/.test(m)) out.push("Refrigerated");
  if (/fragile|breakable|delicate|mudah pecah|mudah rusak|rapuh|pecah belah/.test(m)) out.push("Fragile");
  if (/hazard|dangerous|hazmat|imdg|flammable|corros|toxic|lithium battery|berbahaya|bahan berbahaya|mudah terbakar|beracun|korosif/.test(m)) out.push("Hazardous");
  if (/organic|bio[\s-]?certified|organik|bersertifikat organik/.test(m)) out.push("Organic");
  if (/ambient|standard|none|no special|regular|dry|suhu ruang|suhu normal|biasa|tidak ada|tanpa kebutuhan khusus|normal/.test(m)) out.push("Standard (ambient)");
  return [...new Set(out)];
}

export async function intake(text: string, current?: Partial<ShipmentInput>): Promise<IntakeResult> {
  const clean = (s: string) => (s || "").replace(/^[\s,]+|[\s,]+$/g, "");

  const extracted = await jsonCompletion<
    ShipmentInput & { shippingModeRaw?: string; specialRaw?: string; pricePerKg?: number }
  >({
    system:
        "Extract shipment fields from the user's message for an Indonesian logistics shipment. " +
        "Convert any weight to kilograms (1 metric ton = 1000 kg). " +
        "Detect the product, origin province and city, destination province and city, " +
        "weight, quantity, shipping mode, container size, price per kg in USD, ship date, " +
        "and special handling requirements. " +
        "Shipping mode can be ocean/container, air, rail, or truck. " +
        "Container size can be 20ft, 40ft, 40ft HC, LCL, pallets, or Air ULD. " +
        "Special handling can be refrigerated, frozen, ambient/standard, fragile, hazardous, or organic. " +
        "If a field is not present, leave it empty or 0. " +
        "Do NOT invent values. Respond ONLY with valid JSON.",
    user:
        `Message: "${text}"\n\n` +
        `Return JSON: ` +
        `{"product": string, ` +
        `"origin_province": string, ` +
        `"origin_city": string, ` +
        `"destination_province": string, ` +
        `"destination_city": string, ` +
        `"weightKg": number, ` +
        `"quantity": number, ` +
        `"containerSize": string, ` +
        `"pricePerKg": number, ` +
        `"shipDate": string, ` +
        `"shippingModeRaw": string, ` +
        `"specialRaw": string}`,
    fallback: {
        product: "",
        origin_province: "",
        origin_city: "",
        destination_province: "",
        destination_city: "",
        weightKg: 0,
        shipDate: "",
    },
    agent: "intake"
  });

  const newReqs = normalizeReqs(extracted.specialRaw || "");

  // Merge: keep what we already had, fill in anything new the user just provided.
  const merged: ShipmentInput = {
    product: clean(extracted.product) || current?.product || "",
    origin_province: clean(extracted.origin_province || "") || current?.origin_province || "",
    origin_city: clean(extracted.origin_city || "") || current?.origin_city || "",
    destination_province: clean(extracted.destination_province || "") || current?.destination_province || "",
    destination_city: clean(extracted.destination_city || "") || current?.destination_city || "",
    weightKg: Number(extracted.weightKg) || current?.weightKg || 0,
    quantity: extracted.quantity ? Number(extracted.quantity) : current?.quantity,
    shipDate: clean(extracted.shipDate) || current?.shipDate || "",
    shippingMode: normalizeMode(extracted.shippingModeRaw || "") || current?.shippingMode || "",
    specialRequirements: newReqs.length ? newReqs : current?.specialRequirements,
  };

  // Required fields: [field key, friendly label, present?]
  const required: [string, string, () => boolean][] = [
    ["product", "what you're shipping", () => !!merged.product],
    ["origin_province", "the origin province", () => !!merged.origin_province],
    ["origin_city", "the origin city", () => !!merged.origin_city],
    ["destination_province", "the destination province", () => !!merged.destination_province],
    ["destination_city", "the destination city", () => !!merged.destination_city],
    ["weightKg", "the total weight (kg or tons)", () => merged.weightKg > 0],
    ["shippingMode", "how it should ship (ocean container, air, rail, or truck)", () => !!merged.shippingMode],
    ["shipDate", "when it's ready to ship", () => !!merged.shipDate],
    ["specialRequirements", "any special handling (refrigerated, frozen, fragile, hazardous, organic — or just say 'none')", () => (merged.specialRequirements?.length ?? 0) > 0],
  ];

  const stillMissing = required.filter(([, , ok]) => !ok());
  const missing = stillMissing.map(([, label]) => label);
  const missingFields = stillMissing.map(([key]) => key);

  let question: string | null = null;
  if (missing.length === 1) {
    question = `Almost there — could you also tell me ${missing[0]}?`;
  } else if (missing.length > 1) {
    const list = missing.slice(0, -1).join("; ") + "; and " + missing[missing.length - 1];
    question = `Got it so far. To run a full analysis I still need: ${list}.`;
  }

  return { input: merged, missing, missingFields, question, ready: missing.length === 0 };
}

// ---------------------------------------------------------------------------
// Commodity Price Agent — scrape the live current price for each driver via
// Bright Data, then extract price + a short-term forecast with one LLM call.
// ---------------------------------------------------------------------------

function rnd2(v: number, scale: number): number {
  if (scale >= 1000) return Math.round(v);
  if (scale >= 10) return Math.round(v * 10) / 10;
  return Math.round(v * 100) / 100;
}

export async function enrichDriverPrices(drivers: DependencyDriver[]): Promise<DependencyDriver[]> {
  if (!drivers.length) return drivers;

  // 1. Scrape a price source for each driver in parallel.
  const searched = await Promise.all(
    drivers.map(async (d) => {
      const sources = await bdSearch(`${d.name} current spot price ${d.unit} today forecast 2026`, 3);
      return { d, sources };
    }),
  );

  // 2. One LLM call extracts the current price + forecast for all of them.
  const payload = searched.map((s, i) => ({
    id: i,
    name: s.d.name,
    unit: s.d.unit,
    snippets: s.sources.map((x) => `${x.title}: ${x.snippet ?? ""}`).slice(0, 3),
  }));

  const out = await jsonCompletion<{
    items: { id: number; currentPrice: number; unit?: string; forecastPct: number; forecastNote: string }[];
  }>({
    system:
        "You are a commodity price analyst for a logistics intelligence platform. " +
        "For each commodity, analyze the provided live web search snippets and extract " +
        "the most recent CURRENT market price using the requested unit. " +
        "Then estimate the short-term price change over approximately the next 60 days. " +
        "The forecastPct represents the expected percentage increase or decrease from " +
        "the current price. " +
        "Use only information supported by the provided search results. " +
        "If the search results do not contain a reliable current price, do not invent " +
        "a precise market price. Return currentPrice as 0 so the application can use " +
        "its fallback value. " +
        "Respond ONLY with valid JSON.",
    user:
        `Items:\n${JSON.stringify(payload)}\n\n` +
        `Return JSON: {"items":[{"id":number,"currentPrice":number,"unit":string,"forecastPct":number,"forecastNote":string}]}`,
    fallback: { items: [] },
    agent: "enrichdriverprices",
    maxTokens: 1000
  });

  const items = Array.isArray(out.items) ? out.items : [];

  const byId = new Map< number, { id: number; currentPrice: number; unit?: string; forecastPct: number; forecastNote: string; } >
  ( items.map((item: { id: number; currentPrice: number; unit?: string; forecastPct: number; forecastNote: string; }) => [item.id, item]), );

  return searched.map((item, index) => {
    const driver = item.d;
    const sources = item.sources;
    const result = byId.get(index);

    // No reliable live price found.
    if (
      !result ||
      typeof result.currentPrice !== "number" ||
      result.currentPrice <= 0
    ) {
      return {
        ...driver,
        sources,
      };
    }

    const current = result.currentPrice;
    const unit = result.unit || driver.unit;

    // Rescale the historical shape so it ends at the real current price.
    const oldLast = driver.series[driver.series.length - 1]?.v ?? current;
    const scale = current / (oldLast || current);
    const history: { t: string; v: number | null; f?: number | null }[] = driver.series.map((p: { t: string; v: number | null; f?: number | null }) => ({
      t: p.t,
      v: rnd2((p.v ?? current) * scale, current),
    }));
    history[history.length - 1].v = current;
    history[history.length - 1].f = current; // junction so the dashed forecast connects

    const firstV = history[0].v ?? current;
    const changePct = Math.round(((current - firstV) / firstV) * 1000) / 10;
    const fpct = typeof result.forecastPct === "number" ? result.forecastPct : driver.forecastPct;
    const target = current * (1 + fpct / 100);
    const forecast = [1, 2, 3].map((k) => ({
      t: `+${k * 20}d`,
      v: null,
      f: rnd2(current + (target - current) * (k / 3), current),
    }));

    return {
      ...driver,
      current,
      unit,
      changePct,
      trend: changePct > 1.5 ? "up" : changePct < -1.5 ? "down" : "flat",
      forecastPct: fpct,
      forecastNote: result.forecastNote || "",
      priceLive: true,
      series: [...history, ...forecast],
      sources,
    } as DependencyDriver;
  });
}

// ---------------------------------------------------------------------------
// Synthesis agent (Agents 9-12: cost, route, alerts, summary)
// ---------------------------------------------------------------------------

export interface SynthesisOutput {
  costForecasts: CostForecast[];
  expectedCostIncreasePct: number;
  expectedDelayDays: [number, number];
  routes: RouteOption[];
  alerts: Alert[];
  recommendations: Recommendation[];
}

export async function synthesisAgent(
  input: ShipmentInput,
  profile: ProductProfile,
  factors: RiskFactor[],
  riskScore: number,
): Promise<SynthesisOutput> {
  const factorSummary = factors
    .map((f) => `${f.category} (risk ${f.score}/100, ${f.trend}): ${f.label}`)
    .join("\n");

  const fallback: SynthesisOutput = {
    costForecasts: [
      { horizonDays: 30, productCostPct: 2.1, freightCostPct: 3.4, landedCostPct: 2.6 },
      { horizonDays: 60, productCostPct: 3.8, freightCostPct: 5.2, landedCostPct: 4.3 },
      { horizonDays: 90, productCostPct: 5.1, freightCostPct: 8.0, landedCostPct: 6.4 },
    ],
    expectedCostIncreasePct: 6.4,
    expectedDelayDays: [4, 9],
    routes: defaultRoutes(input),
    alerts: factors
      .filter((f) => f.score >= 60)
      .slice(0, 3)
      .map((f) => ({ severity: f.score >= 75 ? "high" : "medium", title: f.label, impact: f.detail })),
    recommendations: [
      { action: "Lock freight rates now", rationale: "Spot rates are trending up into peak season." },
      { action: "Ship 2-3 weeks earlier", rationale: "Buffer against port congestion and weather delays." },
    ],
  };

  const result = await jsonCompletion<SynthesisOutput>({
    system:
      "You are the cost-prediction, route-optimization and alerting brain of a logistics intelligence " +
      "platform. Combine the per-category risk factors into concrete forecasts and recommended actions. " +
      "Cost percentages are EXPECTED INCREASES over the horizon. Be realistic and decisive. JSON only.",
    user:
      `Shipment: ${input.quantity ? input.quantity + " units of " : ""}${input.product}, ` +
      `${input.weightKg}kg, ${input.origin_city}, ${input.origin_province} -> ${input.destination_city}, ${input.destination_province}, ship date ${input.shipDate}.\n` +
      (input.shippingMode
        ? `The shipper has chosen "${input.shippingMode}" — mark THAT mode as recommended:true and base the headline transit/delay on it, but still list the other modes for comparison.\n`
        : "") +
      `Overall risk score: ${riskScore}/100.\n` +
      `Material exposure: ${profile.materials.map((m) => `${m.material} ${m.pct}%`).join(", ")}.\n\n` +
      `Risk factors:\n${factorSummary}\n\n` +
      `Return JSON: {\n` +
      `  "costForecasts": [{"horizonDays":30,"productCostPct":n,"freightCostPct":n,"landedCostPct":n}, (60), (90)],\n` +
      `  "expectedCostIncreasePct": number,\n` +
      `  "expectedDelayDays": [low, high],\n` +
      `  "routes": [{"method":"Ocean Freight","cost":usd,"transitDays":n,"recommended":bool,"note":string}, ...4 modes],\n` +
      `  "alerts": [{"severity":"high|medium|low","title":string,"impact":string}],\n` +
      `  "recommendations": [{"action":string,"rationale":string}]\n}`,
    fallback,
    agent: "synthesis",
    maxTokens: 1200
  });

  return {
    costForecasts: result.costForecasts?.length === 3 ? result.costForecasts : fallback.costForecasts,
    expectedCostIncreasePct: result.expectedCostIncreasePct ?? fallback.expectedCostIncreasePct,
    expectedDelayDays: result.expectedDelayDays?.length === 2 ? result.expectedDelayDays : fallback.expectedDelayDays,
    routes: result.routes?.length ? result.routes : fallback.routes,
    alerts: result.alerts?.length ? result.alerts : fallback.alerts,
    recommendations: result.recommendations?.length ? result.recommendations : fallback.recommendations,
  };
}

// ---------------------------------------------------------------------------
// Action Plan Agent — turn every per-factor actionable into one prioritized,
// deadline-sorted checklist.
// ---------------------------------------------------------------------------

export async function actionPlanAgent(
    input: ShipmentInput,
    factors: RiskFactor[],
    synthesis: SynthesisOutput,
    ): Promise<ActionItem[]> {
    const fallback: ActionItem[] = factors
        .filter((f) => f.score >= 45)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((f) => ({
            action: f.actionable,
            deadline: "Before booking",
            dueDate: null,
            category: f.category,
            urgency: f.score >= 70 ? "high" : f.score >= 55 ? "medium" : "low",
            why: f.label,
        }));

  const plan = await jsonCompletion<{ items: ActionItem[] }>({
    system:
        "You are a logistics operations planner. Turn the per-category risk actions into ONE consolidated, " +
        "deduplicated to-do list for this shipment. Each item: a short imperative action, a concrete deadline " +
        "(prefer a real date derived from the ship date), an ISO dueDate (YYYY-MM-DD) when datable else null, " +
        "the category, an urgency, and a one-line why. Order earliest deadline first. 5-8 items. JSON only.",
    user:
        `Shipment: ${input.product}, ${input.origin_city}, ${input.origin_province} -> ${input.destination_city}, ${input.destination_province}, ship date ${input.shipDate}` +
        `${input.shippingMode ? `, ${input.shippingMode}` : ""}.\n\n` +
        `Per-category actions:\n${factors.map((f) => `- [${f.category}, risk ${f.score}] ${f.actionable}`).join("\n")}\n\n` +
        `Synthesis recommendations:\n${synthesis.recommendations.map((r) => `- ${r.action}: ${r.rationale}`).join("\n")}\n\n` +
        `Return JSON: {"items":[{"action":string,"deadline":string,"dueDate":"YYYY-MM-DD"|null,` +
        `"category":string,"urgency":"high"|"medium"|"low","why":string}]}`,
    fallback: { items: fallback },
    agent: "actionplan"
  });

  const items = plan.items?.length ? plan.items : fallback;
  // Sort by dueDate ascending; undated items go last.
  return items
    .slice(0, 8)
    .sort((a:ActionItem, b:ActionItem) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });
}

export async function executiveSummaryAgent(
  input: ShipmentInput,
  factors: RiskFactor[],
  riskScore: number,
  synthesis: SynthesisOutput,
): Promise<string> {
  const top = [...factors].sort((a, b) => b.score - a.score).slice(0, 3);
  const fallback =
    `Three major risks currently affect this shipment: ${top
      .map((f) => f.label)
      .join("; ")}. Expected impact: +${synthesis.expectedCostIncreasePct}% cost and a ` +
    `${synthesis.expectedDelayDays[0]}–${synthesis.expectedDelayDays[1]} day delay.`;

  return textCompletion({
    system:
      "You are an executive briefing writer. In 3-4 sentences, plainly explain the top risks to this " +
      "shipment, why they matter, and the headline cost/delay impact. No markdown, no bullet points.",
    user:
      `Shipment: ${input.product}, ${input.origin_city}, ${input.origin_province} -> ${input.destination_city}, ${input.destination_province}, ship date ${input.shipDate}. ` +
      `Overall risk ${riskScore}/100. Top risks: ${top.map((f) => `${f.label} (${f.detail})`).join(" | ")}. ` +
      `Expected +${synthesis.expectedCostIncreasePct}% cost, ${synthesis.expectedDelayDays[0]}-${synthesis.expectedDelayDays[1]} day delay.`,
    fallback,
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

// Deterministic-but-varied baseline used when OpenAI is unavailable, so the
// offline demo still shows a realistic spread of risk rather than flat 50s.
const HEURISTIC_BASE: Record<
  RiskCategory,
  { score: number; trend: RiskFactor["trend"]; label: string; actionable: string }
> = {
  freight: { score: 68, trend: "up", label: "Peak-season rate spike", actionable: "Spot rates may climb ~10-15% during peak season — lock contract rates before booking." },
  port: { score: 61, trend: "up", label: "Rising port dwell times", actionable: "Dwell times rising at the destination port — build a 2-3 day buffer into your booking." },
  commodity: { score: 57, trend: "up", label: "Feedstock costs firming", actionable: "Input costs trending up ~6-8% — hedge or lock supplier pricing before procurement." },
  geopolitical: { score: 54, trend: "flat", label: "Tariff exposure", actionable: "Tariff review pending — confirm HS classification and duty model before booking." },
  weather: { score: 49, trend: "up", label: "Storm-season exposure", actionable: "Tropical storm risk may disrupt this lane — allow a 2-5 day buffer in the shipping schedule." },
  supplier: { score: 42, trend: "flat", label: "Stable but watch policy", actionable: "Supplier base is deep, but get a backup quote in case of tariff-driven margin pressure." },
  regulatory: { score: 38, trend: "flat", label: "Classification check", actionable: "Verify HS code and any 2026 classification changes before the ship date." },
};

function heuristicFactor(spec: IntelSpec, sources: Source[]): RiskFactor {
  const base =
    HEURISTIC_BASE[spec.category] ??
    { score: 50, trend: "flat" as const, label: `${spec.name}`, actionable: "Monitor this factor ahead of booking." };
  // nudge score by how much fresh coverage we found
  const score = clamp(base.score + Math.min(sources.length, 4) * 2 - 4);
  return {
    category: spec.category,
    score,
    label: base.label,
    detail: `Assessment of ${spec.focus}. ${sources[0]?.snippet ?? "Conditions warrant active monitoring for this shipment."}`,
    actionable: base.actionable,
    trend: base.trend,
    keyFindings: sources.slice(0, 3).map((s) => s.title),
    sources,
  };
}

function guessMaterials(product: string): { materials: MaterialBreakdown[]; dependencies: string[] } {
  const p = product.toLowerCase();
  const dep = (extra: string[]) => ["Fuel Prices", ...extra, "Freight Rates", "Port Congestion", "Import Regulations"];
  if (/chair|furniture|toy|bottle|crate|bin|plastic|polymer/.test(p))
    return { materials: [{ material: "Plastic", pct: 80 }, { material: "Steel", pct: 15 }, { material: "Packaging", pct: 5 }], dependencies: dep(["Plastic Resin Prices", "Steel Prices"]) };
  if (/battery|lithium|cell|power/.test(p))
    return { materials: [{ material: "Lithium", pct: 35 }, { material: "Nickel/Cobalt", pct: 30 }, { material: "Aluminum", pct: 20 }, { material: "Plastic", pct: 15 }], dependencies: dep(["Lithium Prices", "Nickel Prices", "Battery Supply"]) };
  if (/shirt|cotton|apparel|garment|textile|cloth/.test(p))
    return { materials: [{ material: "Cotton", pct: 88 }, { material: "Polyester", pct: 8 }, { material: "Packaging", pct: 4 }], dependencies: dep(["Cotton Prices", "Labor Costs"]) };
  if (/steel|metal|machine|tool|appliance/.test(p))
    return { materials: [{ material: "Steel", pct: 65 }, { material: "Aluminum", pct: 20 }, { material: "Plastic", pct: 15 }], dependencies: dep(["Steel Prices", "Aluminum Prices"]) };
  if (/electronic|phone|laptop|chip|device|gadget/.test(p))
    return { materials: [{ material: "Semiconductors", pct: 40 }, { material: "Aluminum", pct: 25 }, { material: "Plastic", pct: 20 }, { material: "Copper", pct: 15 }], dependencies: dep(["Semiconductor Supply", "Copper Prices"]) };
  return { materials: [{ material: "Primary material", pct: 70 }, { material: "Secondary material", pct: 20 }, { material: "Packaging", pct: 10 }], dependencies: dep(["Commodity Prices"]) };
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

function defaultRoutes(input: ShipmentInput): RouteOption[] {
  const w = input.weightKg || 20000;
  const truckCost = Math.round(1500000 + w * 0.08);
  const seaCost = Math.round(truckCost * 0.65);
  const airCost = Math.round(truckCost * 8);
  return [
    { method: "Truck Freight", cost: truckCost, transitDays: 3, recommended: true, note: "Flexible and practical for domestic distribution between cities." },
    { method: "Sea Freight", cost: seaCost, transitDays: 5, recommended: false, note: "Cost-effective for inter-island shipments with sufficient lead time." },
    { method: "Rail Freight", cost: Math.round(truckCost * 0.8), transitDays: 4, recommended: false, note: "Suitable for routes connected by Indonesia's rail network." },
    { method: "Air Freight", cost: airCost, transitDays: 1, recommended: false, note: "Fastest option; significantly higher cost for time-critical cargo." },
  ];
}

function compactSource(
  source: {
    title?: string;
    snippet?: string;
    url?: string;
  },
) {
  return {
    title: (source.title ?? "").trim().slice(0, 160),
    snippet: (source.snippet ?? "").trim().slice(0, 350),
    url: (source.url ?? "").trim(),
  };
}

export async function finalDecisionAgent(
  input: ShipmentInput,
  factors: RiskFactor[],
  riskScore: number,
  synthesis: SynthesisOutput,
): Promise<{
  executiveSummary: string;
  actionPlan: ActionItem[];
}> {
  const top = [...factors]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const fallbackSummary =
    `Three major risks currently affect this shipment: ${top
      .map((f) => f.label)
      .join("; ")}. Expected impact: +${synthesis.expectedCostIncreasePct}% cost and a ` +
    `${synthesis.expectedDelayDays[0]}–${synthesis.expectedDelayDays[1]} day delay.`;

  const fallbackPlan: ActionItem[] = factors
    .filter((f) => f.score >= 45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((f) => ({
      action: f.actionable,
      deadline: "Before booking",
      dueDate: null,
      category: f.category,
      urgency:
        f.score >= 70
          ? "high"
          : f.score >= 55
            ? "medium"
            : "low",
      why: f.label,
    }));

  const result = await jsonCompletion<{
    executiveSummary: string;
    actionPlan: ActionItem[];
  }>({

    system:
      "You are the final logistics decision assistant. " +
      "Generate a concise executive summary and a deduplicated action plan " +
      "from the structured risk analysis below. " +
      "Do not invent facts. Do not discuss raw web searches. " +
      "The executive summary must be 3-4 concise sentences. " +
      "The action plan must contain 5-8 concrete actions. " +
      "Use real dates derived from the ship date when possible. " +
      "Return ONLY valid JSON.",

    user:
      `Shipment:
      ${input.product}, ${input.origin_city}, ${input.origin_province} -> ${input.destination_city}, ${input.destination_province}
      Ship date: ${input.shipDate}
      Shipping mode: ${input.shippingMode || "not specified"}

      Overall risk: ${riskScore}/100

      Top risk factors:
      ${top
        .map(
          (f) =>
            `- ${f.category}: risk ${f.score}, ${f.label}. Action: ${f.actionable}`,
        )
        .join("\n")}

      Cost impact:
      +${synthesis.expectedCostIncreasePct}% expected cost increase

      Expected delay:
      ${synthesis.expectedDelayDays[0]}-${synthesis.expectedDelayDays[1]} days

      Recommendations:
      ${synthesis.recommendations
        .slice(0, 5)
        .map((r) => `- ${r.action}: ${r.rationale}`)
        .join("\n")}

      Return:
      {
        "executiveSummary": "3-4 concise sentences",
        "actionPlan": [
          {
            "action": "short imperative action",
            "deadline": "concrete deadline",
            "dueDate": "YYYY-MM-DD or null",
            "category": "risk category",
            "urgency": "high|medium|low",
            "why": "one-line explanation"
          }
        ]
      }`,

    fallback: {
      executiveSummary: fallbackSummary,
      actionPlan: fallbackPlan,
    },
    agent: "finalDecision",
    maxTokens: 1500,
  });

  const executiveSummary =
    typeof result.executiveSummary === "string" &&
    result.executiveSummary.trim()
      ? result.executiveSummary.trim()
      : fallbackSummary;

  const actionPlan =
    Array.isArray(result.actionPlan) && result.actionPlan.length
      ? result.actionPlan
          .slice(0, 8)
          .sort((a: ActionItem, b: ActionItem) => {
            if (a.dueDate && b.dueDate) {
              return a.dueDate.localeCompare(b.dueDate);
            }
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return 0;
          })
      : fallbackPlan;

  return {
    executiveSummary,
    actionPlan,
  };
}