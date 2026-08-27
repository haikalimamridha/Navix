// Bright Data integration layer.
//
// Primary path: the official Bright Data MCP server (`@brightdata/mcp`), spawned
// once as a stdio subprocess and reused across requests. It exposes web-search and
// scraping tools that auto-provision the required zones from your API_TOKEN.
//
// Fallback path: if the MCP server is unavailable (no token, offline, cold demo
// machine) we degrade gracefully to realistic synthetic results so the demo never
// breaks on stage. `dataMode` in the final result reflects which path was used.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Source } from "./types";

const API_TOKEN = process.env.BRIGHTDATA_API_TOKEN || process.env.API_TOKEN || "";

let clientPromise: Promise<Client | null> | null = null;
let liveUsed = false;

export function brightDataMode(): "live" | "mock" {
  return liveUsed ? "live" : "mock";
}

// Per-analysis log of every search the agents ran, for the transparency panel.
export interface SearchLogEntry {
  query: string;
  results: number;
  mode: "live" | "mock";
  sources: Source[];
}
let searchLog: SearchLogEntry[] = [];
export function resetSearchLog(): void {
  searchLog = [];
}
export function getSearchLog(): SearchLogEntry[] {
  return searchLog;
}

async function getClient(): Promise<Client | null> {
  if (!API_TOKEN) return null;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    try {
      const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@brightdata/mcp"],
        env: {
          ...process.env,
          API_TOKEN,
          PRO_MODE: process.env.BRIGHTDATA_PRO_MODE || "false",
        } as Record<string, string>,
      });
      const client = new Client({ name: "cargoguard-ai", version: "1.0.0" });
      await client.connect(transport);
      return client;
    } catch (err) {
      console.error("[brightdata] MCP connect failed, using mock fallback:", err);
      return null;
    }
  })();

  return clientPromise;
}

function textFromToolResult(result: unknown): string {
  // MCP tool results are { content: [{ type: 'text', text }] }
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n");
}

interface SerpItem {
  link?: string;
  url?: string;
  title?: string;
  description?: string;
  snippet?: string;
}

