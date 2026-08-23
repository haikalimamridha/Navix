"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import type { ShipmentInput } from "@/lib/types";
import { Cities } from "@/lib/geo";

export const SHIP_MODES = ["Ocean (container)", "Air", "Rail", "Truck"];
export const SPECIAL_REQS = ["Standard (ambient)", "Refrigerated", "Frozen", "Fragile", "Hazardous", "Organic"];

export const presets: {
        label: string;
        short: string;
        value: ShipmentInput;
}[] = [
    {
        label: "Plastic Chairs · Bekasi → Surabaya",
        short: "Plastic chairs → Surabaya",
        value: { product: "Plastic Chair", origin_province: "Jawa Barat", origin_city: "Bekasi", destination_province: "Jawa Timur", destination_city: "Surabaya", weightKg: 20000, quantity: 10000, shipDate: "2026-09-20", shippingMode: "Truck", specialRequirements: ["Standard (ambient)"], },
    },

    {
        label: "Steel Pipes · Jakarta → Semarang",
        short: "Steel pipes → Semarang",
        value: { product: "Steel Pipes", origin_province: "DKI Jakarta", origin_city: "Jakarta Pusat", destination_province: "Jawa Tengah", destination_city: "Semarang", weightKg: 15000, quantity: 2500, shipDate: "2026-09-15" , shippingMode: "Truck", specialRequirements: ["Standard (ambient)"], },
    },

    {
        label: "Electronics · Batam → Jakarta",
        short: "Electronics → Jakarta",
        value: { product: "Consumer Electronics", origin_province: "Kepulauan Riau", origin_city: "Batam", destination_province: "DKI Jakarta", destination_city: "Jakarta Pusat", weightKg: 8000, quantity: 5000, shipDate: "2026-07-10", shippingMode: "Ocean (container)", specialRequirements: ["Fragile"], },
    },
];

const field = "w-full rounded-lg bg-panel-2 border border-border px-3 py-2.5 text-sm outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition";
const label = "block text-[11px] mono text-muted mb-1.5 uppercase tracking-wide";

export function AnalyzeForm({
    onSubmit,
    loading,
    initial,
}: {
    onSubmit: (input: ShipmentInput) => void;
    loading: boolean;
    initial?: ShipmentInput;
}) {
    const [input, setInput] = useState<ShipmentInput>(initial ?? presets[0].value);
    const set = (patch: Partial<ShipmentInput>) => setInput((p) => ({ ...p, ...patch }));
    const originCities = Cities[input.origin_province] ?? [];
    const destinationCities = Cities[input.destination_province] ?? [];

    return (
        <div className="rounded-2xl border border-border bg-panel/70 p-5 sm:p-6">
        <div className="flex flex-wrap justify-center gap-2 mb-5">
            {presets.map((p) => (
            <button
                key={p.label}
                type="button"
                onClick={() => setInput(p.value)}
                disabled={loading}
                className="text-[11px] mono px-2.5 py-1.5 rounded-md border border-border bg-panel-2 text-muted hover:text-foreground hover:border-accent/40 transition disabled:opacity-50"
            >
                {p.label}
            </button>
            ))}
        </div>

        <form
            onSubmit={(e) => {
            e.preventDefault();
            if (!loading) onSubmit(input);
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
            <div className="sm:col-span-2">
            <label className={label}>Product</label>
            <input className={field} value={input.product} onChange={(e) => set({ product: e.target.value })} placeholder="e.g. Plastic Chair" required />
            </div>

            <div>
            <label className={label}>Origin Province</label>
            <select className={field} value={input.origin_province} onChange={(e) => set({ origin_province: e.target.value, origin_city: "" })} required>
                <option value="">Select province…</option>
                {Object.keys(Cities).map((province) => (
                <option key={province} value={province}>{province}</option>
                ))}
            </select>
            </div>

            <div>
            <label className={label}>Origin City</label>
            <select className={field} value={input.origin_city} onChange={(e) => set({ origin_city: e.target.value })} disabled={!input.origin_province} required>
                <option value="">Select city…</option>
                {originCities.map((city) => (
                <option key={city} value={city}>{city}</option>
                ))}
            </select>
            </div>

            <div>
            <label className={label}>Destination Province</label>
            <select className={field} value={input.destination_province} onChange={(e) => set({ destination_province: e.target.value, destination_city: "" })} required>
                <option value="">Select province…</option>
                {Object.keys(Cities).map((province) => (
                <option key={province} value={province}>{province}</option>
                ))}
            </select>
            </div>

            <div>
            <label className={label}>Destination City</label>
            <select className={field} value={input.destination_city} onChange={(e) => set({ destination_city: e.target.value })} disabled={!input.destination_province} required>
                <option value="">Select city…</option>
                {destinationCities.map((city) => (
                <option key={city} value={city}>{city}</option>
                ))}
            </select>
            </div>

            <div>
            <label className={label}>Weight (kg)</label>
            <input type="number" className={field} value={input.weightKg || ""} onChange={(e) => set({ weightKg: Number(e.target.value) })} placeholder="20000" required />
            </div>

            <div>
            <label className={label}>Quantity (units)</label>
            <input type="number" className={field} value={input.quantity || ""} onChange={(e) => set({ quantity: Number(e.target.value) })} placeholder="10000" />
            </div>

            <div>
            <label className={label}>Shipping Mode</label>
            <select className={field} value={input.shippingMode || ""} onChange={(e) => set({ shippingMode: e.target.value })}>
                <option value="">Select…</option>
                {SHIP_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
                ))}
            </select>
            </div>

            <div>
            <label className={label}>Desired Ship Date</label>
            <input type="date" className={field} value={input.shipDate} onChange={(e) => set({ shipDate: e.target.value })} required />
            </div>

            <div className="sm:col-span-2">
            <label className={label}>Special Handling</label>
            <div className="flex flex-wrap gap-2">
                {SPECIAL_REQS.map((r) => {
                const on = (input.specialRequirements ?? []).includes(r);
                return (
                    <button
                    key={r}
                    type="button"
                    onClick={() => {
                        const cur = input.specialRequirements ?? [];
                        set({ specialRequirements: on ? cur.filter((x) => x !== r) : [...cur.filter((x) => x !== "Standard (ambient)" || r === "Standard (ambient)"), r] });
                    }}
                    className={
                        "text-[12px] px-3 py-1.5 rounded-full border transition " +
                        (on ? "border-accent/50 bg-accent/15 text-accent" : "border-border bg-panel-2 text-muted hover:text-foreground")
                    }
                    >
                    {r}
                    </button>
                );
                })}
            </div>
            </div>

            <div className="sm:col-span-2 mt-1">
            <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-white font-semibold py-3 text-sm hover:brightness-110 transition disabled:opacity-60"
            >
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {loading ? "Running intelligence analysis…" : "Run Risk Analysis"}
            </button>
            </div>
        </form>
        </div>
    );
}