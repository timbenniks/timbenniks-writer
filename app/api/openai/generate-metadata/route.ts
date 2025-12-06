import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "../utils";
import { METADATA_GENERATION_INSTRUCTIONS } from "../../../utils/toneInstructions";
import type { ChatMessage } from "../types";

interface GenerateMetadataRequest {
  articleContent: string;
  model?: string;
  temperature?: number;
}

interface GeneratedMetadata {
  title: string;
  slug: string;
  description: string;
  tags: string[];
  reading_time: string;
  faqs: Array<{ question: string; answer: string }>;
}

/**
 * Build the system prompt for metadata generation
 */
function buildMetadataSystemPrompt(): string {
  return `CRITICAL: You are a metadata extraction assistant. Return ONLY valid JSON with no additional text, explanation, or markdown formatting. Do not wrap the JSON in code blocks.

${METADATA_GENERATION_INSTRUCTIONS}`;
}

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();
    const body: GenerateMetadataRequest = await request.json();
    
    const {
      articleContent,
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
    } = body;

    if (!articleContent || typeof articleContent !== "string" || !articleContent.trim()) {
      return NextResponse.json(
        { success: false, error: "Article content is required" },
        { status: 400 }
      );
    }

    // Build messages
    const systemPrompt = buildMetadataSystemPrompt();
    
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze the following article and generate metadata as JSON:

---ARTICLE---
${articleContent}
---END ARTICLE---

Return ONLY the JSON object with title, slug, description, tags, reading_time, and faqs.`,
      },
    ];

    // Request metadata generation (non-streaming for JSON parsing)
    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(1, temperature)),
      max_completion_tokens: 2000,
    });

    const responseContent = completion.choices[0]?.message?.content || "";
    
    // Try to parse JSON from response
    let metadata: GeneratedMetadata;
    
    try {
      // Clean up the response - remove any markdown code block markers
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
      
      metadata = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse metadata JSON:", parseError);
      console.error("Raw response:", responseContent);
      
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to parse AI response as JSON. Please try again.",
          rawResponse: responseContent,
        },
        { status: 500 }
      );
    }

    // Validate required fields
    if (!metadata.title || !metadata.slug || !metadata.description) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Generated metadata is missing required fields (title, slug, or description)",
          metadata,
        },
        { status: 500 }
      );
    }

    // Ensure arrays are properly formatted
    if (!Array.isArray(metadata.tags)) {
      metadata.tags = [];
    }
    
    if (!Array.isArray(metadata.faqs)) {
      metadata.faqs = [];
    }

    // Normalize tags to lowercase
    metadata.tags = metadata.tags.map((tag: string) => 
      String(tag).toLowerCase().trim()
    ).filter(Boolean);

    // Ensure slug is properly formatted
    metadata.slug = metadata.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

    return NextResponse.json({
      success: true,
      metadata,
      usage: completion.usage,
    });

  } catch (error: any) {
    console.error("Generate metadata error:", error);

    let status = 500;
    let errorMessage = error.message || "Failed to generate metadata";

    if (error.status === 401) {
      status = 401;
      errorMessage = "Invalid API key. Please check your OpenAI API key.";
    } else if (error.status === 429) {
      status = 429;
      errorMessage = "Rate limit exceeded. Please try again later.";
    } else if (error.status === 500) {
      status = 500;
      errorMessage = "OpenAI service error. Please try again later.";
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status }
    );
  }
}

