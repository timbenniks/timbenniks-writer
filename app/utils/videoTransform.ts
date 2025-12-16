/**
 * Video Transformation Utilities
 * 
 * Shared utilities for transforming markdown videos to Contentstack JSON format.
 * Used by both the Videos API and Contentstack export functionality.
 */

import type { VideoFrontmatter } from "@/app/types/video";

/**
 * Contentstack Video format
 * This is the canonical format used for both API responses and Contentstack export
 */
export interface ContentstackVideo {
  title: string;
  video_id: string;
  description: string;
  date: string;
  image_url?: string;
  transcript?: string;
  position: string;
  playlist: string;
  duration?: string;
  taxonomies?: Array<{ taxonomy_uid: string; term_uid: string }>;
  slug: string;
  source: {
    path: string;
    sha: string;
  };
}

/**
 * Source file information from GitHub
 */
export interface SourceFileInfo {
  path: string;
  sha: string;
  name: string;
}

/**
 * Extract tags from frontmatter, normalizing to lowercase array
 */
export function extractVideoTags(frontmatter: VideoFrontmatter): string[] {
  if (!frontmatter.tags || !Array.isArray(frontmatter.tags)) return [];
  return frontmatter.tags.map((tag) => String(tag).toLowerCase().trim()).filter(Boolean);
}

/**
 * Convert tags to Contentstack taxonomy format
 */
export function videoTagsToTaxonomies(tags: string[]): Array<{ taxonomy_uid: string; term_uid: string }> {
  return tags.map((tag) => ({
    taxonomy_uid: "content_tags",
    term_uid: tag
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, ""),
  }));
}

/**
 * Normalize date to ISO format with time component
 */
export function normalizeVideoDate(date: string | undefined | null): string {
  if (!date) return new Date().toISOString();

  const dateStr = String(date);
  if (!dateStr.includes("T")) {
    return `${dateStr}T10:00:00.000Z`;
  }
  return dateStr;
}

/**
 * Build video slug from videoId or filename
 */
export function buildVideoSlug(frontmatter: VideoFrontmatter, filename: string): string {
  // Use videoId as slug if available, otherwise use filename
  if (frontmatter.videoId) {
    return frontmatter.videoId;
  }
  return filename.replace(/\.(md|markdown)$/i, "");
}

/**
 * Transform video frontmatter to Contentstack video format
 * 
 * This is the main transformation function that converts a video file
 * with frontmatter into the Contentstack JSON format.
 */
export function transformToContentstackVideo(
  frontmatter: VideoFrontmatter,
  sourceFile: SourceFileInfo
): ContentstackVideo {
  // Build slug
  const slug = buildVideoSlug(frontmatter, sourceFile.name);

  // Extract and transform fields
  const tags = extractVideoTags(frontmatter);
  const taxonomies = videoTagsToTaxonomies(tags);

  // Build the video object
  const video: ContentstackVideo = {
    title: frontmatter.title || sourceFile.name.replace(/\.(md|markdown)$/i, ""),
    video_id: frontmatter.videoId || "",
    description: frontmatter.description || "",
    date: normalizeVideoDate(frontmatter.date),
    position: frontmatter.position || "000",
    playlist: frontmatter.playlist || "",
    slug,
    source: {
      path: sourceFile.path,
      sha: sourceFile.sha,
    },
  };

  // Add optional fields only if they have values
  if (frontmatter.image) video.image_url = frontmatter.image;
  if (frontmatter.transcript) video.transcript = frontmatter.transcript;
  if (frontmatter.duration) video.duration = frontmatter.duration;
  if (taxonomies.length > 0) video.taxonomies = taxonomies;

  return video;
}

/**
 * Filter videos by playlist
 */
export function filterByPlaylist(
  videos: ContentstackVideo[],
  playlist: string
): ContentstackVideo[] {
  if (!playlist) return videos;
  return videos.filter((video) => video.playlist === playlist);
}

/**
 * Filter videos by tags (any match)
 */
export function filterVideoByTags(
  videos: ContentstackVideo[],
  tags: string[]
): ContentstackVideo[] {
  if (tags.length === 0) return videos;

  return videos.filter((video) => {
    if (!video.taxonomies) return false;
    const videoTags = video.taxonomies.map((t) => t.term_uid);
    return tags.some((filterTag) =>
      videoTags.some(
        (videoTag) =>
          videoTag === filterTag ||
          videoTag.includes(filterTag) ||
          filterTag.includes(videoTag)
      )
    );
  });
}

/**
 * Sort videos by field
 */
export function sortVideos(
  videos: ContentstackVideo[],
  orderBy: "date" | "title" | "position",
  order: "asc" | "desc"
): ContentstackVideo[] {
  return [...videos].sort((a, b) => {
    let comparison = 0;

    if (orderBy === "date") {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (orderBy === "title") {
      comparison = a.title.localeCompare(b.title);
    } else if (orderBy === "position") {
      comparison = parseInt(a.position, 10) - parseInt(b.position, 10);
    }

    return order === "asc" ? comparison : -comparison;
  });
}

/**
 * Apply pagination to videos
 */
export function paginateVideos(
  videos: ContentstackVideo[],
  offset: number,
  limit: number
): ContentstackVideo[] {
  return videos.slice(offset, offset + limit);
}

/**
 * Full pipeline to filter, sort, and paginate videos
 */
export function processVideos(
  videos: ContentstackVideo[],
  options: {
    playlist?: string;
    tags?: string[];
    orderBy?: "date" | "title" | "position";
    order?: "asc" | "desc";
    offset?: number;
    limit?: number;
  }
): { videos: ContentstackVideo[]; total: number } {
  const {
    playlist = "",
    tags = [],
    orderBy = "date",
    order = "desc",
    offset = 0,
    limit = 10,
  } = options;

  // Apply filters
  let filtered = filterByPlaylist(videos, playlist);
  filtered = filterVideoByTags(filtered, tags);

  // Get total before pagination
  const total = filtered.length;

  // Sort and paginate
  const sorted = sortVideos(filtered, orderBy, order);
  const paginated = paginateVideos(sorted, offset, limit);

  return { videos: paginated, total };
}

