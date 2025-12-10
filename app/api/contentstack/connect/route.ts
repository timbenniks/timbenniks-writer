import { NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  ARTICLE_CONTENT_TYPE,
} from "../utils";

/**
 * POST /api/contentstack/connect
 * Test connection to Contentstack by fetching content types
 * (Management tokens work with stack operations, not user operations)
 */
export async function POST() {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Test connection by fetching content types (works with management token)
    const response = await fetch(`${baseUrl}/v3/content_types`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return handleContentstackError(response, "Connection test");
    }

    const data = await response.json();

    // Check if the article content type exists
    const contentTypes = data.content_types || [];
    const hasArticleType = contentTypes.some(
      (ct: any) => ct.uid === ARTICLE_CONTENT_TYPE
    );

    return NextResponse.json({
      success: true,
      message: "Successfully connected to Contentstack",
      stack: {
        contentTypesCount: contentTypes.length,
        hasArticleContentType: hasArticleType,
        contentTypes: contentTypes.map((ct: any) => ({
          uid: ct.uid,
          title: ct.title,
        })),
      },
      region: process.env.CONTENTSTACK_REGION,
    });
  } catch (error: any) {
    console.error("Contentstack connection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to connect to Contentstack",
      },
      { status: 500 }
    );
  }
}

