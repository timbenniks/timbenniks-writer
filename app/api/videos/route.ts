import { NextRequest } from "next/server";
import { Octokit } from "@octokit/rest";
import {
  transformToContentstackVideo,
  processVideos,
  type ContentstackVideo,
} from "../../utils/videoTransform";
import type { VideoFrontmatter } from "@/app/types/video";
import {
  getCachedProcessedData,
  createVideosCacheKey,
  getCachedFileListing,
  createRepoCacheKey,
  purgeVideosCache,
} from "../../utils/cache";
import { getGitHubConfig, isConfigError } from "../../utils/githubConfig";
import {
  parsePaginationParams,
  parseSortParams,
  parseTags,
  shouldPurgeCache,
  createSuccessResponse,
  handleApiError,
} from "../../utils/apiHelpers";
import {
  filterMarkdownFiles,
  processFilesInBatches,
  parseFrontmatter,
} from "../../utils/fileFetcher";

interface VideosResponse {
  success: boolean;
  videos: ContentstackVideo[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}


/**
 * Parse video frontmatter from parsed matter data
 */
function parseVideoFrontmatter(parsed: { data: any }, itemName: string, folderName: string): VideoFrontmatter {
  return {
    date: parsed.data.date || "",
    position: parsed.data.position || "000",
    title: parsed.data.title || itemName.replace(/\.(md|markdown)$/i, ""),
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
}

/**
 * Fetch and parse all video markdown files from GitHub
 * Uses caching and optimized fetching with download_url
 */
async function fetchVideosFromGitHub(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  videosFolder: string
): Promise<ContentstackVideo[]> {
  const cacheKey = createVideosCacheKey(owner, repoName, branch, videosFolder);

  return getCachedProcessedData(
    cacheKey,
    async () => {
      // Get contents of the videos folder (cached)
      const folderCacheKey = createRepoCacheKey(owner, repoName, branch, videosFolder);
      let playlistFolders: any[] = [];
      
      try {
        const response = await getCachedFileListing(
          folderCacheKey,
          async () => {
            return octokit.repos.getContent({
              owner,
              repo: repoName,
              path: videosFolder,
              ref: branch,
            });
          },
          [`videos-folder-${videosFolder}`]
        );

        if (Array.isArray(response.data)) {
          playlistFolders = response.data.filter((item: any) => item.type === "dir");
        }
      } catch (error: any) {
        if (error.status === 404) {
          return [];
        }
        throw error;
      }

      // Collect all markdown files from all playlist folders
      const allMarkdownFiles: Array<{ item: any; folderName: string }> = [];

      // Get file listings from all folders (parallel, cached)
      await Promise.all(
        playlistFolders.map(async (folder) => {
          try {
            const playlistCacheKey = createRepoCacheKey(owner, repoName, branch, folder.path);
            const folderResponse = await getCachedFileListing(
              playlistCacheKey,
              async () => {
                return octokit.repos.getContent({
                  owner,
                  repo: repoName,
                  path: folder.path,
                  ref: branch,
                });
              },
              [`playlist-${folder.name}`]
            );

            if (!Array.isArray(folderResponse.data)) return;

            const markdownFiles = filterMarkdownFiles(folderResponse.data);
            for (const item of markdownFiles) {
              allMarkdownFiles.push({ item, folderName: folder.name });
            }
          } catch (error) {
            console.warn(`Failed to fetch playlist folder ${folder.path}:`, error);
          }
        })
      );

      // Process files in batches
      return processFilesInBatches<ContentstackVideo>(
        allMarkdownFiles.map(({ item }) => item),
        async (item, fileContent) => {
          const parsed = parseFrontmatter(fileContent);
          const folderName = allMarkdownFiles.find((f) => f.item.path === item.path)?.folderName || "";
          const frontmatter = parseVideoFrontmatter(parsed, item.name, folderName);

          return transformToContentstackVideo(frontmatter, {
            path: item.path,
            sha: item.sha,
            name: item.name,
          });
        },
        octokit,
        owner,
        repoName,
        branch
      );
    },
    [`videos-${owner}-${repoName}-${branch}-${videosFolder}`]
  );
}


/**
 * GET /api/videos
 * Returns videos in Contentstack JSON format
 * 
 * Query parameters:
 * - limit: number (default: 10, max: 100)
 * - offset: number (default: 0)
 * - order: "asc" | "desc" (default: "desc")
 * - orderBy: "date" | "title" | "position" (default: "date")
 * - tags: comma-separated list of tags to filter by (any match)
 * - playlist: playlist name to filter by
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Handle cache purge
    if (shouldPurgeCache(searchParams, "videos")) {
      await purgeVideosCache();
    }

    // Parse parameters
    const { limit, offset } = parsePaginationParams(searchParams);
    const { order, orderBy } = parseSortParams(searchParams, "date");
    const tags = parseTags(searchParams);
    const playlist = searchParams.get("playlist") || "";

    // Get GitHub config
    const config = getGitHubConfig();
    if (isConfigError(config)) {
      return handleApiError({ status: 500, message: config.error }, "Configuration error", {
        videos: [],
        total: 0,
        limit,
        offset,
      });
    }

    const octokit = new Octokit({ auth: config.token });
    const allVideos = await fetchVideosFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.videosFolder || "content/3.videos"
    );

    const { videos, total } = processVideos(allVideos, {
      playlist,
      tags,
      orderBy: orderBy as "date" | "title" | "position",
      order,
      offset,
      limit,
    });

    return createSuccessResponse({ videos, total, limit, offset });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch videos", {
      videos: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  }
}

/**
 * POST /api/videos
 * Returns videos in Contentstack JSON format (alternative to GET with body)
 * Useful for more complex filtering options or overriding GitHub config
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Handle cache purge
    if (shouldPurgeCache(body, "videos")) {
      await purgeVideosCache();
    }

    // Parse parameters
    const { limit, offset } = parsePaginationParams(body);
    const { order, orderBy } = parseSortParams(body, "date");
    const tags = parseTags(body);
    const playlist = body.playlist || "";

    // Get GitHub config with overrides
    const config = getGitHubConfig({
      repo: body.repo,
      branch: body.branch,
      videosFolder: body.videosFolder,
    });

    if (isConfigError(config)) {
      return handleApiError({ status: 500, message: config.error }, "Configuration error", {
        videos: [],
        total: 0,
        limit,
        offset,
      });
    }

    const octokit = new Octokit({ auth: config.token });
    const allVideos = await fetchVideosFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.videosFolder || "content/3.videos"
    );

    const { videos, total } = processVideos(allVideos, {
      playlist,
      tags,
      orderBy: orderBy as "date" | "title" | "position",
      order,
      offset,
      limit,
    });

    return createSuccessResponse({ videos, total, limit, offset });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch videos", {
      videos: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  }
}

