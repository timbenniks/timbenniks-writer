/**
 * Article Transformation Utilities
 * 
 * Shared utilities for transforming markdown articles to Contentstack JSON format.
 * Used by both the Articles API and Contentstack export functionality.
 */

import { markdownToHtml } from "./markdown";
import { htmlToContentstackRte, type JsonRteDocument } from "./contentstackRte";

/**
 * Contentstack Article format
 * This is the canonical format used for both API responses and Contentstack export
 */
export interface ContentstackArticle {
  title: string;
  url: string;
  description: string;
  date: string;
  content: JsonRteDocument;
  canonical_url?: string;
  reading_time?: string;
  thumbnail?: string;
  taxonomies?: Array<{ taxonomy_uid: string; term_uid: string }>;
  faqs?: Array<{ qa: { question: string; answer: string } }>;
  slug: string;
  draft?: boolean;
  source: {
    path: string;
    sha: string;
  };
}

/**
 * Source file information from GitHub
 */
export interface SourceFileInfo {
  path: string;
  sha: string;
  name: string;
}

/**
 * Raw frontmatter from markdown file
 */
export interface RawFrontmatter {
  title?: string;
  slug?: string;
  description?: string;
  date?: string | Date;
  canonical_url?: string;
  canonicalUrl?: string;
  reading_time?: string;
  readingTime?: string;
  image?: string;
  heroImage?: string;
  hero_image?: string;
  tags?: string[] | string;
  faqs?: Array<{ question: string; answer: string }>;
  draft?: boolean | string;
  [key: string]: any;
}

/**
 * Extract tags from frontmatter, normalizing to lowercase array
 */
export function extractTags(frontmatter: RawFrontmatter): string[] {
  if (!frontmatter.tags) return [];
  
  if (Array.isArray(frontmatter.tags)) {
    return frontmatter.tags.map((tag) => String(tag).toLowerCase().trim()).filter(Boolean);
  }
  
  return String(frontmatter.tags)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Convert tags to Contentstack taxonomy format
 */
export function tagsToTaxonomies(tags: string[]): Array<{ taxonomy_uid: string; term_uid: string }> {
  return tags.map((tag) => ({
    taxonomy_uid: "content_tags",
    term_uid: tag
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, ""),
  }));
}

/**
 * Extract FAQs from frontmatter in Contentstack format
 */
export function extractFaqs(frontmatter: RawFrontmatter): Array<{ qa: { question: string; answer: string } }> | undefined {
  if (!frontmatter.faqs || !Array.isArray(frontmatter.faqs)) return undefined;
  
  const faqs = frontmatter.faqs
    .filter((faq) => faq.question && faq.answer)
    .map((faq) => ({
      qa: {
        question: String(faq.question),
        answer: String(faq.answer),
      },
    }));
  
  return faqs.length > 0 ? faqs : undefined;
}

/**
 * Normalize date to ISO format with time component
 */
export function normalizeDate(date: string | Date | undefined | null): string {
  if (!date) return new Date().toISOString();
  
  const dateStr = String(date);
  if (!dateStr.includes("T")) {
    return `${dateStr}T10:00:00.000Z`;
  }
  return dateStr;
}

/**
 * Check if article is a draft
 */
export function isDraft(frontmatter: RawFrontmatter): boolean {
  return frontmatter.draft === true ||
    frontmatter.draft === "true" ||
    String(frontmatter.draft).toLowerCase() === "true";
}

/**
 * Build article slug from frontmatter or filename
 */
export function buildSlug(frontmatter: RawFrontmatter, filename: string): string {
  return frontmatter.slug || filename.replace(/\.(md|markdown)$/i, "");
}

/**
 * Build article URL from slug
 */
export function buildUrl(slug: string): string {
  return slug.startsWith("/writing/") ? slug : `/writing/${slug}`;
}

/**
 * Get hero image from frontmatter (checking multiple field names)
 */
export function getHeroImage(frontmatter: RawFrontmatter): string | undefined {
  const image = frontmatter.image || frontmatter.heroImage || frontmatter.hero_image;
  return image ? String(image) : undefined;
}

/**
 * Get canonical URL from frontmatter (checking multiple field names)
 */
export function getCanonicalUrl(frontmatter: RawFrontmatter): string | undefined {
  const url = frontmatter.canonical_url || frontmatter.canonicalUrl;
  return url ? String(url) : undefined;
}

/**
 * Get reading time from frontmatter (checking multiple field names)
 */
export function getReadingTime(frontmatter: RawFrontmatter): string | undefined {
  const time = frontmatter.reading_time || frontmatter.readingTime;
  return time ? String(time) : undefined;
}

