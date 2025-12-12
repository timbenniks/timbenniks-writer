"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import clsx from "clsx";
import type { Editor as TipTapEditor } from "@tiptap/react";
import { markdownToHtml, mapFrontmatterToMetadata } from "../utils/markdown";
import matter from "gray-matter";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  articleTitle?: string;
  articleDescription?: string;
  articleContent?: string;
  articleMetadata?: {
    tags?: string[];
    slug?: string;
    date?: string;
  };
  editor?: TipTapEditor | null; // TipTap editor instance for inserting content
  onContentInserted?: () => void; // Callback when content is inserted into editor
  isOnboarding?: boolean; // Whether this is the onboarding flow for new articles
  onMetadataUpdate?: (
    metadata: Partial<import("./ArticleMetadata").ArticleMetadata>
  ) => void; // Callback to update metadata from frontmatter
}

export default function AIChatPanel({
  isOpen,
  onClose,
  articleTitle,
  articleDescription,
  articleContent,
  articleMetadata,
  editor,
  onContentInserted,
  isOnboarding = false,
  onMetadataUpdate,
}: AIChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [aiConfig, setAiConfig] = useState<{
    assistantId: string | null;
    model: string;
    temperature: number;
    reasoningEffort: "none" | "low" | "medium" | "high";
    verbosity: "low" | "medium" | "high";
  } | null>(null);

  // Load AI config from environment variables (server-side)
  useEffect(() => {
    const loadAIConfig = async () => {
      try {
        const response = await fetch("/api/openai/config");
        const data = await response.json();
        if (data.success) {
          setAiConfig({
            assistantId: data.assistantId || null,
            model: data.model || "gpt-5.1",
            temperature: data.temperature ?? 0.7,
            reasoningEffort: data.reasoningEffort || "none",
            verbosity: data.verbosity || "medium",
          });
        }
      } catch (e) {
        console.error("Could not load AI config from env:", e);
      }
    };
    loadAIConfig();
  }, []);

  // Auto-scroll to bottom only if user is already at the bottom
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    // Check if user is near the bottom (within 100px)
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      100;

    if (isNearBottom && shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, streamingContent, shouldAutoScroll]);

  // Track scroll position to determine if we should auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;
      setShouldAutoScroll(isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        240
      )}px`;
    }
  }, [inputValue]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError(null);
    setStreamingContent("");

    // Cancel any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Wait for AI config to load if not yet available
      if (!aiConfig) {
        setError("AI configuration not loaded. Please wait...");
        return;
      }

      // Build context for new article generation
      // The system prompt already includes all instructions, so we just add article-specific context
      let articleContext = "";

      if (articleTitle) {
        articleContext += `Article Title: ${articleTitle}\n`;
      }
      if (articleDescription) {
        articleContext += `Article Description: ${articleDescription}\n`;
      }
      if (articleMetadata?.tags && articleMetadata.tags.length > 0) {
        articleContext += `Tags: ${articleMetadata.tags.join(", ")}\n`;
      }
      if (articleContent && articleContent.trim()) {
        // For new articles, show what's been written so far
        const truncatedContent =
          articleContent.length > 1500
            ? articleContent.substring(0, 1500) +
              "\n\n[... content continues ...]"
            : articleContent;
        articleContext += `\nCurrent Content:\n${truncatedContent}\n`;
      }

      if (articleContext) {
        articleContext = `Current Article Context:\n\n${articleContext}\n---\n\n`;
      }

      // Build the final message content
      const finalMessageContent = articleContext + userMessage.content;

      // Convert messages to API format
      const apiMessages = [
        ...messages,
        { ...userMessage, content: finalMessageContent },
      ].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Use custom GPT Assistant API if configured
      const useCustomGPT = aiConfig.assistantId;
      const apiEndpoint = useCustomGPT
        ? "/api/openai/assistant-stream"
        : "/api/openai/stream";

      const requestBody = useCustomGPT
        ? {
            assistantId: aiConfig.assistantId,
            messages: apiMessages.filter((msg) => {
              // Assistants handle system prompts, so filter them out
              return msg.role === "user" || msg.role === "assistant";
            }),
          }
        : {
            messages: apiMessages,
            model: aiConfig.model,
            temperature: aiConfig.temperature,
            maxTokens: 4000,
            // toneInstructions and articleStructure are now code-only defaults
            // They will be loaded from toneInstructions.ts in the API
            // Note: reasoning and text parameters are not supported in streaming API
          };

      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
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

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
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
                setStreamingContent(accumulatedContent);
              } else if (data.type === "done") {
                // Stream complete, add message to history
                if (accumulatedContent) {
                  const aiMessage: ChatMessage = {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: accumulatedContent,
                    timestamp: new Date(),
                  };
                  setMessages((prev) => [...prev, aiMessage]);

                  // If onboarding and editor exists, offer to insert content
                  if (isOnboarding && editor && onContentInserted) {
                    // Content is ready, user can insert it
                  }
                }
                setStreamingContent("");
                setIsLoading(false);
                return;
              } else if (data.type === "error") {
                throw new Error(data.error || "Stream error occurred");
              }
            } catch (e) {
              // Skip invalid JSON lines
              console.warn("Failed to parse SSE data:", e);
            }
          }
        }
      }

      // If we get here, stream ended without "done" message
      if (accumulatedContent) {
        const aiMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: accumulatedContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, aiMessage]);
        setStreamingContent("");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // Request was cancelled, don't show error
        return;
      }
      console.error("Chat error:", err);
      setError(err.message || "Failed to send message. Please try again.");
    } finally {
      setIsLoading(false);
      setStreamingContent("");
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    if (confirm("Are you sure you want to clear the chat history?")) {
      // Cancel any ongoing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setMessages([]);
      setError(null);
      setStreamingContent("");
      setIsLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  if (!isOpen) return null;

  // Inline layout for onboarding (integrated into editor)
  if (isOnboarding) {
    return (
      <div className="w-full bg-white rounded-lg border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                AI Writing Assistant
              </h2>
              <p className="text-xs text-gray-500">
                Start by describing what you'd like to write
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                title="Clear chat"
                aria-label="Clear chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Skip AI assistant"
              title="Skip and start writing"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div
          className="flex flex-col"
          style={{ minHeight: "500px", maxHeight: "600px" }}
        >
          {/* Messages Container */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-6 space-y-4"
          >
            {messages.length === 0 && !isLoading && (
              <div className="text-center text-gray-500 py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Let's create your article
                </h3>
                <p className="text-sm text-gray-600 mb-6 max-w-md mx-auto">
                  Describe what you'd like to write about, and I'll help you
                  create a well-structured article with proper formatting and
                  metadata.
                </p>
                <div className="flex flex-wrap gap-2 justify-center text-xs text-gray-500">
                  <span className="px-3 py-1 bg-gray-100 rounded-full">
                    Article structure
                  </span>
                  <span className="px-3 py-1 bg-gray-100 rounded-full">
                    Frontmatter
                  </span>
                  <span className="px-3 py-1 bg-gray-100 rounded-full">
                    SEO optimization
                  </span>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={clsx(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={clsx(
                    "max-w-[85%] rounded-lg px-4 py-2",
                    message.role === "user"
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-900"
                  )}
                >
                  {message.role === "assistant" ? (
                    <div className="w-full">
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeHighlight]}
                          components={{
                            p: ({ children, ...props }: any) => (
                              <p className="mb-3" {...props}>
                                {children}
                              </p>
                            ),
                            code: ({
                              node,
                              inline,
                              className,
                              children,
                              ...props
                            }: any) => {
                              const match = /language-(\w+)/.exec(
                                className || ""
                              );
                              return !inline && match ? (
                                <pre className="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto">
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code
                                  className="bg-gray-200 px-1 rounded"
                                  {...props}
                                >
                                  {children}
                                </code>
                              );
                            },
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                      {isOnboarding && editor && onContentInserted && (
                        <button
                          onClick={async () => {
                            if (!editor) return;

                            // Parse frontmatter and extract markdown content
                            let content = message.content;
                            let frontmatterData: any = null;

                            try {
                              // Check if content is wrapped in a markdown code block
                              const codeBlockMatch = message.content.match(
                                /```(?:markdown|md)?\n([\s\S]*?)\n```/
                              );
                              let rawContent = codeBlockMatch
                                ? codeBlockMatch[1]
                                : message.content;

                              // Trim leading/trailing whitespace but preserve structure
                              rawContent = rawContent.trim();

                              // Check if frontmatter exists with --- delimiters
                              let hasFrontmatterDelimiters =
                                rawContent.startsWith("---\n");

                              // If no delimiters, try to detect if there's frontmatter at the start
                              if (!hasFrontmatterDelimiters) {
                                // Look for YAML-like structure at the beginning
                                // Match lines that look like "key: value" or "key: value key2: value2"
                                const frontmatterLines: string[] = [];
                                const lines = rawContent.split("\n");
                                let foundContentStart = false;

                                for (let i = 0; i < lines.length; i++) {
                                  const line = lines[i];
                                  // Check if this looks like a frontmatter line (key: value pattern)
                                  const frontmatterLineMatch = line.match(
                                    /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                                  );

                                  if (
                                    frontmatterLineMatch &&
                                    !foundContentStart
                                  ) {
                                    // This is a frontmatter line
                                    frontmatterLines.push(line);

                                    // Check if the value contains multiple key:value pairs (malformed)
                                    const value = frontmatterLineMatch[2];
                                    if (
                                      value.match(/[a-z_][a-z0-9_]*:\s*/i) &&
                                      !value.startsWith("[") &&
                                      !value.startsWith("{")
                                    ) {
                                      // This line has multiple key:value pairs, split them
                                      const parts = value.split(
                                        /(?<=:)\s*(?=[a-z_][a-z0-9_]*:)/i
                                      );
                                      if (parts.length > 1) {
                                        // Replace the current line with the first part
                                        frontmatterLines[
                                          frontmatterLines.length - 1
                                        ] = `${frontmatterLineMatch[1]}: ${parts[0]}`;
                                        // Add the remaining parts as new lines
                                        for (let j = 1; j < parts.length; j++) {
                                          const nextKeyMatch = parts[j].match(
                                            /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                                          );
                                          if (nextKeyMatch) {
                                            frontmatterLines.push(
                                              `${nextKeyMatch[1]}: ${nextKeyMatch[2]}`
                                            );
                                          }
                                        }
                                      }
                                    }
                                  } else if (
                                    line.trim() === "" &&
                                    frontmatterLines.length > 0
                                  ) {
                                    // Empty line after frontmatter, likely separator
                                    foundContentStart = true;
                                  } else if (
                                    frontmatterLineMatch &&
                                    foundContentStart
                                  ) {
                                    // Found another frontmatter-like line after content started, stop
                                    break;
                                  } else if (
                                    !frontmatterLineMatch &&
                                    line.trim() !== "" &&
                                    frontmatterLines.length > 0
                                  ) {
                                    // Non-frontmatter content found, stop collecting frontmatter
                                    foundContentStart = true;
                                    break;
                                  } else if (
                                    !frontmatterLineMatch &&
                                    line.trim() !== "" &&
                                    frontmatterLines.length === 0
                                  ) {
                                    // No frontmatter detected, this is content
                                    break;
                                  }
                                }

                                if (frontmatterLines.length > 0) {
                                  // Found frontmatter-like content, wrap it in delimiters
                                  const frontmatterSection =
                                    frontmatterLines.join("\n");
                                  const contentStartIndex =
                                    rawContent.indexOf(
                                      frontmatterLines[
                                        frontmatterLines.length - 1
                                      ]
                                    ) +
                                    frontmatterLines[
                                      frontmatterLines.length - 1
                                    ].length;
                                  const contentSection = rawContent
                                    .substring(contentStartIndex)
                                    .replace(/^\n+/, "")
                                    .trim();

                                  // Clean up the frontmatter - ensure proper formatting
                                  let cleanedFrontmatter = frontmatterSection
                                    .split("\n")
                                    .map((line) => {
                                      const match = line.match(
                                        /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                                      );
                                      if (match) {
                                        const key = match[1];
                                        let value = match[2].trim();

                                        // Quote values that contain spaces, colons, or special chars (unless already quoted or array/object)
                                        if (
                                          !value.startsWith('"') &&
                                          !value.startsWith("'") &&
                                          !value.startsWith("[") &&
                                          !value.startsWith("{") &&
                                          (value.includes(" ") ||
                                            value.includes(":") ||
                                            value.includes(","))
                                        ) {
                                          value = `"${value.replace(
                                            /"/g,
                                            '\\"'
                                          )}"`;
                                        }

                                        return `${key}: ${value}`;
                                      }
                                      return line;
                                    })
                                    .join("\n");

                                  rawContent = `---\n${cleanedFrontmatter}\n---\n\n${contentSection}`;
                                  hasFrontmatterDelimiters = true;
                                }
                              }

                              // Parse frontmatter - gray-matter handles YAML frontmatter with --- delimiters
                              let parsed;
                              let contentAlreadyExtracted = false;
                              try {
                                parsed = matter(rawContent);
                              } catch (parseError: any) {
                                console.error(
                                  "❌ YAML parsing error:",
                                  parseError.message
                                );
                                // Try to fix common YAML issues
                                if (hasFrontmatterDelimiters) {
                                  const frontmatterMatch = rawContent.match(
                                    /^---\n([\s\S]*?)\n---/
                                  );
                                  if (frontmatterMatch) {
                                    let frontmatterYaml = frontmatterMatch[1];
                                    // Remove empty lines (lines with only whitespace)
                                    frontmatterYaml = frontmatterYaml.replace(
                                      /^\s*$\n/gm,
                                      ""
                                    );
                                    // Fix common YAML issues: ensure proper spacing after colons
                                    frontmatterYaml = frontmatterYaml.replace(
                                      /:\s*([^\n]+?)(?=\n[a-z_][a-z0-9_]*:|$)/gi,
                                      (match, value) => {
                                        // If value contains spaces and isn't quoted, quote it
                                        if (
                                          value.includes(" ") &&
                                          !value.startsWith('"') &&
                                          !value.startsWith("'")
                                        ) {
                                          return `: "${value.replace(
                                            /"/g,
                                            '\\"'
                                          )}"`;
                                        }
                                        return `: ${value}`;
                                      }
                                    );

                                    // Try parsing again with cleaned YAML
                                    try {
                                      parsed = matter(
                                        `---\n${frontmatterYaml}\n---\n${rawContent.substring(
                                          frontmatterMatch[0].length
                                        )}`
                                      );
                                    } catch (retryError) {
                                      console.error(
                                        "❌ Retry parsing also failed:",
                                        retryError
                                      );
                                      // Last resort: try to extract just the content part
                                      const contentMatch = rawContent.match(
                                        /^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/
                                      );
                                      if (contentMatch) {
                                        content = contentMatch[1].trim();
                                        frontmatterData = null;
                                        contentAlreadyExtracted = true;
                                      } else {
                                        throw parseError; // Re-throw original error
                                      }
                                    }
                                  } else {
                                    throw parseError;
                                  }
                                } else {
                                  // No frontmatter detected, use content as-is
                                  content = rawContent;
                                  frontmatterData = null;
                                  contentAlreadyExtracted = true;
                                }
                              }

                              // Check if frontmatter was found (skip if content was already extracted in catch block)
                              if (!contentAlreadyExtracted) {
                                if (
                                  parsed &&
                                  parsed.data &&
                                  Object.keys(parsed.data).length > 0
                                ) {
                                  // Frontmatter found, extract it
                                  frontmatterData = parsed.data;
                                  content = parsed.content.trim(); // Content without frontmatter

                                  // Update metadata if callback provided
                                  if (onMetadataUpdate) {
                                    const metadata =
                                      mapFrontmatterToMetadata(frontmatterData);
                                    onMetadataUpdate(metadata);
                                  } else {
                                    console.warn(
                                      "❌ onMetadataUpdate callback not provided"
                                    );
                                  }
                                } else {
                                  // No frontmatter found
                                  console.warn(
                                    "⚠️ No frontmatter found in content (expected --- delimiters)"
                                  );
                                  // No frontmatter, use the raw content (might be just markdown)
                                  content = rawContent.trim();
                                }
                              }
                            } catch (e) {
                              // Parsing error, try to extract code block or use as-is
                              console.error("❌ Error parsing frontmatter:", e);
                              const codeBlockMatch = message.content.match(
                                /```(?:markdown|md)?\n([\s\S]*?)\n```/
                              );
                              content = codeBlockMatch
                                ? codeBlockMatch[1].trim()
                                : message.content.trim();
                            }

                            // Convert markdown body (without frontmatter) to HTML before inserting
                            const htmlContent = await markdownToHtml(content);
                            // Insert content into editor
                            editor
                              .chain()
                              .focus()
                              .setContent(htmlContent)
                              .run();
                            // Notify parent that content was inserted
                            onContentInserted();
                          }}
                          className="mt-3 px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                          Use this content
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap mb-3">
                      {message.content}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming response */}
            {isLoading && streamingContent && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2 max-w-[85%]">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        p: ({ children, ...props }: any) => (
                          <p className="mb-3" {...props}>
                            {children}
                          </p>
                        ),
                        code: ({
                          node,
                          inline,
                          className,
                          children,
                          ...props
                        }: any) => {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <pre className="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          ) : (
                            <code
                              className="bg-gray-200 px-1 rounded"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {streamingContent}
                    </ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex gap-1">
                      <div
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Insert button for streaming content during onboarding */}
            {isLoading &&
              streamingContent &&
              isOnboarding &&
              editor &&
              onContentInserted && (
                <div className="mt-4 flex justify-start">
                  <button
                    onClick={async () => {
                      if (!editor) return;

                      // Parse frontmatter and extract markdown content
                      let content = streamingContent;
                      let frontmatterData: any = null;

                      try {
                        // Check if content is wrapped in a markdown code block
                        const codeBlockMatch = streamingContent.match(
                          /```(?:markdown|md)?\n([\s\S]*?)\n```/
                        );
                        let rawContent = codeBlockMatch
                          ? codeBlockMatch[1]
                          : streamingContent;

                        // Trim leading/trailing whitespace but preserve structure
                        rawContent = rawContent.trim();

                        // Check if frontmatter exists with --- delimiters
                        let hasFrontmatterDelimiters =
                          rawContent.startsWith("---\n");

                        // If no delimiters, try to detect if there's frontmatter at the start
                        if (!hasFrontmatterDelimiters) {
                          // Look for YAML-like structure at the beginning
                          const frontmatterLines: string[] = [];
                          const lines = rawContent.split("\n");
                          let foundContentStart = false;

                          for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            const frontmatterLineMatch = line.match(
                              /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                            );

                            if (frontmatterLineMatch && !foundContentStart) {
                              frontmatterLines.push(line);
                              const value = frontmatterLineMatch[2];
                              if (
                                value.match(/[a-z_][a-z0-9_]*:\s*/i) &&
                                !value.startsWith("[") &&
                                !value.startsWith("{")
                              ) {
                                const parts = value.split(
                                  /(?<=:)\s*(?=[a-z_][a-z0-9_]*:)/i
                                );
                                if (parts.length > 1) {
                                  frontmatterLines[
                                    frontmatterLines.length - 1
                                  ] = `${frontmatterLineMatch[1]}: ${parts[0]}`;
                                  for (let j = 1; j < parts.length; j++) {
                                    const nextKeyMatch = parts[j].match(
                                      /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                                    );
                                    if (nextKeyMatch) {
                                      frontmatterLines.push(
                                        `${nextKeyMatch[1]}: ${nextKeyMatch[2]}`
                                      );
                                    }
                                  }
                                }
                              }
                            } else if (
                              line.trim() === "" &&
                              frontmatterLines.length > 0
                            ) {
                              foundContentStart = true;
                            } else if (
                              !frontmatterLineMatch &&
                              line.trim() !== "" &&
                              frontmatterLines.length > 0
                            ) {
                              foundContentStart = true;
                              break;
                            } else if (
                              !frontmatterLineMatch &&
                              line.trim() !== "" &&
                              frontmatterLines.length === 0
                            ) {
                              break;
                            }
                          }

                          if (frontmatterLines.length > 0) {
                            const frontmatterSection =
                              frontmatterLines.join("\n");
                            const contentStartIndex =
                              rawContent.indexOf(
                                frontmatterLines[frontmatterLines.length - 1]
                              ) +
                              frontmatterLines[frontmatterLines.length - 1]
                                .length;
                            const contentSection = rawContent
                              .substring(contentStartIndex)
                              .replace(/^\n+/, "")
                              .trim();

                            let cleanedFrontmatter = frontmatterSection
                              .split("\n")
                              .map((line) => {
                                const match = line.match(
                                  /^([a-z_][a-z0-9_]*):\s*(.+)$/i
                                );
                                if (match) {
                                  const key = match[1];
                                  let value = match[2].trim();
                                  if (
                                    !value.startsWith('"') &&
                                    !value.startsWith("'") &&
                                    !value.startsWith("[") &&
                                    !value.startsWith("{") &&
                                    (value.includes(" ") ||
                                      value.includes(":") ||
                                      value.includes(","))
                                  ) {
                                    value = `"${value.replace(/"/g, '\\"')}"`;
                                  }
                                  return `${key}: ${value}`;
                                }
                                return line;
                              })
                              .join("\n");

                            rawContent = `---\n${cleanedFrontmatter}\n---\n\n${contentSection}`;
                            hasFrontmatterDelimiters = true;
                          }
                        }

                        // Parse frontmatter - gray-matter handles YAML frontmatter with --- delimiters
                        let parsed;
                        let contentAlreadyExtracted = false;
                        try {
                          parsed = matter(rawContent);
                        } catch (parseError: any) {
                          console.error(
                            "❌ YAML parsing error:",
                            parseError.message
                          );
                          // Try to fix common YAML issues
                          if (hasFrontmatterDelimiters) {
                            const frontmatterMatch = rawContent.match(
                              /^---\n([\s\S]*?)\n---/
                            );
                            if (frontmatterMatch) {
                              let frontmatterYaml = frontmatterMatch[1];
                              frontmatterYaml = frontmatterYaml.replace(
                                /^\s*$\n/gm,
                                ""
                              );
                              frontmatterYaml = frontmatterYaml.replace(
                                /:\s*([^\n]+?)(?=\n[a-z_][a-z0-9_]*:|$)/gi,
                                (match, value) => {
                                  if (
                                    value.includes(" ") &&
                                    !value.startsWith('"') &&
                                    !value.startsWith("'")
                                  ) {
                                    return `: "${value.replace(/"/g, '\\"')}"`;
                                  }
                                  return `: ${value}`;
                                }
                              );

                              try {
                                parsed = matter(
                                  `---\n${frontmatterYaml}\n---\n${rawContent.substring(
                                    frontmatterMatch[0].length
                                  )}`
                                );
                              } catch (retryError) {
                                console.error(
                                  "❌ Retry parsing also failed:",
                                  retryError
                                );
                                const contentMatch = rawContent.match(
                                  /^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/
                                );
                                if (contentMatch) {
                                  content = contentMatch[1].trim();
                                  frontmatterData = null;
                                  contentAlreadyExtracted = true;
                                } else {
                                  throw parseError;
                                }
                              }
                            } else {
                              throw parseError;
                            }
                          } else {
                            content = rawContent;
                            frontmatterData = null;
                            contentAlreadyExtracted = true;
                          }
                        }

                        // Check if frontmatter was found (skip if content was already extracted in catch block)
                        if (!contentAlreadyExtracted) {
                          if (
                            parsed &&
                            parsed.data &&
                            Object.keys(parsed.data).length > 0
                          ) {
                            // Frontmatter found, extract it
                            frontmatterData = parsed.data;
                            content = parsed.content.trim(); // Content without frontmatter

                            // Update metadata if callback provided
                            if (onMetadataUpdate) {
                              const metadata =
                                mapFrontmatterToMetadata(frontmatterData);
                              onMetadataUpdate(metadata);
                            } else {
                              console.warn(
                                "❌ onMetadataUpdate callback not provided"
                              );
                            }
                          } else {
                            // No frontmatter found
                            console.warn(
                              "⚠️ No frontmatter found in content (expected --- delimiters)"
                            );
                            // No frontmatter, use the raw content (might be just markdown)
                            content = rawContent.trim();
                          }
                        }
                      } catch (e) {
                        // Parsing error, try to extract code block or use as-is
                        console.error("❌ Error parsing frontmatter:", e);
                        const codeBlockMatch = streamingContent.match(
                          /```(?:markdown|md)?\n([\s\S]*?)\n```/
                        );
                        content = codeBlockMatch
                          ? codeBlockMatch[1].trim()
                          : streamingContent.trim();
                      }

                      // Convert markdown body (without frontmatter) to HTML before inserting
                      const htmlContent = await markdownToHtml(content);
                      // Insert streaming content into editor
                      editor.chain().focus().setContent(htmlContent).run();
                      // Notify parent that content was inserted
                      onContentInserted();
                    }}
                    className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Use this content
                  </button>
                </div>
              )}

            {/* Loading indicator when no content yet */}
            {isLoading && !streamingContent && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                    <span className="text-sm text-gray-500">
                      AI is thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-gray-200 p-6 bg-gray-50">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you'd like to write... (Enter to send, Shift+Enter for new line)"
                disabled={isLoading}
                rows={1}
                className={clsx(
                  "flex-1 resize-none rounded-md border border-gray-300 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className={clsx(
                  "px-4 py-3 rounded-md transition-colors font-medium text-sm",
                  !inputValue.trim() || isLoading
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                )}
                title="Send message"
                aria-label="Send message"
              >
                {isLoading ? (
                  <svg
                    className="w-5 h-5 animate-spin"
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
                ) : (
                  <svg
                    className="w-5 h-5"
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
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular side panel layout (for non-onboarding use)
  return (
    <div className="bg-white flex flex-col overflow-hidden shadow-xl border-l border-gray-200 flex-shrink-0 w-[500px] h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          AI Writing Assistant
        </h2>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Clear chat"
              aria-label="Clear chat"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            title="Close chat panel"
            aria-label="Close chat panel"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages Container */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.length === 0 && !isLoading && (
          <div className="text-center text-gray-500 mt-8">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p className="text-sm font-medium mb-2">Start a conversation</p>
            <p className="text-xs text-gray-400">
              Ask questions, request improvements, or generate content
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={clsx(
              "flex",
              message.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={clsx(
                "max-w-[85%] rounded-lg px-4 py-2",
                message.role === "user"
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-900"
              )}
            >
              {message.role === "assistant" ? (
                <div className="w-full">
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        p: ({ children, ...props }: any) => (
                          <p className="mb-3" {...props}>
                            {children}
                          </p>
                        ),
                        code: ({
                          node,
                          inline,
                          className,
                          children,
                          ...props
                        }: any) => {
                          const match = /language-(\w+)/.exec(className || "");
                          return !inline && match ? (
                            <pre className="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          ) : (
                            <code
                              className="bg-gray-200 px-1 rounded"
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap mb-3">
                  {message.content}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isLoading && streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2 max-w-[85%]">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    p: ({ children, ...props }: any) => (
                      <p className="mb-3" {...props}>
                        {children}
                      </p>
                    ),
                    code: ({
                      node,
                      inline,
                      className,
                      children,
                      ...props
                    }: any) => {
                      const match = /language-(\w+)/.exec(className || "");
                      return !inline && match ? (
                        <pre className="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto">
                          <code className={className} {...props}>
                            {children}
                          </code>
                        </pre>
                      ) : (
                        <code className="bg-gray-200 px-1 rounded" {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {streamingContent}
                </ReactMarkdown>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex gap-1">
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator when no content yet */}
        {isLoading && !streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
                <span className="text-sm text-gray-500">AI is thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
            disabled={isLoading}
            rows={1}
            className={clsx(
              "flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className={clsx(
              "p-2 rounded-md transition-colors",
              !inputValue.trim() || isLoading
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-900 text-white hover:bg-gray-800"
            )}
            title="Send message"
            aria-label="Send message"
          >
            <svg
              className="w-5 h-5"
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
          </button>
        </div>
      </div>
    </div>
  );
}
