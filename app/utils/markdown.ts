import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import yaml from "js-yaml";
import type { ArticleMetadata } from "../components/ArticleMetadata";

/**
 * Convert markdown string to HTML
 * This HTML can then be used with TipTap's setContent method
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  let html = result.toString();

  // Post-process HTML to fix common issues
  // Remove <p> tags inside <li> elements - they cause awkward spacing
  // This handles various cases including nested content, multiple paragraphs, etc.

  // First pass: Simple single paragraph in list item
  html = html.replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/g, '<li>$1</li>');

  // Second pass: Handle any remaining <p> tags inside <li> (more aggressive)
  // This regex finds <li> tags and removes any <p></p> wrappers inside them
  html = html.replace(/<li>([\s\S]*?)<\/li>/g, (match, content) => {
    // Remove opening and closing <p> tags but preserve the content
    let cleaned = content
      .replace(/<p>\s*/g, '')
      .replace(/\s*<\/p>/g, '<br>')  // Replace closing </p> with <br> for multi-paragraph items
      .replace(/<br>\s*$/, '')       // Remove trailing <br>
      .replace(/^\s*<br>/, '')       // Remove leading <br>
      .trim();
    return `<li>${cleaned}</li>`;
  });

  return html;
}

/**
 * Map frontmatter fields to ArticleMetadata
 * Handles the comprehensive frontmatter structure from The Composable Writer
 */
