import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../../utils";
import matter from "gray-matter";
import type { VideoFrontmatter } from "@/app/types/video";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "filePath",
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
    const { branch, filePath } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get file content from GitHub
    let fileContent: string;
    let fileSha: string | null = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      // Decode base64 content
      if (
        "content" in response.data &&
        response.data.encoding === "base64"
      ) {
        fileContent = Buffer.from(response.data.content, "base64").toString(
          "utf-8"
        );
        fileSha = response.data.sha || null;
      } else {
        return NextResponse.json(
          { success: false, error: "File content could not be decoded" },
          { status: 400 }
        );
      }
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: `File '${filePath}' not found` },
          { status: 404 }
        );
      }
      throw error;
    }

    // Parse frontmatter
    const parsed = matter(fileContent);

    // Extract playlist from path (e.g., content/3.videos/tim/001-abc.md -> tim)
    const pathParts = filePath.split("/");
    const playlistFromPath =
      pathParts.length >= 3 ? pathParts[pathParts.length - 2] : "";

    // Get image value, treating "undefined" string as empty
    let imageValue =
      parsed.data.image ||
      parsed.data.heroImage ||
      parsed.data.thumbnail ||
      "";
    if (imageValue === "undefined") {
      imageValue = "";
    }

    // Build video frontmatter
    const frontmatter: VideoFrontmatter = {
      date: parsed.data.date || "",
      position: parsed.data.position || "000",
      title: parsed.data.title || "",
      description: parsed.data.description || "",
      image: imageValue,
      videoId: parsed.data.videoId || "",
      transcript: parsed.data.transcript || "",
      tags: Array.isArray(parsed.data.tags)
        ? parsed.data.tags
        : parsed.data.tags
          ? String(parsed.data.tags)
              .split(",")
              .map((t: string) => t.trim())
          : [],
      playlist: parsed.data.playlist || playlistFromPath,
      duration: parsed.data.duration || undefined,
    };

    return NextResponse.json({
      success: true,
      frontmatter,
      original: fileContent,
      sha: fileSha,
      filePath,
    });
  } catch (error: any) {
    console.error("GitHub video load error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load video from GitHub",
      },
      { status: 500 }
    );
  }
}

