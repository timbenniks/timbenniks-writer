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
      "currentSha",
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
    const { filePath, currentSha, branch } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    try {
      // Get current file info from GitHub
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if ("sha" in response.data) {
        const remoteSha = response.data.sha;
        const hasChanged = currentSha && remoteSha !== currentSha;

        return NextResponse.json({
          success: true,
          sha: remoteSha,
          hasChanged: hasChanged || false,
          exists: true,
        });
      }

      return NextResponse.json({
        success: true,
        exists: false,
        hasChanged: false,
      });
    } catch (error: any) {
      if (error.status === 404) {
        // File doesn't exist (new file)
        return NextResponse.json({
          success: true,
          exists: false,
          hasChanged: false,
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("GitHub check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check file status",
      },
      { status: 500 }
    );
  }
}

