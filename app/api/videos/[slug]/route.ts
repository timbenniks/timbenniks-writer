import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import matter from "gray-matter";
import {
  transformToContentstackVideo,
  type ContentstackVideo,
} from "../../../utils/videoTransform";
import type { VideoFrontmatter } from "@/app/types/video";

const DEFAULT_VIDEOS_FOLDER = "content/3.videos";

/**
 * GET /api/videos/[slug]
 * Returns a single video by slug (videoId), file name, or file path in Contentstack JSON format
 * 
 * The slug parameter can be:
 * - A videoId (e.g., "dQw4w9WgXcQ")
 * - A file name (e.g., "001-dQw4w9WgXcQ.md")
 * - A URL-encoded file path (e.g., "content%2F3.videos%2Ftim%2F001-dQw4w9WgXcQ.md")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: slugParam } = await params;
    const decodedSlug = decodeURIComponent(slugParam);

    // Get GitHub config from environment
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const videosFolder = process.env.GITHUB_VIDEOS_FOLDER || DEFAULT_VIDEOS_FOLDER;

    if (!token || !repo) {
      return NextResponse.json(
        { success: false, error: "GitHub configuration missing. Set GITHUB_TOKEN and GITHUB_REPO in environment." },
        { status: 500 }
      );
    }

    const repoMatch = repo.match(/^([^\/]+)\/([^\/]+)$/);
    if (!repoMatch) {
      return NextResponse.json(
        { success: false, error: "Invalid GITHUB_REPO format. Use 'owner/repo'" },
        { status: 500 }
      );
    }
    const [, owner, repoName] = repoMatch;

    const octokit = new Octokit({ auth: token });

    // Try to find the video
    const video = await findVideo(octokit, owner, repoName, branch, videosFolder, decodedSlug);

    if (!video) {
      return NextResponse.json(
        { success: false, error: `Video '${decodedSlug}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, video });
  } catch (error: any) {
    console.error("Video API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch video" },
      { status: 500 }
    );
  }
}

/**
 * Find a video by slug (videoId), filename, or path
 */
async function findVideo(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  videosFolder: string,
  slugOrPath: string
): Promise<ContentstackVideo | null> {
  // Determine the file path to try
  let filePath: string;

  if (slugOrPath.includes("/") || slugOrPath.endsWith(".md") || slugOrPath.endsWith(".markdown")) {
    // It's a path or filename
    filePath = slugOrPath.startsWith(videosFolder) || !videosFolder
      ? slugOrPath
      : `${videosFolder}/${slugOrPath}`;

    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
      filePath = `${filePath}.md`;
    }
  } else {
    // It's a videoId - search for it
    return await searchByVideoId(octokit, owner, repoName, branch, videosFolder, slugOrPath);
  }

  // Try direct path first
  const directResult = await tryLoadVideo(octokit, owner, repoName, branch, filePath);
  if (directResult) return directResult;

  return null;
}

/**
 * Try to load a video from a specific path
 */
async function tryLoadVideo(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  filePath: string
): Promise<ContentstackVideo | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: filePath,
      ref: branch,
    });

    if ("content" in response.data && response.data.encoding === "base64") {
      const fileContent = Buffer.from(response.data.content, "base64").toString("utf-8");
      const parsed = matter(fileContent);

      // Extract folder name from path (e.g., "content/3.videos/tim/file.md" -> "tim")
      const pathParts = filePath.split("/");
      const videosFolderIndex = pathParts.findIndex((part) => part.includes("videos"));
      const folderName = videosFolderIndex >= 0 && videosFolderIndex < pathParts.length - 1
        ? pathParts[videosFolderIndex + 1]
        : "";

      const frontmatter: VideoFrontmatter = {
        date: parsed.data.date || "",
        position: parsed.data.position || "000",
        title: parsed.data.title || response.data.name.replace(/\.(md|markdown)$/i, ""),
        description: parsed.data.description || "",
        image: parsed.data.image || parsed.data.heroImage || parsed.data.thumbnail || "",
        videoId: parsed.data.videoId || "",
        transcript: parsed.data.transcript || "",
        tags: Array.isArray(parsed.data.tags)
          ? parsed.data.tags
          : parsed.data.tags
            ? String(parsed.data.tags).split(",").map((t: string) => t.trim())
            : [],
        playlist: parsed.data.playlist || folderName,
        duration: parsed.data.duration || undefined,
      };

      return transformToContentstackVideo(frontmatter, {
        path: response.data.path,
        sha: response.data.sha,
        name: response.data.name,
      });
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }
  return null;
}

/**
 * Search for a video by videoId in frontmatter
 */
async function searchByVideoId(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  videosFolder: string,
  targetVideoId: string
): Promise<ContentstackVideo | null> {
  try {
    const folderResponse = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: videosFolder,
      ref: branch,
    });

    if (!Array.isArray(folderResponse.data)) return null;

    // Filter playlist folders
    const playlistFolders = folderResponse.data.filter((item: any) => item.type === "dir");

    // Search through all playlist folders
    for (const folder of playlistFolders) {
      try {
        const folderResponse = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: folder.path,
          ref: branch,
        });

        if (!Array.isArray(folderResponse.data)) continue;

        // Filter markdown files
        const markdownFiles = folderResponse.data.filter((item: any) => {
          if (item.type !== "file") return false;
          const fileName = item.name.toLowerCase();
          return fileName.endsWith(".md") || fileName.endsWith(".markdown");
        });

        // Search through files for matching videoId
        for (const file of markdownFiles) {
          try {
            const fileResponse = await octokit.repos.getContent({
              owner,
              repo: repoName,
              path: file.path,
              ref: branch,
            });

            if ("content" in fileResponse.data && fileResponse.data.encoding === "base64") {
              const content = Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
              const parsed = matter(content);

              const fileVideoId = parsed.data.videoId;

              // Check if videoId matches
              if (fileVideoId === targetVideoId) {
                const frontmatter: VideoFrontmatter = {
                  date: parsed.data.date || "",
                  position: parsed.data.position || "000",
                  title: parsed.data.title || file.name.replace(/\.(md|markdown)$/i, ""),
                  description: parsed.data.description || "",
                  image: parsed.data.image || parsed.data.heroImage || parsed.data.thumbnail || "",
                  videoId: parsed.data.videoId || "",
                  transcript: parsed.data.transcript || "",
                  tags: Array.isArray(parsed.data.tags)
                    ? parsed.data.tags
                    : parsed.data.tags
                      ? String(parsed.data.tags).split(",").map((t: string) => t.trim())
                      : [],
                  playlist: parsed.data.playlist || folder.name,
                  duration: parsed.data.duration || undefined,
                };

                return transformToContentstackVideo(frontmatter, {
                  path: file.path,
                  sha: file.sha,
                  name: file.name,
                });
              }
            }
          } catch (error) {
            // Continue searching other files
            console.warn(`Failed to check file ${file.path}:`, error);
          }
        }
      } catch (error) {
        // Continue searching other folders
        console.warn(`Failed to check folder ${folder.path}:`, error);
      }
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  return null;
}

