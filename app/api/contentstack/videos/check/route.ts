import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  getContentstackEntryUrl,
} from "../../utils";

const VIDEO_CONTENT_TYPE = "video";

/**
 * POST /api/contentstack/videos/check
 * Check if a video entry already exists by video_id
 *
 * Body: {
 *   videoId: string  // YouTube video ID
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { videoId } = body;

    if (!videoId) {
      return NextResponse.json(
        { success: false, error: "Missing required field: videoId" },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Query for existing entry with this video_id
    const queryParams = new URLSearchParams({
      locale: "en-us",
      query: JSON.stringify({ video_id: videoId }),
    });

    const response = await fetch(
      `${baseUrl}/v3/content_types/${VIDEO_CONTENT_TYPE}/entries?${queryParams}`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      // Handle 404 as "not found"
      if (response.status === 404) {
        return NextResponse.json({
          success: true,
          exists: false,
        });
      }

      const errorData = await response.json();
      return NextResponse.json(
        {
          success: false,
          error: errorData.error_message || `API error: ${response.status}`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.entries && data.entries.length > 0) {
      const entry = data.entries[0];
      return NextResponse.json({
        success: true,
        exists: true,
        entry: {
          uid: entry.uid,
          title: entry.title,
          videoId: entry.video_id,
          url: getContentstackEntryUrl(entry.uid, VIDEO_CONTENT_TYPE),
        },
      });
    }

    return NextResponse.json({
      success: true,
      exists: false,
    });
  } catch (error: any) {
    console.error("Contentstack video check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check for existing video",
      },
      { status: 500 }
    );
  }
}

