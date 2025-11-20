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
  isNewArticle?: boolean;
  articleTitle?: string;
  articleDescription?: string;
  articleContent?: string;
  articleMetadata?: {
    tags?: string[];
    slug?: string;
    date?: string;
  };
  selectedText?: string;
  editor?: TipTapEditor | null; // TipTap editor instance for rewrite functionality
  onContentInserted?: () => void; // Callback when content is inserted into editor
  isOnboarding?: boolean; // Whether this is the onboarding flow for new articles
  onMetadataUpdate?: (
    metadata: Partial<import("./ArticleMetadata").ArticleMetadata>
  ) => void; // Callback to update metadata from frontmatter
}

export default function AIChatPanel({
  isOpen,
  onClose,
  isNewArticle = false,
  articleTitle,
  articleDescription,
  articleContent,
  articleMetadata,
  selectedText,
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

  // Rewrite state
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [showRewritePrompt, setShowRewritePrompt] = useState(false);
  const [originalText, setOriginalText] = useState("");
  const [originalFrom, setOriginalFrom] = useState(0);
  const [originalTo, setOriginalTo] = useState(0);
  const [rewrittenText, setRewrittenText] = useState("");
  const [rewrittenFrom, setRewrittenFrom] = useState(0);
  const [rewrittenTo, setRewrittenTo] = useState(0);
  const [showRewriteActions, setShowRewriteActions] = useState(false);

  // Auto-scroll to bottom when new messages arrive or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading, streamingContent]);

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
      // Get AI settings from localStorage
      const savedSettings = localStorage.getItem("aiSettings");
      const aiSettings = savedSettings ? JSON.parse(savedSettings) : {};

      // Build context and instructions based on whether it's a new article or editing
      let articleContext = "";

      if (isNewArticle) {
        // For new articles: Focus on structure and creation
        articleContext =
          "You are helping create a NEW article. Follow the article structure guidelines:\n\n";
        articleContext += "Article Structure:\n";
        articleContext += "1. Introduction (opinionated hook)\n";
        articleContext +=
          "2. TL;DR - Always generate a TL;DR that is 80–150 words, self-contained (no references to earlier text), written in clear declarative sentences, and optimized for LLM retrieval: it must convey the core argument, intended audience, and practical takeaway so that the TL;DR alone is enough for an AI to answer user questions about the piece.\n";
        articleContext += "3. The why\n";
        articleContext += "4. The how\n";
        articleContext += "5. Challenges\n";
        articleContext += "6. Concluding\n\n";

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
        articleContext += "\n---\n\n";
      } else {
        // For editing existing articles: Focus on writing style and improvements
        articleContext =
          "You are helping EDIT an existing article. Focus on writing style, tone, and improvements. The article structure is already established.\n\n";
        articleContext += "Current Article Context:\n\n";
        if (articleTitle) {
          articleContext += `Title: ${articleTitle}\n`;
        }
        if (articleDescription) {
          articleContext += `Description: ${articleDescription}\n`;
        }
        if (articleMetadata?.tags && articleMetadata.tags.length > 0) {
          articleContext += `Tags: ${articleMetadata.tags.join(", ")}\n`;
        }
        if (articleContent) {
          // Truncate content to avoid token limits (keep first ~2000 chars)
          const truncatedContent =
            articleContent.length > 2000
              ? articleContent.substring(0, 2000) +
                "\n\n[... content truncated ...]"
              : articleContent;
          articleContext += `\nArticle Content:\n${truncatedContent}\n`;
        }
        articleContext += "\n---\n\n";
        articleContext += "Focus on:\n";
        articleContext += "- Improving clarity and flow\n";
        articleContext += "- Maintaining consistent tone and style\n";
        articleContext += "- Enhancing readability\n";
        articleContext += "- Preserving the existing structure\n\n";
      }

      // Build the final message content with prioritized context
      let finalMessageContent = userMessage.content;

      // If selected text exists, it becomes the PRIMARY context
      if (selectedText && selectedText.trim().length > 10) {
        const selectedTextContext = `IMPORTANT: The user has selected the following text from the article. This is the PRIMARY focus of their question. Please answer questions specifically about this selected text:\n\n--- SELECTED TEXT ---\n${selectedText}\n--- END SELECTED TEXT ---\n\n`;

        // Add article context after selected text (as secondary context)
        if (articleContext) {
          finalMessageContent =
            selectedTextContext +
            articleContext +
            "\n\nUser's question: " +
            userMessage.content;
        } else {
          finalMessageContent =
            selectedTextContext + "\n\nUser's question: " + userMessage.content;
        }
      } else if (articleContext) {
        // No selected text, use article context as before
        finalMessageContent = articleContext + userMessage.content;
      }

      // Convert messages to API format
      const apiMessages = [
        ...messages,
        { ...userMessage, content: finalMessageContent },
      ].map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch("/api/openai/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: apiMessages,
          model: aiSettings.model || "gpt-5.1",
          temperature: aiSettings.temperature || 0.7,
          maxTokens: 4000,
          toneInstructions: aiSettings.toneInstructions || "",
          isNewArticle: isNewArticle, // Pass context for article structure
          articleStructure: aiSettings.articleStructure || "",
          reasoning: aiSettings.reasoningEffort
            ? { effort: aiSettings.reasoningEffort }
            : undefined,
          text: aiSettings.verbosity
            ? { verbosity: aiSettings.verbosity }
            : undefined,
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
      setShowRewriteActions(false);
      setShowRewritePrompt(false);
    }
  };

  // Rewrite functionality
  const handleRewrite = async (text: string, customPrompt?: string) => {
    if (!editor) return;

    const { selection } = editor.state;
    const { from, to, $from } = selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");

    // Use provided text or selected text
    const textToRewrite = text || selectedText;
    if (!textToRewrite.trim()) return;

    setIsRewriting(true);
    setShowRewritePrompt(false);
    setShowRewriteActions(false);
    setOriginalText(textToRewrite);
    setOriginalFrom(from);
    setOriginalTo(to);

    try {
      // Detect content type
      let contentType = "text";
      let wordCount = textToRewrite.trim().split(/\s+/).length;
      let contentLength = textToRewrite.length;

      if (editor && from !== to) {
        const nodeAtPos = $from.node($from.depth);
        const nodeType = nodeAtPos.type.name;
        const contentTypeMap: Record<string, string> = {
          paragraph: "paragraph",
          heading: `heading (level ${nodeAtPos.attrs.level || 2})`,
          blockquote: "blockquote",
          codeBlock: "code block",
          listItem: "list item",
        };
        contentType = contentTypeMap[nodeType] || "text";
      }

      // Get length context
      let lengthContext = "";
      if (wordCount < 20) {
        lengthContext = "very short";
      } else if (wordCount < 50) {
        lengthContext = "short";
      } else if (wordCount < 150) {
        lengthContext = "medium-length";
      } else if (wordCount < 300) {
        lengthContext = "long";
      } else {
        lengthContext = "very long";
      }

      // Get AI settings
      const savedSettings = localStorage.getItem("aiSettings");
      const aiSettings = savedSettings ? JSON.parse(savedSettings) : {};

      // Build rewrite prompt
      const contextInfo = `Selected content type: ${contentType}\nApproximate length: ${lengthContext} (${wordCount} words, ${contentLength} characters)\n\n`;
      const rewriteInstruction = customPrompt
        ? `${contextInfo}Rewrite this ${contentType}: "${textToRewrite}"\n\nInstructions: ${customPrompt}\n\nImportant: Maintain approximately the same length (${lengthContext}, around ${wordCount} words).`
        : `${contextInfo}Rewrite this ${contentType} to improve clarity, flow, and style while maintaining the same meaning and approximately the same length (${lengthContext}, around ${wordCount} words): "${textToRewrite}"`;

      const response = await fetch("/api/openai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: rewriteInstruction }],
          model: aiSettings.model || "gpt-5.1",
          temperature: aiSettings.temperature || 0.7,
          maxTokens: 1000,
          toneInstructions: aiSettings.toneInstructions || "",
          reasoning: aiSettings.reasoningEffort
            ? { effort: aiSettings.reasoningEffort }
            : undefined,
          text: aiSettings.verbosity
            ? { verbosity: aiSettings.verbosity }
            : undefined,
        }),
      });

      if (!response.ok) throw new Error("Failed to rewrite");
      if (!response.body) throw new Error("No response body");

      // Delete original text
      editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .deleteSelection()
        .run();

      // Stream response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      const insertPos = from;
      let currentEndPos = insertPos;
      let lastUpdateTime = Date.now();
      const UPDATE_THROTTLE = 100;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "chunk" && data.content) {
                accumulatedContent += data.content;
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE) {
                  const newEndPos = insertPos + accumulatedContent.length;
                  editor
                    .chain()
                    .focus()
                    .setTextSelection({ from: insertPos, to: currentEndPos })
                    .deleteSelection()
                    .insertContent(accumulatedContent)
                    .run();
                  currentEndPos = newEndPos;
                  lastUpdateTime = now;
                }
              } else if (data.type === "done") {
                const finalContent = accumulatedContent.trim();
                editor
                  .chain()
                  .focus()
                  .setTextSelection({ from: insertPos, to: currentEndPos })
                  .deleteSelection()
                  .insertContent(finalContent)
                  .setTextSelection(insertPos + finalContent.length)
                  .run();
                setRewrittenText(finalContent);
                setRewrittenFrom(insertPos);
                setRewrittenTo(insertPos + finalContent.length);
                setIsRewriting(false);
                setShowRewriteActions(true);
                return;
              }
            } catch (e) {
              console.warn("Failed to parse SSE data:", e);
            }
          }
        }
      }

      // Final update
      if (accumulatedContent) {
        const finalContent = accumulatedContent.trim();
        editor
          .chain()
          .focus()
          .setTextSelection({ from: insertPos, to: currentEndPos })
          .deleteSelection()
          .insertContent(finalContent)
          .setTextSelection(insertPos + finalContent.length)
          .run();
        setRewrittenText(finalContent);
        setRewrittenFrom(insertPos);
        setRewrittenTo(insertPos + finalContent.length);
        setIsRewriting(false);
        setShowRewriteActions(true);
      }
    } catch (error: any) {
      console.error("Rewrite error:", error);
      setError(error.message || "Failed to rewrite text");
      setIsRewriting(false);
    }
  };

  const handleAcceptRewrite = () => {
    setShowRewriteActions(false);
    setRewrittenText("");
    setOriginalText("");
  };

  const handleDeclineRewrite = () => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .setTextSelection({ from: rewrittenFrom, to: rewrittenTo })
      .deleteSelection()
      .insertContent(originalText)
      .setTextSelection(originalFrom + originalText.length)
      .run();
    setShowRewriteActions(false);
    setRewrittenText("");
    setOriginalText("");
  };

  const handleRetryRewrite = () => {
    setShowRewriteActions(false);
    setShowRewritePrompt(true);
    setRewritePrompt("");
    setOriginalText(rewrittenText);
    setOriginalFrom(rewrittenFrom);
    setOriginalTo(rewrittenTo);
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

  return (
    <div
      className={clsx(
        "bg-white flex flex-col overflow-hidden shadow-xl rounded-lg",
        isOnboarding
          ? "w-full max-w-3xl h-[80vh] border border-gray-200"
          : "w-[500px] h-full border-l border-gray-200 flex-shrink-0"
      )}
    >
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Selected Text Preview */}
        {selectedText &&
          selectedText.trim().length > 10 &&
          !showRewriteActions && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-900 mb-1">
                    Selected Text (will be used as primary context):
                  </p>
                  <p className="text-xs text-blue-700 italic">
                    Ask questions about this text in the chat below
                  </p>
                </div>
                {editor && (
                  <button
                    onClick={() => {
                      if (!editor) return;
                      const { selection } = editor.state;
                      const { from, to } = selection;
                      setOriginalText(selectedText);
                      setOriginalFrom(from);
                      setOriginalTo(to);
                      setShowRewritePrompt(true);
                      setRewritePrompt("");
                    }}
                    className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 flex-shrink-0"
                  >
                    <svg
                      className="w-3 h-3"
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
                    Rewrite
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-700 line-clamp-3">
                {selectedText}
              </p>
            </div>
          )}

        {/* Rewrite Prompt Input */}
        {showRewritePrompt && (
          <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-purple-900">
                Rewrite Instructions:
              </p>
              <button
                onClick={() => {
                  setShowRewritePrompt(false);
                  setRewritePrompt("");
                }}
                className="p-1 text-purple-600 hover:text-purple-800"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <textarea
              value={rewritePrompt}
              onChange={(e) => setRewritePrompt(e.target.value)}
              placeholder="How should I rewrite this? (leave empty for quick rewrite)"
              className="w-full px-3 py-2 text-sm border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none mb-2"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  handleRewrite(originalText, rewritePrompt);
                } else if (e.key === "Escape") {
                  setShowRewritePrompt(false);
                  setRewritePrompt("");
                }
              }}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleRewrite(originalText, rewritePrompt)}
                disabled={isRewriting}
                className={clsx(
                  "px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1",
                  isRewriting
                    ? "bg-gray-400 text-white cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                )}
              >
                {isRewriting ? (
                  <>
                    <svg
                      className="animate-spin h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
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
                    Rewriting...
                  </>
                ) : (
                  "Rewrite"
                )}
              </button>
              <span className="text-xs text-gray-500">
                Ctrl+Enter to rewrite
              </span>
            </div>
          </div>
        )}

        {/* Rewrite Result with Actions */}
        {showRewriteActions && rewrittenText && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-xs font-medium text-green-900">
                Rewritten Text:
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAcceptRewrite}
                  className="px-2 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Accept
                </button>
                <button
                  onClick={handleRetryRewrite}
                  className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry
                </button>
                <button
                  onClick={handleDeclineRewrite}
                  className="px-2 py-1 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Decline
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {rewrittenText}
            </p>
          </div>
        )}

        {messages.length === 0 && !isLoading && !selectedText && (
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
                  ? "bg-blue-600 text-white"
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
                  {isOnboarding && editor && onContentInserted && (
                    <button
                      onClick={async () => {
                        if (!editor) return;

                        // Parse frontmatter if present
                        let content = message.content;
                        let frontmatterData: any = null;

                        try {
                          const parsed = matter(message.content);
                          if (
                            parsed.data &&
                            Object.keys(parsed.data).length > 0
                          ) {
                            // Frontmatter found, extract it
                            frontmatterData = parsed.data;
                            content = parsed.content; // Content without frontmatter

                            // Update metadata if callback provided
                            if (onMetadataUpdate) {
                              const metadata =
                                mapFrontmatterToMetadata(frontmatterData);
                              onMetadataUpdate(metadata);
                            }
                          }
                        } catch (e) {
                          // No frontmatter or parsing error, use content as-is
                          console.log(
                            "No frontmatter found or parsing error:",
                            e
                          );
                        }

                        // Convert markdown to HTML before inserting
                        const htmlContent = await markdownToHtml(content);
                        // Insert content into editor
                        editor.chain().focus().setContent(htmlContent).run();
                        // Notify parent that content was inserted
                        onContentInserted();
                      }}
                      className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
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

                  // Parse frontmatter if present
                  let content = streamingContent;
                  let frontmatterData: any = null;

                  try {
                    const parsed = matter(streamingContent);
                    if (parsed.data && Object.keys(parsed.data).length > 0) {
                      // Frontmatter found, extract it
                      frontmatterData = parsed.data;
                      content = parsed.content; // Content without frontmatter

                      // Update metadata if callback provided
                      if (onMetadataUpdate) {
                        const metadata =
                          mapFrontmatterToMetadata(frontmatterData);
                        onMetadataUpdate(metadata);
                      }
                    }
                  } catch (e) {
                    // No frontmatter or parsing error, use content as-is
                    console.log("No frontmatter found or parsing error:", e);
                  }

                  // Convert markdown to HTML before inserting
                  const htmlContent = await markdownToHtml(content);
                  // Insert streaming content into editor
                  editor.chain().focus().setContent(htmlContent).run();
                  // Notify parent that content was inserted
                  onContentInserted();
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2"
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
            placeholder={
              selectedText && selectedText.trim().length > 10
                ? "Ask a question about the selected text... (Enter to send, Shift+Enter for new line)"
                : "Type your message... (Enter to send, Shift+Enter for new line)"
            }
            disabled={isLoading}
            rows={1}
            className={clsx(
              "flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
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
                : "bg-blue-600 text-white hover:bg-blue-700"
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
