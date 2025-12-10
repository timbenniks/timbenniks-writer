import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  CONTENT_TAGS_TAXONOMY,
} from "../utils";

/**
 * POST /api/contentstack/taxonomy-term
 * Create a new term in the content_tags taxonomy
 *
 * Body: { termUid: string, termName: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { termUid, termName } = body;

    if (!termUid || !termName) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: termUid, termName",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Create a new term in the taxonomy
    const response = await fetch(
      `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          term: {
            uid: termUid,
            name: termName,
          },
        }),
      }
    );

    if (!response.ok) {
      // Check if term already exists (409 conflict)
      if (response.status === 409 || response.status === 422) {
        // Term might already exist, try to return success
        return NextResponse.json({
          success: true,
          termUid,
          termName,
          alreadyExists: true,
          message: "Term already exists",
        });
      }
      return handleContentstackError(response, "Create taxonomy term");
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      termUid: data.term?.uid || termUid,
      termName: data.term?.name || termName,
      alreadyExists: false,
    });
  } catch (error: any) {
    console.error("Contentstack taxonomy term creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create taxonomy term",
      },
      { status: 500 }
    );
  }
}

