import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../../utils";
import yaml from "js-yaml";
import type { VideoFrontmatter } from "@/app/types/video";

const DEFAULT_VIDEOS_FOLDER = "content/3.videos";

/**
 * Convert video frontmatter to YAML string
 */
function frontmatterToYaml(frontmatter: VideoFrontmatter): string {
  // Build object in desired key order
  // Use empty strings as fallbacks to prevent "undefined" being written to YAML
  const data: Record<string, any> = {
    date: frontmatter.date || "",
    position: frontmatter.position || "000",
    title: frontmatter.title || "",
    description: frontmatter.description || "",
    image: frontmatter.image || "",
    videoId: frontmatter.videoId || "",
    transcript: frontmatter.transcript || "",
  };

  // Add optional fields
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    data.tags = frontmatter.tags;
  }

  if (frontmatter.playlist) {
    data.playlist = frontmatter.playlist;
  }

  if (frontmatter.duration) {
    data.duration = frontmatter.duration;
  }

  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Generate filename for video
 */
function generateFilename(position: string, videoId: string): string {
  return `${position}-${videoId}.md`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "frontmatter",
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
    const {
      branch,
      frontmatter,
      filePath: existingFilePath,
      sha,
      commitMessage,
    } = body;

    const videoFrontmatter = frontmatter as VideoFrontmatter;

    // Validate required fields
    if (!videoFrontmatter.videoId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    if (!videoFrontmatter.playlist) {
      return NextResponse.json(
        { success: false, error: "Missing required field: playlist" },
        { status: 400 }
      );
    }

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Determine file path
    const videosFolder =
      process.env.GITHUB_VIDEOS_FOLDER || DEFAULT_VIDEOS_FOLDER;
    const filename = generateFilename(
      videoFrontmatter.position,
      videoFrontmatter.videoId
    );
    const newFilePath = `${videosFolder}/${videoFrontmatter.playlist}/${filename}`;

    // Build file content
    const yamlContent = frontmatterToYaml(videoFrontmatter);
    const fileContent = `---\n${yamlContent}---\n\n`;

    // Get author info from environment
    const authorName = process.env.GITHUB_AUTHOR_NAME || "Tim Benniks Writer";
    const authorEmail =
      process.env.GITHUB_AUTHOR_EMAIL || "noreply@timbenniks.dev";

    // Check if we're renaming (path changed)
    const isRename = existingFilePath && existingFilePath !== newFilePath;

    try {
      // If renaming, delete old file first
      if (isRename && sha) {
        await octokit.repos.deleteFile({
          owner,
          repo: repoName,
          path: existingFilePath,
          message: `Rename video: ${videoFrontmatter.title}`,
          sha,
          branch,
          author: {
            name: authorName,
            email: authorEmail,
          },
        });
      }

      // Get current SHA if updating existing file at new path
      let currentSha: string | undefined;
      if (!isRename && sha) {
        currentSha = sha;
      } else if (!isRename) {
        // Check if file exists at new path
        try {
          const existingFile = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: newFilePath,
            ref: branch,
          });
          if ("sha" in existingFile.data) {
            currentSha = existingFile.data.sha;
          }
        } catch (e: any) {
          // File doesn't exist, that's fine for new videos
          if (e.status !== 404) throw e;
        }
      }

      // Create or update file
      const response = await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: newFilePath,
        message:
          commitMessage ||
          `${currentSha ? "Update" : "Add"} video: ${videoFrontmatter.title}`,
        content: Buffer.from(fileContent).toString("base64"),
        sha: currentSha,
        branch,
        author: {
          name: authorName,
          email: authorEmail,
        },
      });

      return NextResponse.json({
        success: true,
        filePath: newFilePath,
        sha: response.data.content?.sha,
        commit: response.data.commit?.sha,
        renamed: isRename,
      });
    } catch (error: any) {
      // Handle conflict (file changed remotely)
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
    console.error("GitHub video save error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to save video to GitHub",
      },
      { status: 500 }
    );
  }
}

