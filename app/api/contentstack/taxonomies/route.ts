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
 * Fetches all terms using pagination (100 per page)
 */
export async function GET() {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    const allTerms: any[] = [];
    let skip = 0;
    const limit = 100;
    let hasMore = true;
    let totalCount = 0;

    // Fetch all terms using pagination
    while (hasMore) {
      const response = await fetch(
        `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms?include_count=true&limit=${limit}&skip=${skip}`,
        {
          method: "GET",
          headers,
        }
      );

      if (!response.ok) {
        return handleContentstackError(response, "Fetch taxonomy terms");
      }

      const data = await response.json();
      
      // Get total count from first response
      if (skip === 0) {
        totalCount = data.count || 0;
      }

      const terms = data.terms || [];
      allTerms.push(...terms);

      // Check if we have more terms to fetch
      if (terms.length < limit || allTerms.length >= totalCount) {
        hasMore = false;
      } else {
        skip += limit;
      }
    }

    // Extract term UIDs for easy lookup
    const terms = allTerms.map((term: any) => ({
      uid: term.uid,
      name: term.name,
      depth: term.depth || 0,
      parentUid: term.parent_uid || null,
    }));

    return NextResponse.json({
      success: true,
      terms,
      count: totalCount || terms.length,
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

