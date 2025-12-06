"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor as TipTapEditor } from "@tiptap/react";
import clsx from "clsx";
import {
  EditorStreamHandler,
  ConversationMessage,
  createConversationMessage,
  buildConversationHistory,
} from "../utils/streamingHelpers";
import type { ArticleMetadata } from "./ArticleMetadata";

interface AIWritingBarProps {
  editor: TipTapEditor | null;
  onMetadataGenerated: (metadata: Partial<ArticleMetadata>) => void;
  onTitleExtracted?: (title: string) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  disabled?: boolean;
}

type StreamMode = "replace-all" | "replace-selection" | "append";

/**
 * Extract title from markdown content
 * Returns the title text if found (from # or ## at the start)
 * Works with partial content during streaming
 */
function extractTitleFromContent(content: string): string | null {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Match # Title or ## Title - must have content after the #
    const match = trimmedLine.match(/^#{1,2}\s+(.+)$/);
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
    // Skip empty lines at the start
    if (trimmedLine.length > 0 && !trimmedLine.startsWith("#")) {
      break; // Stop if we hit non-heading content
    }
  }
  return null;
}

export default function AIWritingBar({
  editor,
  onMetadataGenerated,
  onTitleExtracted,
  scrollContainerRef,
  disabled = false,
}: AIWritingBarProps) {
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{
    from: number;
    to: number;
  } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamHandlerRef = useRef<EditorStreamHandler | null>(null);

  // Track editor selection changes
  useEffect(() => {
    if (!editor) return;

    const updateSelection = () => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");

      if (text && text.trim().length > 0) {
        setSelectedText(text);
        setSelectionRange({ from, to });
      } else {
        setSelectedText(null);
        setSelectionRange(null);
      }
    };

    // Listen to selection changes
    editor.on("selectionUpdate", updateSelection);
    editor.on("focus", updateSelection);

    return () => {
      editor.off("selectionUpdate", updateSelection);
      editor.off("focus", updateSelection);
    };
  }, [editor]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [inputValue]);

  // Clear selection when textarea is focused (to show selection indicator properly)
  const handleTextareaFocus = useCallback(() => {
    // Re-check selection when focusing textarea
    if (editor) {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, " ");
      if (text && text.trim().length > 0) {
        setSelectedText(text);
        setSelectionRange({ from, to });
      }
    }
  }, [editor]);

  /**
   * Scroll to bottom of the scroll container
   * Uses double requestAnimationFrame to ensure DOM has updated
   */
  const scrollToBottom = useCallback(() => {
    // Double requestAnimationFrame ensures layout is complete after DOM mutations
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Try using the provided ref first
        if (scrollContainerRef?.current) {
          const container = scrollContainerRef.current;
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "auto",
          });
        } else {
          // Fallback: scroll the window/document
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "auto",
          });
        }
      });
    });
  }, [scrollContainerRef]);

  /**
   * Get current article content from editor
   */
  const getArticleContent = useCallback((): string => {
    if (!editor) return "";
    // Get plain text representation
    return editor.getText();
  }, [editor]);

  /**
   * Get article content as markdown-like format
   */
  const getArticleMarkdown = useCallback((): string => {
    if (!editor) return "";

    // Get HTML and do a basic conversion to markdown-ish text for context
    const html = editor.getHTML();

    // Basic HTML to text conversion for context
    let text = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return text;
  }, [editor]);

  /**
   * Handle sending a writing request
   */
  const handleSend = async () => {
    if (!inputValue.trim() || !editor || isStreaming || disabled) return;

    const prompt = inputValue.trim();
    setInputValue("");
    setIsStreaming(true);
    setError(null);

    // Cancel any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (streamHandlerRef.current) {
      streamHandlerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Determine mode based on selection
    const hasSelection = selectedText && selectionRange;
    const mode: StreamMode = hasSelection ? "replace-selection" : "replace-all";
    const messageType = hasSelection
      ? "edit-selection"
      : getArticleContent().trim()
      ? "edit-full"
      : "write";

    // Create stream handler with scroll callback
    const streamHandler = new EditorStreamHandler(
      editor,
      mode,
      hasSelection ? selectionRange : undefined,
      scrollToBottom // Scroll after each content insert
    );
    streamHandlerRef.current = streamHandler;

    // Add user message to history
    const userMessage = createConversationMessage(
      "user",
      prompt,
      messageType,
      hasSelection ? selectedText : undefined
    );
    setConversationHistory((prev) => [...prev, userMessage]);

    // Clear selection after starting
    setSelectedText(null);
    setSelectionRange(null);

    try {
      const response = await fetch("/api/openai/write-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          currentContent: getArticleMarkdown(),
          selectedText: hasSelection ? selectedText : undefined,
          conversationHistory: buildConversationHistory(conversationHistory),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      let titleExtracted = false; // Track if we've already extracted the title

      while (true) {
        const { done, value } = await reader.read();

        if (done || streamHandler.isAborted()) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "chunk" && data.content) {
                accumulatedContent += data.content;
                await streamHandler.processChunk(data.content);

                // Extract title immediately during streaming (only for new articles)
                if (
                  !titleExtracted &&
                  messageType === "write" &&
                  onTitleExtracted &&
                  editor
                ) {
                  const extractedTitle =
                    extractTitleFromContent(accumulatedContent);
                  if (extractedTitle) {
                    onTitleExtracted(extractedTitle);
                    titleExtracted = true;

                    // Remove the title heading from the editor to avoid duplication
                    // Find and delete the first heading node
                    const { doc } = editor.state;
                    let headingPos: number | null = null;
                    let headingEnd: number | null = null;

                    doc.descendants((node, pos) => {
                      if (headingPos === null && node.type.name === "heading") {
                        headingPos = pos;
                        headingEnd = pos + node.nodeSize;
                        return false; // Stop traversing
                      }
                      return true;
                    });

                    if (headingPos !== null && headingEnd !== null) {
                      editor
                        .chain()
                        .focus()
                        .deleteRange({ from: headingPos, to: headingEnd })
                        .run();
                    }
                  }
                }
              } else if (data.type === "done") {
                await streamHandler.flush();
                scrollToBottom();

                // Add assistant message to history
                const assistantMessage = createConversationMessage(
                  "assistant",
                  accumulatedContent,
                  messageType
                );
                setConversationHistory((prev) => [...prev, assistantMessage]);

                setIsStreaming(false);
                return;
              } else if (data.type === "error") {
                throw new Error(data.error || "Stream error occurred");
              }
            } catch (e) {
              console.warn("Failed to parse SSE data:", e);
            }
          }
        }
      }

      // Flush remaining content
      await streamHandler.flush();
      scrollToBottom();

      if (accumulatedContent) {
        const assistantMessage = createConversationMessage(
          "assistant",
          accumulatedContent,
          messageType
        );
        setConversationHistory((prev) => [...prev, assistantMessage]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Request was cancelled
        return;
      }
      console.error("Write stream error:", err);
      setError(err.message || "Failed to generate content. Please try again.");
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      streamHandlerRef.current = null;
    }
  };

  /**
   * Handle generating metadata
   */
  const handleGenerateMetadata = async () => {
    if (!editor || isGeneratingMetadata || isStreaming || disabled) return;

    const content = getArticleMarkdown();
    if (!content.trim()) {
      setError("Please write some content first before generating metadata.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setIsGeneratingMetadata(true);
    setError(null);

    try {
      const response = await fetch("/api/openai/generate-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          articleContent: content,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to generate metadata");
      }

      // Map the generated metadata to ArticleMetadata format
      const slug = data.metadata.slug;
      const metadata: Partial<ArticleMetadata> = {
        title: data.metadata.title,
        slug: slug,
        description: data.metadata.description,
        tags: data.metadata.tags || [],
        readingTime: data.metadata.reading_time,
        faqs: data.metadata.faqs || [],
        date: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD format
        draft: true, // Default to draft
        canonicalUrl: `https://timbenniks.dev/writing/${slug}`, // Auto-generate canonical URL
      };

      onMetadataGenerated(metadata);
    } catch (err: any) {
      console.error("Generate metadata error:", err);
      setError(err.message || "Failed to generate metadata. Please try again.");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsGeneratingMetadata(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (streamHandlerRef.current) {
      streamHandlerRef.current.abort();
      streamHandlerRef.current = null;
    }
    setIsStreaming(false);
  };

  /**
   * Handle keyboard shortcuts
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter to send
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
    // Escape to cancel
    if (e.key === "Escape") {
      if (isStreaming) {
        handleCancel();
      } else {
        setInputValue("");
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (streamHandlerRef.current) {
        streamHandlerRef.current.abort();
      }
    };
  }, []);

  const wordCount = selectedText
    ? selectedText.split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-4xl mx-auto px-6 py-4">
        {/* Error Message */}
        {error && (
          <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Selection Indicator */}
        {selectedText && !isStreaming && (
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <svg
              className="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            <span>
              <strong className="text-gray-800">Selection active</strong> (
              {wordCount} words) - Your request will rewrite the selected text
            </span>
            <button
              onClick={() => {
                setSelectedText(null);
                setSelectionRange(null);
                editor?.commands.setTextSelection(
                  editor.state.doc.content.size
                );
              }}
              className="text-blue-600 hover:text-blue-800 underline text-xs"
            >
              Clear selection
            </button>
          </div>
        )}

        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="mb-3 flex items-center gap-2 text-sm text-blue-600">
            <div className="flex gap-1">
              <div
                className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span>
              {selectedText ? "Rewriting selection..." : "Writing article..."}
            </span>
          </div>
        )}

        {/* Input Row - Fixed alignment */}
        <div className="flex items-center gap-3">
          {/* Textarea */}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleTextareaFocus}
              placeholder={
                selectedText
                  ? "Describe how to rewrite the selection... (⌘+Enter to send)"
                  : getArticleContent().trim()
                  ? "Describe changes to make... (⌘+Enter to send)"
                  : "Describe the article you want to write... (⌘+Enter to send)"
              }
              disabled={isStreaming || disabled}
              rows={1}
              className={clsx(
                "w-full resize-none rounded-lg border border-gray-300 px-4 py-2.5 text-sm leading-normal",
                "focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent",
                "placeholder-gray-400",
                (isStreaming || disabled) &&
                  "opacity-50 cursor-not-allowed bg-gray-50"
              )}
            />
          </div>

          {/* Action Buttons - Same height as textarea */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isStreaming ? (
              <button
                onClick={handleCancel}
                className="h-[42px] px-4 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-sm font-medium"
                title="Cancel (Esc)"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={
                  !inputValue.trim() || isStreaming || disabled || !editor
                }
                className={clsx(
                  "h-[42px] px-4 rounded-lg transition-colors text-sm font-medium flex items-center gap-2",
                  !inputValue.trim() || isStreaming || disabled || !editor
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                )}
                title="Send (⌘+Enter)"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Send
              </button>
            )}

            {/* Generate Metadata Button */}
            <button
              onClick={handleGenerateMetadata}
              disabled={
                isGeneratingMetadata || isStreaming || disabled || !editor
              }
              className={clsx(
                "h-[42px] px-4 rounded-lg transition-colors text-sm font-medium flex items-center gap-2",
                isGeneratingMetadata || isStreaming || disabled || !editor
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-purple-600 text-white hover:bg-purple-700"
              )}
              title="Generate article metadata"
            >
              {isGeneratingMetadata ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  Metadata
                </>
              )}
            </button>
          </div>
        </div>

        {/* Hint Text */}
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>
            {selectedText
              ? "Selection mode: AI will rewrite only the selected text"
              : getArticleContent().trim()
              ? "Edit mode: AI will update your existing article"
              : "New article: AI will write a complete article"}
          </span>
          <span>⌘+Enter to send · Esc to cancel</span>
        </div>
      </div>
    </div>
  );
}
