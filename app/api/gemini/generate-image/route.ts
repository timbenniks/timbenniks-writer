import { NextRequest, NextResponse } from "next/server";
import { getGeminiConfig, buildImagePrompt } from "../utils";

// Gemini 3 Pro (Nano Banana Pro) for image generation
const IMAGE_MODEL = "gemini-3-pro-image-preview";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, articleContext, previousFeedback } = body;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    const config = getGeminiConfig();
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Gemini API key not configured. Please set GEMINI_API_KEY in .env.local",
        },
        { status: 401 }
      );
    }

    // Build the full prompt with context
    let fullPrompt = buildImagePrompt(prompt, articleContext);

    // If there's previous feedback, append it
    if (previousFeedback) {
      fullPrompt += `\n\nPrevious feedback to incorporate:\n${previousFeedback}`;
    }

    // Use the Gemini generateContent API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${config.apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: fullPrompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("Gemini API error:", errorData);

      // Check for specific error types
      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Invalid or unauthorized Gemini API key. Please check your GEMINI_API_KEY.",
          },
          { status: 401 }
        );
      }

      if (response.status === 429) {
        return NextResponse.json(
          {
            success: false,
            error: "API rate limit reached. Please try again later.",
          },
          { status: 429 }
        );
      }

      throw new Error(
        errorData.error?.message || `API request failed: ${response.status}`
      );
    }

    const data = await response.json();

    // Extract the image from the response
    // Gemini returns candidates with parts that can contain text or inline_data (images)
    const candidates = data.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { success: false, error: "No response generated" },
        { status: 500 }
      );
    }

    const parts = candidates[0].content?.parts;
    if (!parts || parts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No content in response" },
        { status: 500 }
      );
    }

    // Find the image part
    const imagePart = parts.find(
      (part: { inlineData?: { mimeType: string; data: string } }) =>
        part.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart || !imagePart.inlineData) {
      // Check if we got text instead (error message or refusal)
      const textPart = parts.find((part: { text?: string }) => part.text);
      if (textPart?.text) {
        return NextResponse.json(
          {
            success: false,
            error: `Could not generate image: ${textPart.text.substring(0, 200)}`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { success: false, error: "No image was generated" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      image: {
        base64: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
      },
    });
  } catch (error: unknown) {
    console.error("Image generation error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate image";

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
