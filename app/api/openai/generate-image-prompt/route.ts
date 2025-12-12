import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "../utils";
import type { ChatMessage } from "../types";

interface GenerateImagePromptRequest {
  articleContent: string;
  articleTitle?: string;
  model?: string;
  temperature?: number;
}

const IMAGE_PROMPT_INSTRUCTIONS = `You are an expert visual designer who creates compelling cover image concepts for tech blog articles.

Your task is to generate a creative, descriptive image prompt that will be used to generate a cover image with AI.

Guidelines for the image prompt:
1. The image should be abstract and conceptual - avoid literal representations
2. Focus on mood, atmosphere, and visual metaphors
3. Use modern, professional aesthetics suitable for a tech blog
4. Think about geometric shapes, gradients, patterns, and symbolic elements
5. The style should be clean and minimalist with striking visual impact
6. Consider colors that evoke the article's theme (e.g., blues for trust/tech, greens for growth, purples for innovation)
7. Avoid any text, logos, or human faces in the image
8. The image will be rendered in 16:9 landscape format

Output ONLY the image generation prompt - no explanations, no quotation marks, just the prompt itself.
Keep the prompt concise but descriptive (2-4 sentences max).`;

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();
    const body: GenerateImagePromptRequest = await request.json();
    
    const {
      articleContent,
      articleTitle,
      model = DEFAULT_MODEL,
      temperature = 0.8, // Slightly higher for creativity
    } = body;

    if (!articleContent || typeof articleContent !== "string" || !articleContent.trim()) {
      return NextResponse.json(
        { success: false, error: "Article content is required" },
        { status: 400 }
      );
    }

    // Truncate content if too long
    const truncatedContent = articleContent.substring(0, 3000);

    const chatMessages: ChatMessage[] = [
      { role: "system", content: IMAGE_PROMPT_INSTRUCTIONS },
      {
        role: "user",
        content: `Generate a cover image prompt for this article:

${articleTitle ? `Title: ${articleTitle}\n\n` : ""}Content:
${truncatedContent}

Remember: Output ONLY the image prompt, nothing else.`,
      },
    ];

    const completion = await openai.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(1, temperature)),
      max_completion_tokens: 300,
    });

    const prompt = completion.choices[0]?.message?.content?.trim() || "";

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Failed to generate image prompt" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      prompt,
      usage: completion.usage,
    });

  } catch (error: any) {
    console.error("Generate image prompt error:", error);

    let status = 500;
    let errorMessage = error.message || "Failed to generate image prompt";

    if (error.status === 401) {
      status = 401;
      errorMessage = "Invalid API key. Please check your OpenAI API key.";
    } else if (error.status === 429) {
      status = 429;
      errorMessage = "Rate limit exceeded. Please try again later.";
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status }
    );
  }
}

