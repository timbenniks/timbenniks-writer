import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  ARTICLE_CONTENT_TYPE,
} from "../../utils";

/**
 * POST /api/contentstack/entries/check
 * Check if an article entry already exists by title or URL
 *
 * Body: { title?: string, url?: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { title, url } = body;

    if (!title && !url) {
      return NextResponse.json(
        {
          success: false,
          error: "At least one of title or url is required",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Build query to search for existing entry
    // Contentstack uses MongoDB-style queries
    const queries: any[] = [];
    
    if (title) {
      queries.push({ title: title });
    }
    if (url) {
      queries.push({ url: url });
    }

    const query = queries.length > 1 ? { $or: queries } : queries[0];

    const response = await fetch(
      `${baseUrl}/v3/content_types/${ARTICLE_CONTENT_TYPE}/entries?query=${encodeURIComponent(
        JSON.stringify(query)
      )}`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Check entry existence");
    }

    const data = await response.json();
    const entries = data.entries || [];

    if (entries.length > 0) {
      const entry = entries[0];
      return NextResponse.json({
        success: true,
        exists: true,
        entry: {
          uid: entry.uid,
          title: entry.title,
          url: entry.url,
          version: entry._version,
        },
      });
    }

    return NextResponse.json({
      success: true,
      exists: false,
      entry: null,
    });
  } catch (error: any) {
    console.error("Contentstack entry check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to check entry existence",
      },
      { status: 500 }
    );
  }
}

