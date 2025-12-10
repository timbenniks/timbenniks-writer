import { NextResponse } from "next/server";
import { getContentstackConfig } from "../utils";

/**
 * GET /api/contentstack/config
 * Check if Contentstack is configured and return configuration status
 */
export async function GET() {
  try {
    const config = getContentstackConfig();

    return NextResponse.json({
      success: true,
      ...config,
    });
  } catch (error: any) {
    console.error("Contentstack config check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check Contentstack configuration",
      },
      { status: 500 }
    );
  }
}

