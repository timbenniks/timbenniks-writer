import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  getContentstackEntryUrl,
  ARTICLE_CONTENT_TYPE,
} from "../../utils";

/**
 * PUT /api/contentstack/entries/update
 * Update an existing article entry in Contentstack
 *
 * Body: {
 *   entryUid: string,
 *   entry: {
 *     title: string,
 *     url: string,
 *     description: string,
 *     date: string,
 *     canonical_url?: string,
 *     reading_time?: string,
 *     content: object,        // JSON RTE content
 *     thumbnail?: object,     // Asset reference { uid: string }
 *     taxonomies?: array,     // Array of { taxonomy_uid, term_uid }
 *     faqs?: array           // Array of { qa: { question, answer } }
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

    if (!entryUid || !entry) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: entryUid, entry",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Update the entry
    const response = await fetch(
      `${baseUrl}/v3/content_types/${ARTICLE_CONTENT_TYPE}/entries/${entryUid}?locale=en-us`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ entry }),
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Update entry");
    }

    const data = await response.json();

    const finalEntryUid = data.entry?.uid || entryUid;
    
    return NextResponse.json({
      success: true,
      entry: {
        uid: finalEntryUid,
        title: data.entry?.title,
        url: data.entry?.url,
        version: data.entry?._version,
        dashboardUrl: finalEntryUid ? getContentstackEntryUrl(finalEntryUid) : null,
      },
    });
  } catch (error: any) {
    console.error("Contentstack entry update error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to update entry",
      },
      { status: 500 }
    );
  }
}

