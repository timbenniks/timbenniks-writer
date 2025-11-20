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
      "token",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const { branch, filePath, sha, commitMessage, token, authorName, authorEmail } = body;
    const octokit = new Octokit({ auth: token });

    const deleteOptions: {
      owner: string;
      repo: string;
      path: string;
      message: string;
      sha: string;
      branch: string;
      committer?: { name: string; email: string };
      author?: { name: string; email: string };
    } = {
      owner,
      repo: repoName,
      path: filePath,
      message: commitMessage,
      sha,
      branch,
    };

    if (authorName && authorEmail) {
      deleteOptions.committer = { name: authorName, email: authorEmail };
      deleteOptions.author = { name: authorName, email: authorEmail };
    }

    await octokit.repos.deleteFile(deleteOptions);

    return NextResponse.json({
      success: true,
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

