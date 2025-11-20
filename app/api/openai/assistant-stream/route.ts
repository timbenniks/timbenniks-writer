import { NextRequest } from "next/server";
import { createOpenAIClient } from "../utils";

/**
 * Stream responses from OpenAI Assistants API
 * Used for custom GPTs when creating new articles
 */
export async function POST(request: NextRequest) {
  try {
    const openai = createOpenAIClient();

    const body = await request.json();
    const {
      assistantId,
      messages,
    } = body;

    if (!assistantId) {
      return new Response(
        JSON.stringify({ success: false, error: "Assistant ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Messages array is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create a thread
    const thread = await openai.beta.threads.create();

    // Add all messages to the thread (skip system messages, assistants handle that)
    for (const message of messages) {
      if (message.role === "user") {
        await openai.beta.threads.messages.create(thread.id, {
          role: "user",
          content: message.content,
        });
      }
    }

    // Create a run with streaming enabled
    const stream = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistantId,
      stream: true,
    });

    // Create a readable stream for SSE
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let accumulatedContent = "";
          
          for await (const event of stream) {
            // Handle different event types from Assistants API
            if (event.event === "thread.message.delta") {
              // Message delta contains incremental content updates
              const delta = (event.data as any).delta;
              if (delta.content && Array.isArray(delta.content)) {
                for (const contentItem of delta.content) {
                  if (contentItem.type === "text" && contentItem.text?.value) {
                    accumulatedContent += contentItem.text.value;
                    const data = JSON.stringify({
                      type: "chunk",
                      content: contentItem.text.value,
                    });
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                  }
                }
              }
            } else if (event.event === "thread.message.completed") {
              // Message completed - send any remaining content
              const messageData = (event.data as any);
              if (messageData.content && Array.isArray(messageData.content)) {
                for (const contentItem of messageData.content) {
                  if (contentItem.type === "text" && contentItem.text?.value) {
                    // Only send if we haven't already sent this content via delta
                    const fullContent = contentItem.text.value;
                    if (fullContent !== accumulatedContent) {
                      const remaining = fullContent.slice(accumulatedContent.length);
                      if (remaining) {
                        const data = JSON.stringify({
                          type: "chunk",
                          content: remaining,
                        });
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                        accumulatedContent = fullContent;
                      }
                    }
                  }
                }
              }
            } else if (event.event === "thread.run.completed") {
              // Run completed
              const data = JSON.stringify({
                type: "done",
                finishReason: "stop",
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              controller.close();
              break;
            } else if (event.event === "thread.run.failed") {
              // Run failed
              const errorData = (event.data as any);
              const errorMessage = errorData.last_error?.message || "Assistant run failed";
              const errorResponse = JSON.stringify({
                type: "error",
                error: errorMessage,
              });
              controller.enqueue(encoder.encode(`data: ${errorResponse}\n\n`));
              controller.close();
              break;
            } else if (event.event === "thread.run.requires_action") {
              // Run requires action (function calling, etc.)
              // For now, we'll treat this as an error since we don't support function calling
              const errorResponse = JSON.stringify({
                type: "error",
                error: "Assistant requires action (function calling not supported)",
              });
              controller.enqueue(encoder.encode(`data: ${errorResponse}\n\n`));
              controller.close();
              break;
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
    console.error("Assistant stream error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to create assistant stream",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

