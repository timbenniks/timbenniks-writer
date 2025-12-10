import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
} from "../utils";

/**
 * POST /api/contentstack/assets
 * Upload an asset to Contentstack from a URL
 *
 * Body: {
 *   url: string,        // URL of the image to upload
 *   title: string,      // Asset title
 *   description?: string,
 *   folder?: string     // Folder UID to upload to (optional)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { url, title, description, folder } = body;

    if (!url || !title) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: url, title",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();

    // Contentstack supports uploading assets from URL using multipart form data
    // We need to fetch the image first and then upload it
    // Alternative: Use the import from URL feature if available

    // First, let's try the direct URL upload approach
    // Contentstack's asset upload API expects multipart/form-data

    // Fetch the image from the URL
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch image from URL: ${imageResponse.statusText}`,
        },
        { status: 400 }
      );
    }

    const imageBlob = await imageResponse.blob();
    const contentType = imageResponse.headers.get("content-type") || "image/png";

    // Extract filename from URL or use title
    let filename = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const extension = contentType.includes("jpeg") || contentType.includes("jpg")
      ? ".jpg"
      : contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
      ? ".webp"
      : contentType.includes("gif")
      ? ".gif"
      : ".png";
    filename = `${filename}${extension}`;

    // Create FormData for the upload
    const formData = new FormData();
    formData.append("asset[upload]", imageBlob, filename);
    formData.append("asset[title]", title);
    if (description) {
      formData.append("asset[description]", description);
    }
    if (folder) {
      formData.append("asset[parent_uid]", folder);
    }

    // Upload to Contentstack
    const uploadResponse = await fetch(`${baseUrl}/v3/assets`, {
      method: "POST",
      headers: {
        api_key: process.env.CONTENTSTACK_API_KEY || "",
        authorization: process.env.CONTENTSTACK_MANAGEMENT_TOKEN || "",
        // Don't set Content-Type - let fetch set it with boundary for FormData
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      return handleContentstackError(uploadResponse, "Upload asset");
    }

    const data = await uploadResponse.json();

    return NextResponse.json({
      success: true,
      asset: {
        uid: data.asset?.uid,
        title: data.asset?.title,
        filename: data.asset?.filename,
        url: data.asset?.url,
        contentType: data.asset?.content_type,
        fileSize: data.asset?.file_size,
      },
    });
  } catch (error: any) {
    console.error("Contentstack asset upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to upload asset",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contentstack/assets
 * Get asset folders or list assets
 */
export async function GET(request: NextRequest) {
  try {
    // Validate configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const searchParams = request.nextUrl.searchParams;
    const folderUid = searchParams.get("folder");

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Fetch folders if needed
    const response = await fetch(
      `${baseUrl}/v3/assets${folderUid ? `?folder=${folderUid}` : ""}`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      return handleContentstackError(response, "Fetch assets");
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      assets: (data.assets || []).map((asset: any) => ({
        uid: asset.uid,
        title: asset.title,
        filename: asset.filename,
        url: asset.url,
        contentType: asset.content_type,
      })),
    });
  } catch (error: any) {
    console.error("Contentstack assets fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch assets",
      },
      { status: 500 }
    );
  }
}

