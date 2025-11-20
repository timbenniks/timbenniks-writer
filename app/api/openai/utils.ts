import OpenAI from "openai";
import { DEFAULT_TONE_INSTRUCTIONS, ARTICLE_STRUCTURE_INSTRUCTIONS } from "../../utils/toneInstructions";

/**
 * Get OpenAI API configuration from environment variables
 */
export function getOpenAIConfig(): { apiKey: string; organizationId?: string } | null {
  const apiKey = process.env.OPENAI_API_KEY;
  const organizationId = process.env.OPENAI_ORG_ID;

  if (!apiKey) {
    return null;
  }

  return { apiKey, organizationId };
}

/**
 * Create OpenAI client instance
 */
export function createOpenAIClient(): OpenAI {
  const config = getOpenAIConfig();

  if (!config) {
    throw new Error("OpenAI API key not configured. Please set OPENAI_API_KEY in .env.local");
  }

  const clientConfig: { apiKey: string; organization?: string } = {
    apiKey: config.apiKey,
  };

  if (config.organizationId) {
    clientConfig.organization = config.organizationId;
  }

  return new OpenAI(clientConfig);
}

/**
 * Build system prompt with tone instructions
 * @param toneInstructions - Custom tone instructions (optional)
 * @param includeArticleStructure - Whether to include article structure guidelines (for full article generation)
 * @param articleStructure - Custom article structure instructions (optional, only used if includeArticleStructure is true)
 */
export function buildSystemPrompt(
  toneInstructions?: string,
  includeArticleStructure: boolean = false,
  articleStructure?: string
): string {
  // Important: Do not include reasoning or thinking process in your output
  const noReasoningInstruction = "IMPORTANT: Provide only your final output. Do not include your reasoning process, thinking steps, or internal thoughts in your response. Only provide the actual content requested.\n\n";
  
  const basePrompt = `You are an expert writing assistant helping to create and improve articles.`;

  // Use provided tone instructions, or fall back to default
  const instructions = toneInstructions?.trim() || DEFAULT_TONE_INSTRUCTIONS;

  // Add article structure if needed (for full article generation)
  // Use custom structure if provided, otherwise use default
  const structureSection = includeArticleStructure
    ? `\n\n${articleStructure?.trim() || ARTICLE_STRUCTURE_INSTRUCTIONS}`
    : "";

  // Add frontmatter instructions for full article generation
  const frontmatterInstructions = includeArticleStructure
    ? `\n\n**IMPORTANT: When generating a complete article, you MUST include YAML frontmatter at the beginning of your response with the following structure:**

\`\`\`yaml
---
title: "Article Title"
slug: "article-slug"
description: "A compelling description of the article (150-200 characters)"
date: "YYYY-MM-DD"
image: "URL to hero image (optional)"
canonical_url: "Canonical URL (optional)"
reading_time: "X min read"
tags: ["tag1", "tag2", "tag3"]
draft: false
---

[Your article content here]
\`\`\`

The frontmatter should be wrapped in \`---\` markers and include:
- title: The article title
- slug: URL-friendly version of the title (lowercase, hyphens instead of spaces)
- description: A compelling description (150-200 characters)
- date: Today's date in YYYY-MM-DD format
- image: Hero image URL (if available)
- tags: Array of relevant tags (3-5 tags)
- draft: false (unless it's a draft)

After the frontmatter, provide the full article content in markdown format.`
    : "";

  return `${noReasoningInstruction}${basePrompt}

${instructions}${structureSection}${frontmatterInstructions}

Please follow these guidelines in all your writing.`;
}

/**
 * Default model configuration
 */
export const DEFAULT_MODEL = "gpt-5.1";
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 4000; // Higher default for GPT-5.1, can be removed from UI
export const DEFAULT_REASONING_EFFORT = "none"; // GPT-5.1 default: none (lowest latency)
export const DEFAULT_VERBOSITY = "medium"; // GPT-5.1 default: medium

/**
 * Available models
 */
export const AVAILABLE_MODELS = [
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
] as const;

