import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

/**
 * Get list of folders/directories in a repository path
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch"]);
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
    const { branch, path = "" } = body;

    const octokit = new Octokit({ auth: token });

    // Fetch contents of the path
    const response = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: path || "",
      ref: branch,
    });

    // Filter only directories
    const contents = Array.isArray(response.data) ? response.data : [response.data];
    const folders = contents
      .filter((item: any) => item.type === "dir")
      .map((item: any) => ({
        name: item.name,
        path: item.path,
      }));

    return NextResponse.json({
      success: true,
      folders,
    });
  } catch (error: any) {
    console.error("GitHub folders error:", error);
    
    if (error.status === 404) {
      return NextResponse.json(
        { success: false, error: "Path not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch folders",
      },
      { status: 500 }
    );
  }
}

