import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "../utils";
import type { ChatMessage } from "../types";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  CONTENT_TAGS_TAXONOMY,
} from "../../contentstack/utils";

interface GenerateArticleTagsRequest {
  title: string;
  description?: string;
  content?: string; // HTML or markdown content
  model?: string;
  temperature?: number;
}

/**
 * Build the system prompt for article tag generation
 */
function buildTagGenerationPrompt(existingTags: string[]): string {
  const tagsList = existingTags.length > 0
    ? existingTags.join(", ")
    : "none available";

  return `You are a content tagging assistant specializing in tech content, specifically around headless CMS, composable architecture, and web development.

Your task is to analyze article content and suggest relevant tags from the EXISTING taxonomy.

CRITICAL RULES:
1. Return ONLY a valid JSON array of strings with no additional text
2. Generate between 3-8 relevant tags
3. STRONGLY PREFER using tags from the existing taxonomy list below
4. Only suggest NEW tags if absolutely necessary and no existing tag matches
5. Tags should match the exact names from the existing taxonomy (case-insensitive matching)
6. Focus on technical topics, products, and concepts mentioned in the article

EXISTING TAXONOMY TAGS (use these as your primary source):
${tagsList}

IMPORTANT:
- First, try to match concepts in the article to existing tags
- Only add a new tag if there's no suitable existing tag
- When matching, consider synonyms and related concepts (e.g., "CMS" matches "headless CMS")
- Return tags as they appear in the existing taxonomy (exact names)

Example: If the article is about React and Next.js, and "Development" and "Frameworks" exist in the taxonomy, return ["Development", "Frameworks"] rather than ["React", "Next.js"]`;
}

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();
    const body: GenerateArticleTagsRequest = await request.json();

    const {
      title,
      description,
      content,
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
    } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Article title is required" },
        { status: 400 }
      );
    }

    // Fetch existing taxonomy terms from Contentstack (if configured)
    let existingTags: string[] = [];
    try {
      const configError = validateContentstackConfig();
      if (!configError) {
        // Contentstack is configured, fetch existing terms
        const baseUrl = getContentstackBaseUrl();
        const headers = getContentstackHeaders();

        const allTerms: any[] = [];
        let skip = 0;
        const limit = 100;
        let hasMore = true;
        let totalCount = 0;

        while (hasMore) {
          const response = await fetch(
            `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms?include_count=true&limit=${limit}&skip=${skip}`,
            {
              method: "GET",
              headers,
            }
          );

          if (response.ok) {
            const data = await response.json();

            if (skip === 0) {
              totalCount = data.count || 0;
            }

            const terms = data.terms || [];
            allTerms.push(...terms);

            if (terms.length < limit || allTerms.length >= totalCount) {
              hasMore = false;
            } else {
              skip += limit;
            }
          } else {
            hasMore = false;
          }
        }

        existingTags = allTerms.map((term: any) => term.name);
      }
    } catch (error) {
      // If Contentstack is not configured or fails, continue without existing tags
      console.warn("Could not fetch existing taxonomy terms:", error);
    }

    // Build the content to analyze
    let contentToAnalyze = `TITLE: ${title}\n\n`;

    if (description) {
      contentToAnalyze += `DESCRIPTION: ${description}\n\n`;
    }

    if (content) {
      // Limit content to first 3000 characters to stay within token limits
      // Remove HTML tags if present for better analysis
      const textContent = content
        .replace(/<[^>]*>/g, " ") // Remove HTML tags
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();

      const truncatedContent = textContent.length > 3000
        ? textContent.substring(0, 3000) + "..."
        : textContent;
      contentToAnalyze += `CONTENT (excerpt): ${truncatedContent}`;
    }

    const systemPrompt = buildTagGenerationPrompt(existingTags);

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this article content and generate relevant tags as a JSON array.

${existingTags.length > 0
            ? `IMPORTANT: Use tags from the existing taxonomy whenever possible. Only add new tags if absolutely necessary.`
            : ""}

Article content:
${contentToAnalyze}

Return ONLY a JSON array of tag strings, nothing else.`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(1, temperature)),
      max_completion_tokens: 500,
    });

    const responseContent = completion.choices[0]?.message?.content || "";

    // Parse the JSON array from response
    let tags: string[];

    try {
      // Clean up the response
      let cleanedContent = responseContent.trim();

      // Remove markdown code block if present
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }

      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }

      cleanedContent = cleanedContent.trim();

      tags = JSON.parse(cleanedContent);

      if (!Array.isArray(tags)) {
        throw new Error("Response is not an array");
      }
    } catch (parseError) {
      console.error("Failed to parse tags JSON:", parseError);
      console.error("Raw response:", responseContent);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to parse AI response. Please try again.",
          rawResponse: responseContent,
        },
        { status: 500 }
      );
    }

    // Normalize tags and match to existing taxonomy terms
    const normalizedTags: string[] = [];
    const existingTagsMap = new Map(
      existingTags.map((tag) => [tag.toLowerCase(), tag])
    );

    for (const tag of tags) {
      const normalizedTag = String(tag).trim();
      if (normalizedTag.length === 0 || normalizedTag.length >= 50) {
        continue;
      }

      // Try to match to existing taxonomy term (case-insensitive)
      const lowerTag = normalizedTag.toLowerCase();
      const matchedTag = existingTagsMap.get(lowerTag);

      if (matchedTag) {
        // Use the exact name from taxonomy
        normalizedTags.push(matchedTag);
      } else {
        // New tag - use as-is (will be normalized when creating term)
        normalizedTags.push(normalizedTag);
      }
    }

    // Remove duplicates and limit
    const uniqueTags = Array.from(new Set(normalizedTags)).slice(0, 10);

    return NextResponse.json({
      success: true,
      tags: uniqueTags,
      usage: completion.usage,
      matchedExisting: uniqueTags.filter((tag) =>
        existingTagsMap.has(tag.toLowerCase())
      ).length,
      newTags: uniqueTags.filter(
        (tag) => !existingTagsMap.has(tag.toLowerCase())
      ).length,
    });
  } catch (error: any) {
    console.error("Generate article tags error:", error);

    let status = 500;
    let errorMessage = error.message || "Failed to generate tags";

    if (error.status === 401) {
      status = 401;
      errorMessage = "Invalid API key. Please check your OpenAI API key.";
    } else if (error.status === 429) {
      status = 429;
      errorMessage = "Rate limit exceeded. Please try again later.";
    }

    return NextResponse.json({ success: false, error: errorMessage }, { status });
  }
}

