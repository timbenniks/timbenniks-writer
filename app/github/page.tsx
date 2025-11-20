"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { GitHubConfig } from "../types/github";

interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  downloadUrl: string;
  lastModified: string | null;
}

export default function GitHubPage() {
  const router = useRouter();
  const [githubConfig, setGitHubConfig] = useState<GitHubConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [localConfig, setLocalConfig] = useState<GitHubConfig>({
    repo: "",
    branch: "main",
    folder: "",
    token: "",
    authorName: "",
    authorEmail: "",
  });
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("githubConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setGitHubConfig(parsed);
        setLocalConfig(parsed);
        setShowConfig(false);
      } catch (e) {
        console.error("Failed to parse saved GitHub config:", e);
        setShowConfig(true);
      }
    } else {
      setShowConfig(true);
    }
  }, []);

  // Load files when config is available
  useEffect(() => {
    if (githubConfig && !showConfig) {
      loadFiles();
    }
  }, [githubConfig, showConfig]);

  const loadFiles = async () => {
    if (!githubConfig) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          folder: githubConfig.folder,
          // Token comes from environment variables on the server
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFiles(data.files || []);
      } else {
        setError(data.error || "Failed to load files");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof GitHubConfig, value: string) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));
    setTestStatus({ type: null, message: "" });
  };

  const testConnection = async () => {
    if (!localConfig.repo || !localConfig.branch || !localConfig.token) {
      setTestStatus({
        type: "error",
        message: "Please fill in all required fields",
      });
      return;
    }

    setIsTesting(true);
    setTestStatus({ type: null, message: "" });

    try {
      const response = await fetch("/api/github/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: localConfig.repo,
          branch: localConfig.branch,
          token: localConfig.token,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestStatus({
          type: "success",
          message: `Connected to ${data.repo.fullName} (${data.repo.defaultBranch})`,
        });
        if (data.repo.branches && data.repo.branches.length > 0) {
          setLocalConfig((prev) => ({
            ...prev,
            branch: prev.branch || data.repo.defaultBranch,
          }));
        }
      } else {
        setTestStatus({
          type: "error",
          message: data.error || "Connection failed",
        });
      }
    } catch (error: any) {
      setTestStatus({
        type: "error",
        message: error.message || "Failed to test connection",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const saveConfig = () => {
    if (!localConfig.repo || !localConfig.branch || !localConfig.token) {
      setTestStatus({
        type: "error",
        message: "Please fill in all required fields",
      });
      return;
    }

    if (!localConfig.repo.match(/^[^\/]+\/[^\/]+$/)) {
      setTestStatus({
        type: "error",
        message: "Invalid repo format. Use 'owner/repo'",
      });
      return;
    }

    localStorage.setItem("githubConfig", JSON.stringify(localConfig));
    setGitHubConfig(localConfig);
    setShowConfig(false);
  };

  const clearConfig = () => {
    localStorage.removeItem("githubConfig");
    setLocalConfig({
      repo: "",
      branch: "main",
      folder: "",
      token: "",
      authorName: "",
      authorEmail: "",
    });
    setGitHubConfig(null);
    setFiles([]);
    setTestStatus({ type: null, message: "" });
    setShowConfig(true);
  };

  const handleFileClick = (file: GitHubFile) => {
    // Navigate to editor with file info
    router.push(`/article?file=${encodeURIComponent(file.path)}`);
  };

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
            <p className="text-sm text-gray-600 mt-1">
              {githubConfig
                ? `Connected to ${githubConfig.repo}${githubConfig.folder ? ` / ${githubConfig.folder}` : ""}`
                : "Connect to GitHub to view articles"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {githubConfig && (
              <>
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
                <button
                  onClick={() => {
                    setShowConfig(true);
                    setLocalConfig(githubConfig);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                >
                  Settings
                </button>
              </>
            )}
            <button
              onClick={() => router.push("/article")}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              New Article
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {showConfig || !githubConfig ? (
          /* Configuration Form */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                GitHub Repository Configuration
              </h2>
              <p className="text-gray-600">
                Connect your GitHub repository to view and edit your markdown articles.
              </p>
            </div>

            <div className="space-y-6">
              {/* Repository */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repository <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.repo}
                  onChange={(e) => updateField("repo", e.target.value)}
                  placeholder="e.g., timbenniks/blog"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Format: owner/repo (e.g., timbenniks/blog)
                </p>
              </div>

              {/* Branch */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Branch <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localConfig.branch}
                  onChange={(e) => updateField("branch", e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">Default: main</p>
              </div>

              {/* Subfolder Path */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subfolder Path
                </label>
                <input
                  type="text"
                  value={localConfig.folder}
                  onChange={(e) => updateField("folder", e.target.value)}
                  placeholder="e.g., content/articles"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty to use repository root
                </p>
              </div>

              {/* Personal Access Token */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Personal Access Token <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={localConfig.token}
                    onChange={(e) => updateField("token", e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                    title={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? (
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
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                        />
                      </svg>
                    ) : (
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
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Requires <code className="bg-gray-100 px-1 rounded">repo</code> scope.{" "}
                  <a
                    href="https://github.com/settings/tokens/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Create token on GitHub
                  </a>
                </p>
              </div>

              {/* Author Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Author Name (for commits)
                </label>
                <input
                  type="text"
                  value={localConfig.authorName || ""}
                  onChange={(e) => updateField("authorName", e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Author Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Author Email (for commits)
                </label>
                <input
                  type="email"
                  value={localConfig.authorEmail || ""}
                  onChange={(e) => updateField("authorEmail", e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              {/* Test Status */}
              {testStatus.type && (
                <div
                  className={clsx(
                    "p-3 rounded-md text-sm",
                    testStatus.type === "success"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  )}
                >
                  {testStatus.message}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-gray-200">
                {githubConfig && (
                  <button
                    onClick={clearConfig}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    Clear Configuration
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    onClick={testConnection}
                    disabled={isTesting}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                      isTesting
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    )}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    onClick={saveConfig}
                    className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* File List */
          <>
            {/* Search */}
            {files.length > 0 && (
              <div className="mb-6">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search articles..."
                  className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            )}

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

            {/* File Grid */}
            {!isLoading && filteredFiles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredFiles.map((file) => (
                  <button
                    key={file.sha}
                    onClick={() => handleFileClick(file)}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-left hover:shadow-md hover:border-gray-300 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-gray-700">
                          {file.name.replace(/\.(md|markdown)$/i, "")}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {file.path}
                        </p>
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{file.size} bytes</span>
                      {file.lastModified && (
                        <span>{file.lastModified}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && filteredFiles.length === 0 && files.length === 0 && !error && (
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
                  No articles match your search.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

