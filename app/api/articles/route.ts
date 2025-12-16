import { NextRequest } from "next/server";
import { Octokit } from "@octokit/rest";
import {
  transformToContentstackArticle,
  processArticles,
  isExcludedSlug,
  buildSlug,
  type ContentstackArticle,
  type RawFrontmatter,
} from "../../utils/articleTransform";
import {
  getCachedProcessedData,
  createArticlesCacheKey,
  getCachedFileListing,
  createRepoCacheKey,
  purgeArticlesCache,
} from "../../utils/cache";
import { getGitHubConfig, isConfigError } from "../../utils/githubConfig";
import {
  parsePaginationParams,
  parseSortParams,
  parseTags,
  shouldPurgeCache,
  createSuccessResponse,
  handleApiError,
} from "../../utils/apiHelpers";
import {
  filterMarkdownFiles,
  processFilesInBatches,
  parseFrontmatter,
} from "../../utils/fileFetcher";

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
 * Uses caching and optimized fetching
 */
async function fetchArticlesFromGitHub(
  octokit: Octokit,
  owner: string,
  repoName: string,
  branch: string,
  folder: string
): Promise<ContentstackArticle[]> {
  const cacheKey = createArticlesCacheKey(owner, repoName, branch, folder);

  return getCachedProcessedData(
    cacheKey,
    async () => {
      // Get contents of the folder (cached)
      const folderCacheKey = createRepoCacheKey(owner, repoName, branch, folder);
      const response = await getCachedFileListing(
        folderCacheKey,
        async () => {
          return octokit.repos.getContent({
            owner,
            repo: repoName,
            path: folder,
            ref: branch,
          });
        },
        [`articles-folder-${folder}`]
      );

      const contents = Array.isArray(response.data) ? response.data : [response.data];
      const markdownFiles = filterMarkdownFiles(contents);

      // Process files in batches
      return processFilesInBatches<ContentstackArticle>(
        markdownFiles,
        async (item, fileContent) => {
          const parsed = parseFrontmatter(fileContent);
          const slug = buildSlug(parsed.data as RawFrontmatter, item.name);
          
          if (isExcludedSlug(slug)) return null;

          return transformToContentstackArticle(
            parsed.content,
            parsed.data as RawFrontmatter,
            { path: item.path, sha: item.sha, name: item.name }
          );
        },
        octokit,
        owner,
        repoName,
        branch
      );
    },
    [`articles-${owner}-${repoName}-${branch}-${folder}`]
  );
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

    // Handle cache purge
    if (shouldPurgeCache(searchParams, "articles")) {
      await purgeArticlesCache();
    }

    // Parse parameters
    const { limit, offset } = parsePaginationParams(searchParams);
    const { order, orderBy } = parseSortParams(searchParams, "date");
    const tags = parseTags(searchParams);
    const draftFilter = (searchParams.get("draft") || "false") as "true" | "false" | "all";

    // Get GitHub config
    const config = getGitHubConfig();
    if (isConfigError(config)) {
      return handleApiError({ status: 500, message: config.error }, "Configuration error", {
        articles: [],
        total: 0,
        limit,
        offset,
      });
    }

    const octokit = new Octokit({ auth: config.token });
    const allArticles = await fetchArticlesFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.folder || ""
    );

    const { articles, total } = processArticles(allArticles, {
      draftFilter,
      tags,
      orderBy: orderBy as "date" | "title",
      order,
      offset,
      limit,
    });

    return createSuccessResponse({ articles, total, limit, offset });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch articles", {
      articles: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
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

    // Handle cache purge
    if (shouldPurgeCache(body, "articles")) {
      await purgeArticlesCache();
    }

    // Parse parameters
    const { limit, offset } = parsePaginationParams(body);
    const { order, orderBy } = parseSortParams(body, "date");
    const tags = parseTags(body);
    const draftFilter = (body.draft || "false") as "true" | "false" | "all";

    // Get GitHub config with overrides
    const config = getGitHubConfig({
      repo: body.repo,
      branch: body.branch,
      folder: body.folder,
    });

    if (isConfigError(config)) {
      return handleApiError({ status: 500, message: config.error }, "Configuration error", {
        articles: [],
        total: 0,
        limit,
        offset,
      });
    }

    const octokit = new Octokit({ auth: config.token });
    const allArticles = await fetchArticlesFromGitHub(
      octokit,
      config.owner,
      config.repoName,
      config.branch,
      config.folder || ""
    );

    const { articles, total } = processArticles(allArticles, {
      draftFilter,
      tags,
      orderBy: orderBy as "date" | "title",
      order,
      offset,
      limit,
    });

    return createSuccessResponse({ articles, total, limit, offset });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch articles", {
      articles: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
  }
}
