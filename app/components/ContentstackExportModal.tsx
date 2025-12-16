"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import type { ArticleMetadata } from "./ArticleMetadata";
import { htmlToContentstackRte } from "../utils/contentstackRte";

interface ContentstackExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  articleMetadata: ArticleMetadata;
  articleHtml: string;
}

interface ExportStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "error";
  error?: string;
  detail?: string;
}

export default function ContentstackExportModal({
  isOpen,
  onClose,
  articleMetadata,
  articleHtml,
}: ContentstackExportModalProps) {
  const [steps, setSteps] = useState<ExportStep[]>([
    { id: "check", label: "Checking for existing entry", status: "pending" },
    { id: "taxonomies", label: "Processing tags", status: "pending" },
    { id: "image", label: "Uploading thumbnail", status: "pending" },
    { id: "content", label: "Converting content", status: "pending" },
    { id: "entry", label: "Creating/updating entry", status: "pending" },
    { id: "thumbnail", label: "Linking thumbnail", status: "pending" },
  ]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [existingEntry, setExistingEntry] = useState<{
    uid: string;
    title: string;
    url: string;
  } | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSteps([
        {
          id: "check",
          label: "Checking for existing entry",
          status: "pending",
        },
        { id: "taxonomies", label: "Processing tags", status: "pending" },
        { id: "image", label: "Uploading thumbnail", status: "pending" },
        { id: "content", label: "Converting content", status: "pending" },
        { id: "entry", label: "Creating/updating entry", status: "pending" },
        { id: "thumbnail", label: "Linking thumbnail", status: "pending" },
      ]);
      setIsExporting(false);
      setExportComplete(false);
      setExportError(null);
      setEntryUrl(null);
      setExistingEntry(null);
    }
  }, [isOpen]);

  const updateStep = (stepId: string, updates: Partial<ExportStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, ...updates } : step))
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportError(null);

    try {
      // Step 1: Check for existing entry
      updateStep("check", { status: "in_progress" });

      const url = articleMetadata.slug.startsWith("/writing/")
        ? articleMetadata.slug
        : `/writing/${articleMetadata.slug}`;

      const checkResponse = await fetch("/api/contentstack/entries/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: articleMetadata.title,
          url,
        }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        throw new Error(
          checkData.error || "Failed to check for existing entry"
        );
      }

      let entryUid: string | null = null;
      if (checkData.exists) {
        setExistingEntry(checkData.entry);
        entryUid = checkData.entry.uid;
        updateStep("check", {
          status: "completed",
          detail: `Found existing entry: ${checkData.entry.title}`,
        });
      } else {
        updateStep("check", {
          status: "completed",
          detail: "Creating new entry",
        });
      }

      // Step 2: Process taxonomies
      updateStep("taxonomies", { status: "in_progress" });

      const taxonomyRefs: Array<{ taxonomy_uid: string; term_uid: string }> =
        [];
      const tags = articleMetadata.tags || [];

      // First, get existing terms
      const taxonomiesResponse = await fetch("/api/contentstack/taxonomies");
      const taxonomiesData = await taxonomiesResponse.json();
      const existingTerms = new Set(
        (taxonomiesData.terms || []).map((t: any) => t.uid)
      );

      // Process each tag
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i]
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "");

        updateStep("taxonomies", {
          status: "in_progress",
          detail: `Processing tag ${i + 1}/${tags.length}: ${tags[i]}`,
        });

        if (!existingTerms.has(tag)) {
          // Create the term
          const createResponse = await fetch(
            "/api/contentstack/taxonomy-term",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                termUid: tag,
                termName: tags[i],
              }),
            }
          );

          const createData = await createResponse.json();

          if (!createResponse.ok && !createData.alreadyExists) {
            console.warn(
              `Failed to create taxonomy term: ${tag}`,
              createData.error
            );
            // Continue anyway - the term might already exist with different casing
          }
        }

        taxonomyRefs.push({
          taxonomy_uid: "content_tags",
          term_uid: tag,
        });

        // Small delay between taxonomy operations
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      updateStep("taxonomies", {
        status: "completed",
        detail: `Processed ${tags.length} tags`,
      });

      // Step 3: Upload thumbnail
      updateStep("image", { status: "in_progress" });

      let thumbnailUid: string | null = null;
      const heroImage = articleMetadata.heroImage || articleMetadata.image;

      if (heroImage) {
        // Get or create the "articles" folder
        updateStep("image", { detail: "Checking for articles folder..." });

        let folderUid: string | null = null;

        // First, try to find existing folder
        const folderResponse = await fetch(
          "/api/contentstack/folders?name=articles"
        );
        const folderData = await folderResponse.json();

        if (folderData.success && folderData.folder?.uid) {
          folderUid = folderData.folder.uid;
        } else {
          // Create the folder
          updateStep("image", { detail: "Creating articles folder..." });
          const createFolderResponse = await fetch(
            "/api/contentstack/folders",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "articles" }),
            }
          );
          const createFolderData = await createFolderResponse.json();

          if (createFolderData.success && createFolderData.folder?.uid) {
            folderUid = createFolderData.folder.uid;
          }
        }

        updateStep("image", { detail: "Uploading image to Contentstack..." });

        const assetResponse = await fetch("/api/contentstack/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: heroImage,
            title: `${articleMetadata.slug}-thumbnail`,
            description: `Thumbnail for ${articleMetadata.title}`,
            folder: folderUid,
          }),
        });

        const assetData = await assetResponse.json();

        if (assetResponse.ok && assetData.asset?.uid) {
          thumbnailUid = assetData.asset.uid;
          updateStep("image", {
            status: "completed",
            detail: `Image uploaded to articles folder`,
          });
        } else {
          updateStep("image", {
            status: "error",
            error: assetData.error || "Failed to upload image",
            detail: "Continuing without thumbnail",
          });
        }
      } else {
        updateStep("image", {
          status: "completed",
          detail: "No thumbnail to upload",
        });
      }

      // Step 4: Convert content to JSON RTE
      updateStep("content", { status: "in_progress" });

      const jsonRteContent = htmlToContentstackRte(articleHtml);

      updateStep("content", {
        status: "completed",
        detail: `Converted ${jsonRteContent.children.length} content blocks`,
      });

      // Step 5: Create or update entry
      updateStep("entry", { status: "in_progress" });

      // Build the entry payload
      const entryPayload: any = {
        title: articleMetadata.title,
        url,
        description: articleMetadata.description,
        date: articleMetadata.date
          ? articleMetadata.date.includes("T")
            ? articleMetadata.date
            : `${articleMetadata.date}T10:00:00.000Z`
          : new Date().toISOString(),
        content: jsonRteContent,
      };

      // Add optional fields
      if (articleMetadata.canonicalUrl) {
        entryPayload.canonical_url = articleMetadata.canonicalUrl;
      }
      if (articleMetadata.readingTime) {
        entryPayload.reading_time = articleMetadata.readingTime;
      }
      // Note: Thumbnail is added in a separate update step after creation
      // This works around issues with file field format during entry creation
      if (taxonomyRefs.length > 0) {
        entryPayload.taxonomies = taxonomyRefs;
      }
      if (articleMetadata.faqs && articleMetadata.faqs.length > 0) {
        entryPayload.faqs = articleMetadata.faqs
          .filter((faq) => faq.question && faq.answer)
          .map((faq) => ({
            qa: {
              question: faq.question,
              answer: faq.answer,
            },
          }));
      }

      let response;
      if (entryUid) {
        // Update existing entry
        updateStep("entry", { detail: "Updating existing entry..." });
        response = await fetch("/api/contentstack/entries/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entryUid,
            entry: entryPayload,
          }),
        });
      } else {
        // Create new entry
        updateStep("entry", { detail: "Creating new entry..." });
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
        throw new Error(entryData.error || "Failed to save entry");
      }

      // Get the entry UID (from creation response or existing)
      const finalEntryUid = entryData.entry?.uid || entryUid;

      updateStep("entry", {
        status: "completed",
        detail: entryUid
          ? "Entry updated successfully"
          : "Entry created successfully",
      });

      // Step 6: Link thumbnail (if we have one)
      if (thumbnailUid && finalEntryUid) {
        updateStep("thumbnail", {
          status: "in_progress",
          detail: "Linking thumbnail to entry...",
        });

        try {
          const thumbnailResponse = await fetch(
            "/api/contentstack/entries/update",
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                entryUid: finalEntryUid,
                entry: {
                  thumbnail: thumbnailUid,
                },
              }),
            }
          );

          const thumbnailData = await thumbnailResponse.json();

          if (thumbnailResponse.ok) {
            updateStep("thumbnail", {
              status: "completed",
              detail: "Thumbnail linked successfully",
            });
          } else {
            updateStep("thumbnail", {
              status: "error",
              error: thumbnailData.error || "Failed to link thumbnail",
              detail: "Entry created but thumbnail not linked",
            });
          }
        } catch (thumbError: any) {
          updateStep("thumbnail", {
            status: "error",
            error: thumbError.message || "Failed to link thumbnail",
            detail: "Entry created but thumbnail not linked",
          });
        }
      } else {
        updateStep("thumbnail", {
          status: "completed",
          detail: thumbnailUid
            ? "No entry UID to link"
            : "No thumbnail to link",
        });
      }

      // Set entry URL from API response
      if (entryData.entry?.dashboardUrl) {
        setEntryUrl(entryData.entry.dashboardUrl);
      }

      setExportComplete(true);
    } catch (error: any) {
      console.error("Contentstack export error:", error);
      setExportError(error.message || "Failed to export to Contentstack");

      // Mark current step as error
      setSteps((prev) =>
        prev.map((step) =>
          step.status === "in_progress"
            ? { ...step, status: "error", error: error.message }
            : step
        )
      );
    } finally {
      setIsExporting(false);
    }
  };

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
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Export to Contentstack
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
              {articleMetadata.title || "Untitled Article"}
            </p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
            {!isExporting && !exportComplete && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">
                    Article Details
                  </h3>
                  <dl className="space-y-1 text-sm">
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Title:</dt>
                      <dd className="text-gray-900">
                        {articleMetadata.title || "Untitled"}
                      </dd>
                    </div>
                    <div className="flex">
                      <dt className="text-gray-500 w-24">URL:</dt>
                      <dd className="text-gray-900">
                        {articleMetadata.slug.startsWith("/writing/")
                          ? articleMetadata.slug
                          : `/writing/${articleMetadata.slug}`}
                      </dd>
                    </div>
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Tags:</dt>
                      <dd className="text-gray-900">
                        {articleMetadata.tags?.length > 0
                          ? articleMetadata.tags.join(", ")
                          : "None"}
                      </dd>
                    </div>
                    <div className="flex">
                      <dt className="text-gray-500 w-24">Thumbnail:</dt>
                      <dd className="text-gray-900">
                        {articleMetadata.heroImage || articleMetadata.image
                          ? "Yes"
                          : "None"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <p className="text-sm text-gray-600">
                  This will export your article to Contentstack. If an entry
                  with the same title or URL exists, it will be updated.
                </p>
              </div>
            )}

            {(isExporting || exportComplete) && (
              <div className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={clsx(
                      "flex items-start gap-3 p-3 rounded-lg transition-colors",
                      step.status === "completed" && "bg-green-50",
                      step.status === "error" && "bg-red-50",
                      step.status === "in_progress" && "bg-blue-50",
                      step.status === "pending" && "bg-gray-50"
                    )}
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {step.status === "pending" && (
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                      )}
                      {step.status === "in_progress" && (
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
                      )}
                      {step.status === "completed" && (
                        <svg
                          className="w-5 h-5 text-green-600"
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
                      {step.status === "error" && (
                        <svg
                          className="w-5 h-5 text-red-600"
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
                    </div>

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <p
                        className={clsx(
                          "font-medium",
                          step.status === "completed" && "text-green-800",
                          step.status === "error" && "text-red-800",
                          step.status === "in_progress" && "text-blue-800",
                          step.status === "pending" && "text-gray-500"
                        )}
                      >
                        {step.label}
                      </p>
                      {step.detail && (
                        <p
                          className={clsx(
                            "text-sm mt-0.5",
                            step.status === "completed" && "text-green-600",
                            step.status === "error" && "text-red-600",
                            step.status === "in_progress" && "text-blue-600",
                            step.status === "pending" && "text-gray-400"
                          )}
                        >
                          {step.detail}
                        </p>
                      )}
                      {step.error && (
                        <p className="text-sm text-red-600 mt-0.5">
                          {step.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Export error */}
            {exportError && !isExporting && (
              <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-800">
                  Export Failed
                </p>
                <p className="text-sm text-red-600 mt-1">{exportError}</p>
              </div>
            )}

            {/* Success message */}
            {exportComplete && !exportError && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-medium text-green-800">
                  Export Complete!
                </p>
                <p className="text-sm text-green-600 mt-1">
                  Your article has been successfully exported to Contentstack.
                  {existingEntry
                    ? " The existing entry was updated."
                    : " A new entry was created."}
                </p>
                {entryUrl && (
                  <a
                    href={entryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-sm text-green-700 hover:text-green-800 underline"
                  >
                    Open in Contentstack
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
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
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
                onClick={handleExport}
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
                  "Export to Contentstack"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
