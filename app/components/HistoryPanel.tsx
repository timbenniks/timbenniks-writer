"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import type { GitHubConfig } from "../types/github";
import { formatDate } from "../utils/helpers";
import { BUTTON_PRIMARY_CLASSES, BUTTON_SECONDARY_CLASSES, BUTTON_DANGER_CLASSES } from "../utils/constants";

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  date: string;
}

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
  githubConfig: GitHubConfig | null;
  onRevert?: (commitSha: string) => void;
}

export default function HistoryPanel({
  isOpen,
  onClose,
  filePath,
  githubConfig,
  onRevert,
}: HistoryPanelProps) {
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitContent, setCommitContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isReverting, setIsReverting] = useState(false);

  useEffect(() => {
    if (isOpen && filePath && githubConfig) {
      loadHistory();
    } else {
      setCommits([]);
      setError(null);
      setSelectedCommit(null);
      setCommitContent(null);
    }
  }, [isOpen, filePath, githubConfig]);

  const loadHistory = async () => {
    if (!filePath || !githubConfig) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath,
          // Token comes from environment variables on the server
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCommits(data.commits || []);
      } else {
        setError(data.error || "Failed to load commit history");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load commit history");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCommitContent = async (commitSha: string) => {
    if (!filePath || !githubConfig) return;

    setIsLoadingContent(true);
    setSelectedCommit(commitSha);

    try {
      const response = await fetch("/api/github/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: commitSha, // Use commit SHA as ref
          filePath,
          // Token comes from environment variables on the server
        }),
      });

      const data = await response.json();

      if (data.success && data.content) {
        setCommitContent(data.content);
      } else {
        setError(data.error || "Failed to load commit content");
        setCommitContent(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load commit content");
      setCommitContent(null);
    } finally {
      setIsLoadingContent(false);
    }
  };

  const handleRevert = async (commitSha: string) => {
    if (!filePath || !githubConfig || !onRevert) return;

    const commit = commits.find((c) => c.sha === commitSha);
    if (!commit) return;

    const confirmMessage = `Are you sure you want to revert to this version?\n\nCommit: ${commit.message}\nAuthor: ${commit.author.name}\nDate: ${formatDate(commit.date)}\n\nThis will create a new commit reverting to this version.`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsReverting(true);

    try {
      const response = await fetch("/api/github/revert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath,
          commitSha,
          commitMessage: `Revert to: ${commit.message}`,
          // Token comes from environment variables on the server
          authorName: githubConfig.authorName,
          authorEmail: githubConfig.authorEmail,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onRevert(commitSha);
        // Reload history to show the new revert commit
        await loadHistory();
        setSelectedCommit(null);
        setCommitContent(null);
      } else {
        setError(data.error || "Failed to revert file");
      }
    } catch (err: any) {
      setError(err.message || "Failed to revert file");
    } finally {
      setIsReverting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className={clsx(
          "fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out overflow-y-auto",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-semibold text-gray-900">Commit History</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close history panel"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {!filePath ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No file selected</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600">Loading commit history...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={loadHistory}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Retry
              </button>
            </div>
          ) : commits.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No commit history found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  {commits.length} {commits.length === 1 ? "commit" : "commits"}
                </p>
                <button
                  onClick={loadHistory}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                  aria-label="Refresh history"
                >
                  Refresh
                </button>
              </div>

              <div className="space-y-3">
                {commits.map((commit, index) => (
                  <div
                    key={commit.sha}
                    className={clsx(
                      "border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors",
                      selectedCommit === commit.sha && "border-gray-900 bg-gray-50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono text-gray-500">
                            {commit.sha.substring(0, 7)}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                          {commit.message}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                          <span>{commit.author.name}</span>
                          <span>•</span>
                          <span>{formatDate(commit.date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadCommitContent(commit.sha)}
                          disabled={isLoadingContent}
                          className={clsx(
                            BUTTON_SECONDARY_CLASSES,
                            "text-xs",
                            selectedCommit === commit.sha && "bg-gray-900 text-white hover:bg-gray-800"
                          )}
                          aria-label={`View commit ${commit.sha.substring(0, 7)}`}
                        >
                          {selectedCommit === commit.sha ? "Viewing" : "View"}
                        </button>
                        {index > 0 && (
                          <button
                            onClick={() => handleRevert(commit.sha)}
                            disabled={isReverting}
                            className={clsx(BUTTON_DANGER_CLASSES, "text-xs")}
                            aria-label={`Revert to commit ${commit.sha.substring(0, 7)}`}
                          >
                            {isReverting ? "Reverting..." : "Revert"}
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedCommit === commit.sha && commitContent && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-auto">
                          <pre className="whitespace-pre-wrap font-mono text-xs text-gray-800">
                            {commitContent}
                          </pre>
                        </div>
                      </div>
                    )}

                    {selectedCommit === commit.sha && isLoadingContent && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="text-center py-4">
                          <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                          <p className="mt-2 text-xs text-gray-600">Loading content...</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

