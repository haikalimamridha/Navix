import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const input = await request.json();

    console.log("Received shipment:", input);

    return NextResponse.json({
      success: true,

      message: "Risk analysis completed",

      input,

      analysis: {
        riskScore: 42,
        riskLevel: "MEDIUM",
        expectedDelayDays: 2,
        expectedCostIncreasePercent: 6.5,
        recommendation:
          "Monitor weather, freight capacity, and route conditions.",
      },
    });
  } catch (error) {
    console.error("Analyze API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Invalid shipment input",
      },
      {
        status: 400,
      }
    );
  }
}