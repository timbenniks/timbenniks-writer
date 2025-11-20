import { NextResponse } from "next/server";

/**
 * Get GitHub configuration (for client-side access)
 * Token comes from environment variables, other settings from localStorage (handled client-side)
 */
export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tokenConfigured: true,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get config" },
      { status: 500 }
    );
  }
}

