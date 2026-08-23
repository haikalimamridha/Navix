"use client";

import { useState } from "react";
import { Header } from "@/components/header";
import { AnalyzeForm, presets } from "@/components/analyzeform";
import type { ShipmentInput } from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = (input: ShipmentInput) => {
    console.log("Shipment Input:", input);
  };

  return (
    <>
      <Header />

      <main className="flex-1 mx-auto w-full max-w-7xl px-5">

        <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center py-10">

          {/* HERO */}
          <div className="text-center mb-10">
            <h1 className="serif text-4xl sm:text-5xl">
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