import { NextRequest } from "next/server";
import { createOpenAIClient, DEFAULT_MODEL, DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS } from "../utils";
import { ARTICLE_WRITING_INSTRUCTIONS } from "../../../utils/toneInstructions";
import type { ChatMessage } from "../types";

interface WriteStreamRequest {
  prompt: string;
  currentContent?: string;
  selectedText?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Build the system prompt for article writing
 */
function buildWritingSystemPrompt(): string {
  const noReasoningInstruction = "CRITICAL: You are The Composable Writer. Provide ONLY your final output. Never include your reasoning process, thinking steps, internal thoughts, or meta-commentary. Output raw Markdown directly without code block wrappers.\n\n";
  
  return `${noReasoningInstruction}${ARTICLE_WRITING_INSTRUCTIONS}`;
}

/**
 * Build the user message based on context
 */
function buildUserMessage(request: WriteStreamRequest): string {
  const { prompt, currentContent, selectedText } = request;
  
  let message = "";
  
  // If there's selected text, this is a targeted rewrite
  if (selectedText) {
    message = `I have selected the following text from my article:

---SELECTED TEXT---
${selectedText}
---END SELECTED TEXT---

${currentContent ? `Here is the full article for context:

---FULL ARTICLE---
${currentContent}
---END FULL ARTICLE---

` : ""}My request: ${prompt}

IMPORTANT: Return ONLY the rewritten text that should replace the selection. Do not include any text before or after the selected portion. Match the tone and style of the surrounding content.`;
  }
  // If there's current content but no selection, this is a full article edit
  else if (currentContent) {
    message = `Here is my current article:

---CURRENT ARTICLE---
${currentContent}
---END CURRENT ARTICLE---

My request: ${prompt}

Please rewrite the entire article incorporating my requested changes. Output the complete updated article in Markdown format.`;
  }
  // Fresh writing request
  else {
    message = `${prompt}

Write a complete article on this topic following the structure: Introduction (opinionated hook), TL;DR, The why, The how, Challenges, Concluding. Output raw Markdown directly.`;
  }
  
  return message;
}

export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();
    const body: WriteStreamRequest = await request.json();
    
    const {
      prompt,
      conversationHistory = [],
      model = DEFAULT_MODEL,
      temperature = DEFAULT_TEMPERATURE,
      maxTokens = DEFAULT_MAX_TOKENS,
    } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build the system prompt
    const systemPrompt = buildWritingSystemPrompt();
    
    // Build user message with context
    const userMessage = buildUserMessage(body);

    // Build messages array
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
    ];
    
    // Add conversation history for context
    for (const msg of conversationHistory) {
      chatMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    // Add the current user message
    chatMessages.push({
      role: "user",
      content: userMessage,
    });

    // Build API request parameters
    const requestParams: any = {
      model,
      messages: chatMessages,
      temperature: Math.max(0, Math.min(2, temperature)),
      max_completion_tokens: Math.max(1, Math.min(8000, maxTokens)),
      stream: true,
    };

    // Create streaming response
    const stream = await openai.chat.completions.create(requestParams) as any;

    // Create a readable stream for SSE
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            const content = delta?.content || "";

            if (content) {
              // Send chunk as SSE
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
    console.error("Write stream error:", error);

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

