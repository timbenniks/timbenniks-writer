import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import { purgeArticlesCache } from "../../../utils/cache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "filePath",
      "content",
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
    const { owner, repoName } = repoResult;
    const { branch, filePath, content, commitMessage, sha } = body;
    
    // Always stage changes - no immediate commits
    // Return success response indicating the change should be staged client-side
    return NextResponse.json({
      success: true,
      staged: true,
      filePath,
      sha: sha || null,
      message: "Change staged successfully",
    });
  } catch (error: any) {
    console.error("GitHub save error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save file to GitHub",
      },
      { status: 500 }
    );
  }
}

