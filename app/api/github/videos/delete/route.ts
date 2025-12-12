import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../../utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "filePath",
      "sha",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error:
            "GitHub token not configured. Please set GITHUB_TOKEN in .env.local",
        },
        { status: 500 }
      );
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const { branch, filePath, sha, commitMessage, videoTitle } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get author info from environment
    const authorName = process.env.GITHUB_AUTHOR_NAME || "Tim Benniks Writer";
    const authorEmail =
      process.env.GITHUB_AUTHOR_EMAIL || "noreply@timbenniks.dev";

    try {
      await octokit.repos.deleteFile({
        owner,
        repo: repoName,
        path: filePath,
        message:
          commitMessage || `Delete video: ${videoTitle || filePath}`,
        sha,
        branch,
        author: {
          name: authorName,
          email: authorEmail,
        },
      });

      return NextResponse.json({
        success: true,
        filePath,
        deleted: true,
      });
    } catch (error: any) {
      // Handle file not found
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: "File not found or already deleted" },
          { status: 404 }
        );
      }
      // Handle conflict (SHA mismatch)
      if (error.status === 409) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Conflict: The file has been modified. Please refresh and try again.",
            conflict: true,
          },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error("GitHub video delete error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to delete video from GitHub",
      },
      { status: 500 }
    );
  }
}

