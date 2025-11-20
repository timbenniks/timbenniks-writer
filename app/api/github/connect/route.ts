import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch", "token"]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const { branch, token } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Test repository access
    let repository;
    try {
      repository = await octokit.repos.get({
        owner,
        repo: repoName,
      });
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: "Repository not found or you don't have access" },
          { status: 404 }
        );
      }
      if (error.status === 401) {
        return NextResponse.json(
          { success: false, error: "Invalid authentication token" },
          { status: 401 }
        );
      }
      throw error;
    }

    // Verify branch exists
    let branchData;
    try {
      branchData = await octokit.repos.getBranch({
        owner,
        repo: repoName,
        branch,
      });
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: `Branch '${branch}' not found` },
          { status: 404 }
        );
      }
      throw error;
    }

    // Optionally fetch list of branches
    let branches: string[] = [];
    try {
      const branchesResponse = await octokit.repos.listBranches({
        owner,
        repo: repoName,
        per_page: 100,
      });
      branches = branchesResponse.data.map((b) => b.name);
    } catch (error) {
      // If we can't fetch branches, continue anyway
      console.warn("Could not fetch branches list:", error);
    }

    return NextResponse.json({
      success: true,
      repo: {
        name: repository.data.name,
        fullName: repository.data.full_name,
        defaultBranch: repository.data.default_branch,
        branches,
      },
    });
  } catch (error: any) {
    console.error("GitHub connect error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to connect to GitHub",
      },
      { status: 500 }
    );
  }
}

