import { NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  CONTENT_TAGS_TAXONOMY,
} from "../utils";

/**
 * GET /api/contentstack/taxonomies
 * Get all terms from the content_tags taxonomy
 */
export async function GET() {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Fetch all terms from the content_tags taxonomy
    const response = await fetch(
      `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms?include_count=true&limit=100`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Fetch taxonomy terms");
    }

    const data = await response.json();

    // Extract term UIDs for easy lookup
    const terms = (data.terms || []).map((term: any) => ({
      uid: term.uid,
      name: term.name,
      depth: term.depth || 0,
      parentUid: term.parent_uid || null,
    }));

    return NextResponse.json({
      success: true,
      terms,
      count: data.count || terms.length,
    });
  } catch (error: any) {
    console.error("Contentstack taxonomies error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch taxonomy terms",
      },
      { status: 500 }
    );
  }
}

