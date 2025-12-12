import { NextRequest, NextResponse } from "next/server";
import {
  getYouTubeApiKey,
  validateYouTubeConfig,
  parseDuration,
  fetchWithRetry,
  getBestThumbnailUrl,
} from "../utils";
import type { YouTubeVideo } from "@/app/types/video";

interface VideoSnippet {
  publishedAt: string;
  title: string;
  description: string;
  thumbnails?: {
    maxres?: { url: string };
    high?: { url: string };
    medium?: { url: string };
    default?: { url: string };
  };
  channelTitle?: string;
  tags?: string[];
}

interface VideoContentDetails {
  duration?: string;
}

interface VideoResponse {
  items: Array<{
    id: string;
    snippet: VideoSnippet;
    contentDetails?: VideoContentDetails;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const validation = validateYouTubeConfig();
    if (!validation.isValid) {
      return validation.error!;
    }

    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    const apiKey = getYouTubeApiKey()!;

    // Fetch video details
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      id: videoId,
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
      const errorData = await response.json();
      throw new Error(
        errorData.error?.message || `YouTube API error: ${response.status}`
      );
    }

    const data: VideoResponse = await response.json();

    if (!data.items || data.items.length === 0) {
      return NextResponse.json(
        { success: false, error: `Video not found: ${videoId}` },
        { status: 404 }
      );
    }

    const item = data.items[0];
    const snippet = item.snippet;

    // Get best available thumbnail (maxres with fallback to hq)
    const thumbnailUrl = await getBestThumbnailUrl(item.id);

    const video: YouTubeVideo = {
      videoId: item.id,
      title: snippet.title,
      description: snippet.description,
      publishedAt: snippet.publishedAt,
      thumbnail: thumbnailUrl,
      position: 0,
      duration: item.contentDetails?.duration
        ? parseDuration(item.contentDetails.duration)
        : undefined,
      channelTitle: snippet.channelTitle,
    };

    return NextResponse.json({
      success: true,
      video,
      tags: snippet.tags || [],
    });
  } catch (error: any) {
    console.error("YouTube video error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch video details",
      },
      { status: 500 }
    );
  }
}

