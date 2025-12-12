"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import type { GitHubFile } from "./types/github";
import { useGitHubConfig } from "./hooks/useGitHubConfig";
import { useGitHubFiles } from "./hooks/useGitHubFiles";
import { normalizeTags, formatDate, extractUniqueTags } from "./utils/helpers";
import {
  INPUT_CLASSES,
  BUTTON_PRIMARY_CLASSES,
  BUTTON_SECONDARY_CLASSES,
} from "./utils/constants";
import { deleteGitHubFile } from "./utils/api";
import DeleteConfirmModal from "./components/ui/DeleteConfirmModal";
import BulkContentstackExportModal from "./components/BulkContentstackExportModal";
import AppHeader from "./components/AppHeader";

export default function Home() {
  const router = useRouter();
  const { config: githubConfig, loading: configLoading, error: configError } = useGitHubConfig();
  const { files, isLoading, error, loadFiles, setFiles, setError } =
    useGitHubFiles(githubConfig);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [deleteFile, setDeleteFile] = useState<GitHubFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isBulkExportOpen, setIsBulkExportOpen] = useState(false);

  const handleFileClick = (file: GitHubFile) => {
    // Navigate to editor with file info
    router.push(`/article?file=${encodeURIComponent(file.path)}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, file: GitHubFile) => {
    e.stopPropagation();
    setDeleteFile(file);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteFile || !githubConfig) return;

    setIsDeleting(true);

    try {
      const data = await deleteGitHubFile(
        githubConfig,
        deleteFile.path,
        deleteFile.sha,
        deleteFile.name
      );

      if (!data.success) {
        throw new Error(data.error || "Failed to delete file");
      }

      setFiles((prev) => prev.filter((f) => f.sha !== deleteFile.sha));
      setDeleteFile(null);
    } catch (error: any) {
      console.error("Failed to delete file:", error);
      setError(error.message || "Failed to delete file from GitHub");
      setDeleteFile(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // Extract unique tags from files
  const allTags = useMemo(() => extractUniqueTags(files), [files]);

  // Filter and sort files
  const filteredFiles = useMemo(() => {
    const normalizedSelectedTags = normalizeTags(selectedTags);
    const lowerSearchQuery = searchQuery.toLowerCase();

    return files
      .filter((file) => {
        // Search filter
        const matchesSearch =
          searchQuery === "" ||
          file.frontmatter?.title?.toLowerCase().includes(lowerSearchQuery) ||
          file.frontmatter?.description
            ?.toLowerCase()
            .includes(lowerSearchQuery) ||
          file.name.toLowerCase().includes(lowerSearchQuery);

        // Tag filter - show files that have ANY of the selected tags (OR logic)
        const matchesTags =
          selectedTags.length === 0 ||
          (() => {
            const fileTags = file.frontmatter?.tags;
            if (
              !fileTags ||
              !Array.isArray(fileTags) ||
              fileTags.length === 0
            ) {
              return false;
            }
            const normalizedFileTags = normalizeTags(fileTags);
            return normalizedSelectedTags.some((selectedTag) =>
              normalizedFileTags.includes(selectedTag)
            );
          })();

        return matchesSearch && matchesTags;
      })
      .sort((a, b) => {
        const dateA = a.frontmatter?.date || "";
        const dateB = b.frontmatter?.date || "";
        return sortOrder === "newest"
          ? dateB.localeCompare(dateA)
          : dateA.localeCompare(dateB);
      });
  }, [files, searchQuery, selectedTags, sortOrder]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const normalizedTag = tag.trim().toLowerCase();
      const normalizedPrev = normalizeTags(prev);
      if (normalizedPrev.includes(normalizedTag)) {
        return prev.filter((t) => normalizeTags([t])[0] !== normalizedTag);
      }
      return [...prev, tag]; // Keep original case for display
    });
  };

  const toggleFileSelection = (fileSha: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileSha)) {
        newSet.delete(fileSha);
      } else {
        newSet.add(fileSha);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map((f) => f.sha)));
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedFiles(new Set());
  };

  const getSelectedFilesForExport = (): GitHubFile[] => {
    return filteredFiles.filter((f) => selectedFiles.has(f.sha));
  };

  // Header actions
  const headerActions = (
    <>
      {githubConfig && (
        <>
          {isSelectionMode ? (
            <>
              <span className="text-sm text-gray-600">
                {selectedFiles.size} selected
              </span>
              <button
                onClick={toggleSelectAll}
                className={BUTTON_SECONDARY_CLASSES}
              >
                {selectedFiles.size === filteredFiles.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
              <button
                onClick={() => setIsBulkExportOpen(true)}
                disabled={selectedFiles.size === 0}
                className={clsx(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  selectedFiles.size === 0
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-purple-600 text-white hover:bg-purple-700"
                )}
              >
                Export to Contentstack
              </button>
              <button
                onClick={exitSelectionMode}
                className={BUTTON_SECONDARY_CLASSES}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsSelectionMode(true)}
                className={BUTTON_SECONDARY_CLASSES}
                title="Select articles for bulk export"
              >
                Select
              </button>
              <button
                onClick={loadFiles}
                disabled={isLoading}
                className={clsx(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  isLoading
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                )}
              >
                {isLoading ? "Loading..." : "Refresh"}
              </button>
            </>
          )}
        </>
      )}
      {!isSelectionMode && (
        <button
          onClick={() => router.push("/article?new=true")}
          className={BUTTON_SECONDARY_CLASSES}
        >
          New Article
        </button>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        actions={headerActions}
        subtitle={
          githubConfig
            ? `Connected to ${githubConfig.repo}${
                githubConfig.folder ? ` / ${githubConfig.folder}` : ""
              }`
            : "Connect to GitHub to view articles"
        }
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {configLoading ? (
          /* Loading Config State */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading configuration...</p>
          </div>
        ) : !githubConfig ? (
          /* No Config State */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              GitHub Not Configured
            </h2>
            <p className="text-gray-600 mb-6">
              {configError || "Please add your GitHub configuration to .env.local to view and edit articles."}
            </p>
            <button
              onClick={() => router.push("/settings")}
              className={BUTTON_PRIMARY_CLASSES}
            >
              View Settings
            </button>
          </div>
        ) : files.length > 0 ? (
          <div className="flex gap-8">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Filters
                </h2>

                {/* Tag Filters */}
                {allTags.length > 0 && (
                  <nav aria-label="Tag filters">
                    <h2 className="block text-sm font-medium text-gray-700 mb-3">
                      Tags
                    </h2>
                    <div
                      className="space-y-2 max-h-96 overflow-y-auto"
                      role="list"
                    >
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={clsx(
                            "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                            selectedTags.includes(tag)
                              ? "bg-gray-900 text-white"
                              : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                          )}
                          aria-pressed={selectedTags.includes(tag)}
                          role="listitem"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="mt-4 w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 underline"
                        aria-label="Clear all tag filters"
                      >
                        Clear all filters
                      </button>
                    )}
                  </nav>
                )}
              </div>
            </aside>

            {/* Articles Grid */}
            <div className="flex-1 min-w-0">
              {/* Search and Sort */}
              <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <label htmlFor="search-articles" className="sr-only">
                    Search articles
                  </label>
                  <input
                    id="search-articles"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search articles..."
                    className={`${INPUT_CLASSES} px-4`}
                    aria-label="Search articles"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="sort-articles"
                    className="text-sm text-gray-700 font-medium"
                  >
                    Sort:
                  </label>
                  <select
                    id="sort-articles"
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(e.target.value as "newest" | "oldest")
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                    aria-label="Sort articles"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                  </select>
                </div>
              </div>

              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Loading State */}
              {isLoading && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                  <p className="mt-4 text-gray-600">Loading articles...</p>
                </div>
              )}

              {/* Article Grid */}
              {!isLoading && filteredFiles.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredFiles.map((file) => (
                    <article
                      key={file.sha}
                      className={clsx(
                        "bg-white rounded-lg shadow-sm border overflow-hidden transition-all group relative",
                        isSelectionMode && selectedFiles.has(file.sha)
                          ? "border-purple-500 ring-2 ring-purple-200"
                          : "border-gray-200 hover:shadow-lg hover:border-gray-300"
                      )}
                      onClick={
                        isSelectionMode
                          ? () => toggleFileSelection(file.sha)
                          : undefined
                      }
                    >
                      {/* Selection Checkbox */}
                      {isSelectionMode && (
                        <div className="absolute top-2 left-2 z-10">
                          <div
                            className={clsx(
                              "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
                              selectedFiles.has(file.sha)
                                ? "bg-purple-600 border-purple-600"
                                : "bg-white/90 border-gray-300 hover:border-purple-400"
                            )}
                          >
                            {selectedFiles.has(file.sha) && (
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Delete Button */}
                      {!isSelectionMode && (
                        <button
                          onClick={(e) => handleDeleteClick(e, file)}
                          className="absolute top-2 right-2 z-10 p-2 bg-white/90 backdrop-blur-sm rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete article: ${
                            file.frontmatter?.title || file.name
                          }`}
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}

                      {/* Article Content - Conditionally wrapped */}
                      {isSelectionMode ? (
                        <div className="w-full text-left flex flex-col cursor-pointer">
                          {/* Hero Image */}
                          {file.frontmatter?.heroImage && (
                            <div className="w-full aspect-video bg-gray-100 overflow-hidden rounded-t-lg relative">
                              <img
                                src={file.frontmatter.heroImage}
                                alt={file.frontmatter.title}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            </div>
                          )}

                          <div className="p-6">
                            {/* Date, Reading Time, and Draft Badge */}
                            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 flex-wrap">
                              {file.frontmatter?.date && (
                                <span>{formatDate(file.frontmatter.date)}</span>
                              )}
                              {file.frontmatter?.readingTime && (
                                <>
                                  {file.frontmatter.date && <span>•</span>}
                                  <span>{file.frontmatter.readingTime}</span>
                                </>
                              )}
                              {file.frontmatter?.draft === true && (
                                <>
                                  {(file.frontmatter.date ||
                                    file.frontmatter.readingTime) && (
                                    <span>•</span>
                                  )}
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                                    Draft
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Title */}
                            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-gray-700 line-clamp-2">
                              {file.frontmatter?.title ||
                                file.name.replace(/\.(md|markdown)$/i, "")}
                            </h3>

                            {/* Description */}
                            {file.frontmatter?.description && (
                              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                {file.frontmatter.description}
                              </p>
                            )}

                            {/* Tags */}
                            {file.frontmatter?.tags &&
                              file.frontmatter.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {file.frontmatter.tags
                                    .slice(0, 3)
                                    .map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  {file.frontmatter.tags.length > 3 && (
                                    <span className="px-2 py-1 text-gray-500 text-xs">
                                      +{file.frontmatter.tags.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>
                      ) : (
                        <Link
                          href={`/article?file=${encodeURIComponent(
                            file.path
                          )}`}
                          className="w-full text-left flex flex-col focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 rounded-lg"
                        >
                          {/* Hero Image */}
                          {file.frontmatter?.heroImage && (
                            <div className="w-full aspect-video bg-gray-100 overflow-hidden rounded-t-lg relative">
                              <img
                                src={file.frontmatter.heroImage}
                                alt={file.frontmatter.title}
                                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            </div>
                          )}

                          <div className="p-6">
                            {/* Date, Reading Time, and Draft Badge */}
                            <div className="flex items-center gap-3 text-xs text-gray-500 mb-2 flex-wrap">
                              {file.frontmatter?.date && (
                                <span>{formatDate(file.frontmatter.date)}</span>
                              )}
                              {file.frontmatter?.readingTime && (
                                <>
                                  {file.frontmatter.date && <span>•</span>}
                                  <span>{file.frontmatter.readingTime}</span>
                                </>
                              )}
                              {file.frontmatter?.draft === true && (
                                <>
                                  {(file.frontmatter.date ||
                                    file.frontmatter.readingTime) && (
                                    <span>•</span>
                                  )}
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                                    Draft
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Title */}
                            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-gray-700 line-clamp-2">
                              {file.frontmatter?.title ||
                                file.name.replace(/\.(md|markdown)$/i, "")}
                            </h3>

                            {/* Description */}
                            {file.frontmatter?.description && (
                              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                                {file.frontmatter.description}
                              </p>
                            )}

                            {/* Tags */}
                            {file.frontmatter?.tags &&
                              file.frontmatter.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-4">
                                  {file.frontmatter.tags
                                    .slice(0, 3)
                                    .map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-md"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  {file.frontmatter.tags.length > 3 && (
                                    <span className="px-2 py-1 text-gray-500 text-xs">
                                      +{file.frontmatter.tags.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                          </div>
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {/* Delete Confirmation Modal */}
              <DeleteConfirmModal
                isOpen={!!deleteFile}
                title={deleteFile?.frontmatter?.title || deleteFile?.name || ""}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteFile(null)}
                isDeleting={isDeleting}
              />

              {/* Bulk Export to Contentstack Modal */}
              {githubConfig && (
                <BulkContentstackExportModal
                  isOpen={isBulkExportOpen}
                  onClose={() => {
                    setIsBulkExportOpen(false);
                    setIsSelectionMode(false);
                    setSelectedFiles(new Set());
                  }}
                  files={getSelectedFilesForExport()}
                  githubConfig={githubConfig}
                />
              )}

              {/* Empty State */}
              {!isLoading &&
                filteredFiles.length === 0 &&
                files.length === 0 &&
                !error && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                    <p className="text-gray-600">
                      No markdown files found in this folder.
                    </p>
                  </div>
                )}

              {/* No Search Results */}
              {!isLoading && filteredFiles.length === 0 && files.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                  <p className="text-gray-600">
                    No articles match your search
                    {selectedTags.length > 0 ? " and filters" : ""}.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Empty/Loading State */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            {isLoading ? (
              <>
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-4 text-gray-600">Loading articles...</p>
              </>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            ) : (
              <p className="text-gray-600">
                {githubConfig
                  ? "No articles found. Click Refresh to load files."
                  : "Configure GitHub repository to view articles."}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
