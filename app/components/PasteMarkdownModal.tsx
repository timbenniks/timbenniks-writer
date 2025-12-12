"use client";

import { useState, useCallback } from "react";
import clsx from "clsx";
import matter from "gray-matter";
import { markdownToHtml, mapFrontmatterToMetadata } from "../utils/markdown";
import type { ArticleMetadata } from "./ArticleMetadata";

interface PasteMarkdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (htmlContent: string, metadata: Partial<ArticleMetadata>) => void;
}

/**
 * Detects if a string is markdown with frontmatter
 * Checks for the YAML frontmatter pattern: starts with --- and has closing ---
 */
export function isMarkdownWithFrontmatter(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("---")) return false;
  
  // Find the closing --- (must be on its own line)
  const lines = trimmed.split("\n");
  let foundClosing = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      foundClosing = true;
      break;
    }
  }
  
  return foundClosing;
}

/**
 * Parse markdown with frontmatter and return HTML content + metadata
 */
export async function parseMarkdownWithFrontmatter(
  markdown: string
): Promise<{ htmlContent: string; metadata: Partial<ArticleMetadata> } | null> {
  try {
    const trimmed = markdown.trim();
    
    // Verify it has frontmatter
    if (!isMarkdownWithFrontmatter(trimmed)) {
      return null;
    }
    
    // Parse frontmatter
    const parsed = matter(trimmed);
    const frontmatter = parsed.data;
    const bodyContent = parsed.content.trim();
    
    // Map frontmatter to metadata
    const metadata = mapFrontmatterToMetadata(frontmatter);
    
    // Convert markdown body to HTML
    const htmlContent = await markdownToHtml(bodyContent);
    
    return { htmlContent, metadata };
  } catch (error) {
    console.error("Failed to parse markdown:", error);
    return null;
  }
}

export default function PasteMarkdownModal({
  isOpen,
  onClose,
  onParsed,
}: PasteMarkdownModalProps) {
  const [pastedContent, setPastedContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = useCallback(async () => {
    if (!pastedContent.trim()) {
      setError("Please paste some markdown content first.");
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const result = await parseMarkdownWithFrontmatter(pastedContent);

      if (!result) {
        setError(
          "Could not parse the content. Make sure it starts with YAML frontmatter (---) and includes closing (---)."
        );
        setIsParsing(false);
        return;
      }

      onParsed(result.htmlContent, result.metadata);
      setPastedContent("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to parse markdown content.");
    } finally {
      setIsParsing(false);
    }
  }, [pastedContent, onParsed, onClose]);

  const handleClose = useCallback(() => {
    setPastedContent("");
    setError(null);
    onClose();
  }, [onClose]);

  // Preview detected frontmatter fields
  const previewMetadata = useCallback(() => {
    if (!pastedContent.trim() || !isMarkdownWithFrontmatter(pastedContent)) {
      return null;
    }
    
    try {
      const parsed = matter(pastedContent.trim());
      const fm = parsed.data;
      return {
        title: fm.title,
        description: fm.description?.slice(0, 100) + (fm.description?.length > 100 ? "..." : ""),
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        date: fm.date,
        hasContent: parsed.content.trim().length > 0,
      };
    } catch {
      return null;
    }
  }, [pastedContent])();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paste-markdown-title"
      >
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2
                id="paste-markdown-title"
                className="text-lg font-semibold text-gray-900"
              >
                Paste Markdown
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Paste a markdown article with frontmatter to import it
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="w-5 h-5 text-gray-500"
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

          {/* Content */}
          <div className="flex-1 overflow-auto p-6 space-y-4">
            {/* Error */}
            {error && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Textarea */}
            <div className="space-y-2">
              <label
                htmlFor="markdown-paste-area"
                className="block text-sm font-medium text-gray-700"
              >
                Markdown Content
              </label>
              <textarea
                id="markdown-paste-area"
                value={pastedContent}
                onChange={(e) => {
                  setPastedContent(e.target.value);
                  setError(null);
                }}
                placeholder={`Paste your markdown here...

---
title: My Article Title
description: A description of the article
tags: [tag1, tag2]
date: 2025-01-01
---

Your article content goes here...`}
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                disabled={isParsing}
              />
            </div>

            {/* Preview */}
            {previewMetadata && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-green-600"
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
                  Detected Frontmatter
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {previewMetadata.title && (
                    <div>
                      <span className="text-gray-500">Title:</span>{" "}
                      <span className="text-gray-900 font-medium">
                        {previewMetadata.title}
                      </span>
                    </div>
                  )}
                  {previewMetadata.date && (
                    <div>
                      <span className="text-gray-500">Date:</span>{" "}
                      <span className="text-gray-900">
                        {String(previewMetadata.date).split("T")[0]}
                      </span>
                    </div>
                  )}
                  {previewMetadata.tags.length > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Tags:</span>{" "}
                      <span className="text-gray-900">
                        {previewMetadata.tags.join(", ")}
                      </span>
                    </div>
                  )}
                  {previewMetadata.description && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Description:</span>{" "}
                      <span className="text-gray-900">
                        {previewMetadata.description}
                      </span>
                    </div>
                  )}
                </div>
                {previewMetadata.hasContent && (
                  <p className="text-xs text-green-600 mt-2">
                    ✓ Body content detected
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isParsing}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleParse}
              disabled={isParsing || !pastedContent.trim()}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                isParsing || !pastedContent.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              )}
            >
              {isParsing ? (
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
                  Parsing...
                </>
              ) : (
                <>
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Import Article
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

