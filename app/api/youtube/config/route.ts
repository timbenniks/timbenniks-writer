import { NextResponse } from "next/server";
import { getYouTubeApiKey } from "../utils";

export async function GET() {
  try {
    const apiKey = getYouTubeApiKey();
    const configured = !!apiKey;

    return NextResponse.json({
      success: true,
      configured,
      // Don't expose the full key, just show it's configured
      keyPreview: configured
        ? `${apiKey!.slice(0, 4)}...${apiKey!.slice(-4)}`
        : null,
    });
  } catch (error: any) {
    console.error("YouTube config error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check YouTube configuration",
      },
      { status: 500 }
    );
  }
}