export function mapFrontmatterToMetadata(frontmatter: any): Partial<ArticleMetadata> {
  const metadata: Partial<ArticleMetadata> = {};

  // Map common frontmatter fields
  if (frontmatter.title) metadata.title = String(frontmatter.title);
  if (frontmatter.slug) metadata.slug = String(frontmatter.slug);
  if (frontmatter.description) metadata.description = String(frontmatter.description);

  // Date - extract date part for form input, but we'll preserve full format when saving
  if (frontmatter.date) {
    const dateValue = String(frontmatter.date);
    // Extract just the date part (YYYY-MM-DD) for the date input field
    // The full format will be preserved when saving via updateFrontmatter
    if (dateValue.includes("T")) {
      metadata.date = dateValue.split("T")[0];
    } else {
      metadata.date = dateValue;
    }
  }

  // Canonical URL - check multiple variations (prioritize snake_case since that's what's in the file)
  const canonicalValue =
    frontmatter.canonical_url ||
    frontmatter.canonicalUrl ||
    frontmatter.canonical;
  if (canonicalValue) {
    metadata.canonicalUrl = String(canonicalValue);
  }

  // Reading Time - check multiple variations (prioritize snake_case since that's what's in the file)
  const readingTimeValue =
    frontmatter.reading_time ||
    frontmatter.readingTime ||
    frontmatter.readTime ||
    frontmatter["reading-time"]; // Also check kebab-case
  if (readingTimeValue) {
    metadata.readingTime = String(readingTimeValue);
  }

  // Image - check multiple variations (prioritize 'image' as that's what's in source files)
  const imageValue =
    frontmatter.image ||
    frontmatter.heroImage ||
    frontmatter.hero_image;
  if (imageValue) {
    metadata.heroImage = String(imageValue); // Store in heroImage for UI, but save as 'image'
  }

  // Handle tags (can be array or comma-separated string)
  // Tags should be lowercase per instructions
  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) {
      metadata.tags = frontmatter.tags.map((tag: any) => String(tag).toLowerCase());
    } else {
      metadata.tags = String(frontmatter.tags)
        .split(",")
        .map((tag: string) => tag.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  // Handle FAQs (array of {question, answer} objects)
  if (frontmatter.faqs && Array.isArray(frontmatter.faqs)) {
    metadata.faqs = frontmatter.faqs.map((faq: any) => ({
      question: String(faq.question || ""),
      answer: String(faq.answer || ""),
    }));
  }

  // Draft - handle boolean or string "true"
  if (frontmatter.draft !== undefined) {
    metadata.draft = frontmatter.draft === true ||
      frontmatter.draft === "true" ||
      String(frontmatter.draft).toLowerCase() === "true";
  }

  // Note: id, collection_id, and head.meta are preserved in frontmatter but not mapped to ArticleMetadata
  // They will be preserved when saving via updateFrontmatter

  return metadata;
}

/**
 * Update original frontmatter with new metadata values, preserving structure and formatting
 */
export function updateFrontmatter(
  originalFrontmatter: string,
  metadata: Partial<ArticleMetadata>
): string {
  if (!originalFrontmatter.trim()) {
    // No original frontmatter, generate new one
    return metadataToFrontmatter(metadata);
  }

  try {
    // Parse original frontmatter to get structure - preserve everything including nested objects
    const originalData = yaml.load(originalFrontmatter, { schema: yaml.DEFAULT_SCHEMA }) as Record<string, any> || {};

    // Deep clone to preserve all original fields including nested structures (id, collection_id, head, etc.)
    const updatedData: Record<string, any> = JSON.parse(JSON.stringify(originalData));

    // Preserve id and collection_id from original (these are not in ArticleMetadata)
    // They will be kept automatically since we're cloning originalData

    // Helper to get original value for a field (checking multiple key variations)
    const getOriginalValue = (snakeKey: string, camelKey: string, fallbackKey?: string): any => {
      return originalData[snakeKey] ?? originalData[camelKey] ?? (fallbackKey ? originalData[fallbackKey] : undefined);
    };

    // Update fields only if they have values (preserve original key names and ALL other fields)
    if (metadata.title) updatedData.title = metadata.title;
    if (metadata.slug) updatedData.slug = metadata.slug;
    if (metadata.description) updatedData.description = metadata.description;

    // Update date - preserve original format if it had time/timezone, otherwise add T10:00:00Z
    if (metadata.date !== undefined && metadata.date !== null && metadata.date !== '') {
      const originalDate = originalData.date;
      const newDate = String(metadata.date).trim();

      // If original had ISO datetime with time, and new date is date-only, preserve time
      if (originalDate && typeof originalDate === 'string' && originalDate.includes('T') &&
        newDate && !newDate.includes('T')) {
        const timePart = originalDate.split('T')[1] || '10:00:00Z';
        updatedData.date = `${newDate}T${timePart}`;
      } else if (newDate && !newDate.includes('T')) {
        // If new date is date-only and original didn't have time, add T10:00:00Z
        updatedData.date = `${newDate}T10:00:00Z`;
      } else if (newDate) {
        // Otherwise use the new date as-is (already has time component)
        updatedData.date = newDate;
      }
    }

    // Preserve original key naming convention - check what exists in original file
    if (metadata.canonicalUrl !== undefined) {
      if (originalData.canonical_url !== undefined) {
        updatedData.canonical_url = metadata.canonicalUrl || undefined;
        delete updatedData.canonicalUrl;
      } else if (originalData.canonicalUrl !== undefined) {
        updatedData.canonicalUrl = metadata.canonicalUrl || undefined;
        delete updatedData.canonical_url;
      } else {
        // Default to snake_case as per source files
        updatedData.canonical_url = metadata.canonicalUrl || undefined;
        delete updatedData.canonicalUrl;
      }
    }

    if (metadata.readingTime !== undefined) {
      if (originalData.reading_time !== undefined) {
        updatedData.reading_time = metadata.readingTime || undefined;
        delete updatedData.readingTime;
      } else if (originalData.readingTime !== undefined) {
        updatedData.readingTime = metadata.readingTime || undefined;
        delete updatedData.reading_time;
      } else {
        // Default to snake_case as per source files
        updatedData.reading_time = metadata.readingTime || undefined;
        delete updatedData.readingTime;
      }
    }

    // Use 'image' key (not hero_image) as per source files
    if (metadata.heroImage !== undefined) {
      if (originalData.image !== undefined) {
        // Source files use 'image', preserve it
        updatedData.image = metadata.heroImage || undefined;
        delete updatedData.hero_image;
        delete updatedData.heroImage;
      } else if (originalData.hero_image !== undefined) {
        updatedData.hero_image = metadata.heroImage || undefined;
        delete updatedData.image;
        delete updatedData.heroImage;
      } else if (originalData.heroImage !== undefined) {
        updatedData.heroImage = metadata.heroImage || undefined;
        delete updatedData.image;
        delete updatedData.hero_image;
      } else {
        // Default to 'image' as per source files
        updatedData.image = metadata.heroImage || undefined;
        delete updatedData.hero_image;
        delete updatedData.heroImage;
      }
    }

    // Preserve tags array format (flow vs block style)
    if (metadata.tags !== undefined) {
      if (metadata.tags.length > 0) {
        // Check if original used flow style (inline array)
        const originalTags = originalData.tags;
        const wasFlowStyle = Array.isArray(originalTags) &&
          originalTags.length > 0 &&
          !originalFrontmatter.includes('tags:\n') &&
          originalFrontmatter.includes('tags: [');

        updatedData.tags = metadata.tags;
        // Note: We'll handle the style in yaml.dump options
      } else {
        updatedData.tags = undefined;
      }
    }

    if (metadata.faqs !== undefined) {
      updatedData.faqs = metadata.faqs.length > 0 ? metadata.faqs : undefined;
    }

    if (metadata.draft !== undefined) {
      updatedData.draft = metadata.draft;
    }

    // Update head.meta section based on metadata fields
    if (updatedData.head && updatedData.head.meta && Array.isArray(updatedData.head.meta)) {
      // Update or create twitter:image
      const imageMetaIndex = updatedData.head.meta.findIndex((m: any) => m.property === 'twitter:image');
      const imageValue = updatedData.image || updatedData.hero_image || updatedData.heroImage;
      if (imageValue) {
        if (imageMetaIndex >= 0) {
          updatedData.head.meta[imageMetaIndex].content = imageValue;
        } else {
          updatedData.head.meta.push({ property: 'twitter:image', content: imageValue });
        }
      }

      // Update or create twitter:title
      const titleMetaIndex = updatedData.head.meta.findIndex((m: any) => m.property === 'twitter:title');
      if (updatedData.title) {
        if (titleMetaIndex >= 0) {
          updatedData.head.meta[titleMetaIndex].content = updatedData.title;
        } else {
          updatedData.head.meta.push({ property: 'twitter:title', content: updatedData.title });
        }
      }

      // Update or create twitter:description
      const descMetaIndex = updatedData.head.meta.findIndex((m: any) => m.property === 'twitter:description');
      if (updatedData.description) {
        if (descMetaIndex >= 0) {
          updatedData.head.meta[descMetaIndex].content = updatedData.description;
        } else {
          updatedData.head.meta.push({ property: 'twitter:description', content: updatedData.description });
        }
      }

      // Update or create keywords
      const keywordsMetaIndex = updatedData.head.meta.findIndex((m: any) => m.property === 'keywords');
      if (updatedData.tags && Array.isArray(updatedData.tags) && updatedData.tags.length > 0) {
        const keywordsValue = updatedData.tags.join(', ');
        if (keywordsMetaIndex >= 0) {
          updatedData.head.meta[keywordsMetaIndex].content = keywordsValue;
        } else {
          updatedData.head.meta.push({ property: 'keywords', content: keywordsValue });
        }
      }
    } else if (updatedData.image || updatedData.title || updatedData.description || (updatedData.tags && updatedData.tags.length > 0)) {
      // Create head.meta structure if it doesn't exist but we have data
      updatedData.head = {
        meta: []
      };
      const imageValue = updatedData.image || updatedData.hero_image || updatedData.heroImage;
      if (imageValue) {
        updatedData.head.meta.push({ property: 'twitter:image', content: imageValue });
      }
      if (updatedData.title) {
        updatedData.head.meta.push({ property: 'twitter:title', content: updatedData.title });
      }
      if (updatedData.description) {
        updatedData.head.meta.push({ property: 'twitter:description', content: updatedData.description });
      }
      if (updatedData.tags && Array.isArray(updatedData.tags) && updatedData.tags.length > 0) {
        updatedData.head.meta.push({ property: 'keywords', content: updatedData.tags.join(', ') });
      }
    }

    // Remove undefined/null/empty string values (but keep false/0, empty arrays/objects)
    Object.keys(updatedData).forEach(key => {
      const value = updatedData[key];
      if (value === undefined || value === null || value === '') {
        delete updatedData[key];
      }
    });

    // Detect original formatting preferences from the original frontmatter string
    const originalTags = originalData.tags;
    // Check if tags used flow style [item1, item2] vs block style
    const tagsUseFlowStyle = Array.isArray(originalTags) &&
      originalTags.length > 0 &&
      originalFrontmatter.match(/^tags:\s*\[/m) !== null;

    // Check if date was quoted in original
    const dateWasQuoted = originalFrontmatter.match(/^date:\s*["']/m) !== null;

    // Convert back to YAML with proper formatting
    // Always use block style (flowLevel: -1) to ensure multi-line formatting
    // We'll handle tags flow style with post-processing
    const yamlOptions: any = {
      lineWidth: -1, // Don't wrap lines
      noRefs: true,
      sortKeys: false, // Preserve key order from original
      quotingType: '"',
      forceQuotes: false,
      flowLevel: -1, // Always use block style (multi-line) - we'll handle tags separately
      indent: 2, // Use 2-space indentation
      noArrayIndent: false, // Allow array indentation for nested structures
    };

    // Convert to YAML string
    let result = yaml.dump(updatedData, yamlOptions).trim();

    // Post-process to fix formatting issues

    // 1. Fix date formatting - remove quotes if original didn't have them
    if (updatedData.date !== undefined && updatedData.date !== null && updatedData.date !== '') {
      if (!dateWasQuoted) {
        result = result.replace(/^date:\s*"(.+)"$/m, `date: $1`);
      }
    }

    // 2. Fix tags format - use flow style [item1, item2] if original used it
    if (tagsUseFlowStyle && updatedData.tags && Array.isArray(updatedData.tags) && updatedData.tags.length > 0) {
      const tagsFlow = `[${updatedData.tags.join(', ')}]`;
      const tagsBlockPattern = /^tags:\s*\n((?:\s+-\s+.+\n?)+)/m;
      if (tagsBlockPattern.test(result)) {
        result = result.replace(tagsBlockPattern, `tags: ${tagsFlow}\n`);
      } else {
        // Also handle if tags is already on one line but needs to be fixed
        const tagsLinePattern = /^tags:\s*\[.+\]\s*$/m;
        if (tagsLinePattern.test(result)) {
          // Ensure there's a newline after tags
          result = result.replace(/^(tags:\s*\[.+\])\s*$/m, `$1\n`);
        }
      }
    }

    // 3. Fix head.meta indentation - ensure proper 2-space indentation
    // Format: head:\n  meta:\n    - property: ...\n      content: ...
    if (updatedData.head && updatedData.head.meta && Array.isArray(updatedData.head.meta)) {
      // Reconstruct head.meta section with proper indentation
      const metaLines: string[] = [];
      updatedData.head.meta.forEach((meta: any) => {
        if (meta.property && meta.content !== undefined) {
          metaLines.push(`    - property: ${meta.property}`);
          metaLines.push(`      content: ${meta.content}`);
        }
      });

      if (metaLines.length > 0) {
        // Find and replace the entire head section
        // Match from "head:" to the end of the meta array
        const headSectionPattern = /^head:\s*\n(\s+meta:\s*\n(?:\s+-\s+property:.+\n(?:\s+content:.+\n?)+)+)/m;
        if (headSectionPattern.test(result)) {
          result = result.replace(headSectionPattern, `head:\n  meta:\n${metaLines.join('\n')}\n`);
        } else {
          // If pattern doesn't match, try a more flexible approach
          // Find where head: starts and replace everything until the next top-level key
          const headStartPattern = /^head:\s*\n/m;
          if (headStartPattern.test(result)) {
            // Find the end of the head section (next top-level key or end of file)
            const lines = result.split('\n');
            let headStartIdx = -1;
            let headEndIdx = lines.length;

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].match(/^head:\s*$/)) {
                headStartIdx = i;
              } else if (headStartIdx >= 0 && lines[i].match(/^[a-z_]+:/) && !lines[i].match(/^\s+/)) {
                headEndIdx = i;
                break;
              }
            }

            if (headStartIdx >= 0) {
              const beforeHead = lines.slice(0, headStartIdx).join('\n');
              const afterHead = lines.slice(headEndIdx).join('\n');
              result = `${beforeHead}\nhead:\n  meta:\n${metaLines.join('\n')}\n${afterHead ? afterHead : ''}`;
            }
          }
        }
      }
    }

    return result;
  } catch (error) {
    console.warn("Failed to update frontmatter, generating new one:", error);
    return metadataToFrontmatter(metadata);
  }
}

/**
 * Convert ArticleMetadata to YAML frontmatter string (fallback for new files)
 */
export function metadataToFrontmatter(metadata: Partial<ArticleMetadata>): string {
  const frontmatter: Record<string, any> = {};

  if (metadata.title) frontmatter.title = metadata.title;
  if (metadata.slug) frontmatter.slug = metadata.slug;
  if (metadata.description) frontmatter.description = metadata.description;
  if (metadata.date) {
    // Add T10:00:00Z if date is date-only
    const dateValue = String(metadata.date).trim();
    if (dateValue && !dateValue.includes('T')) {
      frontmatter.date = `${dateValue}T10:00:00Z`;
    } else {
      frontmatter.date = dateValue;
    }
  }
  if (metadata.canonicalUrl) frontmatter.canonical_url = metadata.canonicalUrl;
  if (metadata.readingTime) frontmatter.reading_time = metadata.readingTime;
  if (metadata.heroImage) frontmatter.image = metadata.heroImage; // Use 'image' as per source files
  if (metadata.tags && metadata.tags.length > 0) frontmatter.tags = metadata.tags;
  if (metadata.faqs && metadata.faqs.length > 0) frontmatter.faqs = metadata.faqs;
  if (metadata.draft !== undefined) frontmatter.draft = metadata.draft;

  // Create head.meta section based on metadata fields
  const headMeta: Array<{ property: string; content: string }> = [];
  const imageValue = metadata.heroImage || metadata.image;
  if (imageValue) {
    headMeta.push({ property: 'twitter:image', content: imageValue });
  }
  if (metadata.title) {
    headMeta.push({ property: 'twitter:title', content: metadata.title });
  }
  if (metadata.description) {
    headMeta.push({ property: 'twitter:description', content: metadata.description });
  }
  if (metadata.tags && metadata.tags.length > 0) {
    headMeta.push({ property: 'keywords', content: metadata.tags.join(', ') });
  }

  if (headMeta.length > 0) {
    frontmatter.head = {
      meta: headMeta,
    };
  }

  // Use js-yaml for better formatting
  let result = yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
    indent: 2,
    flowLevel: -1, // Use block style
  }).trim();

  // Post-process to fix head.meta indentation - ensure proper 2-space indentation
  // Format: head:\n  meta:\n    - property: ...\n      content: ...
  if (headMeta.length > 0) {
    const metaLines: string[] = [];
    headMeta.forEach((meta) => {
      metaLines.push(`    - property: ${meta.property}`);
      metaLines.push(`      content: ${meta.content}`);
    });

    // Replace the head section with properly indented version
    const headPattern = /^head:\s*\n\s+meta:\s*\n((?:\s+-\s+property:.+\n(?:\s+content:.+\n?)+)+)/m;
    if (headPattern.test(result)) {
      result = result.replace(headPattern, `head:\n  meta:\n${metaLines.join('\n')}\n`);
    }
  }

  return result;
}

/**
 * Combine frontmatter and markdown content into a complete markdown file
 * Preserves original frontmatter structure when available
 */
export function combineFrontmatterAndContent(
  metadata: Partial<ArticleMetadata>,
  content: string,
  originalFrontmatter?: string
): string {
  const frontmatter = originalFrontmatter
    ? updateFrontmatter(originalFrontmatter, metadata)
    : metadataToFrontmatter(metadata);
  return `---\n${frontmatter}\n---\n\n${content}`;
}

