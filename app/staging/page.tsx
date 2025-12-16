"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  getStagedChanges,
  clearStagedChanges,
  unstageChange,
  type StagedChange,
} from "../utils/staging";
import { useGitHubConfig } from "../hooks/useGitHubConfig";
import AppHeader from "../components/AppHeader";
import DiffView from "../components/DiffView";
import clsx from "clsx";

function StagingPageContent() {
  const router = useRouter();
  const { config: githubConfig } = useGitHubConfig();
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>("");
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStaged = () => {
      const changes = getStagedChanges();
      setStagedChanges(changes);
      // Auto-select first file if none selected
      if (changes.length > 0 && !selectedFile) {
        setSelectedFile(changes[0].filePath);
      }
      // Clear selection if file is no longer staged
      if (selectedFile && !changes.some((c) => c.filePath === selectedFile)) {
        setSelectedFile(changes.length > 0 ? changes[0].filePath : null);
      }
    };

    loadStaged();
    window.addEventListener("staging-changed", loadStaged);
    return () => window.removeEventListener("staging-changed", loadStaged);
  }, [selectedFile]);

  // Load original content for selected file
  useEffect(() => {
    if (!selectedFile || !githubConfig) return;

    const change = stagedChanges.find((c) => c.filePath === selectedFile);
    if (!change) return;

    // For new files, original content is empty
    if (change.type === "create") {
      setOriginalContent("");
      setIsLoadingOriginal(false);
      return;
    }

    // For deletes, we need to load the original content
    if (change.type === "delete" && change.sha) {
      setIsLoadingOriginal(true);
      loadOriginalContent(change.filePath, change.sha);
      return;
    }

    // For updates/renames, load original content from GitHub
    if ((change.type === "update" || change.type === "rename") && change.sha) {
      setIsLoadingOriginal(true);
      const filePathToLoad = change.oldPath || change.filePath;
      loadOriginalContent(filePathToLoad, change.sha);
      return;
    }

    setOriginalContent("");
    setIsLoadingOriginal(false);
  }, [selectedFile, stagedChanges, githubConfig]);

  const loadOriginalContent = async (filePath: string, sha: string) => {
    if (!githubConfig) return;

    try {
      const response = await fetch("/api/github/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath,
        }),
      });

      const data = await response.json();
      if (data.success && data.original) {
        setOriginalContent(data.original);
      } else {
        setOriginalContent("");
      }
    } catch (err: any) {
      console.error("Failed to load original content:", err);
      setOriginalContent("");
    } finally {
      setIsLoadingOriginal(false);
    }
  };

  const handleCommit = async () => {
    if (!githubConfig || stagedChanges.length === 0) return;
    if (!commitMessage.trim()) {
      setError("Commit message is required");
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      // Prepare changes for commit API
      const changes = stagedChanges.map((change) => ({
        type: change.type,
        filePath: change.filePath,
        oldPath: change.oldPath,
        content: change.content,
        sha: change.sha,
      }));

      const response = await fetch("/api/github/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          commitMessage: commitMessage.trim(),
          changes,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to commit");
      }

      // Clear staged changes
      clearStagedChanges();
      setStagedChanges([]);
      setCommitMessage("");
      setSelectedFile(null);
      setOriginalContent("");

      // Navigate back to articles page
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to commit changes");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleUnstage = (filePath: string) => {
    unstageChange(filePath);
    const remaining = stagedChanges.filter((c) => c.filePath !== filePath);
    setStagedChanges(remaining);
    if (selectedFile === filePath) {
      setSelectedFile(remaining.length > 0 ? remaining[0].filePath : null);
    }
  };

  const handleClearAll = () => {
    if (confirm(`Clear all ${stagedChanges.length} staged changes?`)) {
      clearStagedChanges();
      setStagedChanges([]);
      setSelectedFile(null);
      setOriginalContent("");
      router.push("/");
    }
  };

  const selectedChange = stagedChanges.find((c) => c.filePath === selectedFile);
  const newContent = selectedChange?.content || "";

  // Redirect if no staged changes
  if (stagedChanges.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <main className="w-full px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              No Staged Changes
            </h2>
            <p className="text-gray-600 mb-6">
              You don't have any staged changes to commit.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
            >
              Go to Articles
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AppHeader />
      {/* Commit Message and Actions Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="w-full px-8 py-5">
          <div className="flex items-start justify-between gap-6">
            <div className="flex-1 max-w-2xl">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Commit Message <span className="text-red-500">*</span>
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Describe your changes..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                rows={2}
              />
              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {error}
                </div>
              )}
            </div>
            <div className="flex items-end gap-3 pt-7">
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isCommitting}
              >
                Clear All
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                disabled={isCommitting}
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={isCommitting || !commitMessage.trim()}
                className={clsx(
                  "px-5 py-2 text-sm font-semibold rounded-lg transition-colors",
                  isCommitting || !commitMessage.trim()
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                )}
              >
                {isCommitting
                  ? "Committing..."
                  : `Commit ${stagedChanges.length} file${
                      stagedChanges.length !== 1 ? "s" : ""
                    }`}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm">
          <div className="p-5 border-b border-gray-200 bg-gray-50">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Staged Changes
            </h2>
            <p className="text-sm text-gray-600">
              {stagedChanges.length} file{stagedChanges.length !== 1 ? "s" : ""}{" "}
              ready to commit
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-1">
              {stagedChanges.map((change) => (
                <div
                  key={change.filePath}
                  className={clsx(
                    "w-full rounded-lg transition-all flex items-start gap-3 group relative border",
                    selectedFile === change.filePath
                      ? "bg-blue-50 border-blue-300 shadow-sm"
                      : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  )}
                >
                  <button
                    onClick={() => setSelectedFile(change.filePath)}
                    className="flex-1 text-left p-3 flex items-start gap-3 min-w-0"
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {change.type === "create" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          A
                        </span>
                      )}
                      {change.type === "update" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          M
                        </span>
                      )}
                      {change.type === "delete" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          D
                        </span>
                      )}
                      {change.type === "rename" && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          R
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {change.filePath.split("/").pop()}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {change.filePath}
                      </div>
                      {change.oldPath && change.oldPath !== change.filePath && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          from {change.oldPath.split("/").pop()}
                        </div>
                      )}
                      {change.metadata?.title && (
                        <div className="text-xs text-gray-500 mt-1">
                          {change.metadata.title}
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnstage(change.filePath);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-gray-200 rounded-md text-gray-400 hover:text-gray-600 m-2 flex-shrink-0"
                    title="Unstage"
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
              ))}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          {selectedChange ? (
            <>
              {/* File Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-8 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {selectedChange.filePath.split("/").pop()}
                      </h3>
                      {selectedChange.type === "create" && (
                        <span className="px-2.5 py-0.5 bg-green-100 text-green-800 rounded-md text-xs font-semibold flex-shrink-0">
                          New File
                        </span>
                      )}
                      {selectedChange.type === "update" && (
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-md text-xs font-semibold flex-shrink-0">
                          Modified
                        </span>
                      )}
                      {selectedChange.type === "delete" && (
                        <span className="px-2.5 py-0.5 bg-red-100 text-red-800 rounded-md text-xs font-semibold flex-shrink-0">
                          Deleted
                        </span>
                      )}
                      {selectedChange.type === "rename" && (
                        <span className="px-2.5 py-0.5 bg-yellow-100 text-yellow-800 rounded-md text-xs font-semibold flex-shrink-0">
                          Renamed
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">
                      {selectedChange.filePath}
                    </p>
                    {selectedChange.oldPath &&
                      selectedChange.oldPath !== selectedChange.filePath && (
                        <p className="text-xs text-gray-400 mt-1">
                          Renamed from {selectedChange.oldPath}
                        </p>
                      )}
                    {selectedChange.metadata?.title && (
                      <p className="text-sm text-gray-700 mt-2 font-medium">
                        {selectedChange.metadata.title}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Diff Content */}
              <div className="flex-1 overflow-auto bg-gray-50">
                {isLoadingOriginal ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="mt-4 text-gray-600 text-sm">
                        Loading original content...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    {selectedChange.type === "delete" ? (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          File will be deleted
                        </div>
                        <div className="p-5">
                          <DiffView
                            oldContent={originalContent}
                            newContent=""
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <div className="bg-gray-50 border-b border-gray-200 px-5 py-3 text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          <span className="text-red-600">−</span> Removed lines{" "}
                          | <span className="text-green-600">+</span> Added
                          lines
                        </div>
                        <div className="p-5 max-h-[calc(100vh-400px)] overflow-auto">
                          <DiffView
                            oldContent={originalContent}
                            newContent={newContent}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-gray-400"
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
                </div>
                <p className="text-gray-600 font-medium">
                  Select a file to view its changes
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Choose a file from the sidebar to see the diff
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function StagingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">Loading staging area...</div>
        </div>
      }
    >
      <StagingPageContent />
    </Suspense>
  );
}
