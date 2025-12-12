import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import type { PlaylistsConfig } from "@/app/types/video";

const PLAYLISTS_FILE = "playlists.json";

/**
 * GET - Load playlists.json from repository root
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const repo = searchParams.get("repo");
    const branch = searchParams.get("branch");

    if (!repo || !branch) {
      return NextResponse.json(
        { success: false, error: "Missing required params: repo, branch" },
        { status: 400 }
      );
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

    const repoResult = parseRepo(repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    try {
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: PLAYLISTS_FILE,
        ref: branch,
      });

      if (
        "content" in response.data &&
        response.data.encoding === "base64"
      ) {
        const content = Buffer.from(response.data.content, "base64").toString(
          "utf-8"
        );
        const config: PlaylistsConfig = JSON.parse(content);

        return NextResponse.json({
          success: true,
          config,
          sha: response.data.sha,
        });
      }

      return NextResponse.json(
        { success: false, error: "Could not decode playlists.json" },
        { status: 400 }
      );
    } catch (error: any) {
      if (error.status === 404) {
        // File doesn't exist, return empty config
        return NextResponse.json({
          success: true,
          config: { playlists: [] } as PlaylistsConfig,
          sha: null,
          notFound: true,
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error("GitHub playlists GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load playlists.json",
      },
      { status: 500 }
    );
  }
}

/**
 * POST - Save playlists.json to repository root
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch", "config"]);
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
    const { branch, config, sha } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get author info from environment
    const authorName = process.env.GITHUB_AUTHOR_NAME || "Tim Benniks Writer";
    const authorEmail =
      process.env.GITHUB_AUTHOR_EMAIL || "noreply@timbenniks.dev";

    // Format JSON with indentation for readability
    const content = JSON.stringify(config, null, 2);

    try {
      // Get current SHA if not provided
      let currentSha = sha;
      if (!currentSha) {
        try {
          const existingFile = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: PLAYLISTS_FILE,
            ref: branch,
          });
          if ("sha" in existingFile.data) {
            currentSha = existingFile.data.sha;
          }
        } catch (e: any) {
          // File doesn't exist, that's fine for new file
          if (e.status !== 404) throw e;
        }
      }

      const response = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: PLAYLISTS_FILE,
        message: currentSha
          ? "Update playlists configuration"
          : "Add playlists configuration",
        content: Buffer.from(content).toString("base64"),
        sha: currentSha,
        branch,
        author: {
          name: authorName,
          email: authorEmail,
        },
      });

      return NextResponse.json({
        success: true,
        sha: response.data.content?.sha,
        commit: response.data.commit?.sha,
      });
    } catch (error: any) {
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
    console.error("GitHub playlists POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save playlists.json",
      },
      { status: 500 }
    );
  }
}

