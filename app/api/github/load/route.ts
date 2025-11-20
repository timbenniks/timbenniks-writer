import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import matter from "gray-matter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch", "filePath"]);
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
    const { branch, filePath } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get file content from GitHub
    let fileContent;
    let fileSha: string | null = null;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: filePath,
        ref: branch,
      });

      // Decode base64 content
      if ("content" in response.data && response.data.encoding === "base64") {
        fileContent = Buffer.from(response.data.content, "base64").toString("utf-8");
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

    // Parse frontmatter and content
    const parsed = matter(fileContent);

    // Extract original frontmatter string (between --- markers)
    let originalFrontmatter = "";
    const frontmatterMatch = fileContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (frontmatterMatch) {
      originalFrontmatter = frontmatterMatch[1];
    }

    return NextResponse.json({
      success: true,
      content: parsed.content, // Markdown content without frontmatter
      frontmatter: parsed.data, // Frontmatter as object
      frontmatterString: originalFrontmatter, // Original frontmatter YAML string
      original: fileContent, // Full original content
      sha: fileSha, // File SHA for updates
      filePath,
    });
  } catch (error: any) {
    console.error("GitHub load error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load file from GitHub",
      },
      { status: 500 }
    );
  }
}

