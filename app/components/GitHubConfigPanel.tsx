"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import type { GitHubConfig } from "../types/github";

interface GitHubConfigPanelProps {
  config: GitHubConfig | null;
  onChange: (config: GitHubConfig | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function GitHubConfigPanel({
  config,
  onChange,
  isOpen,
  onClose,
}: GitHubConfigPanelProps) {
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

  // Load config when panel opens or config prop changes
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
    } else {
      // Try to load from localStorage
      const saved = localStorage.getItem("githubConfig");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setLocalConfig(parsed);
        } catch (e) {
          console.error("Failed to parse saved GitHub config:", e);
        }
      }
    }
  }, [config, isOpen]);

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
        // Update branch if it was auto-detected
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
    // Validate required fields
    if (!localConfig.repo || !localConfig.branch || !localConfig.token) {
      setTestStatus({
        type: "error",
        message: "Please fill in all required fields",
      });
      return;
    }

    // Validate repo format
    if (!localConfig.repo.match(/^[^\/]+\/[^\/]+$/)) {
      setTestStatus({
        type: "error",
        message: "Invalid repo format. Use 'owner/repo'",
      });
      return;
    }

    // Save to localStorage
    localStorage.setItem("githubConfig", JSON.stringify(localConfig));
    onChange(localConfig);
    onClose();
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
    onChange(null);
    setTestStatus({ type: null, message: "" });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            GitHub Repository Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close GitHub settings"
          >
            <svg
              className="w-5 h-5 text-gray-600"
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
        <div className="flex-1 overflow-auto p-6 space-y-6">
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
            <p className="mt-1 text-xs text-gray-500">
              Default: main
            </p>
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
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={clearConfig}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
          <div className="flex items-center gap-2">
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
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

