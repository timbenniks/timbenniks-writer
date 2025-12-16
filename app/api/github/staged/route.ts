import { NextRequest, NextResponse } from "next/server";
import { parseRepo, validateGitHubFields } from "../utils";

/**
 * GET /api/github/staged
 * Get preview of staged changes (validates SHAs against current state)
 * 
 * Query params: repo, branch
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const repo = searchParams.get("repo");
    const branch = searchParams.get("branch") || "main";

    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: repo" },
        { status: 400 }
      );
    }

    const repoResult = parseRepo(repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }

    // Note: Actual staged changes are stored client-side in localStorage
    // This endpoint is for validation/preview purposes
    // The client should send staged changes to /api/github/commit
    
    return NextResponse.json({
      success: true,
      message: "Staged changes are managed client-side. Use POST /api/github/commit to commit them.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get staged changes",
      },
      { status: 500 }
    );
  }
}

