import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  getContentstackEntryUrl,
} from "../../utils";

const VIDEO_CONTENT_TYPE = "video";

/**
 * POST /api/contentstack/videos/create
 * Create a new video entry in Contentstack
 *
 * Body: {
 *   entry: {
 *     title: string,
 *     description?: string,
 *     date?: string,
 *     video_id: string,
 *     image_url?: string,
 *     transcript?: string,
 *     taxonomies?: array  // Array of { taxonomy_uid, term_uid }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { entry } = body;

    if (!entry || !entry.title || !entry.video_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: entry.title, entry.video_id",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Create the entry
    const response = await fetch(
      `${baseUrl}/v3/content_types/${VIDEO_CONTENT_TYPE}/entries?locale=en-us`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ entry }),
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Create video entry");
    }

    const data = await response.json();
    const entryUid = data.entry?.uid;

    return NextResponse.json({
      success: true,
      entry: {
        uid: entryUid,
        title: data.entry?.title,
        videoId: data.entry?.video_id,
        version: data.entry?._version,
        dashboardUrl: entryUid
          ? getContentstackEntryUrl(entryUid, VIDEO_CONTENT_TYPE)
          : null,
      },
    });
  } catch (error: any) {
    console.error("Contentstack video creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create video entry",
      },
      { status: 500 }
    );
  }
}

