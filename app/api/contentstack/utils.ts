import { NextResponse } from "next/server";

/**
 * Contentstack region URL mapping (API)
 */
const REGION_API_URLS: Record<string, string> = {
  eu: "https://eu-api.contentstack.com",
  us: "https://api.contentstack.io",
  "azure-na": "https://azure-na-api.contentstack.com",
  "azure-eu": "https://azure-eu-api.contentstack.com",
};

/**
 * Contentstack region URL mapping (Dashboard App)
 */
const REGION_APP_URLS: Record<string, string> = {
  eu: "https://eu-app.contentstack.com",
  us: "https://app.contentstack.com",
  "azure-na": "https://azure-na-app.contentstack.com",
  "azure-eu": "https://azure-eu-app.contentstack.com",
};

/**
 * Get the Contentstack API base URL based on configured region
 */
export function getContentstackBaseUrl(): string {
  const region = process.env.CONTENTSTACK_REGION || "eu";
  return REGION_API_URLS[region] || REGION_API_URLS["eu"];
}

/**
 * Get the Contentstack Dashboard App URL based on configured region
 */
export function getContentstackAppUrl(): string {
  const region = process.env.CONTENTSTACK_REGION || "eu";
  return REGION_APP_URLS[region] || REGION_APP_URLS["eu"];
}

/**
 * Build a Contentstack entry dashboard URL
 */
export function getContentstackEntryUrl(entryUid: string, contentType: string = ARTICLE_CONTENT_TYPE): string {
  const appUrl = getContentstackAppUrl();
  const apiKey = process.env.CONTENTSTACK_API_KEY || "";
  return `${appUrl}/#!/stack/${apiKey}/content-type/${contentType}/en-us/entry/${entryUid}/edit?branch=main`;
}

/**
 * Get standard headers for Contentstack Management API requests
 */
export function getContentstackHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    api_key: process.env.CONTENTSTACK_API_KEY || "",
    authorization: process.env.CONTENTSTACK_MANAGEMENT_TOKEN || "",
  };
}

/**
 * Get multipart headers for asset uploads (no Content-Type, let fetch set it)
 */
export function getContentstackMultipartHeaders(): HeadersInit {
  return {
    api_key: process.env.CONTENTSTACK_API_KEY || "",
    authorization: process.env.CONTENTSTACK_MANAGEMENT_TOKEN || "",
  };
}

/**
 * Check if Contentstack is properly configured
 */
export function isContentstackConfigured(): boolean {
  return !!(
    process.env.CONTENTSTACK_API_KEY &&
    process.env.CONTENTSTACK_MANAGEMENT_TOKEN &&
    process.env.CONTENTSTACK_REGION
  );
}

/**
 * Get Contentstack configuration status
 */
export function getContentstackConfig(): {
  configured: boolean;
  region: string | null;
  hasApiKey: boolean;
  hasManagementToken: boolean;
} {
  return {
    configured: isContentstackConfigured(),
    region: process.env.CONTENTSTACK_REGION || null,
    hasApiKey: !!process.env.CONTENTSTACK_API_KEY,
    hasManagementToken: !!process.env.CONTENTSTACK_MANAGEMENT_TOKEN,
  };
}

/**
 * Validate required Contentstack configuration and return error response if missing
 */
export function validateContentstackConfig(): NextResponse | null {
  if (!isContentstackConfigured()) {
    const config = getContentstackConfig();
    const missing: string[] = [];
    if (!config.hasApiKey) missing.push("CONTENTSTACK_API_KEY");
    if (!config.hasManagementToken) missing.push("CONTENTSTACK_MANAGEMENT_TOKEN");
    if (!config.region) missing.push("CONTENTSTACK_REGION");

    return NextResponse.json(
      {
        success: false,
        error: `Contentstack not configured. Missing: ${missing.join(", ")}`,
      },
      { status: 500 }
    );
  }
  return null;
}

/**
 * Content type UID for articles
 */
export const ARTICLE_CONTENT_TYPE = "article";

/**
 * Taxonomy UID for content tags
 */
export const CONTENT_TAGS_TAXONOMY = "content_tags";

/**
 * Rate limit helper - delay between operations
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique ID for JSON RTE nodes
 */
export function generateUid(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 32);
}

/**
 * Handle Contentstack API errors and return appropriate response
 */
export async function handleContentstackError(
  response: Response,
  operation: string
): Promise<NextResponse> {
  let errorMessage = `${operation} failed`;
  let errorDetails: any = null;

  try {
    const errorData = await response.json();
    errorMessage = errorData.error_message || errorData.message || errorMessage;
    errorDetails = errorData;
  } catch {
    // Response might not be JSON
    errorMessage = `${operation} failed with status ${response.status}`;
  }

  // Handle rate limiting
  if (response.status === 429) {
    return NextResponse.json(
      {
        success: false,
        error: "Rate limited by Contentstack. Please wait and try again.",
        rateLimited: true,
        details: errorDetails,
      },
      { status: 429 }
    );
  }

  return NextResponse.json(
    {
      success: false,
      error: errorMessage,
      details: errorDetails,
    },
    { status: response.status }
  );
}

