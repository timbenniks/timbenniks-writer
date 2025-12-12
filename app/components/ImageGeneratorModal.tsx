"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";

interface ImageGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageSelected: (url: string) => void;
  articleContent?: string;
  articleTitle?: string;
}

interface GeneratedImage {
  base64: string;
  mimeType: string;
}

interface ConversationEntry {
  role: "user" | "assistant";
  content: string;
  image?: GeneratedImage;
}

export default function ImageGeneratorModal({
  isOpen,
  onClose,
  onImageSelected,
  articleContent,
  articleTitle,
}: ImageGeneratorModalProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSuggestingPrompt, setIsSuggestingPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [promptSuggested, setPromptSuggested] = useState(false);

  // Check if Gemini is configured
  useEffect(() => {
    const checkGeminiConfig = async () => {
      try {
        const response = await fetch("/api/gemini/config");
        const data = await response.json();
        setGeminiConfigured(data.configured);
      } catch {
        setGeminiConfigured(false);
      }
    };

    if (isOpen) {
      checkGeminiConfig();
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPrompt("");
      setError(null);
      setCurrentImage(null);
      setConversation([]);
      setPromptSuggested(false);
    }
  }, [isOpen]);

  // Auto-generate prompt suggestion when modal opens with article content
  useEffect(() => {
    const generatePromptSuggestion = async () => {
      if (!isOpen || !articleContent || promptSuggested || isSuggestingPrompt) return;
      
      // Only suggest if there's meaningful content
      const textContent = articleContent
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      
      if (textContent.length < 100) return;
      
      setIsSuggestingPrompt(true);
      setPromptSuggested(true);
      
      try {
        const response = await fetch("/api/openai/generate-image-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleContent: textContent.substring(0, 3000),
            articleTitle,
          }),
        });
        
        const data = await response.json();
        
        if (data.success && data.prompt) {
          setPrompt(data.prompt);
        }
      } catch (err) {
        console.error("Failed to generate prompt suggestion:", err);
        // Silently fail - user can still type their own prompt
      } finally {
        setIsSuggestingPrompt(false);
      }
    };
    
    generatePromptSuggestion();
  }, [isOpen, articleContent, articleTitle, promptSuggested, isSuggestingPrompt]);

  // Get article context for the prompt
  const getArticleContext = () => {
    const parts: string[] = [];
    if (articleTitle) {
      parts.push(`Title: ${articleTitle}`);
    }
    if (articleContent) {
      // Strip HTML tags and get first 1500 characters
      const textContent = articleContent
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      parts.push(`Content: ${textContent.substring(0, 1500)}`);
    }
    return parts.join("\n\n");
  };

  // Get previous feedback from conversation
  const getPreviousFeedback = () => {
    if (conversation.length === 0) return undefined;
    return conversation
      .filter((entry) => entry.role === "user")
      .map((entry) => entry.content)
      .join("\n\n");
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setError(null);

    // Add user message to conversation
    const userEntry: ConversationEntry = {
      role: "user",
      content: prompt,
    };
    setConversation((prev) => [...prev, userEntry]);
    setPrompt("");

    try {
      const response = await fetch("/api/gemini/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          articleContext: getArticleContext(),
          previousFeedback: getPreviousFeedback(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to generate image");
      }

      const generatedImage: GeneratedImage = {
        base64: data.image.base64,
        mimeType: data.image.mimeType,
      };

      setCurrentImage(generatedImage);

      // Add assistant response with image to conversation
      const assistantEntry: ConversationEntry = {
        role: "assistant",
        content: "Here's the generated image:",
        image: generatedImage,
      };
      setConversation((prev) => [...prev, assistantEntry]);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to generate image";
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadAndSelect = async () => {
    if (!currentImage) return;

    setIsUploading(true);
    setError(null);

    try {
      // Upload to Cloudinary using server-side credentials (env vars)
      const response = await fetch("/api/cloudinary/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: currentImage.base64,
          mimeType: currentImage.mimeType,
          folder: "website",
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to upload image");
      }

      // Pass the URL back to the editor
      onImageSelected(data.url);
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload image";
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isGenerating) {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="image-generator-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2
                id="image-generator-title"
                className="text-xl font-semibold text-gray-900"
              >
                Generate Cover Image
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Powered by Google Gemini Imagen 3
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
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

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {geminiConfigured === false ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-yellow-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Gemini API Not Configured
                  </h3>
                  <p className="text-gray-600 max-w-md">
                    To generate images, please add your Gemini API key to your
                    environment variables:
                  </p>
                  <code className="block mt-3 px-4 py-2 bg-gray-100 rounded-lg text-sm font-mono text-gray-800">
                    GEMINI_API_KEY=your_api_key_here
                  </code>
                </div>
              </div>
            ) : (
              <>
                {/* Image Display Area */}
                <div className="flex-1 overflow-y-auto p-6">
                  {conversation.length === 0 && !isGenerating ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-md">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-100 to-blue-100 rounded-2xl flex items-center justify-center">
                          {isSuggestingPrompt ? (
                            <div className="w-10 h-10 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                          ) : (
                            <svg
                              className="w-10 h-10 text-purple-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          {isSuggestingPrompt
                            ? "Analyzing your article..."
                            : "Describe your cover image"}
                        </h3>
                        <p className="text-gray-500 text-sm">
                          {isSuggestingPrompt
                            ? "AI is generating a creative image concept based on your article content."
                            : "The AI will use your article content as context to generate a relevant, professional cover image in 16:9 format."}
                        </p>
                        {articleTitle && !isSuggestingPrompt && (
                          <p className="mt-4 text-xs text-gray-400">
                            Article: &quot;{articleTitle}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {conversation.map((entry, index) => (
                        <div
                          key={index}
                          className={clsx(
                            "flex",
                            entry.role === "user"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          <div
                            className={clsx(
                              "max-w-[85%] rounded-2xl px-4 py-3",
                              entry.role === "user"
                                ? "bg-gray-900 text-white"
                                : "bg-gray-100 text-gray-900"
                            )}
                          >
                            <p className="text-sm">{entry.content}</p>
                            {entry.image && (
                              <div className="mt-3">
                                <img
                                  src={`data:${entry.image.mimeType};base64,${entry.image.base64}`}
                                  alt="Generated cover"
                                  className="w-full rounded-lg aspect-video object-cover"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {isGenerating && (
                        <div className="flex justify-start">
                          <div className="bg-gray-100 rounded-2xl px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                              <div
                                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0.1s" }}
                              />
                              <div
                                className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                                style={{ animationDelay: "0.2s" }}
                              />
                              <span className="ml-2 text-sm text-gray-500">
                                Generating image...
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Error Display */}
                {error && (
                  <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                {/* Action Buttons - Show when image is generated */}
                {currentImage && !isGenerating && (
                  <div className="px-6 pb-4 flex items-center gap-3">
                    <button
                      onClick={handleUploadAndSelect}
                      disabled={isUploading}
                      className={clsx(
                        "flex-1 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
                        isUploading
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-green-600 text-white hover:bg-green-700"
                      )}
                    >
                      {isUploading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                          Uploading to Cloudinary...
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
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
                          Use This Image
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Input Area */}
                <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          isSuggestingPrompt
                            ? "✨ Generating a prompt suggestion based on your article..."
                            : currentImage
                            ? "Give feedback to generate a new version..."
                            : "Describe the cover image you want..."
                        }
                        className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        rows={2}
                        disabled={isGenerating || isUploading || isSuggestingPrompt}
                      />
                    </div>
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim() || isGenerating || isUploading || isSuggestingPrompt}
                      className={clsx(
                        "px-4 py-3 rounded-xl font-medium transition-colors flex items-center gap-2",
                        !prompt.trim() || isGenerating || isUploading || isSuggestingPrompt
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : "bg-purple-600 text-white hover:bg-purple-700"
                      )}
                    >
                      {isGenerating ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : isSuggestingPrompt ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      )}
                      {currentImage ? "Regenerate" : "Generate"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-400 text-center">
                    Press Enter to generate • Images are created in 16:9 aspect
                    ratio
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

