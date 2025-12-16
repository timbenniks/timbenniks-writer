/**
 * GitHub Configuration Utilities
 * 
 * Shared utilities for parsing and validating GitHub configuration
 * from environment variables with optional overrides.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repoName: string;
  branch: string;
  folder?: string;
  videosFolder?: string;
}

export interface GitHubConfigError {
  error: string;
}

export type GitHubConfigResult = GitHubConfig | GitHubConfigError;

/**
 * Parse and validate GitHub config from environment
 */
export function getGitHubConfig(overrides?: {
  repo?: string;
  branch?: string;
  folder?: string;
  videosFolder?: string;
}): GitHubConfigResult {
  const token = process.env.GITHUB_TOKEN;
  const repo = overrides?.repo || process.env.GITHUB_REPO;
  const branch = overrides?.branch || process.env.GITHUB_BRANCH || "main";
  const folder = overrides?.folder !== undefined
    ? overrides.folder
    : (process.env.GITHUB_FOLDER || "");
  const videosFolder = overrides?.videosFolder !== undefined
    ? overrides.videosFolder
    : (process.env.GITHUB_VIDEOS_FOLDER || "content/3.videos");

  if (!token || !repo) {
    return { error: "GitHub configuration missing. Set GITHUB_TOKEN and GITHUB_REPO in environment." };
  }

  const repoMatch = repo.match(/^([^\/]+)\/([^\/]+)$/);
  if (!repoMatch) {
    return { error: "Invalid GITHUB_REPO format. Use 'owner/repo'" };
  }

  return {
    token,
    owner: repoMatch[1],
    repoName: repoMatch[2],
    branch,
    ...(folder && { folder }),
    ...(videosFolder && { videosFolder }),
  };
}

/**
 * Check if config result is an error
 */
export function isConfigError(config: GitHubConfigResult): config is GitHubConfigError {
  return "error" in config;
}

