import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

/**
 * Get list of branches for a repository
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo"]);
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

    const octokit = new Octokit({ auth: token });

    // Fetch branches
    const branches = await octokit.paginate(octokit.repos.listBranches, {
      owner,
      repo: repoName,
      per_page: 100,
    });

    const branchNames = branches.map((branch) => branch.name);

    return NextResponse.json({
      success: true,
      branches: branchNames,
    });
  } catch (error: any) {
    console.error("GitHub branches error:", error);
    
    if (error.status === 404) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch branches",
      },
      { status: 500 }
    );
  }
}

