/**
 * File Fetcher Utilities
 * 
 * Shared utilities for fetching and parsing markdown files from GitHub
 * with optimized batch processing and caching.
 */

import { Octokit } from "@octokit/rest";
import matter from "gray-matter";

const BATCH_SIZE = 20;

/**
 * Fetch file content using download_url (faster) or GitHub API (fallback)
 */
export async function fetchFileContent(
  item: { download_url?: string; path: string },
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string
): Promise<string | null> {
  try {
    // Prefer download_url if available (faster, bypasses API rate limits)
    if (item.download_url) {
      const response = await fetch(item.download_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${item.path}: ${response.status}`);
      }
      return await response.text();
    }

    // Fallback to GitHub API
    const fileResponse = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: item.path,
      ref: branch,
    });

    if ("content" in fileResponse.data && fileResponse.data.encoding === "base64") {
      return Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
    }

    return null;
  } catch (error) {
    console.warn(`Failed to fetch file ${item.path}:`, error);
    return null;
  }
}

/**
 * Filter markdown files from GitHub content items
 */
export function filterMarkdownFiles(items: any[]): any[] {
  return items.filter((item: any) => {
    if (item.type !== "file") return false;
    const fileName = item.name.toLowerCase();
    return fileName.endsWith(".md") || fileName.endsWith(".markdown");
  });
}

/**
 * Process files in batches with a transformer function
 */
export async function processFilesInBatches<T>(
  files: any[],
  transformer: (item: any, fileContent: string) => Promise<T | null> | T | null,
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string
): Promise<T[]> {
  const results: T[] = [];

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const fileContent = await fetchFileContent(item, octokit, owner, repoName, branch);
        if (!fileContent) return null;

        try {
          const result = await transformer(item, fileContent);
          return result;
        } catch (error) {
          console.warn(`Failed to process file ${item.path}:`, error);
          return null;
        }
      })
    );

    for (const result of batchResults) {
      if (result !== null) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): { data: any; content: string } {
  return matter(content);
}

