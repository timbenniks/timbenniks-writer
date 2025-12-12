import { NextResponse } from "next/server";

/**
 * Get YouTube API key from environment
 */
export function getYouTubeApiKey(): string | null {
  return process.env.YOUTUBE_KEY || null;
}

/**
 * Validate YouTube API key is configured
 */
export function validateYouTubeConfig(): {
  isValid: boolean;
  error?: NextResponse;
} {
  const apiKey = getYouTubeApiKey();
  if (!apiKey) {
    return {
      isValid: false,
      error: NextResponse.json(
        {
          success: false,
          error:
            "YouTube API key not configured. Please set YOUTUBE_KEY in .env.local",
        },
        { status: 500 }
      ),
    };
  }
  return { isValid: true };
}

/**
 * Parse ISO 8601 duration to human-readable format
 * e.g., PT5M30S -> "5:30"
 */
export function parseDuration(isoDuration: string): string {
  if (!isoDuration) return "";

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return isoDuration;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Get the best available thumbnail URL for a YouTube video
 * Tries maxresdefault first, falls back to hqdefault if not available
 */
export async function getBestThumbnailUrl(videoId: string): Promise<string> {
  const maxresUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const hqUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  try {
    // Check if maxresdefault exists with a HEAD request
    const response = await fetch(maxresUrl, { method: "HEAD" });

    // YouTube returns 200 even for missing thumbnails, but with a small placeholder
    // Check Content-Length - maxres images are typically > 10KB
    const contentLength = response.headers.get("Content-Length");
    if (response.ok && contentLength && parseInt(contentLength, 10) > 10000) {
      return maxresUrl;
    }
  } catch {
    // If HEAD request fails, fall back to hqdefault
  }

  return hqUrl;
}

/**
 * Handle rate limiting with exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // If rate limited, wait and retry
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 1000;

        console.log(
          `Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Request failed. Waiting ${waitTime}ms before retry`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

