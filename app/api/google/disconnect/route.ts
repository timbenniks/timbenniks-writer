import { NextRequest, NextResponse } from "next/server";
import { deleteGoogleTokens } from "../utils";

export async function POST(request: NextRequest) {
  try {
    await deleteGoogleTokens();
    return NextResponse.json({
      success: true,
      message: "Disconnected from Google",
    });
  } catch (error: any) {
    console.error("Google disconnect error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to disconnect" },
      { status: 500 }
    );
  }
}

