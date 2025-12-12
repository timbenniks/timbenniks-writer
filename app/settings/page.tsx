"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import {
  BUTTON_PRIMARY_CLASSES,
  BUTTON_SECONDARY_CLASSES,
} from "../utils/constants";
import PlaylistManager from "../components/PlaylistManager";
import { useGitHubConfig } from "../hooks/useGitHubConfig";
import { usePlaylists } from "../hooks/usePlaylists";

interface GitHubEnvConfig {
  repo: string;
  branch: string;
  folder: string;
  authorName: string;
  authorEmail: string;
}

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // GitHub config from env vars
  const [githubConfig, setGitHubConfig] = useState<{
    configured: boolean;
    tokenConfigured: boolean;
    config: GitHubEnvConfig | null;
    error?: string;
    loading: boolean;
  }>({
    configured: false,
    tokenConfigured: false,
    config: null,
    loading: true,
  });
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

  // YouTube config from env vars
  const [youtubeConfig, setYoutubeConfig] = useState<{
    configured: boolean;
    keyPreview: string | null;
  } | null>(null);
  const [isTestingYoutube, setIsTestingYoutube] = useState(false);
  const [youtubeTestStatus, setYoutubeTestStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  // Playlists management
  const { config: ghConfig } = useGitHubConfig();
  const {
    playlists,
    isLoading: playlistsLoading,
    isSaving: playlistsSaving,
    error: playlistsError,
    addPlaylist,
    updatePlaylist,
    removePlaylist,
  } = usePlaylists(ghConfig);

  // Load all configs on mount
  useEffect(() => {
    // Load GitHub config from environment variables
    const loadGitHubConfig = async () => {
      try {
        const response = await fetch("/api/github/config");
        const data = await response.json();
        setGitHubConfig({
          configured: data.configured || false,
          tokenConfigured: data.tokenConfigured || false,
          config: data.config || null,
          error: data.error,
          loading: false,
        });
      } catch (e) {
        console.error("Failed to load GitHub config:", e);
        setGitHubConfig({
          configured: false,
          tokenConfigured: false,
          config: null,
          error: "Failed to load GitHub configuration",
          loading: false,
        });
      }
    };
    loadGitHubConfig();

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

    // Load YouTube config status
    const loadYoutubeConfig = async () => {
      try {
        const response = await fetch("/api/youtube/config");
        const data = await response.json();
        setYoutubeConfig({
          configured: data.configured || false,
          keyPreview: data.keyPreview || null,
        });
      } catch (e) {
        console.error("Failed to load YouTube config:", e);
        setYoutubeConfig({ configured: false, keyPreview: null });
      }
    };
    loadYoutubeConfig();
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

  const testConnection = async () => {
    if (!githubConfig.configured || !githubConfig.config) {
      setTestStatus({
        type: "error",
        message: "GitHub is not configured. Check your environment variables.",
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
          repo: githubConfig.config.repo,
          branch: githubConfig.config.branch,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTestStatus({
          type: "success",
          message: `Connected to ${data.repo.fullName} (${data.repo.defaultBranch})`,
        });
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

  // YouTube connection test handler
  const testYoutubeConnection = async () => {
    if (!youtubeConfig?.configured) {
      setYoutubeTestStatus({
        type: "error",
        message: "YouTube API is not configured",
      });
      return;
    }

    setIsTestingYoutube(true);
    setYoutubeTestStatus({ type: null, message: "" });

    try {
      // Try to fetch a known playlist to test the connection
      const response = await fetch("/api/youtube/playlist-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: "PLQVvvaa0QuDfKTOs3Keq_kaG2P55YRn5v", // A public playlist for testing
          includeDurations: false,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setYoutubeTestStatus({
          type: "success",
          message: "YouTube API connection successful!",
        });
      } else {
        setYoutubeTestStatus({
          type: "error",
          message: data.error || "Failed to connect to YouTube API",
        });
      }
    } catch (error: any) {
      setYoutubeTestStatus({
        type: "error",
        message: error.message || "Failed to test YouTube connection",
      });
    } finally {
      setIsTestingYoutube(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - using simpler header for settings since it's a different layout */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Navigation links */}
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
              >
                Articles
              </a>
              <a
                href="/videos"
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
              >
                Videos
              </a>
              <span className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-900 rounded-md">
                Settings
              </span>
            </nav>
          </div>
          <p className="text-sm text-gray-600">
            Configuration status (via environment variables)
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* GitHub Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              GitHub Repository
            </h2>
            <p className="text-gray-600">
              Connected to your GitHub repository for markdown article management.
            </p>
          </div>

          <div className="space-y-6">
            {/* Loading state */}
            {githubConfig.loading ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking configuration...
              </div>
            ) : githubConfig.configured && githubConfig.config ? (
              <>
                {/* Connected state */}
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
                        GitHub Connected
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        All settings configured via environment variables
                      </p>
                    </div>
                  </div>
                </div>

                {/* Configuration display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Repository
                    </p>
                    <p className="text-sm font-mono text-gray-900">
                      {githubConfig.config.repo}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Branch
                    </p>
                    <p className="text-sm font-mono text-gray-900">
                      {githubConfig.config.branch}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Folder
                    </p>
                    <p className="text-sm font-mono text-gray-900">
                      {githubConfig.config.folder || "(root)"}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-md">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      Author
                    </p>
                    <p className="text-sm font-mono text-gray-900">
                      {githubConfig.config.authorName || "(not set)"}{" "}
                      {githubConfig.config.authorEmail && (
                        <span className="text-gray-500">
                          &lt;{githubConfig.config.authorEmail}&gt;
                        </span>
                      )}
                    </p>
                  </div>
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

                {/* Test Connection Button */}
                <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={testConnection}
                    disabled={isTesting}
                    className={clsx(
                      BUTTON_PRIMARY_CLASSES,
                      isTesting && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isTesting ? "Testing..." : "Test Connection"}
                  </button>
                </div>
              </>
            ) : (
              /* Not configured state */
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
                      GitHub Not Configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      {githubConfig.error || "Add your GitHub credentials to .env.local:"}
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-yellow-100 rounded text-xs font-mono text-yellow-900 space-y-1">
                      <div>GITHUB_TOKEN=your_personal_access_token</div>
                      <div>GITHUB_REPO=owner/repo</div>
                      <div>GITHUB_BRANCH=main</div>
                      <div>GITHUB_FOLDER=content/articles</div>
                      <div>GITHUB_AUTHOR_NAME=Your Name</div>
                      <div>GITHUB_AUTHOR_EMAIL=you@example.com</div>
                    </code>
                  </div>
                </div>
              </div>
            )}
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

        {/* YouTube API Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              YouTube API
            </h2>
            <p className="text-gray-600">
              Import videos from YouTube playlists. Configure via environment
              variables.
            </p>
          </div>

          <div className="space-y-6">
            {/* Status */}
            {youtubeConfig === null ? (
              <div className="p-4 bg-gray-50 rounded-md text-sm text-gray-600">
                Checking configuration...
              </div>
            ) : youtubeConfig.configured ? (
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
                        YouTube API Configured
                      </p>
                      {youtubeConfig.keyPreview && (
                        <p className="text-xs text-green-700 mt-0.5 font-mono">
                          API Key: {youtubeConfig.keyPreview}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={testYoutubeConnection}
                    disabled={isTestingYoutube}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium bg-white text-green-800 border border-green-300 rounded-md hover:bg-green-100 hover:border-green-400 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2",
                      isTestingYoutube && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isTestingYoutube ? "Testing..." : "Test Connection"}
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
                      YouTube API Not Configured
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      Add your YouTube API key to enable video import:
                    </p>
                    <code className="block mt-2 px-3 py-2 bg-yellow-100 rounded text-xs font-mono text-yellow-900">
                      YOUTUBE_KEY=your_api_key_here
                    </code>
                    <p className="text-xs text-yellow-700 mt-2">
                      Get your API key from the{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-yellow-800"
                      >
                        Google Cloud Console
                      </a>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Test Status Messages */}
            {youtubeTestStatus.type && (
              <div
                className={clsx(
                  "p-3 rounded-md text-sm",
                  youtubeTestStatus.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                )}
              >
                {youtubeTestStatus.message}
              </div>
            )}

            {/* Info */}
            <div className="text-sm text-gray-500 space-y-2">
              <p>
                <strong>Features:</strong> Import videos from playlists, fetch
                transcripts, update metadata
              </p>
              <p>
                <strong>API:</strong> YouTube Data API v3 (read-only)
              </p>
            </div>
          </div>
        </div>

        {/* Playlists Configuration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              YouTube Playlists
            </h2>
            <p className="text-gray-600">
              Manage which YouTube playlists can be imported. Each playlist maps
              to a folder in your repository.
            </p>
          </div>

          <PlaylistManager
            playlists={playlists}
            onAdd={addPlaylist}
            onUpdate={updatePlaylist}
            onRemove={removePlaylist}
            isLoading={playlistsLoading}
            isSaving={playlistsSaving}
            error={playlistsError}
          />
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
