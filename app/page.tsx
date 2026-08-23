"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { AnalyzeForm, presets } from "@/components/analyzeform";
import type { ShipmentInput } from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (input: ShipmentInput) => {
    setLoading(true);
    setResult(null);
    setError(null);
    console.log("Shipment Input:", input);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();

      console.log("Analysis Result:", data);

      setResult(data);
    } catch (err) {
      console.error("Risk analysis failed:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Risk analysis failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Header />

      <main className="flex-1 mx-auto w-full max-w-7xl px-5">

        <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center py-10">

          {/* HERO */}
          <div className="text-center mb-10">
            <h1 className="font-semibold text-4xl sm:text-5xl">
              Predict supply chain risk before it happens.
            </h1>

            <p className="text-sm text-muted max-w-xl mx-auto mt-4 leading-6">
              Analyze your shipment across Indonesia and
              identify potential logistics risks before they
              impact your business.
            </p>
          </div>

          {/* FORM */}
          <div className="w-full max-w-4xl">
            <AnalyzeForm
              onSubmit={handleSubmit}
              loading={loading}
            />
          </div>

        </div>

      </main>
    </>
  );
}