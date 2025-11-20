import { NextResponse } from "next/server";

/**
 * Parse repository string into owner and repo name
 * Returns error response if format is invalid
 */
export function parseRepo(repo: string): { owner: string; repoName: string } | NextResponse {
  const repoMatch = repo.match(/^([^\/]+)\/([^\/]+)$/);
  if (!repoMatch) {
    return NextResponse.json(
      { success: false, error: "Invalid repo format. Use 'owner/repo'" },
      { status: 400 }
    );
  }
  const [, owner, repoName] = repoMatch;
  return { owner, repoName };
}

/**
 * Validate required GitHub API fields and return error response if invalid
 */
export function validateGitHubFields(
  body: Record<string, any>,
  required: string[]
): { isValid: boolean; error?: NextResponse } {
  const missing = required.filter((field) => !body[field]);
  if (missing.length > 0) {
    return {
      isValid: false,
      error: NextResponse.json(
        { success: false, error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      ),
    };
  }
  return { isValid: true };
}
