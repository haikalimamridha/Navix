import { runAnalysis } from "@/lib/orchestrator";
import type { AnalyzeEvent, ShipmentInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
    let input: ShipmentInput;
    try {
        const body = await req.json();
        input = {
            product: String(body.product || "").slice(0, 200),
            origin_province: String(body.origin_province || "").slice(0, 100),
            origin_city: String(body.origin_city || "").slice(0, 100),
            destination_province: String( body.destination_province || "" ).slice(0, 100),
            destination_city: String( body.destination_city || "" ).slice(0, 100),
            weightKg: Number(body.weightKg) || 0,
            quantity: body.quantity ? Number(body.quantity) : undefined,
            shipDate: String(body.shipDate || "").slice(0, 60),
            shippingMode: body.shippingMode ? String(body.shippingMode).slice(0, 40) : undefined,
            specialRequirements: Array.isArray(body.specialRequirements)
                ? body.specialRequirements.slice(0, 6).map((s: unknown) => String(s).slice(0, 40))
                : undefined,
        };
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    if (
        !input.product ||
        !input.origin_province ||
        !input.origin_city ||
        !input.destination_province ||
        !input.destination_city) 
        {
            return new Response("product, origin and destination are required", { status: 400 });
        }

    if (!input.weightKg || input.weightKg <= 0) {
        return new Response(
            "Weight must be greater than 0",
            {
                status: 400,
            }
        );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
    async start(controller) {
      const send = (e: AnalyzeEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        const result = await runAnalysis(input, send);
        send({ type: "result", data: result });
      } catch (err) {
        console.error("[analyze] pipeline error:", err);
        send({ type: "error", message: err instanceof Error ? err.message : "Analysis failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
