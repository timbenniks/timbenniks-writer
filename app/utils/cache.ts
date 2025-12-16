/**
 * Caching Utilities
 * 
 * Provides caching for GitHub API responses and processed data.
 * Uses Next.js unstable_cache for server-side caching.
 * 
 * Cache durations are set to be very long since files rarely change
 * unless updated through the interface. Use ?purge=true to invalidate.
 */

import { unstable_cache, revalidateTag } from "next/cache";

/**
 * Cache configuration
 */
export const CACHE_TAGS = {
  articles: "github-articles",
  videos: "github-videos",
  githubContent: "github-content",
} as const;

/**
 * Cache duration in seconds
 * Set to very long durations since files rarely change
 */
const CACHE_DURATION = {
  // Long cache for file listings (24 hours)
  fileListings: 86400,
  // Very long cache for processed content (7 days)
  processed: 604800,
  // Very long cache for individual files (7 days)
  individualFiles: 604800,
} as const;

/**
 * Create a cache key from parameters
 */
function createCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  return `${prefix}:${parts.filter(Boolean).join(":")}`;
}

/**
 * Cache GitHub file listing
 */
export async function getCachedFileListing<T>(
  key: string,
  fetcher: () => Promise<T>,
  tags: string[] = []
): Promise<T> {
  return unstable_cache(
    fetcher,
    [key],
    {
      tags: [CACHE_TAGS.githubContent, ...tags],
      revalidate: CACHE_DURATION.fileListings,
    }
  )();
}

/**
 * Cache processed articles/videos
 */
export async function getCachedProcessedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  tags: string[] = []
): Promise<T> {
  return unstable_cache(
    fetcher,
    [key],
    {
      tags: [CACHE_TAGS.articles, CACHE_TAGS.videos, ...tags],
      revalidate: CACHE_DURATION.processed,
    }
  )();
}

/**
 * Cache individual file content
 */
export async function getCachedFileContent<T>(
  key: string,
  fetcher: () => Promise<T>,
  tags: string[] = []
): Promise<T> {
  return unstable_cache(
    fetcher,
    [key],
    {
      tags: [CACHE_TAGS.githubContent, ...tags],
      revalidate: CACHE_DURATION.individualFiles,
    }
  )();
}

/**
 * Create cache key for GitHub repository content
 */
export function createRepoCacheKey(
  owner: string,
  repo: string,
  branch: string,
  path: string
): string {
  return createCacheKey("repo-content", owner, repo, branch, path);
}

/**
 * Create cache key for processed articles
 */
export function createArticlesCacheKey(
  owner: string,
  repo: string,
  branch: string,
  folder: string
): string {
  return createCacheKey("articles", owner, repo, branch, folder);
}

/**
 * Create cache key for processed videos
 */
export function createVideosCacheKey(
  owner: string,
  repo: string,
  branch: string,
  videosFolder: string
): string {
  return createCacheKey("videos", owner, repo, branch, videosFolder);
}

/**
 * Create cache key for individual file
 */
export function createFileCacheKey(
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): string {
  return createCacheKey("file", owner, repo, branch, filePath);
}

/**
 * Revalidate cache by tags
 * This can be called after updates to invalidate cache
 */
export async function revalidateCache(tags: string[]) {
  for (const tag of tags) {
    revalidateTag(tag, "force");
  }
}

/**
 * Purge all article caches
 */
export async function purgeArticlesCache() {
  revalidateTag(CACHE_TAGS.articles, "force");
  revalidateTag(CACHE_TAGS.githubContent, "force");
}

/**
 * Purge all video caches
 */
export async function purgeVideosCache() {
  revalidateTag(CACHE_TAGS.videos, "force");
  revalidateTag(CACHE_TAGS.githubContent, "force");
}

/**
 * Purge all caches
 */
export async function purgeAllCache() {
  revalidateTag(CACHE_TAGS.articles, "force");
  revalidateTag(CACHE_TAGS.videos, "force");
  revalidateTag(CACHE_TAGS.githubContent, "force");
}

