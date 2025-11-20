import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

/**
 * Get list of repositories the user has access to
 */
export async function GET() {
  try {
    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured. Please set GITHUB_TOKEN in .env.local" },
        { status: 500 }
      );
    }

    const octokit = new Octokit({ auth: token });

    // Fetch repositories (both owned and accessible)
    const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
      type: "all", // all, owner, member
      sort: "updated",
      per_page: 100,
    });

    // Format repositories
    const formattedRepos = repos.map((repo) => ({
      fullName: repo.full_name,
      name: repo.name,
      owner: repo.owner.login,
      defaultBranch: repo.default_branch,
      private: repo.private,
      description: repo.description || "",
    }));

    return NextResponse.json({
      success: true,
      repos: formattedRepos,
    });
  } catch (error: any) {
    console.error("GitHub repos error:", error);
    
    if (error.status === 401) {
      return NextResponse.json(
        { success: false, error: "Invalid GitHub token. Please check your GITHUB_TOKEN in .env.local" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch repositories",
      },
      { status: 500 }
    );
  }
}

