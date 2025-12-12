import { NextResponse } from "next/server";

/**
 * Get GitHub configuration from environment variables
 * All settings now come from .env.local
 */
export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const folder = process.env.GITHUB_FOLDER || "";
    const authorName = process.env.GITHUB_AUTHOR_NAME || "";
    const authorEmail = process.env.GITHUB_AUTHOR_EMAIL || "";

    if (!token) {
      return NextResponse.json({
        success: true,
        configured: false,
        error: "GitHub token not configured. Set GITHUB_TOKEN in .env.local",
      });
    }

    if (!repo) {
      return NextResponse.json({
        success: true,
        configured: false,
        tokenConfigured: true,
        error: "GitHub repository not configured. Set GITHUB_REPO in .env.local",
      });
    }

    // Validate repo format
    if (!repo.match(/^[^\/]+\/[^\/]+$/)) {
      return NextResponse.json({
        success: false,
        configured: false,
        error: "Invalid GITHUB_REPO format. Use 'owner/repo'",
      });
    }

    return NextResponse.json({
      success: true,
      configured: true,
      tokenConfigured: true,
      config: {
        repo,
        branch,
        folder,
        authorName,
        authorEmail,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to get config" },
      { status: 500 }
    );
  }
}
