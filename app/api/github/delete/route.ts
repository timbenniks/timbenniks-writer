import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "filePath",
      "sha",
      "commitMessage",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured. Please set GITHUB_TOKEN in .env.local" },
        { status: 500 }
      );
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { filePath, sha, commitMessage } = body;
    
    // Always stage deletions - no immediate commits
    // Return success response indicating the deletion should be staged client-side
    return NextResponse.json({
      success: true,
      staged: true,
      filePath,
      sha,
      message: "Deletion staged successfully",
    });
  } catch (error: any) {
    console.error("GitHub delete API error:", error);
    if (error.status === 404) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }
    if (error.status === 409) {
      return NextResponse.json(
        { success: false, error: "Conflict: File has been updated. Please refresh and try again." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

