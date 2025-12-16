import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../../utils";
import yaml from "js-yaml";
import type { VideoFrontmatter } from "@/app/types/video";
import { purgeVideosCache } from "../../../../utils/cache";

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

    // Determine file path
    const videosFolder =
      process.env.GITHUB_VIDEOS_FOLDER || DEFAULT_VIDEOS_FOLDER;
    const filename = generateFilename(
      videoFrontmatter.position,
      videoFrontmatter.videoId
    );
    const newFilePath = `${videosFolder}/${videoFrontmatter.playlist}/${filename}`;

    // Always stage changes - no immediate commits
    // Return success response indicating the change should be staged client-side
    const isRename = existingFilePath && existingFilePath !== newFilePath;
    return NextResponse.json({
      success: true,
      staged: true,
      filePath: newFilePath,
      oldPath: isRename ? existingFilePath : undefined,
      sha: sha || null,
      type: isRename ? "rename" : (sha ? "update" : "create"),
      message: "Change staged successfully",
    });
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

