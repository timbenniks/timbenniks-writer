/**
 * Normalize tags for case-insensitive comparison
 */
export function normalizeTags(tags: string[]): string[] {
  return tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
}

/**
 * Format date string for display
 */
export function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

/**
 * Slugify text to URL-friendly format
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract unique tags from files
 */
export function extractUniqueTags<T extends { frontmatter?: { tags?: string[] } }>(
  files: T[]
): string[] {
  return Array.from(
    new Set(
      files.flatMap((file) => {
        const tags = file.frontmatter?.tags || [];
        if (Array.isArray(tags)) {
          return tags.map((tag) => String(tag).trim()).filter(Boolean);
        }
        return [];
      })
    )
  ).sort();
}

