import type { GitHubConfig } from "../types/github";

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
 * Delete a file from GitHub
 */
export async function deleteGitHubFile(
  config: GitHubConfig,
  filePath: string,
  sha: string,
  fileName: string
) {
  return githubApiRequest("delete", config, {
    filePath,
    sha,
    commitMessage: `Delete article: ${fileName}`,
    authorName: config.authorName,
    authorEmail: config.authorEmail,
  });
}

