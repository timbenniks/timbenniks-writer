import { NextRequest, NextResponse } from "next/server";
import { createOpenAIClient, buildSystemPrompt, DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "../utils";
import type { ChatMessage } from "../types";

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();

    const body = await request.json();
    const {
      messages,
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
      maxTokens = DEFAULT_MAX_TOKENS,
      isNewArticle = false,
      reasoning,
      text,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "Messages array is required" },
        { status: 400 }
      );
    }

    // Build messages with system prompt
    // Include article structure for full article generation (when isNewArticle context is present)
    // toneInstructions and articleStructure are now code-only defaults (from toneInstructions.ts)
    const includeStructure = body.isNewArticle === true;
    const systemPrompt = buildSystemPrompt(
      undefined, // Use default from toneInstructions.ts
      includeStructure,
      undefined // Use default from toneInstructions.ts
    );
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // For GPT-5.1 with reasoning/text parameters, use responses.create() API
    if (model === "gpt-5.1" && (reasoning?.effort || text?.verbosity)) {
      // Convert messages to a single input string
      // Combine system prompt and user messages
      const inputParts: string[] = [];
      chatMessages.forEach((msg) => {
        if (msg.role === "system") {
          inputParts.push(msg.content);
        } else if (msg.role === "user") {
          inputParts.push(msg.content);
        } else if (msg.role === "assistant") {
          inputParts.push(`Assistant: ${msg.content}`);
        }
      });
      const input = inputParts.join("\n\n");

      const requestParams: any = {
        model: "gpt-5.1",
        input,
        temperature: Math.max(0, Math.min(2, temperature)),
        max_output_tokens: Math.max(1, Math.min(4000, maxTokens)), // Responses API uses max_output_tokens
      };

      if (reasoning?.effort) {
        requestParams.reasoning = { effort: reasoning.effort };
      }
      if (text?.verbosity) {
        requestParams.text = { verbosity: text.verbosity };
      }

      // Use responses.create() for GPT-5.1
      const result = await (openai as any).responses.create(requestParams);
      const content = result.output_text;

      if (!content) {
        return NextResponse.json(
          { success: false, error: "No response from OpenAI" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        content,
        usage: result.usage,
      });
    }

    // For other models or GPT-5.1 without special parameters, use chat.completions.create()
    const requestParams: any = {
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(2, temperature)),
      max_completion_tokens: Math.max(1, Math.min(4000, maxTokens)),
    };

    // Call OpenAI API
    const completion = await openai.chat.completions.create(requestParams);

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { success: false, error: "No response from OpenAI" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      content,
      usage: completion.usage,
    });
  } catch (error: any) {
    console.error("OpenAI API error:", error);

    // Handle specific OpenAI errors
    if (error.status === 401) {
      return NextResponse.json(
        { success: false, error: "Invalid API key. Please check your OpenAI API key." },
        { status: 401 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    if (error.status === 500) {
      return NextResponse.json(
        { success: false, error: "OpenAI service error. Please try again later." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get response from OpenAI",
      },
      { status: 500 }
    );
  }
}

