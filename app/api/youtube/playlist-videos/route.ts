import { NextRequest, NextResponse } from "next/server";
import {
  getYouTubeApiKey,
  validateYouTubeConfig,
  parseDuration,
  fetchWithRetry,
  getBestThumbnailUrl,
} from "../utils";
import type { YouTubeVideo } from "@/app/types/video";

interface PlaylistItemSnippet {
  publishedAt: string;
  title: string;
  description: string;
  thumbnails?: {
    maxres?: { url: string };
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
  position: number;
  resourceId: {
    videoId: string;
  };
  channelTitle?: string;
}

interface PlaylistItem {
  snippet: PlaylistItemSnippet;
}

interface PlaylistItemsResponse {
  items: PlaylistItem[];
  nextPageToken?: string;
}

interface VideoDetailsResponse {
  items: Array<{
    id: string;
    contentDetails?: {
      duration?: string;
    };
  }>;
}

/**
 * Fetch all videos from a YouTube playlist with pagination
 */
async function fetchAllPlaylistVideos(
  playlistId: string,
  apiKey: string
): Promise<YouTubeVideo[]> {
  const videos: YouTubeVideo[] = [];
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      part: "snippet",
      playlistId,
      key: apiKey,
      maxResults: "50",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/playlistItems?${params}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error?.message || `YouTube API error: ${response.status}`
      );
    }

    const data: PlaylistItemsResponse = await response.json();

    // Map playlist items to our video format
    for (const item of data.items) {
      const snippet = item.snippet;
      
      // Skip deleted or private videos
      if (snippet.title === "Deleted video" || snippet.title === "Private video") {
        continue;
      }

      videos.push({
        videoId: snippet.resourceId.videoId,
        title: snippet.title,
        description: snippet.description,
        publishedAt: snippet.publishedAt,
        thumbnail: `https://img.youtube.com/vi/${snippet.resourceId.videoId}/hqdefault.jpg`,
        position: snippet.position,
        channelTitle: snippet.channelTitle,
      });
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return videos;
}

/**
 * Fetch video durations in batches
 */
async function fetchVideoDurations(
  videoIds: string[],
  apiKey: string
): Promise<Map<string, string>> {
  const durations = new Map<string, string>();

  // YouTube API allows up to 50 video IDs per request
  const batchSize = 50;
  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);

    const params = new URLSearchParams({
      part: "contentDetails",
      id: batch.join(","),
      key: apiKey,
    });

    const response = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/videos?${params}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch durations for batch starting at ${i}`);
      continue;
    }

    const data: VideoDetailsResponse = await response.json();

    for (const item of data.items) {
      if (item.contentDetails?.duration) {
        durations.set(item.id, parseDuration(item.contentDetails.duration));
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < videoIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return durations;
}

/**
 * Fetch best thumbnails for videos in parallel batches
 */
async function fetchBestThumbnails(
  videoIds: string[]
): Promise<Map<string, string>> {
  const thumbnails = new Map<string, string>();
  const batchSize = 10; // Check 10 thumbnails at a time

  for (let i = 0; i < videoIds.length; i += batchSize) {
    const batch = videoIds.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (videoId) => {
        const url = await getBestThumbnailUrl(videoId);
        return { videoId, url };
      })
    );

    for (const result of results) {
      thumbnails.set(result.videoId, result.url);
    }

    // Small delay between batches
    if (i + batchSize < videoIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return thumbnails;
}

export async function POST(request: NextRequest) {
  try {
    const validation = validateYouTubeConfig();
    if (!validation.isValid) {
      return validation.error!;
    }

    const body = await request.json();
    const { playlistId, includeDurations = true } = body;

    if (!playlistId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: playlistId" },
        { status: 400 }
      );
    }

    const apiKey = getYouTubeApiKey()!;

    // Fetch all videos from the playlist
    const videos = await fetchAllPlaylistVideos(playlistId, apiKey);

    if (videos.length > 0) {
      const videoIds = videos.map((v) => v.videoId);

      // Fetch durations and thumbnails in parallel
      const [durations, thumbnails] = await Promise.all([
        includeDurations
          ? fetchVideoDurations(videoIds, apiKey)
          : Promise.resolve(new Map<string, string>()),
        fetchBestThumbnails(videoIds),
      ]);

      // Update videos with fetched data
      for (const video of videos) {
        if (includeDurations) {
          video.duration = durations.get(video.videoId) || undefined;
        }
        video.thumbnail =
          thumbnails.get(video.videoId) || video.thumbnail;
      }
    }

    return NextResponse.json({
      success: true,
      videos,
      count: videos.length,
    });
  } catch (error: any) {
    console.error("YouTube playlist videos error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch playlist videos",
      },
      { status: 500 }
    );
  }
}

