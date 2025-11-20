"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { GitHubConfig } from "../types/github";
import {
  INPUT_CLASSES,
  BUTTON_PRIMARY_CLASSES,
  BUTTON_SECONDARY_CLASSES,
} from "../utils/constants";

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // Google connection state
  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    email?: string;
    name?: string;
    loading: boolean;
  }>({ connected: false, loading: true });
  const [googleMessage, setGoogleMessage] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // AI config from env vars
  const [aiConfig, setAiConfig] = useState<{
    assistantId: string | null;
    model: string;
    temperature: number;
    reasoningEffort: "none" | "low" | "medium" | "high";
    verbosity: "low" | "medium" | "high";
  } | null>(null);
  const [isTestingAI, setIsTestingAI] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("githubConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLocalConfig(parsed);
      } catch (e) {
        console.error("Failed to parse saved GitHub config:", e);
      }
    }

    // Load AI config from environment variables
    const loadAIConfig = async () => {
      try {
        const response = await fetch("/api/openai/config");
        const data = await response.json();
        if (data.success) {
          setAiConfig({
            assistantId: data.assistantId || null,
            model: data.model || "gpt-5.1",
            temperature: data.temperature ?? 0.7,
            reasoningEffort: data.reasoningEffort || "none",
            verbosity: data.verbosity || "medium",
          });
        }
      } catch (e) {
        console.error("Failed to load AI config:", e);
      }
    };
    loadAIConfig();
  }, []);

  // Check Google connection status
  useEffect(() => {
    const checkGoogleStatus = async () => {
      try {
        const response = await fetch("/api/google/status");
        const data = await response.json();
        setGoogleStatus({
          connected: data.connected || false,
          email: data.email,
          name: data.name,
          loading: false,
        });
      } catch (error) {
        console.error("Failed to check Google status:", error);
        setGoogleStatus({ connected: false, loading: false });
      }
    };

    checkGoogleStatus();
  }, []);

  // Handle URL params for Google OAuth callback
  useEffect(() => {
    const googleConnected = searchParams.get("google_connected");
    const googleError = searchParams.get("google_error");

    if (googleConnected === "true") {
      // Show temporary success message
      setGoogleMessage({
        type: "success",
        message: "Successfully connected to Google! Verifying...",
      });

      // Refresh status with retries (cookies need time to be set)
      const checkStatus = async (retries = 3) => {
        try {
          const response = await fetch("/api/google/status");
          const data = await response.json();

          if (data.connected) {
            setGoogleStatus({
              connected: true,
              email: data.email,
              name: data.name,
              loading: false,
            });
            setGoogleMessage({
              type: "success",
              message: `Successfully connected to Google${
                data.email ? ` (${data.email})` : ""
              }!`,
            });
            // Clear message after 5 seconds
            setTimeout(() => {
              setGoogleMessage({ type: null, message: "" });
            }, 5000);
          } else if (retries > 0) {
            // Retry after a delay
            setTimeout(() => checkStatus(retries - 1), 1000);
          } else {
            setGoogleStatus({ connected: false, loading: false });
            setGoogleMessage({
              type: "error",
              message:
                "Connection completed but verification failed. Please refresh the page or try again.",
            });
          }
        } catch (error) {
          console.error("Failed to check Google status:", error);
          if (retries > 0) {
            setTimeout(() => checkStatus(retries - 1), 1000);
          } else {
            setGoogleStatus({ connected: false, loading: false });
            setGoogleMessage({
              type: "error",
              message:
                "Connection completed but failed to verify. Please refresh the page.",
            });
          }
        }
      };

      // Start checking status
      checkStatus();

      // Clear URL params
      router.replace("/settings");
    } else if (googleError) {
      setGoogleStatus({ connected: false, loading: false });
      setGoogleMessage({
        type: "error",
        message: `Google connection failed: ${decodeURIComponent(googleError)}`,
      });
      // Clear URL params
      router.replace("/settings");
    }
  }, [searchParams, router]);

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
    // Redirect back to homepage
    router.push("/");
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
    setTestStatus({ type: null, message: "" });
    // Redirect back to homepage
    router.push("/");
  };

  // Google connection handlers
  const connectGoogle = () => {
    window.location.href = "/api/google/auth";
  };

  const disconnectGoogle = async () => {
    try {
      const response = await fetch("/api/google/disconnect", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        setGoogleStatus({ connected: false, loading: false });
        setGoogleMessage({
          type: "success",
          message: "Disconnected from Google",
        });
      } else {
        setGoogleMessage({
          type: "error",
          message: data.error || "Failed to disconnect",
        });
      }
    } catch (error: any) {
      setGoogleMessage({
        type: "error",
        message: error.message || "Failed to disconnect",
      });
    }
  };

  // AI connection test handler
  const testAIConnection = async () => {
    if (!aiConfig) {
      setAiTestStatus({
        type: "error",
        message: "AI configuration not loaded",
      });
      return;
    }

    setIsTestingAI(true);
    setAiTestStatus({ type: null, message: "" });

    try {
      const response = await fetch("/api/openai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "Hello! Please respond with a brief confirmation that you're working.",
            },
          ],
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          maxTokens: 100,
          reasoning: { effort: aiConfig.reasoningEffort },
          text: { verbosity: aiConfig.verbosity },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAiTestStatus({
          type: "success",
          message: "AI connection successful! OpenAI API is working correctly.",
        });
      } else {
        setAiTestStatus({
          type: "error",
          message: data.error || "Failed to connect to OpenAI",
        });
      }
    } catch (error: any) {
      setAiTestStatus({
        type: "error",
        message: error.message || "Failed to test AI connection",
      });
    } finally {
      setIsTestingAI(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-600 mt-1">
              Configure your GitHub repository and Google Docs integration
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className={BUTTON_SECONDARY_CLASSES}
          >
            Back to Articles
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              GitHub Repository Configuration
            </h2>
            <p className="text-gray-600">
              Connect your GitHub repository to view and edit your markdown
              articles.
            </p>
          </div>

          <div className="space-y-6">
            {/* Repository */}
            <div>
              <label
                htmlFor="settings-repo"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Repository{" "}
                <span className="text-red-500" aria-label="required">
                  *
                </span>
              </label>
              <input
                id="settings-repo"
                type="text"
                value={localConfig.repo}
                onChange={(e) => updateField("repo", e.target.value)}
                placeholder="e.g., timbenniks/blog"
                className={INPUT_CLASSES}
                required
                aria-required="true"
              />
              <p className="mt-1 text-xs text-gray-500">
                Format: owner/repo (e.g., timbenniks/blog)
              </p>
            </div>

            {/* Branch */}
            <div>
              <label
                htmlFor="settings-branch"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Branch{" "}
                <span className="text-red-500" aria-label="required">
                  *
                </span>
              </label>
              <input
                id="settings-branch"
                type="text"
                value={localConfig.branch}
                onChange={(e) => updateField("branch", e.target.value)}
                placeholder="main"
                className={INPUT_CLASSES}
                required
                aria-required="true"
              />
              <p className="mt-1 text-xs text-gray-500">Default: main</p>
            </div>

            {/* Subfolder Path */}
            <div>
              <label
                htmlFor="settings-folder"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Subfolder Path
              </label>
              <input
                id="settings-folder"
                type="text"
                value={localConfig.folder}
                onChange={(e) => updateField("folder", e.target.value)}
                placeholder="e.g., content/articles"
                className={INPUT_CLASSES}
              />
              <p className="mt-1 text-xs text-gray-500">
                Leave empty to use repository root
              </p>
            </div>

            {/* Personal Access Token */}
            <div>
              <label
                htmlFor="settings-token"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Personal Access Token{" "}
                <span className="text-red-500" aria-label="required">
                  *
                </span>
              </label>
              <div className="relative">
                <input
                  id="settings-token"
                  type={showToken ? "text" : "password"}
                  value={localConfig.token}
                  onChange={(e) => updateField("token", e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className={`${INPUT_CLASSES} pr-10`}
                  required
                  aria-required="true"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  aria-label={showToken ? "Hide token" : "Show token"}
                  aria-pressed={showToken}
                >
                  {showToken ? (
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
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
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
                Requires <code className="bg-gray-100 px-1 rounded">repo</code>{" "}
                scope.{" "}
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
              <label
                htmlFor="settings-author-name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Author Name (for commits)
              </label>
              <input
                id="settings-author-name"
                type="text"
                value={localConfig.authorName || ""}
                onChange={(e) => updateField("authorName", e.target.value)}
                placeholder="Your Name"
                className={INPUT_CLASSES}
              />
            </div>

            {/* Author Email */}
            <div>
              <label
                htmlFor="settings-author-email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Author Email (for commits)
              </label>
              <input
                id="settings-author-email"
                type="email"
                value={localConfig.authorEmail || ""}
                onChange={(e) => updateField("authorEmail", e.target.value)}
                placeholder="your.email@example.com"
                className={INPUT_CLASSES}
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
              <button
                onClick={clearConfig}
                className={BUTTON_SECONDARY_CLASSES}
              >
                Clear Configuration
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={testConnection}
                  disabled={isTesting}
                  className={clsx(
                    BUTTON_SECONDARY_CLASSES,
                    isTesting && "bg-gray-100 text-gray-400 cursor-not-allowed"
                  )}
                >
                  {isTesting ? "Testing..." : "Test Connection"}
                </button>
                <button onClick={saveConfig} className={BUTTON_PRIMARY_CLASSES}>
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Google Docs Integration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Google Docs Integration
            </h2>
            <p className="text-gray-600">
              Connect your Google account to export articles directly to Google
              Docs.
            </p>
          </div>

          <div className="space-y-6">
            {/* Google Connection Status */}
            {googleStatus.loading ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking connection status...
              </div>
            ) : googleStatus.connected ? (
              <div className="p-4 bg-green-50 rounded-md border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Connected to Google
                    </p>
                    {googleStatus.email && (
                      <p className="text-xs text-green-700 mt-1">
                        {googleStatus.name && `${googleStatus.name} • `}
                        {googleStatus.email}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={disconnectGoogle}
                    className="px-4 py-2 text-sm font-medium bg-white text-green-800 border border-green-300 rounded-md hover:bg-green-100 hover:border-green-400 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    aria-label="Disconnect Google account"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 rounded-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Not connected to Google
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Connect your Google account to enable Google Docs export
                    </p>
                  </div>
                  <button
                    onClick={connectGoogle}
                    className={BUTTON_PRIMARY_CLASSES}
                  >
                    Connect Google Account
                  </button>
                </div>
              </div>
            )}

            {/* Google Status Messages - Only show if there's a message */}
            {googleMessage.type && (
              <div
                className={clsx(
                  "p-3 rounded-md text-sm",
                  googleMessage.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                )}
              >
                {googleMessage.message}
              </div>
            )}
          </div>
        </div>

        {/* AI Writing Assistant */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              AI Writing Assistant
            </h2>
            <p className="text-gray-600">
              All AI settings are configured via environment variables. Tone of
              voice and article structure instructions are managed in code.
            </p>
          </div>

          <div className="space-y-6">
            {/* Test Connection */}
            <div className="flex items-center gap-3">
              <button
                onClick={testAIConnection}
                disabled={isTestingAI}
                className={clsx(
                  BUTTON_PRIMARY_CLASSES,
                  isTestingAI && "opacity-50 cursor-not-allowed"
                )}
              >
                {isTestingAI ? "Testing..." : "Test Connection"}
              </button>
              {aiTestStatus.type && (
                <div
                  className={clsx(
                    "px-4 py-2 rounded-md text-sm",
                    aiTestStatus.type === "success"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  )}
                >
                  {aiTestStatus.message}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">Loading settings...</div>
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  );
}
