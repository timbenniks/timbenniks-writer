import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "../utils";
import type { ChatMessage } from "../types";

interface GenerateVideoTagsRequest {
  title: string;
  description: string;
  transcript?: string;
  model?: string;
  temperature?: number;
}

/**
 * Build the system prompt for video tag generation
 */
function buildTagGenerationPrompt(): string {
  return `You are a content tagging assistant specializing in tech content, specifically around headless CMS, composable architecture, and web development.

Your task is to analyze video content and suggest relevant tags.

CRITICAL RULES:
1. Return ONLY a valid JSON array of strings with no additional text
2. Generate between 3-8 relevant tags
3. Tags should be lowercase, single words or short phrases (2-3 words max)
4. Focus on technical topics, products, and concepts mentioned
5. Prioritize tags that would help users discover this content

Common tag categories to consider:
- CMS platforms: contentstack, hygraph, sanity, strapi, etc.
- Technologies: nextjs, react, vue, graphql, rest-api, etc.
- Concepts: headless-cms, composable-architecture, jamstack, visual-builder, etc.
- Content types: tutorial, demo, livestream, interview, etc.
- Topics: personalization, localization, content-modeling, etc.

Example output: ["contentstack", "visual-builder", "nextjs", "composable-architecture", "tutorial"]`;
}

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();
    const body: GenerateVideoTagsRequest = await request.json();

    const {
      title,
      description,
      transcript,
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
    } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Video title is required" },
        { status: 400 }
      );
    }

    // Build the content to analyze
    let contentToAnalyze = `TITLE: ${title}\n\n`;
    
    if (description) {
      contentToAnalyze += `DESCRIPTION: ${description}\n\n`;
    }
    
    if (transcript) {
      // Limit transcript to first 3000 characters to stay within token limits
      const truncatedTranscript = transcript.length > 3000 
        ? transcript.substring(0, 3000) + "..."
        : transcript;
      contentToAnalyze += `TRANSCRIPT (excerpt): ${truncatedTranscript}`;
    }

    const systemPrompt = buildTagGenerationPrompt();

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Analyze this video content and generate relevant tags as a JSON array:

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

    // Normalize tags
    tags = tags
      .map((tag: any) => String(tag).toLowerCase().trim())
      .filter((tag) => tag.length > 0 && tag.length < 50)
      .slice(0, 10); // Max 10 tags

    return NextResponse.json({
      success: true,
      tags,
      usage: completion.usage,
    });
  } catch (error: any) {
    console.error("Generate video tags error:", error);

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

