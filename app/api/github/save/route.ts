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
      "content",
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
    const { branch, filePath, content, commitMessage, sha, token, authorName, authorEmail } = body;
    const octokit = new Octokit({ auth: token });

    // Encode content to base64
    const encodedContent = Buffer.from(content, "utf-8").toString("base64");

    // Prepare commit author if provided
    const author = authorName && authorEmail
      ? {
          name: authorName,
          email: authorEmail,
        }
      : undefined;

    try {
      // Create or update file
      const response = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: filePath,
        message: commitMessage,
        content: encodedContent,
        branch,
        sha: sha || undefined, // Include SHA for updates, omit for new files
        author,
        committer: author,
      });

      return NextResponse.json({
        success: true,
        sha: response.data.content?.sha || null,
        commit: {
          sha: response.data.commit.sha,
          message: response.data.commit.message,
        },
      });
    } catch (error: any) {
      if (error.status === 409) {
        return NextResponse.json(
          {
            success: false,
            error: "File has been modified on GitHub. Please reload and try again.",
          },
          { status: 409 }
        );
      }
      if (error.status === 404) {
        return NextResponse.json(
          {
            success: false,
            error: "Repository or branch not found",
          },
          { status: 404 }
        );
      }
      if (error.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error: "Permission denied. Check your token permissions.",
          },
          { status: 403 }
        );
      }
      throw error;
    }
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