/**
 * Transform markdown content and frontmatter to Contentstack article format
 * 
 * This is the main transformation function that converts a markdown file
 * with frontmatter into the Contentstack JSON format.
 */
export async function transformToContentstackArticle(
  markdownContent: string,
  frontmatter: RawFrontmatter,
  sourceFile: SourceFileInfo
): Promise<ContentstackArticle> {
  // Convert markdown to HTML, then to Contentstack RTE
  const htmlContent = await markdownToHtml(markdownContent);
  const rteContent = htmlToContentstackRte(htmlContent);

  // Build slug and URL
  const slug = buildSlug(frontmatter, sourceFile.name);
  const url = buildUrl(slug);

  // Extract and transform fields
  const tags = extractTags(frontmatter);
  const taxonomies = tagsToTaxonomies(tags);
  const faqs = extractFaqs(frontmatter);

  // Build the article object
  const article: ContentstackArticle = {
    title: frontmatter.title || sourceFile.name.replace(/\.(md|markdown)$/i, ""),
    url,
    description: frontmatter.description || "",
    date: normalizeDate(frontmatter.date),
    content: rteContent,
    slug,
    draft: isDraft(frontmatter),
    source: {
      path: sourceFile.path,
      sha: sourceFile.sha,
    },
  };

  // Add optional fields only if they have values
  const canonicalUrl = getCanonicalUrl(frontmatter);
  if (canonicalUrl) article.canonical_url = canonicalUrl;

  const readingTime = getReadingTime(frontmatter);
  if (readingTime) article.reading_time = readingTime;

  const heroImage = getHeroImage(frontmatter);
  if (heroImage) article.thumbnail = heroImage;

  if (taxonomies.length > 0) article.taxonomies = taxonomies;
  if (faqs) article.faqs = faqs;

  return article;
}

/**
 * Check if a slug should be excluded (e.g., "index")
 */
export function isExcludedSlug(slug: string): boolean {
  return slug === "index";
}

/**
 * Filter articles to exclude reserved slugs
 */
export function filterExcludedArticles(articles: ContentstackArticle[]): ContentstackArticle[] {
  return articles.filter((article) => !isExcludedSlug(article.slug));
}

/**
 * Filter articles by draft status
 */
export function filterByDraftStatus(
  articles: ContentstackArticle[],
  draftFilter: "true" | "false" | "all"
): ContentstackArticle[] {
  if (draftFilter === "all") return articles;
  if (draftFilter === "true") return articles.filter((a) => a.draft);
  return articles.filter((a) => !a.draft);
}

/**
 * Filter articles by tags (any match)
 */
export function filterByTags(
  articles: ContentstackArticle[],
  tags: string[]
): ContentstackArticle[] {
  if (tags.length === 0) return articles;
  
  return articles.filter((article) => {
    if (!article.taxonomies) return false;
    const articleTags = article.taxonomies.map((t) => t.term_uid);
    return tags.some((filterTag) =>
      articleTags.some(
        (articleTag) =>
          articleTag === filterTag ||
          articleTag.includes(filterTag) ||
          filterTag.includes(articleTag)
      )
    );
  });
}

/**
 * Sort articles by field
 */
export function sortArticles(
  articles: ContentstackArticle[],
  orderBy: "date" | "title",
  order: "asc" | "desc"
): ContentstackArticle[] {
  return [...articles].sort((a, b) => {
    let comparison = 0;
    
    if (orderBy === "date") {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else if (orderBy === "title") {
      comparison = a.title.localeCompare(b.title);
    }

    return order === "asc" ? comparison : -comparison;
  });
}

/**
 * Apply pagination to articles
 */
export function paginateArticles(
  articles: ContentstackArticle[],
  offset: number,
  limit: number
): ContentstackArticle[] {
  return articles.slice(offset, offset + limit);
}

/**
 * Full pipeline to filter, sort, and paginate articles
 */
export function processArticles(
  articles: ContentstackArticle[],
  options: {
    draftFilter?: "true" | "false" | "all";
    tags?: string[];
    orderBy?: "date" | "title";
    order?: "asc" | "desc";
    offset?: number;
    limit?: number;
  }
): { articles: ContentstackArticle[]; total: number } {
  const {
    draftFilter = "false",
    tags = [],
    orderBy = "date",
    order = "desc",
    offset = 0,
    limit = 10,
  } = options;

  // Apply filters
  let filtered = filterExcludedArticles(articles);
  filtered = filterByDraftStatus(filtered, draftFilter);
  filtered = filterByTags(filtered, tags);

  // Get total before pagination
  const total = filtered.length;

  // Sort and paginate
  const sorted = sortArticles(filtered, orderBy, order);
  const paginated = paginateArticles(sorted, offset, limit);

  return { articles: paginated, total };
}

