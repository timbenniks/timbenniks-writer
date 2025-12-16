import { NextRequest, NextResponse } from "next/server";
import { parseRepo, validateGitHubFields } from "../utils";

/**
 * POST /api/github/stage
 * Stage a change without committing
 * 
 * Body: {
 *   repo: string,
 *   branch: string,
 *   type: "create" | "update" | "delete" | "rename",
 *   filePath: string,
 *   oldPath?: string, // For rename
 *   content?: string, // For create/update
 *   sha?: string, // Current SHA for update/delete
 *   commitMessage?: string, // Optional individual message
 *   metadata?: { title?, videoId?, isArticle?, isVideo? }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "type",
      "filePath",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const { type, filePath, oldPath, content, sha, commitMessage, metadata } = body;

    // Validate type-specific requirements
    if ((type === "create" || type === "update") && !content) {
      return NextResponse.json(
        { success: false, error: "Content is required for create/update operations" },
        { status: 400 }
      );
    }

    if ((type === "update" || type === "delete") && !sha) {
      return NextResponse.json(
        { success: false, error: "SHA is required for update/delete operations" },
        { status: 400 }
      );
    }

    if (type === "rename" && !oldPath) {
      return NextResponse.json(
        { success: false, error: "oldPath is required for rename operations" },
        { status: 400 }
      );
    }

    // Return success - staging is handled client-side via localStorage
    // This endpoint validates and confirms the staging operation
    return NextResponse.json({
      success: true,
      staged: {
        type,
        filePath,
        oldPath,
        sha,
        commitMessage,
        metadata,
      },
    });
  } catch (error: any) {
    console.error("Stage error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to stage change",
      },
      { status: 500 }
    );
  }
}

