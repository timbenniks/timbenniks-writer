import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import matter from "gray-matter";
import {
  transformToContentstackArticle,
  processArticles,
  isExcludedSlug,
  buildSlug,
  type ContentstackArticle,
  type RawFrontmatter,
} from "../../utils/articleTransform";

interface ArticlesResponse {
  success: boolean;
  articles: ContentstackArticle[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}

/**
 * Fetch and parse all markdown files from GitHub
 */
async function fetchArticlesFromGitHub(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  folder: string
): Promise<ContentstackArticle[]> {
  // Get contents of the folder
  const response = await octokit.repos.getContent({
    owner,
    repo: repoName,
    path: folder,
    ref: branch,
  });

  const contents = Array.isArray(response.data) ? response.data : [response.data];

  // Filter markdown files
  const markdownFiles = contents.filter((item: any) => {
    if (item.type !== "file") return false;
    const fileName = item.name.toLowerCase();
    return fileName.endsWith(".md") || fileName.endsWith(".markdown");
  });

  // Fetch and parse all files in parallel
  const articlesPromises = markdownFiles.map(async (item: any) => {
    try {
      const fileResponse = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path: item.path,
        ref: branch,
      });

      if ("content" in fileResponse.data && fileResponse.data.encoding === "base64") {
        const fileContent = Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
        const parsed = matter(fileContent);

        // Skip excluded slugs early
        const slug = buildSlug(parsed.data as RawFrontmatter, item.name);
        if (isExcludedSlug(slug)) return null;

        return transformToContentstackArticle(
          parsed.content,
          parsed.data as RawFrontmatter,
          { path: item.path, sha: item.sha, name: item.name }
        );
      }
    } catch (error) {
      console.warn(`Failed to parse article ${item.path}:`, error);
    }
    return null;
  });

  const results = await Promise.all(articlesPromises);
  return results.filter((article): article is ContentstackArticle => article !== null);
}

/**
 * Parse and validate GitHub config from environment
 */
function getGitHubConfig(overrides?: { repo?: string; branch?: string; folder?: string }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = overrides?.repo || process.env.GITHUB_REPO;
  const branch = overrides?.branch || process.env.GITHUB_BRANCH || "main";
  const folder = overrides?.folder !== undefined ? overrides.folder : (process.env.GITHUB_FOLDER || "");

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
    folder,
  };
}

/**
 * GET /api/articles
 * Returns articles in Contentstack JSON format
 * 
 * Query parameters:
 * - limit: number (default: 10, max: 100)
 * - offset: number (default: 0)
 * - order: "asc" | "desc" (default: "desc")
 * - orderBy: "date" | "title" (default: "date")
 * - tags: comma-separated list of tags to filter by (any match)
 * - draft: "true" | "false" | "all" (default: "false" - exclude drafts)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "10", 10)), 100);
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));
    const order = (searchParams.get("order") || "desc") as "asc" | "desc";
    const orderBy = (searchParams.get("orderBy") || "date") as "date" | "title";
    const tags = searchParams.get("tags")
      ? searchParams.get("tags")!.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];
    const draftFilter = (searchParams.get("draft") || "false") as "true" | "false" | "all";

    const config = getGitHubConfig();
    if ("error" in config) {
      return NextResponse.json({ success: false, error: config.error }, { status: 500 });
    }

    const octokit = new Octokit({ auth: config.token });

    const allArticles = await fetchArticlesFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.folder
    );

    const { articles, total } = processArticles(allArticles, {
      draftFilter,
      tags,
      orderBy,
      order,
      offset,
      limit,
    });

    const response: ArticlesResponse = {
      success: true,
      articles,
      total,
      limit,
      offset,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Articles API error:", error);

    if (error.status === 404) {
      return NextResponse.json(
        { success: false, articles: [], total: 0, limit: 10, offset: 0, error: "Repository path not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, articles: [], total: 0, limit: 10, offset: 0, error: error.message || "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/articles
 * Returns articles in Contentstack JSON format (alternative to GET with body)
 * Useful for more complex filtering options or overriding GitHub config
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const limit = Math.min(Math.max(1, parseInt(body.limit || "10", 10)), 100);
    const offset = Math.max(0, parseInt(body.offset || "0", 10));
    const order = (body.order || "desc") as "asc" | "desc";
    const orderBy = (body.orderBy || "date") as "date" | "title";
    const tags = Array.isArray(body.tags)
      ? body.tags.map((t: string) => t.toLowerCase().trim()).filter(Boolean)
      : [];
    const draftFilter = (body.draft || "false") as "true" | "false" | "all";

    const config = getGitHubConfig({
      repo: body.repo,
      branch: body.branch,
      folder: body.folder,
    });

    if ("error" in config) {
      return NextResponse.json({ success: false, error: config.error }, { status: 500 });
    }

    const octokit = new Octokit({ auth: config.token });

    const allArticles = await fetchArticlesFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.folder
    );

    const { articles, total } = processArticles(allArticles, {
      draftFilter,
      tags,
      orderBy,
      order,
      offset,
      limit,
    });

    const response: ArticlesResponse = {
      success: true,
      articles,
      total,
      limit,
      offset,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Articles API error:", error);

    if (error.status === 404) {
      return NextResponse.json(
        { success: false, articles: [], total: 0, limit: 10, offset: 0, error: "Repository path not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, articles: [], total: 0, limit: 10, offset: 0, error: error.message || "Failed to fetch articles" },
      { status: 500 }
    );
  }
}
