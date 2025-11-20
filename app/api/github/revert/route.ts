import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";

export interface GitHubRevertResponse {
  success: boolean;
  error?: string;
  sha?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      repo,
      branch,
      filePath,
      commitSha,
      commitMessage,
      token,
      authorName,
      authorEmail,
    } = body;

    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "filePath",
      "commitSha",
      "commitMessage",
      "token",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const repoResult = parseRepo(repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const octokit = new Octokit({ auth: token });

    // Get the file content from the specified commit
    const commitResponse = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: filePath,
      ref: commitSha,
    });

    if (Array.isArray(commitResponse.data) || commitResponse.data.type !== "file") {
      return NextResponse.json(
        { success: false, error: "Path is not a file" },
        { status: 400 }
      );
    }

    const oldContent = Buffer.from(commitResponse.data.content, "base64").toString("utf-8");

    // Get current file SHA for update
    let currentSha: string;
    try {
      const currentFileResponse = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      if (Array.isArray(currentFileResponse.data) || currentFileResponse.data.type !== "file") {
        return NextResponse.json(
          { success: false, error: "Path is not a file" },
          { status: 400 }
        );
      }

      currentSha = currentFileResponse.data.sha;
    } catch (error: any) {
      if (error.status === 404) {
        // File doesn't exist, create it
        currentSha = "";
      } else {
        throw error;
      }
    }

    // Update file with old content
    const updateResponse = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo: repoName,
      path: filePath,
      message: commitMessage,
      content: Buffer.from(oldContent).toString("base64"),
      branch,
      sha: currentSha || undefined,
      author: authorName && authorEmail ? { name: authorName, email: authorEmail } : undefined,
      committer: authorName && authorEmail ? { name: authorName, email: authorEmail } : undefined,
    });

    return NextResponse.json({
      success: true,
      sha: updateResponse.data.content?.sha,
    } as GitHubRevertResponse);
  } catch (error: any) {
    console.error("Error reverting file:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to revert file",
      } as GitHubRevertResponse,
      { status: 500 }
    );
  }
}

