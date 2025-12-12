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
 * PUT /api/contentstack/videos/update
 * Update an existing video entry in Contentstack
 *
 * Body: {
 *   entryUid: string,
 *   entry: {
 *     title?: string,
 *     description?: string,
 *     date?: string,
 *     video_id?: string,
 *     image_url?: string,
 *     transcript?: string,
 *     taxonomies?: array
 *   }
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { entryUid, entry } = body;

    if (!entryUid) {
      return NextResponse.json(
        { success: false, error: "Missing required field: entryUid" },
        { status: 400 }
      );
    }

    if (!entry || Object.keys(entry).length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Update the entry
    const response = await fetch(
      `${baseUrl}/v3/content_types/${VIDEO_CONTENT_TYPE}/entries/${entryUid}?locale=en-us`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ entry }),
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Update video entry");
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      entry: {
        uid: data.entry?.uid,
        title: data.entry?.title,
        videoId: data.entry?.video_id,
        version: data.entry?._version,
        dashboardUrl: getContentstackEntryUrl(entryUid, VIDEO_CONTENT_TYPE),
      },
    });
  } catch (error: any) {
    console.error("Contentstack video update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update video entry",
      },
      { status: 500 }
    );
  }
}

