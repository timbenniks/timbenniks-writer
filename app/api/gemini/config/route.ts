import { NextResponse } from "next/server";
import { getGeminiConfig } from "../utils";

export async function GET() {
  const config = getGeminiConfig();

  return NextResponse.json({
    success: true,
    configured: !!config,
  });
}

