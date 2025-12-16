"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import type { GitHubVideoFile } from "../types/video";
import { getContentstackCategory } from "../types/video";

interface BulkVideoExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: GitHubVideoFile[];
}

interface ExportResult {
  video: GitHubVideoFile;
  status: "pending" | "exporting" | "success" | "error";
  error?: string;
  entryUid?: string;
  isUpdate?: boolean;
  dashboardUrl?: string;
}

// Rate limiting delay between videos (2 seconds)
const RATE_LIMIT_DELAY = 2000;

export default function BulkVideoExportModal({
  isOpen,
  onClose,
  videos,
}: BulkVideoExportModalProps) {
  const [results, setResults] = useState<ExportResult[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Reset when modal opens or videos change
  useEffect(() => {
    if (isOpen) {
      setResults(videos.map((video) => ({ video, status: "pending" })));
      setIsExporting(false);
      setExportComplete(false);
      setCurrentIndex(-1);
    }
  }, [isOpen, videos]);

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const exportSingleVideo = async (
    video: GitHubVideoFile,
    _videosFolderUid: string | null
  ): Promise<{
    success: boolean;
    error?: string;
    entryUid?: string;
    isUpdate?: boolean;
    dashboardUrl?: string;
  }> => {
    const frontmatter = video.frontmatter;

    try {
      // Check for existing entry
      const checkResponse = await fetch("/api/contentstack/videos/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: frontmatter.title,
          videoId: frontmatter.videoId,
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

      // Add video category if playlist has a mapping
      const categoryUid = getContentstackCategory(frontmatter.playlist);
      if (categoryUid) {
        taxonomyRefs.push({
          taxonomy_uid: "video_categories",
          term_uid: categoryUid,
        });
      }

      // Add content tags
      const tags = frontmatter.tags || [];
      for (const tag of tags) {
        const termUid = tag
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");

        // Try to create the term
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

      // Build entry payload
      const entryPayload: Record<string, unknown> = {
        title: frontmatter.title,
        video_id: frontmatter.videoId,
        description: frontmatter.description || "",
        transcript: frontmatter.transcript || "",
        date: frontmatter.date
          ? frontmatter.date.includes("T")
            ? frontmatter.date
            : `${frontmatter.date}T10:00:00.000Z`
          : new Date().toISOString(),
      };

      // Use image URL directly instead of uploading as asset
      if (frontmatter.image) {
        entryPayload.image_url = frontmatter.image;
      }

      if (taxonomyRefs.length > 0) {
        entryPayload.taxonomies = taxonomyRefs;
      }

      // Create or update entry
      let response;
      if (entryUid) {
        response = await fetch("/api/contentstack/videos/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryUid,
            entry: entryPayload,
          }),
        });
      } else {
        response = await fetch("/api/contentstack/videos/create", {
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

      return {
        success: true,
        entryUid: entryData.entry?.uid || entryUid,
        isUpdate,
        dashboardUrl: entryData.entry?.dashboardUrl,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportComplete(false);

    // Reset all results to pending
    setResults(videos.map((video) => ({ video, status: "pending" })));

    // Export videos sequentially with rate limiting
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      setCurrentIndex(i);

      // Update status to exporting
      setResults((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "exporting" } : r))
      );

      const result = await exportSingleVideo(video, null);

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

      // Rate limit delay between videos (except for last one)
      if (i < videos.length - 1) {
        await delay(RATE_LIMIT_DELAY);
      }
    }

    setIsExporting(false);
    setExportComplete(true);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const updateCount = results.filter(
    (r) => r.status === "success" && r.isUpdate
  ).length;
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
                Export Videos to Contentstack
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
              {videos.length} video{videos.length !== 1 ? "s" : ""} selected
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {!isExporting && !exportComplete && (
              <div className="space-y-4">
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-lg">
                  <p className="text-sm text-purple-800">
                    This will export {videos.length} video
                    {videos.length !== 1 ? "s" : ""} to Contentstack. Each video
                    will be checked for duplicates before creating/updating.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900">
                    Videos to export:
                  </h3>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {videos.map((video) => (
                      <li
                        key={video.sha}
                        className="text-sm text-gray-600 flex items-center gap-2"
                      >
                        <span className="w-2 h-2 bg-purple-400 rounded-full flex-shrink-0" />
                        <span className="truncate">
                          {video.frontmatter.title}
                        </span>
                        {video.frontmatter.playlist && (
                          <span className="text-xs text-gray-400">
                            ({video.frontmatter.playlist})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Progress */}
            {isExporting && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Exporting video {currentIndex + 1} of {videos.length}...
                  </span>
                  <span className="text-gray-500">
                    {Math.round(((currentIndex + 1) / videos.length) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((currentIndex + 1) / videos.length) * 100}%`,
                    }}
                  />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {results.map((result, idx) => (
                    <div
                      key={result.video.sha}
                      className={clsx(
                        "flex items-center gap-2 text-sm p-2 rounded",
                        result.status === "exporting" && "bg-purple-50",
                        result.status === "success" && "bg-green-50",
                        result.status === "error" && "bg-red-50",
                        result.status === "pending" && "bg-gray-50"
                      )}
                    >
                      {result.status === "pending" && (
                        <span className="w-4 h-4 text-gray-400">○</span>
                      )}
                      {result.status === "exporting" && (
                        <svg
                          className="animate-spin h-4 w-4 text-purple-600"
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
                      <span
                        className={clsx(
                          "truncate flex-1",
                          result.status === "exporting" && "text-purple-700",
                          result.status === "success" && "text-green-700",
                          result.status === "error" && "text-red-700",
                          result.status === "pending" && "text-gray-500"
                        )}
                      >
                        {result.video.frontmatter.title}
                      </span>
                      {result.isUpdate && result.status === "success" && (
                        <span className="text-xs text-amber-600">
                          (updated)
                        </span>
                      )}
                      {result.error && (
                        <span className="text-xs text-red-600 truncate max-w-[150px]">
                          {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Complete */}
            {exportComplete && (
              <div className="space-y-4">
                <div
                  className={clsx(
                    "p-4 rounded-lg",
                    errorCount > 0
                      ? "bg-amber-50 border border-amber-200"
                      : "bg-green-50 border border-green-200"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {errorCount > 0 ? (
                      <svg
                        className="w-5 h-5 text-amber-600 mt-0.5"
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
                    ) : (
                      <svg
                        className="w-5 h-5 text-green-600 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    )}
                    <div>
                      <h3
                        className={clsx(
                          "font-medium",
                          errorCount > 0 ? "text-amber-800" : "text-green-800"
                        )}
                      >
                        Export Complete
                      </h3>
                      <p
                        className={clsx(
                          "text-sm mt-1",
                          errorCount > 0 ? "text-amber-700" : "text-green-700"
                        )}
                      >
                        {createCount > 0 && `${createCount} created`}
                        {createCount > 0 && updateCount > 0 && ", "}
                        {updateCount > 0 && `${updateCount} updated`}
                        {errorCount > 0 && `, ${errorCount} failed`}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {results.map((result) => (
                    <div
                      key={result.video.sha}
                      className={clsx(
                        "flex items-center gap-2 text-sm p-2 rounded",
                        result.status === "success" && "bg-green-50",
                        result.status === "error" && "bg-red-50"
                      )}
                    >
                      {result.status === "success" ? (
                        <svg
                          className="w-4 h-4 text-green-600 flex-shrink-0"
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
                      ) : (
                        <svg
                          className="w-4 h-4 text-red-600 flex-shrink-0"
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
                      <span className="truncate flex-1">
                        {result.video.frontmatter.title}
                      </span>
                      {result.isUpdate && (
                        <span className="text-xs text-amber-600">
                          (updated)
                        </span>
                      )}
                      {result.dashboardUrl && (
                        <a
                          href={result.dashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-600 hover:text-purple-700"
                        >
                          View →
                        </a>
                      )}
                      {result.error && (
                        <span className="text-xs text-red-600">
                          {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            {!isExporting && !exportComplete && (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartExport}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors"
                >
                  Start Export
                </button>
              </>
            )}
            {exportComplete && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
