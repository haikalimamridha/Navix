"use client";

import { useCallback, useRef, useState } from "react";
import { Header } from "@/components/header";
import { AnalyzeForm } from "@/components/analyzeform";
import { AgentConsole, type AgentState, } from "@/components/agentconsole";
import { Dashboard } from "@/components/dashboard";
import type { AnalysisResult, AnalyzeEvent, ShipmentInput, } from "@/lib/types";

type Phase = "idle" | "running" | "done";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ShipmentInput | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const upsertAgent = useCallback((agent: AgentState) => {
    setAgents((prev) => {
      const index = prev.findIndex( (item) => item.id === agent.id, );
      if (index === -1) { return [...prev, agent]; }
      const next = [...prev];
      next[index] = agent;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    async (input: ShipmentInput) => {
      setActive(input);
      setPhase("running");
      setAgents([]);
      setLogs([]);
      setResult(null);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify(input),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error( `Request failed (${response.status})`, );
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true, });

          const events = buffer.split("\n\n");

          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event .split("\n") .find((line) => line.startsWith("data:"), );
            if (!line) continue;
            const data = line .replace(/^data:\s*/, "") .trim();
            if (!data) continue;

            try {
              const eventData: AnalyzeEvent = JSON.parse(data);
              /*
               * AGENT
               */
              if (
                eventData.type === "agent"
              ) {
                upsertAgent({
                  id: eventData.id,
                  name: eventData.name,
                  status: eventData.status,
                  summary: eventData.summary,
                });
              }

              /*
               * LOG
               */
              else if (
                eventData.type === "log"
              ) {
                setLogs((prev) => [ ...prev, eventData.message, ]);
              }

              /*
               * RESULT
               */
              else if (
                eventData.type === "result"
              ) {
                setResult(eventData.data);
                setPhase("done");
              }

              /*
               * ERROR
               */
              else if (
                eventData.type === "error"
              ) {
                setError(eventData.message);
                setPhase("done");
              }
            } catch {
              console.warn( "Invalid SSE event:", data, );
            }
          }
        }
      } catch (err) {
        if (
          err instanceof Error && err.name === "AbortError"
        ) {
          return;
        }

        setError( err instanceof Error ? err.message : "Risk analysis failed", );
        setPhase("done");
      }
    },
    [upsertAgent],
  );

  const reset = () => {
    abortRef.current?.abort();

    setPhase("idle");
    setAgents([]);
    setLogs([]);
    setResult(null);
    setError(null);
    setActive(null);
  };

  return (
    <>
      <Header />

      <main className="flex-1 mx-auto w-full max-w-7xl px-5">

        {/* IDLE */}
        {phase === "idle" && (
          <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center py-10">

            {/* HERO */}
            <div className="text-center mb-10">
              <h1 className="font-semibold text-4xl sm:text-5xl">
                Predict supply chain risk
                <span className="text-accent">
                  {" "}before it happens.
                </span>
              </h1>

              <p className="text-sm text-muted max-w-xl mx-auto mt-4 leading-6">
                Analyze your shipment across Indonesia
                and identify potential logistics risks
                before they impact your business.
              </p>
            </div>

            {/* FORM */}
            <div className="w-full max-w-4xl">
              <AnalyzeForm
                onSubmit={handleSubmit}
                loading={false}
              />
            </div>

          </div>
        )}

        {/* RUNNING */}
        {phase === "running" && (
          <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center py-10">

            <div className="w-full max-w-2xl">

              {/* SHIPMENT INFO */}
              {active && (
                <div className="text-center mb-6">

                  <h1 className="text-3xl font-semibold">
                    Analyzing your shipment
                  </h1>

                  <p className="text-sm text-muted mt-2">
                    {active.product}
                    {" · "}
                    {active.origin_city},{" "}
                    {active.origin_province}
                    {" → "}
                    {active.destination_city},{" "}
                    {active.destination_province}
                  </p>

                  {active.shippingMode && (
                    <p className="text-xs text-muted mt-1">
                      Shipping mode:{" "}
                      {active.shippingMode}
                    </p>
                  )}

                </div>
              )}

              {/* AGENT CONSOLE */}
              <AgentConsole
                agents={agents}
                logs={logs}
              />

            </div>

          </div>
        )}

        {/* DONE */}
        {phase === "done" && (
          <div className="py-8">

            {/* HEADER */}
            <div className="flex items-center justify-between mb-6">

              <div>
                <h1 className="text-2xl font-semibold">
                  Risk Analysis
                </h1>

                {result && (
                  <p className="text-sm text-muted mt-1">
                    {result.input.product}
                    {" · "}
                    {result.input.origin_city},{" "}
                    {result.input.origin_province}
                    {" → "}
                    {result.input.destination_city},{" "}
                    {result.input.destination_province}
                  </p>
                )}
              </div>

              <button
                onClick={reset}
                className="text-sm px-4 py-2 rounded-lg border border-border bg-panel-2 hover:border-accent/40 transition"
              >
                New Analysis
              </button>

            </div>

            {/* ERROR */}
            {error && (
              <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            {/* DASHBOARD */}
            {result && (
              <Dashboard result={result} />
            )}

          </div>
        )}

      </main>
    </>
  );
}