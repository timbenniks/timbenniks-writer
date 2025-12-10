import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
} from "../utils";

// GET - List all folders or find a specific folder by name
export async function GET(request: NextRequest) {
  try {
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Query for folders (is_dir: true)
    const query = encodeURIComponent(JSON.stringify({ is_dir: true }));
    const response = await fetch(`${baseUrl}/v3/assets?query=${query}`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return handleContentstackError(response, "List folders");
    }

    const data = await response.json();
    const folders = data.assets || [];

    console.log("Found folders:", folders.map((f: any) => ({ uid: f.uid, name: f.name })));

    // If searching for a specific folder by name
    if (name) {
      const folder = folders.find(
        (f: any) => f.name?.toLowerCase() === name.toLowerCase()
      );
      console.log(`Looking for folder "${name}", found:`, folder ? folder.uid : "none");
      return NextResponse.json({
        success: true,
        folder: folder
          ? {
            uid: folder.uid,
            name: folder.name,
          }
          : null,
      });
    }

    return NextResponse.json({
      success: true,
      folders: folders.map((f: any) => ({
        uid: f.uid,
        name: f.name,
      })),
    });
  } catch (error: any) {
    console.error("Contentstack folders error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to list folders",
      },
      { status: 500 }
    );
  }
}

// POST - Create a new folder (or return existing one with same name)
export async function POST(request: NextRequest) {
  try {
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { name, parentUid } = body;

    if (!name) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required field: name",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // First, check if a folder with this name already exists
    const query = encodeURIComponent(JSON.stringify({ is_dir: true }));
    const checkResponse = await fetch(`${baseUrl}/v3/assets?query=${query}`, {
      method: "GET",
      headers,
    });

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      const existingFolder = (checkData.assets || []).find(
        (f: any) => f.name?.toLowerCase() === name.toLowerCase()
      );

      if (existingFolder) {
        console.log(`Folder "${name}" already exists with UID: ${existingFolder.uid}`);
        return NextResponse.json({
          success: true,
          folder: {
            uid: existingFolder.uid,
            name: existingFolder.name,
          },
          existed: true,
        });
      }
    }

    // Folder doesn't exist, create it
    const assetPayload: any = {
      asset: {
        name,
        is_dir: true,
      },
    };

    if (parentUid) {
      assetPayload.asset.parent_uid = parentUid;
    }

    const response = await fetch(`${baseUrl}/v3/assets/folders`, {
      method: "POST",
      headers,
      body: JSON.stringify(assetPayload),
    });

    if (!response.ok) {
      return handleContentstackError(response, "Create folder");
    }

    const data = await response.json();
    console.log(`Created new folder "${name}" with UID: ${data.asset?.uid}`);

    return NextResponse.json({
      success: true,
      folder: {
        uid: data.asset?.uid,
        name: data.asset?.name,
      },
      existed: false,
    });
  } catch (error: any) {
    console.error("Contentstack folder creation error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to create folder",
      },
      { status: 500 }
    );
  }
}