// The Bright Data `search_engine` tool returns JSON with organic/news arrays.
// Some scrape paths return markdown instead, so we handle both.
function parseSources(raw: string, limit = 5): Source[] {
  const sources: Source[] = [];
  const seen = new Set<string>();

  const push = (title?: string, url?: string, snippet?: string) => {
    if (!title || !url || seen.has(url) || sources.length >= limit) return;
    if (/google\.com\/(search|aclk)|gstatic|w3\.org/.test(url)) return;
    seen.add(url);
    sources.push({ title: title.trim(), url: url.trim(), snippet: snippet?.trim() || undefined });
  };

  // 1) Try JSON (SERP API shape).
  try {
    const data = JSON.parse(raw);
    const buckets: SerpItem[][] = [data.organic, data.news, data.top_stories, data.results].filter(
      Array.isArray,
    ) as SerpItem[][];
    for (const bucket of buckets) {
      for (const it of bucket) {
        push(it.title, it.link || it.url, it.description || it.snippet);
      }
    }
    if (sources.length) return sources;
  } catch {
    // not JSON — fall through to markdown parsing
  }

  // 2) Markdown links fallback.
  const linkRe = /\[([^\]]{4,160})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(raw)) && sources.length < limit) {
    const after = raw.slice(m.index + m[0].length, m.index + m[0].length + 240);
    const snippet = after.replace(/[#*>\-\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
    push(m[1], m[2], snippet);
  }
  return sources;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);

/** Live web search via Bright Data MCP `search_engine` (Google). */
export async function bdSearch(query: string, limit = 5): Promise<Source[]> {
  const client = await getClient();
  if (client) {
    try {
      const res = await withTimeout(
        client.callTool({
          name: "search_engine",
          arguments: { query, engine: "google" },
        }),
        30_000, // a slow query falls back to mock rather than stalling the run
      );
      const text = textFromToolResult(res);
      const sources = parseSources(text, limit);
      if (sources.length) {
        liveUsed = true;
        searchLog.push({ query, results: sources.length, mode: "live", sources });
        return sources;
      }
    } catch (err) {
      console.error(`[brightdata] search "${query}" failed:`, err);
    }
  }
  const mock = mockSearch(query, limit);
  searchLog.push({ query, results: mock.length, mode: "mock", sources: mock });
  return mock;
}

/** Scrape a single URL to markdown via Bright Data MCP `scrape_as_markdown`. */
export async function bdScrape(url: string): Promise<string> {
  const client = await getClient();
  if (client) {
    try {
      const res = await withTimeout(
        client.callTool({ name: "scrape_as_markdown", arguments: { url } }),
        45_000,
      );
      const text = textFromToolResult(res);
      if (text) {
        liveUsed = true;
        return text;
      }
    } catch (err) {
      console.error(`[brightdata] scrape "${url}" failed:`, err);
    }
  }
  return "";
}

// --- Mock fallback -------------------------------------------------------

function host(seed: string, base: string): string {
    return `https://${base}/${encodeURIComponent(seed.toLowerCase().replace(/\s+/g, "-")).slice(0, 40)}`;
}

function mockSearch(query: string, limit: number): Source[] {
    const q = query.toLowerCase();
    const pick = (arr: Source[]) => arr.slice(0, limit);

    if (/freight|container|shipping rate|ocean|truck|rail/.test(q)) {
        return pick([
            { title: "Indonesia domestic freight rates", url: host(query, "dephub.go.id"), snippet: "Domestic freight costs in Indonesia vary by route, transport mode, fuel prices, and cargo volume.", },
            { title: "Indonesia logistics and transportation costs", url: host(query, "bps.go.id"), snippet: "Domestic logistics costs are influenced by transportation distance, fuel prices, infrastructure, and regional demand.", },
        ]);
    }
    if (/port|congestion|berth|vessel queue/.test(q)) {
        return pick([
            { title: "Indonesian port congestion and vessel activity", url: host(query, "pelindo.co.id"), snippet: "Port congestion and vessel waiting times vary by terminal, cargo volume, and operational conditions.", },
            { title: "Indonesia port transportation statistics", url: host(query, "dephub.go.id"), snippet: "Port performance and cargo movement across Indonesia vary according to traffic volume and operational capacity.", },
        ]);
    }
    if ( /oil|crude|brent|wti|natural gas|resin|plastic|steel|aluminum|copper|metal|commodity/.test( q, ) ) {
            return pick([
            { title: "Indonesia commodity price developments", url: host(query, "bps.go.id"), snippet: "Commodity price movements can affect domestic manufacturing costs, transportation costs, and product prices in Indonesia.", },
            { title: "Indonesia industrial raw material conditions", url: host(query, "kemenperin.go.id"), snippet: "Changes in raw material availability and industrial input costs can influence domestic production and supply-chain conditions.", },
            ]);
    }
    if (/weather|storm|flood|rain|wind|wave|typhoon/.test(q)) {
        return pick([
            { title: "Indonesia weather and rainfall conditions", url: host(query, "bmkg.go.id"), snippet: "Weather conditions, rainfall, wind, and wave activity may affect domestic transportation and port operations in Indonesia.", },
            { title: "Indonesia marine weather information", url: host(query, "bmkg.go.id"), snippet: "Marine weather conditions can affect vessel operations and domestic sea transportation routes.", },
        ]);
    }
//   if (/tariff|trade war|sanction|geopolit|export restriction/.test(q)) {
//     return pick([
//       { title: "US reviews Section 301 tariffs on Chinese goods", url: host(query, "ustr.gov"), snippet: "Potential adjustments to tariff lines covering consumer and industrial imports under review." },
//       { title: "Red Sea diversions continue to lengthen some routes", url: host(query, "lloydslist.com"), snippet: "Carriers maintain Cape of Good Hope routing on select services." },
//     ]);
//   }
    if (/regulation|regulatory|compliance|requirement|customs|domestic|permit|license/.test(q)) {
        return pick([
            { title: "Indonesian domestic transportation regulations", url: host(query, "dephub.go.id"), snippet: "Domestic transportation requirements in Indonesia depend on cargo type, transportation mode, and applicable regulations.", },
            { title: "Indonesian regulatory requirements", url: host(query, "oss.go.id"), snippet: "Business and product compliance requirements may apply depending on the type of goods and transportation activity.", },
        ]);
    }
    if (/supplier|manufactur|factory|warehouse|distribution|pmi/.test(q)) {
        return pick([
            { title: "Indonesia manufacturing activity", url: host(query, "bps.go.id"), snippet: "Manufacturing activity and domestic demand influence supplier capacity and product availability in Indonesia.", },
            { title: "Indonesia industrial activity", url: host(query, "kemenperin.go.id"), snippet: "Industrial production and supply conditions can affect domestic product availability and lead times.", },
        ]);
    }
    return pick([
        { title: `Indonesia logistics intelligence: ${query}`, url: host(query, "dephub.go.id"), snippet: "Information related to transportation, logistics, and domestic supply-chain conditions in Indonesia.", },
        { title: `Indonesia logistics market brief: ${query}`, url: host(query, "bps.go.id"), snippet: "Statistical and economic information relevant to logistics and domestic supply-chain conditions in Indonesia.", },
    ]);
}
