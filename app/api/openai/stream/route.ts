import { NextRequest } from "next/server";
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
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Messages array is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build messages with system prompt
    // Uses unified Composable Writer instructions (from toneInstructions.ts)
    const systemPrompt = buildSystemPrompt();
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // Build API request parameters
    // For GPT-5.1, we use chat.completions which supports streaming
    // Note: GPT-5.1 specific parameters (reasoning, text) are not supported in chat.completions streaming
    const requestParams: any = {
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(2, temperature)),
      max_completion_tokens: Math.max(1, Math.min(4000, maxTokens)),
      stream: true,
    };

    // GPT-5.1 specific parameters (only work in Responses API, not chat.completions)
    // We'll use chat.completions for streaming, which works well with GPT-5.1
    // The model will still follow the system prompt instructions effectively

    // Create streaming response
    // Type assertion needed because GPT-5.1 streaming works but types may not be fully updated
    const stream = await openai.chat.completions.create(requestParams) as any;

    // Create a readable stream for SSE
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            
            // Only send content, ignore reasoning tokens if present
            // For GPT-5.1, reasoning might be in delta.reasoning, we only want delta.content
            const content = delta?.content || "";

            if (content) {
              // Send chunk as SSE (only output content, not reasoning)
              const data = JSON.stringify({
                type: "chunk",
                content,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }

            // Check if stream is done
            if (chunk.choices[0]?.finish_reason) {
              const data = JSON.stringify({
                type: "done",
                finishReason: chunk.choices[0].finish_reason,
                usage: chunk.usage,
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              controller.close();
            }
          }
        } catch (error: any) {
          const errorData = JSON.stringify({
            type: "error",
            error: error.message || "Stream error occurred",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("OpenAI streaming error:", error);

    // Handle specific OpenAI errors
    let status = 500;
    let errorMessage = error.message || "Failed to stream response from OpenAI";

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

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

