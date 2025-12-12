import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import matter from "gray-matter";
import {
  transformToContentstackArticle,
  isExcludedSlug,
  buildSlug,
  type ContentstackArticle,
  type RawFrontmatter,
} from "../../../utils/articleTransform";

/**
 * GET /api/articles/[slug]
 * Returns a single article by slug or file path in Contentstack JSON format
 * 
 * The slug parameter can be:
 * - A slug (e.g., "my-article")
 * - A file name (e.g., "my-article.md")
 * - A URL-encoded file path (e.g., "content%2Farticles%2Fmy-article.md")
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: slugParam } = await params;
    const decodedSlug = decodeURIComponent(slugParam);

    // Reject excluded slugs (e.g., "index")
    if (isExcludedSlug(decodedSlug) || isExcludedSlug(decodedSlug.replace(/\.(md|markdown)$/i, ""))) {
      return NextResponse.json(
        { success: false, error: `Article '${decodedSlug}' not found` },
        { status: 404 }
      );
    }

    // Get GitHub config from environment
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const folder = process.env.GITHUB_FOLDER || "";

    if (!token || !repo) {
      return NextResponse.json(
        { success: false, error: "GitHub configuration missing. Set GITHUB_TOKEN and GITHUB_REPO in environment." },
        { status: 500 }
      );
    }

    const repoMatch = repo.match(/^([^\/]+)\/([^\/]+)$/);
    if (!repoMatch) {
      return NextResponse.json(
        { success: false, error: "Invalid GITHUB_REPO format. Use 'owner/repo'" },
        { status: 500 }
      );
    }
    const [, owner, repoName] = repoMatch;

    const octokit = new Octokit({ auth: token });

    // Try to find the article
    const article = await findArticle(octokit, owner, repoName, branch, folder, decodedSlug);

    if (!article) {
      return NextResponse.json(
        { success: false, error: `Article '${decodedSlug}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, article });
  } catch (error: any) {
    console.error("Article API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch article" },
      { status: 500 }
    );
  }
}

/**
 * Find an article by slug, filename, or path
 */
async function findArticle(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  folder: string,
  slugOrPath: string
): Promise<ContentstackArticle | null> {
  // Determine the file path to try
  let filePath: string;

  if (slugOrPath.includes("/") || slugOrPath.endsWith(".md") || slugOrPath.endsWith(".markdown")) {
    // It's a path or filename
    filePath = slugOrPath.startsWith(folder) || !folder
      ? slugOrPath
      : `${folder}/${slugOrPath}`;

    if (!filePath.endsWith(".md") && !filePath.endsWith(".markdown")) {
      filePath = `${filePath}.md`;
    }
  } else {
    // It's a slug - build the path
    filePath = folder ? `${folder}/${slugOrPath}.md` : `${slugOrPath}.md`;
  }

  // Try direct path first
  const directResult = await tryLoadArticle(octokit, owner, repoName, branch, filePath);
  if (directResult) return directResult;

  // If direct path failed, search by slug in frontmatter
  return await searchBySlug(octokit, owner, repoName, branch, folder, slugOrPath);
}

/**
 * Try to load an article from a specific path
 */
async function tryLoadArticle(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  filePath: string
): Promise<ContentstackArticle | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: filePath,
      ref: branch,
    });

    if ("content" in response.data && response.data.encoding === "base64") {
      const fileContent = Buffer.from(response.data.content, "base64").toString("utf-8");
      const parsed = matter(fileContent);

      const slug = buildSlug(parsed.data as RawFrontmatter, response.data.name);

      // Check if this is an excluded slug
      if (isExcludedSlug(slug)) return null;

      return transformToContentstackArticle(
        parsed.content,
        parsed.data as RawFrontmatter,
        { path: response.data.path, sha: response.data.sha, name: response.data.name }
      );
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }
  return null;
}

/**
 * Search for an article by slug in frontmatter
 */
async function searchBySlug(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  folder: string,
  targetSlug: string
): Promise<ContentstackArticle | null> {
  try {
    const folderResponse = await octokit.repos.getContent({
      owner,
      repo: repoName,
      path: folder,
      ref: branch,
    });

    if (!Array.isArray(folderResponse.data)) return null;

    // Filter markdown files
    const markdownFiles = folderResponse.data.filter((item: any) => {
      if (item.type !== "file") return false;
      const fileName = item.name.toLowerCase();
      return fileName.endsWith(".md") || fileName.endsWith(".markdown");
    });

    // Search through files for matching slug
    for (const file of markdownFiles) {
      try {
        const fileResponse = await octokit.repos.getContent({
          owner,
          repo: repoName,
          path: file.path,
          ref: branch,
        });

        if ("content" in fileResponse.data && fileResponse.data.encoding === "base64") {
          const content = Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
          const parsed = matter(content);

          const fileSlug = buildSlug(parsed.data as RawFrontmatter, file.name);

          // Check if this is an excluded slug
          if (isExcludedSlug(fileSlug)) continue;

          // Check if slug matches
          if (
            fileSlug === targetSlug ||
            fileSlug === `/${targetSlug}` ||
            fileSlug === `/writing/${targetSlug}` ||
            `/writing/${fileSlug}` === `/writing/${targetSlug}`
          ) {
            return transformToContentstackArticle(
              parsed.content,
              parsed.data as RawFrontmatter,
              { path: file.path, sha: file.sha, name: file.name }
            );
          }
        }
      } catch (error) {
        // Continue searching other files
        console.warn(`Failed to check file ${file.path}:`, error);
      }
    }
  } catch (error: any) {
    if (error.status !== 404) {
      throw error;
    }
  }

  return null;
}
