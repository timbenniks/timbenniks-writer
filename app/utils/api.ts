import type { GitHubConfig } from "../types/github";
import { stageDeleteChange } from "./staging";

/**
 * Make a GitHub API request
 */
export async function githubApiRequest(
  endpoint: string,
  config: GitHubConfig,
  additionalBody: Record<string, any> = {}
) {
  const response = await fetch(`/api/github/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: config.repo,
      branch: config.branch,
      // Token comes from environment variables on the server
      ...additionalBody,
    }),
  });

  return response.json();
}

/**
 * Delete a file from GitHub (stages the deletion)
 */
export async function deleteGitHubFile(
  config: GitHubConfig,
  filePath: string,
  sha: string,
  fileName: string
) {
  // Always stage deletions - no immediate commits
  if (typeof window !== "undefined") {
    stageDeleteChange({
      filePath,
      sha,
      title: fileName,
      commitMessage: `Delete article: ${fileName}`,
    });
    return { success: true, staged: true };
  }
  return { success: false, error: "Client-side only operation" };
}

