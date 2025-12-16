"use client";

import { useState } from "react";
import clsx from "clsx";
import type { GitHubFile } from "../types/github";
import type { GitHubConfig } from "../types/github";
import { htmlToContentstackRte } from "../utils/contentstackRte";
import { markdownToHtml, mapFrontmatterToMetadata } from "../utils/markdown";

interface BulkContentstackExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: GitHubFile[];
  githubConfig: GitHubConfig;
}

interface ExportResult {
  file: GitHubFile;
  status: "pending" | "exporting" | "success" | "error";
  error?: string;
  entryUid?: string;
  isUpdate?: boolean;
  dashboardUrl?: string;
}

// Rate limiting delay between articles (2 seconds)
const RATE_LIMIT_DELAY = 2000;

export default function BulkContentstackExportModal({
  isOpen,
  onClose,
  files,
  githubConfig,
}: BulkContentstackExportModalProps) {
  const [results, setResults] = useState<ExportResult[]>(
    files.map((file) => ({ file, status: "pending" }))
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Reset when files change
  useState(() => {
    setResults(files.map((file) => ({ file, status: "pending" })));
    setIsExporting(false);
    setExportComplete(false);
    setCurrentIndex(-1);
  });

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const exportSingleArticle = async (
    file: GitHubFile,
    index: number,
    articlesFolderUid: string | null
  ): Promise<{
    success: boolean;
    error?: string;
    entryUid?: string;
    isUpdate?: boolean;
    dashboardUrl?: string;
  }> => {
    try {
      // Load file content from GitHub
      const loadResponse = await fetch("/api/github/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath: file.path,
        }),
      });

      const loadData = await loadResponse.json();
      if (!loadData.success) {
        return {
          success: false,
          error: loadData.error || "Failed to load file",
        };
      }

      // Parse frontmatter and content
      const metadata = mapFrontmatterToMetadata(loadData.frontmatter || {});
      const htmlContent = await markdownToHtml(loadData.content || "");

      // Build URL
      const slug = metadata.slug || file.name.replace(/\.(md|markdown)$/i, "");
      const url = slug.startsWith("/writing/") ? slug : `/writing/${slug}`;

      // Check for existing entry
      const checkResponse = await fetch("/api/contentstack/entries/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: metadata.title || file.frontmatter?.title,
          url,
        }),
      });

      const checkData = await checkResponse.json();
      let entryUid: string | null = null;
      let isUpdate = false;

      if (checkData.exists) {
        entryUid = checkData.entry.uid;
        isUpdate = true;
      }

      // Process taxonomies
      const taxonomyRefs: Array<{ taxonomy_uid: string; term_uid: string }> =
        [];
      const tags = metadata.tags || [];

      for (const tag of tags) {
        const termUid = tag
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");

        // Try to create the term (will succeed or indicate it exists)
        await fetch("/api/contentstack/taxonomy-term", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            termUid,
            termName: tag,
          }),
        });

        taxonomyRefs.push({
          taxonomy_uid: "content_tags",
          term_uid: termUid,
        });

        await delay(100); // Small delay between taxonomy operations
      }

      // Upload thumbnail
      let thumbnailUid: string | null = null;
      const heroImage = metadata.heroImage || metadata.image;

      if (heroImage) {
        const assetResponse = await fetch("/api/contentstack/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: heroImage,
            title: `${slug.replace(/\//g, "-")}-thumbnail`,
            description: `Thumbnail for ${metadata.title}`,
            folder: articlesFolderUid,
          }),
        });

        const assetData = await assetResponse.json();
        if (assetResponse.ok && assetData.asset?.uid) {
          thumbnailUid = assetData.asset.uid;
        }
      }

      // Convert content to JSON RTE
      const jsonRteContent = htmlToContentstackRte(htmlContent);

      // Build entry payload
      const entryPayload: any = {
        title: metadata.title || file.frontmatter?.title || file.name,
        url,
        description: metadata.description || "",
        date: metadata.date
          ? metadata.date.includes("T")
            ? metadata.date
            : `${metadata.date}T10:00:00.000Z`
          : new Date().toISOString(),
        content: jsonRteContent,
      };

      if (metadata.canonicalUrl) {
        entryPayload.canonical_url = metadata.canonicalUrl;
      }
      if (metadata.readingTime) {
        entryPayload.reading_time = metadata.readingTime;
      }
      // Note: Thumbnail is linked in a separate update step after creation
      if (taxonomyRefs.length > 0) {
        entryPayload.taxonomies = taxonomyRefs;
      }
      if (metadata.faqs && metadata.faqs.length > 0) {
        entryPayload.faqs = metadata.faqs
          .filter((faq) => faq.question && faq.answer)
          .map((faq) => ({
            qa: {
              question: faq.question,
              answer: faq.answer,
            },
          }));
      }

      // Create or update entry
      let response;
      if (entryUid) {
        response = await fetch("/api/contentstack/entries/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryUid,
            entry: entryPayload,
          }),
        });
      } else {
        response = await fetch("/api/contentstack/entries/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: entryPayload,
          }),
        });
      }

      const entryData = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: entryData.error || "Failed to save entry",
        };
      }

      const finalEntryUid = entryData.entry?.uid || entryUid;

      // Link thumbnail in separate update if we have one
      if (thumbnailUid && finalEntryUid) {
        try {
          await fetch("/api/contentstack/entries/update", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entryUid: finalEntryUid,
              entry: {
                thumbnail: thumbnailUid,
              },
            }),
          });
        } catch (thumbError) {
          // Log but don't fail the whole export if thumbnail linking fails
          console.warn("Failed to link thumbnail:", thumbError);
        }
      }

      return {
        success: true,
        entryUid: finalEntryUid,
        isUpdate,
        dashboardUrl: entryData.entry?.dashboardUrl,
      };
    } catch (error: any) {
      return { success: false, error: error.message || "Unknown error" };
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportComplete(false);

    // Reset all results to pending
    setResults(files.map((file) => ({ file, status: "pending" })));

    // Get or create the "articles" folder once for all uploads
    let articlesFolderUid: string | null = null;
    try {
      const folderResponse = await fetch(
        "/api/contentstack/folders?name=articles"
      );
      const folderData = await folderResponse.json();

      if (folderData.success && folderData.folder?.uid) {
        articlesFolderUid = folderData.folder.uid;
      } else {
        // Create the folder
        const createFolderResponse = await fetch("/api/contentstack/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "articles" }),
        });
        const createFolderData = await createFolderResponse.json();

        if (createFolderData.success && createFolderData.folder?.uid) {
          articlesFolderUid = createFolderData.folder.uid;
        }
      }
    } catch (folderError) {
      console.warn("Failed to get/create articles folder:", folderError);
      // Continue without folder - assets will be uploaded to root
    }

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i);

      // Update current file to exporting
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "exporting" } : r))
      );

      // Export the article
      const result = await exportSingleArticle(files[i], i, articlesFolderUid);

      // Update result
      setResults((prev) =>
        prev.map((r, idx) =>
          idx === i
            ? {
                ...r,
                status: result.success ? "success" : "error",
                error: result.error,
                entryUid: result.entryUid,
                isUpdate: result.isUpdate,
                dashboardUrl: result.dashboardUrl,
              }
            : r
        )
      );

      // Rate limiting delay before next article (except for the last one)
      if (i < files.length - 1) {
        await delay(RATE_LIMIT_DELAY);
      }
    }

    setIsExporting(false);
    setExportComplete(true);
    setCurrentIndex(-1);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const updateCount = results.filter((r) => r.isUpdate).length;
  const createCount = successCount - updateCount;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={!isExporting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Bulk Export to Contentstack
              </h2>
              {!isExporting && (
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                  aria-label="Close"
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
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
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {files.length} article{files.length !== 1 ? "s" : ""} selected
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {!isExporting && !exportComplete && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This will export {files.length}{" "}
                    article{files.length !== 1 ? "s" : ""} to Contentstack.
                    Articles with matching titles or URLs will be updated. This
                    may take several minutes due to rate limiting (2 seconds
                    between articles).
                  </p>
                  <p className="text-sm text-yellow-700 mt-2">
                    Estimated time:{" "}
                    {Math.ceil((files.length * RATE_LIMIT_DELAY) / 1000 / 60)}{" "}
                    minute{files.length > 30 ? "s" : ""}
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900">
                    Articles to export:
                  </h3>
                  <ul className="space-y-1 max-h-40 overflow-y-auto">
                    {files.map((file) => (
                      <li
                        key={file.sha}
                        className="text-sm text-gray-600 flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                        {file.frontmatter?.title ||
                          file.name.replace(/\.(md|markdown)$/i, "")}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {(isExporting || exportComplete) && (
              <div className="space-y-4">
                {/* Progress */}
                {isExporting && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <svg
                        className="w-5 h-5 text-blue-600 animate-spin"
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
                      <span className="text-sm text-blue-800">
                        Exporting article {currentIndex + 1} of {files.length}
                        ...
                      </span>
                    </div>
                    <div className="mt-3 w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${
                            ((currentIndex + 1) / files.length) * 100
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Results list */}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {results.map((result, idx) => (
                    <div
                      key={result.file.sha}
                      className={clsx(
                        "flex items-center gap-3 p-2 rounded-md",
                        result.status === "success" && "bg-green-50",
                        result.status === "error" && "bg-red-50",
                        result.status === "exporting" && "bg-blue-50",
                        result.status === "pending" && "bg-gray-50"
                      )}
                    >
                      {/* Status icon */}
                      {result.status === "pending" && (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                      {result.status === "exporting" && (
                        <svg
                          className="w-4 h-4 text-blue-600 animate-spin"
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
                      )}
                      {result.status === "success" && (
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
                      )}
                      {result.status === "error" && (
                        <svg
                          className="w-4 h-4 text-red-600"
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
                      )}

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className={clsx(
                            "text-sm truncate",
                            result.status === "success" && "text-green-800",
                            result.status === "error" && "text-red-800",
                            result.status === "exporting" && "text-blue-800",
                            result.status === "pending" && "text-gray-500"
                          )}
                        >
                          {result.file.frontmatter?.title ||
                            result.file.name.replace(/\.(md|markdown)$/i, "")}
                        </p>
                        {result.status === "success" && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-green-600">
                              {result.isUpdate ? "Updated" : "Created"}
                            </span>
                            {result.dashboardUrl && (
                              <a
                                href={result.dashboardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-700 hover:text-green-800 underline inline-flex items-center gap-0.5"
                              >
                                Open
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
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                  />
                                </svg>
                              </a>
                            )}
                          </div>
                        )}
                        {result.error && (
                          <p className="text-xs text-red-600 truncate">
                            {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                {exportComplete && (
                  <div
                    className={clsx(
                      "p-4 rounded-lg border",
                      errorCount === 0
                        ? "bg-green-50 border-green-200"
                        : errorCount === files.length
                        ? "bg-red-50 border-red-200"
                        : "bg-yellow-50 border-yellow-200"
                    )}
                  >
                    <p className="font-medium">
                      {errorCount === 0
                        ? "Export Complete!"
                        : errorCount === files.length
                        ? "Export Failed"
                        : "Export Complete with Errors"}
                    </p>
                    <p className="text-sm mt-1">
                      {successCount} succeeded ({createCount} created,{" "}
                      {updateCount} updated), {errorCount} failed
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isExporting}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                isExporting
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              )}
            >
              {exportComplete ? "Close" : "Cancel"}
            </button>
            {!exportComplete && (
              <button
                onClick={handleStartExport}
                disabled={isExporting}
                className={clsx(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                  isExporting
                    ? "bg-purple-400 text-white cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                )}
              >
                {isExporting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
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
                    Exporting...
                  </>
                ) : (
                  `Export ${files.length} Article${
                    files.length !== 1 ? "s" : ""
                  }`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
