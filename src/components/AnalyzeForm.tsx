"use client";

import { FormEvent, useState } from "react";

export default function AnalyzeForm() {
  const [product, setProduct] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [shipDate, setShipDate] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    console.log({
      product,
      origin,
      destination,
      weight,
      shipDate,
    });

    // API / SSE akan kita sambungkan nanti.
  }

  return (
    <form id="analyze" onSubmit={handleSubmit} className="space-y-5">
      {/* Product */}
      <div>
        <label
          htmlFor="product"
          className="mb-2 block text-sm font-medium text-slate-300"
        >
          Product
        </label>

        <input
          id="product"
          type="text"
          placeholder="e.g. Plastic Chairs"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          required
          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
        />
      </div>

      {/* Origin + Destination */}
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="origin"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Origin
          </label>

          <input
            id="origin"
            type="text"
            placeholder="e.g. Shanghai, China"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
          />
        </div>

        <div>
          <label
            htmlFor="destination"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Destination
          </label>

          <input
            id="destination"
            type="text"
            placeholder="e.g. Los Angeles, USA"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
          />
        </div>
      </div>

      {/* Weight + Date */}
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="weight"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Weight
          </label>

          <div className="relative">
            <input
              id="weight"
              type="number"
              min="0"
              placeholder="10000"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 pr-14 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60"
            />

            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-600">
              kg
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="shipDate"
            className="mb-2 block text-sm font-medium text-slate-300"
          >
            Ship Date
          </label>

          <input
            id="shipDate"
            type="date"
            value={shipDate}
            onChange={(e) => setShipDate(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400/60"
          />
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 active:scale-[0.99]"
      >
        <span>Run Risk Analysis</span>
        <span>→</span>
      </button>

      <p className="text-center text-xs text-slate-600">
        AI analysis may take a few moments while intelligence sources are
        investigated.
      </p>
    </form>
  );
}