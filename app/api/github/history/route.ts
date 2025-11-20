import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  date: string;
}

export interface GitHubHistoryResponse {
  success: boolean;
  error?: string;
  commits?: GitHubCommit[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repo, branch, filePath, token } = body;

    const validation = validateGitHubFields(body, ["repo", "branch", "filePath", "token"]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const repoResult = parseRepo(repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const octokit = new Octokit({ auth: token });

    // Get file SHA first
    let fileSha: string;
    try {
      const fileResponse = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if (Array.isArray(fileResponse.data) || fileResponse.data.type !== "file") {
        return NextResponse.json(
          { success: false, error: "Path is not a file" },
          { status: 400 }
        );
      }

      fileSha = fileResponse.data.sha;
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: "File not found" },
          { status: 404 }
        );
      }
      throw error;
    }

    // Get commit history for the file
    const commitsResponse = await octokit.repos.listCommits({
      owner,
      repo: repoName,
      sha: branch,
      path: filePath,
      per_page: 50,
    });

    const commits: GitHubCommit[] = commitsResponse.data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message.split("\n")[0], // First line only
      author: {
        name: commit.commit.author?.name || commit.commit.committer?.name || "Unknown",
        email: commit.commit.author?.email || commit.commit.committer?.email || "",
        date: commit.commit.author?.date || commit.commit.committer?.date || "",
      },
      date: commit.commit.author?.date || commit.commit.committer?.date || commit.commit.committer?.date || "",
    }));

    return NextResponse.json({
      success: true,
      commits,
    } as GitHubHistoryResponse);
  } catch (error: any) {
    console.error("Error fetching commit history:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch commit history",
      } as GitHubHistoryResponse,
      { status: 500 }
    );
  }
}

