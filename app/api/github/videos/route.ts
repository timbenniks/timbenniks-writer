import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import matter from "gray-matter";
import type { GitHubVideoFile, VideoFrontmatter } from "@/app/types/video";

const DEFAULT_VIDEOS_FOLDER = "content/3.videos";

interface GitHubContentItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  html_url: string;
  download_url: string;
}

/**
 * Parse video frontmatter from markdown content
 */
function parseVideoFrontmatter(
  content: string,
  fileName: string
): VideoFrontmatter {
  try {
    const parsed = matter(content);

    // Extract date for sorting (handle ISO datetime strings)
    let dateValue = parsed.data.date || "";
    if (dateValue && typeof dateValue === "string" && dateValue.includes("T")) {
      // Keep full ISO string for videos
    } else if (dateValue instanceof Date) {
      dateValue = dateValue.toISOString();
    }

    // Get image value, treating "undefined" string as empty
    let imageValue =
      parsed.data.image ||
      parsed.data.heroImage ||
      parsed.data.thumbnail ||
      "";

    // Fix for legacy files that have "undefined" as a string
    if (imageValue === "undefined") {
      imageValue = "";
    }

    return {
      date: dateValue,
      position: parsed.data.position || "000",
      title: parsed.data.title || fileName.replace(/\.(md|markdown)$/i, ""),
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
      playlist: parsed.data.playlist || "",
      duration: parsed.data.duration || undefined,
    };
  } catch (error) {
    console.warn(`Failed to parse frontmatter for ${fileName}:`, error);
    return {
      date: "",
      position: "000",
      title: fileName.replace(/\.(md|markdown)$/i, ""),
      description: "",
      image: "",
      videoId: "",
      transcript: "",
      tags: [],
      playlist: "",
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch"]);
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
    const { branch, playlist } = body;

    // Use videos folder from env or default
    const videosFolder =
      process.env.GITHUB_VIDEOS_FOLDER || DEFAULT_VIDEOS_FOLDER;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Get all playlist folders
    let playlistFolders: GitHubContentItem[] = [];
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: videosFolder,
        ref: branch,
      });

      if (Array.isArray(response.data)) {
        playlistFolders = response.data.filter(
          (item: any) => item.type === "dir"
        ) as GitHubContentItem[];
      }
    } catch (error: any) {
      if (error.status === 404) {
        // Folder doesn't exist yet - return empty array (not an error)
        // User can still import videos which will create the folder
        return NextResponse.json({
          success: true,
          videos: [],
          count: 0,
          playlists: [],
          message: `Videos folder '${videosFolder}' not found. Import videos to create it.`,
        });
      }
      throw error;
    }

    // If a specific playlist is requested, filter to just that one
    if (playlist) {
      playlistFolders = playlistFolders.filter((f) => f.name === playlist);
      if (playlistFolders.length === 0) {
        return NextResponse.json(
          { success: false, error: `Playlist folder '${playlist}' not found` },
          { status: 404 }
        );
      }
    }

    // Collect all markdown files from all playlist folders first
    const allMarkdownFiles: Array<{
      item: GitHubContentItem;
      folderName: string;
    }> = [];

    // Step 1: Get file listings from all folders (parallel)
    await Promise.all(
      playlistFolders.map(async (folder) => {
        try {
          const folderResponse = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: folder.path,
            ref: branch,
          });

          if (!Array.isArray(folderResponse.data)) return;

          // Filter markdown files
          const markdownFiles = folderResponse.data.filter((item: any) => {
            if (item.type !== "file") return false;
            const fileName = item.name.toLowerCase();
            return fileName.endsWith(".md") || fileName.endsWith(".markdown");
          });

          for (const item of markdownFiles) {
            allMarkdownFiles.push({
              item: item as GitHubContentItem,
              folderName: folder.name,
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch playlist folder ${folder.path}:`, error);
        }
      })
    );

    // Step 2: Fetch file contents in parallel batches using download_url (much faster)
    const BATCH_SIZE = 20; // Fetch 20 files at a time
    const allVideos: GitHubVideoFile[] = [];

    for (let i = 0; i < allMarkdownFiles.length; i += BATCH_SIZE) {
      const batch = allMarkdownFiles.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async ({ item, folderName }) => {
          try {
            // Use download_url for faster direct content fetch (bypasses GitHub API rate limits)
            const response = await fetch(item.download_url);
            if (!response.ok) {
              console.warn(`Failed to fetch ${item.path}: ${response.status}`);
              return null;
            }

            const fileContent = await response.text();
            const frontmatter = parseVideoFrontmatter(fileContent, item.name);

            // Set playlist from folder name if not in frontmatter
            if (!frontmatter.playlist) {
              frontmatter.playlist = folderName;
            }

            return {
              name: item.name,
              path: item.path,
              sha: item.sha,
              size: item.size,
              url: item.html_url,
              downloadUrl: item.download_url,
              frontmatter,
            } as GitHubVideoFile;
          } catch (error) {
            console.warn(`Failed to fetch video file ${item.path}:`, error);
            return null;
          }
        })
      );

      // Add non-null results to allVideos
      allVideos.push(...batchResults.filter((v): v is GitHubVideoFile => v !== null));
    }

    // Sort by date (newest first) then by position
    allVideos.sort((a, b) => {
      const dateA = a.frontmatter.date || "";
      const dateB = b.frontmatter.date || "";
      if (dateB !== dateA) {
        return dateB.localeCompare(dateA);
      }
      return a.frontmatter.position.localeCompare(b.frontmatter.position);
    });

    return NextResponse.json({
      success: true,
      videos: allVideos,
      count: allVideos.length,
      playlists: playlistFolders.map((f) => f.name),
    });
  } catch (error: any) {
    console.error("GitHub videos error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch videos from GitHub",
      },
      { status: 500 }
    );
  }
}

