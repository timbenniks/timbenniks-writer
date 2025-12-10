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
 * POST /api/contentstack/entries/create
 * Create a new article entry in Contentstack
 *
 * Body: {
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
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { entry } = body;

    if (!entry || !entry.title || !entry.url) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: entry.title, entry.url",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Log what we're sending (for debugging)
    console.log("Creating Contentstack entry with thumbnail:", entry.thumbnail);

    // Create the entry
    const response = await fetch(
      `${baseUrl}/v3/content_types/${ARTICLE_CONTENT_TYPE}/entries?locale=en-us`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ entry }),
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Create entry");
    }

    const data = await response.json();

    const entryUid = data.entry?.uid;
    
    return NextResponse.json({
      success: true,
      entry: {
        uid: entryUid,
        title: data.entry?.title,
        url: data.entry?.url,
        version: data.entry?._version,
        dashboardUrl: entryUid ? getContentstackEntryUrl(entryUid) : null,
      },
    });
  } catch (error: any) {
    console.error("Contentstack entry creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create entry",
      },
      { status: 500 }
    );
  }
}

