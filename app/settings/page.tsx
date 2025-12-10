"use client";

import { useState, useEffect, useRef, Suspense } from "react";
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
    token: "", // Not used anymore, kept for type compatibility
    authorName: "",
    authorEmail: "",
  });
  const [githubTokenConfigured, setGitHubTokenConfigured] = useState<
    boolean | null
  >(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Repository selection state
  const [repositories, setRepositories] = useState<
    Array<{
      fullName: string;
      name: string;
      owner: string;
      defaultBranch: string;
      private: boolean;
      description: string;
    }>
  >([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState("");
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const repoInputRef = useRef<HTMLInputElement>(null);

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

  // Cloudinary config from env vars
  const [cloudinaryConfigured, setCloudinaryConfigured] = useState<
    boolean | null
  >(null);

  // Gemini config from env vars
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(
    null
  );

  // Contentstack config from env vars
  const [contentstackConfig, setContentstackConfig] = useState<{
    configured: boolean;
    region: string | null;
  } | null>(null);
  const [isTestingContentstack, setIsTestingContentstack] = useState(false);
  const [contentstackTestStatus, setContentstackTestStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Define load functions first
  const loadBranches = async (
    repo: string,
    autoSelectDefault: boolean = false
  ) => {
    if (!repo) return;

    setIsLoadingBranches(true);
    try {
      const response = await fetch("/api/github/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo }),
      });
      const data = await response.json();
      if (data.success) {
        setBranches(data.branches || []);
        // Auto-select default branch if requested and available
        if (autoSelectDefault && data.branches && data.branches.length > 0) {
          const repoData = repositories.find((r) => r.fullName === repo);
          const defaultBranch = repoData?.defaultBranch || data.branches[0];
          setLocalConfig((prev) => ({ ...prev, branch: defaultBranch }));
        } else if (
          data.branches.length > 0 &&
          !data.branches.includes(localConfig.branch)
        ) {
          // Select first branch if current is invalid
          setLocalConfig((prev) => ({ ...prev, branch: data.branches[0] }));
        }
      }
    } catch (e) {
      console.error("Failed to load branches:", e);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const loadRepositories = async () => {
    setIsLoadingRepos(true);
    try {
      const response = await fetch("/api/github/repos");
      const data = await response.json();
      if (data.success) {
        setRepositories(data.repos || []);
        // If a repo is already selected, load its branches
        if (localConfig.repo) {
          loadBranches(localConfig.repo, false);
        }
      }
    } catch (e) {
      console.error("Failed to load repositories:", e);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // Load config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("githubConfig");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLocalConfig(parsed);
        // Set search query to show selected repo
        if (parsed.repo) {
          setRepoSearchQuery(parsed.repo);
        }
      } catch (e) {
        console.error("Failed to parse saved GitHub config:", e);
      }
    }

    // Load Cloudinary config status
    const loadCloudinaryConfig = async () => {
      try {
        const response = await fetch("/api/cloudinary/config");
        const data = await response.json();
        setCloudinaryConfigured(data.configured || false);
      } catch (e) {
        console.error("Failed to load Cloudinary config:", e);
        setCloudinaryConfigured(false);
      }
    };
    loadCloudinaryConfig();

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

    // Load Gemini config status
    const loadGeminiConfig = async () => {
      try {
        const response = await fetch("/api/gemini/config");
        const data = await response.json();
        setGeminiConfigured(data.configured || false);
      } catch (e) {
        console.error("Failed to load Gemini config:", e);
        setGeminiConfigured(false);
      }
    };
    loadGeminiConfig();

    // Load Contentstack config status
    const loadContentstackConfig = async () => {
      try {
        const response = await fetch("/api/contentstack/config");
        const data = await response.json();
        setContentstackConfig({
          configured: data.configured || false,
          region: data.region || null,
        });
      } catch (e) {
        console.error("Failed to load Contentstack config:", e);
        setContentstackConfig({ configured: false, region: null });
      }
    };
    loadContentstackConfig();

    // Load GitHub token status from environment variables
    const loadGitHubConfig = async () => {
      try {
        const response = await fetch("/api/github/config");
        const data = await response.json();
        if (data.success) {
          setGitHubTokenConfigured(data.tokenConfigured || false);
          // If token is configured, load repositories
          if (data.tokenConfigured) {
            loadRepositories();
          }
        } else {
          setGitHubTokenConfigured(false);
        }
      } catch (e) {
        console.error("Failed to load GitHub config:", e);
        setGitHubTokenConfigured(false);
      }
    };
    loadGitHubConfig();
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
    setLocalConfig((prev) => {
      const updated = { ...prev, [field]: value };

      // When repo changes, load branches and reset folder
      if (field === "repo" && value) {
        updated.folder = ""; // Reset folder when repo changes
        updated.branch = ""; // Reset branch when repo changes
        setBranches([]);
        setRepoSearchQuery(""); // Clear search query when repo is selected
        setShowRepoDropdown(false); // Hide dropdown
        loadBranches(value, true); // Auto-select default branch
      }

      return updated;
    });
    setTestStatus({ type: null, message: "" });
  };

  const testConnection = async () => {
    if (!localConfig.repo || !localConfig.branch) {
      setTestStatus({
        type: "error",
        message: "Please fill in all required fields",
      });
      return;
    }

    if (!githubTokenConfigured) {
      setTestStatus({
        type: "error",
        message:
          "GitHub token not configured. Please set GITHUB_TOKEN in .env.local",
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
    if (!localConfig.repo || !localConfig.branch) {
      setTestStatus({
        type: "error",
        message: "Please fill in all required fields",
      });
      return;
    }

    if (!githubTokenConfigured) {
      setTestStatus({
        type: "error",
        message:
          "GitHub token not configured. Please set GITHUB_TOKEN in .env.local",
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

    // Save config without token (token comes from env vars)
    const configToSave = {
      ...localConfig,
      token: "", // Don't save token, it comes from env vars
    };
    localStorage.setItem("githubConfig", JSON.stringify(configToSave));
    // Redirect back to homepage
    router.push("/");
  };

  const clearConfig = () => {
    localStorage.removeItem("githubConfig");
    setLocalConfig({
      repo: "",
      branch: "main",
      folder: "",
      token: "", // Not used anymore
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

  // Contentstack connection test handler
  const testContentstackConnection = async () => {
    if (!contentstackConfig?.configured) {
      setContentstackTestStatus({
        type: "error",
        message: "Contentstack is not configured",
      });
      return;
    }

    setIsTestingContentstack(true);
    setContentstackTestStatus({ type: null, message: "" });

    try {
      const response = await fetch("/api/contentstack/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.success) {
        const hasArticle = data.stack?.hasArticleContentType;
        setContentstackTestStatus({
          type: "success",
          message: `Connected to Contentstack (${data.region?.toUpperCase() || "EU"}) - ${
            data.stack?.contentTypesCount || 0
          } content types${hasArticle ? ", article type found ✓" : ", article type NOT found ⚠️"}`,
        });
      } else {
        setContentstackTestStatus({
          type: "error",
          message: data.error || "Failed to connect to Contentstack",
        });
      }
    } catch (error: any) {
      setContentstackTestStatus({
        type: "error",
        message: error.message || "Failed to test Contentstack connection",
      });
    } finally {
      setIsTestingContentstack(false);
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
            <div className="relative">
              <label
                htmlFor="settings-repo"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Repository{" "}
                <span className="text-red-500" aria-label="required">
                  *
                </span>
              </label>
              {githubTokenConfigured ? (
                <>
                  <input
                    ref={repoInputRef}
                    id="settings-repo"
                    type="text"
                    value={repoSearchQuery || localConfig.repo}
                    onChange={(e) => {
                      const query = e.target.value;
                      setRepoSearchQuery(query);
                      setShowRepoDropdown(true);
                      // If exact match, update config
                      const exactMatch = repositories.find(
                        (r) => r.fullName.toLowerCase() === query.toLowerCase()
                      );
                      if (exactMatch) {
                        updateField("repo", exactMatch.fullName);
                        setRepoSearchQuery("");
                        setShowRepoDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      if (repositories.length > 0) {
                        setShowRepoDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on dropdown item
                      setTimeout(() => setShowRepoDropdown(false), 200);
                    }}
                    placeholder={
                      isLoadingRepos
                        ? "Loading repositories..."
                        : "Type to search repositories..."
                    }
                    className={INPUT_CLASSES}
                    required
                    aria-required="true"
                    disabled={isLoadingRepos}
                    autoComplete="off"
                  />
                  {showRepoDropdown && repositories.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {repositories
                        .filter((repo) =>
                          repoSearchQuery
                            ? repo.fullName
                                .toLowerCase()
                                .includes(repoSearchQuery.toLowerCase()) ||
                              repo.description
                                .toLowerCase()
                                .includes(repoSearchQuery.toLowerCase())
                            : true
                        )
                        .slice(0, 10) // Limit to 10 results
                        .map((repo) => (
                          <button
                            key={repo.fullName}
                            type="button"
                            onClick={() => {
                              updateField("repo", repo.fullName);
                              setRepoSearchQuery("");
                              setShowRepoDropdown(false);
                              repoInputRef.current?.blur();
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-gray-900">
                                  {repo.fullName}
                                  {repo.private && (
                                    <span className="ml-2 text-xs text-gray-500">
                                      (Private)
                                    </span>
                                  )}
                                </div>
                                {repo.description && (
                                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    {repo.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      {repositories.filter((repo) =>
                        repoSearchQuery
                          ? repo.fullName
                              .toLowerCase()
                              .includes(repoSearchQuery.toLowerCase()) ||
                            repo.description
                              .toLowerCase()
                              .includes(repoSearchQuery.toLowerCase())
                          : true
                      ).length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500">
                          No repositories found
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <input
                  id="settings-repo"
                  type="text"
                  value={localConfig.repo}
                  onChange={(e) => updateField("repo", e.target.value)}
                  placeholder="e.g., timbenniks/blog"
                  className={INPUT_CLASSES}
                  required
                  aria-required="true"
                  disabled
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                {githubTokenConfigured
                  ? "Type to search repositories from your GitHub account"
                  : "Configure GITHUB_TOKEN in .env.local to enable repository selection"}
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
              {localConfig.repo && githubTokenConfigured ? (
                <select
                  id="settings-branch"
                  value={localConfig.branch}
                  onChange={(e) => updateField("branch", e.target.value)}
                  className={INPUT_CLASSES}
                  required
                  aria-required="true"
                  disabled={isLoadingBranches}
                >
                  <option value="">
                    {isLoadingBranches
                      ? "Loading branches..."
                      : "Select a branch"}
                  </option>
                  {branches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="settings-branch"
                  type="text"
                  value={localConfig.branch}
                  onChange={(e) => updateField("branch", e.target.value)}
                  placeholder="main"
                  className={INPUT_CLASSES}
                  required
                  aria-required="true"
                  disabled={!githubTokenConfigured}
                />
              )}
              <p className="mt-1 text-xs text-gray-500">
                {localConfig.repo && githubTokenConfigured
                  ? "Select a branch from the repository"
                  : "Default: main"}
              </p>
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
                disabled={!githubTokenConfigured}
              />
              <p className="mt-1 text-xs text-gray-500">
                Enter the folder path relative to repository root (e.g.,
                "content/articles" or "posts/2024"). Leave empty to use
                repository root.
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

        {/* Gemini Image Generation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              AI Image Generation
            </h2>
            <p className="text-gray-600">
              Generate cover images using Google Gemini Imagen 3. Configure via
              environment variables.
            </p>
          </div>

          <div className="space-y-6">
            {/* Status */}
            {geminiConfigured === null ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking configuration...
              </div>
            ) : geminiConfigured ? (
              <div className="p-4 bg-green-50 rounded-md border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Gemini API Configured
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      You can generate images in the article editor
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-md border border-yellow-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-yellow-600"
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Gemini API Not Configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Add your Gemini API key to enable AI image generation:
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-yellow-100 rounded text-xs font-mono text-yellow-900">
                      GEMINI_API_KEY=your_api_key_here
                    </code>
                    <p className="text-xs text-yellow-700 mt-2">
                      Get your API key from{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-800"
                      >
                        Google AI Studio
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                <strong>Model:</strong> Gemini 3 Pro
                (gemini-3-pro-image-preview)
              </p>
              <p>
                <strong>Features:</strong> Context-aware cover images,
                feedback-based refinement, automatic Cloudinary upload
              </p>
            </div>
          </div>
        </div>

        {/* Cloudinary Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Cloudinary Media Library
            </h2>
            <p className="text-gray-600">
              Select and upload images from your Cloudinary DAM. Configure via
              environment variables.
            </p>
          </div>

          <div className="space-y-6">
            {/* Status */}
            {cloudinaryConfigured === null ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking configuration...
              </div>
            ) : cloudinaryConfigured ? (
              <div className="p-4 bg-green-50 rounded-md border border-green-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Cloudinary Configured
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      You can select images from your media library
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-md border border-yellow-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-yellow-600"
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Cloudinary Not Configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Add your Cloudinary credentials to enable image selection
                      and upload:
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-yellow-100 rounded text-xs font-mono text-yellow-900 space-y-1">
                      <div>CLOUDINARY_CLOUD_NAME=your_cloud_name</div>
                      <div>CLOUDINARY_API_KEY=your_api_key</div>
                      <div>CLOUDINARY_API_SECRET=your_api_secret</div>
                    </code>
                    <p className="text-xs text-yellow-700 mt-2">
                      Find these in your{" "}
                      <a
                        href="https://console.cloudinary.com/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-800"
                      >
                        Cloudinary Console
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                <strong>Features:</strong> Media library browser, automatic
                image optimization, AI image upload
              </p>
            </div>
          </div>
        </div>

        {/* Contentstack CMS Integration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Contentstack CMS
            </h2>
            <p className="text-gray-600">
              Export articles directly to Contentstack CMS. Configure via
              environment variables.
            </p>
          </div>

          <div className="space-y-6">
            {/* Status */}
            {contentstackConfig === null ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking configuration...
              </div>
            ) : contentstackConfig.configured ? (
              <div className="p-4 bg-green-50 rounded-md border border-green-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
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
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">
                        Contentstack Configured
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        Region: {contentstackConfig.region?.toUpperCase() || "EU"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={testContentstackConnection}
                    disabled={isTestingContentstack}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium bg-white text-green-800 border border-green-300 rounded-md hover:bg-green-100 hover:border-green-400 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                      isTestingContentstack && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isTestingContentstack ? "Testing..." : "Test Connection"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-yellow-50 rounded-md border border-yellow-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-yellow-600"
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
                  </div>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Contentstack Not Configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Add your Contentstack credentials to enable CMS export:
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-yellow-100 rounded text-xs font-mono text-yellow-900 space-y-1">
                      <div>CONTENTSTACK_API_KEY=your_stack_api_key</div>
                      <div>CONTENTSTACK_MANAGEMENT_TOKEN=your_management_token</div>
                      <div>CONTENTSTACK_REGION=eu</div>
                    </code>
                    <p className="text-xs text-yellow-700 mt-2">
                      Get your credentials from the{" "}
                      <a
                        href="https://app.contentstack.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-800"
                      >
                        Contentstack Dashboard
                      </a>{" "}
                      under Settings → Tokens
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Test Status Messages */}
            {contentstackTestStatus.type && (
              <div
                className={clsx(
                  "p-3 rounded-md text-sm",
                  contentstackTestStatus.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                )}
              >
                {contentstackTestStatus.message}
              </div>
            )}

            {/* Info */}
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                <strong>Content Type:</strong> article
              </p>
              <p>
                <strong>Features:</strong> Create/update articles, automatic
                taxonomy management, image upload from URL
              </p>
              <p>
                <strong>Regions:</strong> EU, US, Azure NA, Azure EU
              </p>
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
