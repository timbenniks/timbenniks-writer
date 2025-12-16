"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import YouTubeEmbed from "../components/YouTubeEmbed";
import TranscriptEditor from "../components/TranscriptEditor";
import ContentstackVideoExportModal from "../components/ContentstackVideoExportModal";
import type { VideoFrontmatter, Playlist } from "../types/video";
import { useGitHubConfig } from "../hooks/useGitHubConfig";
import { usePlaylists } from "../hooks/usePlaylists";
import {
  BUTTON_PRIMARY_CLASSES,
  BUTTON_SECONDARY_CLASSES,
  INPUT_CLASSES,
} from "../utils/constants";
import { stageVideoChange } from "../utils/staging";
import StagingPanel from "../components/StagingPanel";

function VideoEditorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filePath = searchParams.get("file");
  const isNew = searchParams.get("new") === "true";
  const defaultPlaylist = searchParams.get("playlist") || "";

  const { config: githubConfig, loading: configLoading } = useGitHubConfig();
  const {
    playlists: configPlaylists,
    addPlaylist,
    isSaving: isAddingPlaylist,
  } = usePlaylists(githubConfig);

  // Video state
  const [frontmatter, setFrontmatter] = useState<VideoFrontmatter>({
    date: new Date().toISOString(),
    position: "000",
    title: "",
    description: "",
    image: "",
    videoId: "",
    transcript: "",
    tags: [],
    playlist: defaultPlaylist,
    duration: undefined,
  });
  const [originalSha, setOriginalSha] = useState<string | null>(null);
  const [originalPath, setOriginalPath] = useState<string | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingTranscript, setIsFetchingTranscript] = useState(false);
  const [isRefreshingFromYouTube, setIsRefreshingFromYouTube] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "staged" | "error"
  >("idle");
  const [newTag, setNewTag] = useState("");
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [playlistJustAdded, setPlaylistJustAdded] = useState(false);
  const [backUrl, setBackUrl] = useState("/videos");

  // Get the back URL from sessionStorage on mount
  useEffect(() => {
    const storedUrl = sessionStorage.getItem("videosListUrl");
    if (storedUrl) {
      setBackUrl(storedUrl);
    }
  }, []);

  // Check if current playlist is missing from config
  const isPlaylistMissingFromConfig =
    frontmatter.playlist &&
    !configPlaylists.some((p) => p.folder === frontmatter.playlist);

  // Add missing playlist to config
  const handleAddPlaylistToConfig = async () => {
    if (!frontmatter.playlist) return;

    const newPlaylist: Playlist = {
      id: "", // Will need to be filled in later in settings
      name: frontmatter.playlist
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      folder: frontmatter.playlist,
      enabled: true,
    };

    const success = await addPlaylist(newPlaylist);
    if (success) {
      setPlaylistJustAdded(true);
      setTimeout(() => setPlaylistJustAdded(false), 3000);
    }
  };

  // Load video from GitHub
  const loadVideo = useCallback(async () => {
    if (!githubConfig || !filePath) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/videos/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFrontmatter(data.frontmatter);
        setOriginalSha(data.sha);
        setOriginalPath(filePath);
      } else {
        setError(data.error || "Failed to load video");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load video");
    } finally {
      setIsLoading(false);
    }
  }, [githubConfig, filePath]);

  useEffect(() => {
    if (githubConfig && filePath && !isNew) {
      loadVideo();
    }
  }, [githubConfig, filePath, isNew, loadVideo]);

  // Save video to GitHub
  const saveVideo = async () => {
    if (!githubConfig) {
      setError("GitHub not configured");
      return;
    }

    if (!frontmatter.videoId) {
      setError("Video ID is required");
      return;
    }

    if (!frontmatter.playlist) {
      setError("Playlist is required");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveStatus("idle");

    try {
      // Build file content for staging
      const yaml = require("js-yaml");
      const yamlContent = yaml.dump(
        {
          date: frontmatter.date || "",
          position: frontmatter.position || "000",
          title: frontmatter.title || "",
          description: frontmatter.description || "",
          image: frontmatter.image || "",
          videoId: frontmatter.videoId || "",
          transcript: frontmatter.transcript || "",
          tags: frontmatter.tags || [],
          playlist: frontmatter.playlist || "",
          duration: frontmatter.duration || undefined,
        },
        {
          lineWidth: -1,
          noRefs: true,
          sortKeys: false,
          quotingType: '"',
          forceQuotes: false,
        }
      );
      const fileContent = `---\n${yamlContent}---\n\n`;

      // Always stage changes - no immediate commits
      const videosFolder =
        process.env.NEXT_PUBLIC_GITHUB_VIDEOS_FOLDER || "content/3.videos";
      const filename = `${frontmatter.position}-${frontmatter.videoId}.md`;
      const newFilePath = `${videosFolder}/${frontmatter.playlist}/${filename}`;

      stageVideoChange({
        filePath: newFilePath,
        content: fileContent,
        sha: originalSha || undefined,
        oldPath: originalPath || undefined,
        title: frontmatter.title,
        videoId: frontmatter.videoId,
        commitMessage: `Update video: ${frontmatter.title}`,
      });

      // Update local state
      if (isNew && newFilePath) {
        setOriginalPath(newFilePath);
        router.replace(`/video?file=${encodeURIComponent(newFilePath)}`);
      } else if (newFilePath !== originalPath) {
        setOriginalPath(newFilePath);
      }

      setSaveStatus("staged");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save video");
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch transcript from YouTube
  const fetchTranscript = async () => {
    if (!frontmatter.videoId) {
      setError("Video ID is required to fetch transcript");
      return;
    }

    setIsFetchingTranscript(true);
    setError(null);

    try {
      const response = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: frontmatter.videoId }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.transcript) {
          setFrontmatter((prev) => ({ ...prev, transcript: data.transcript }));
        } else if (data.warning) {
          setError(data.warning);
        }
      } else {
        setError(data.error || "Failed to fetch transcript");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch transcript");
    } finally {
      setIsFetchingTranscript(false);
    }
  };

  // Refresh metadata from YouTube
  const refreshFromYouTube = async () => {
    if (!frontmatter.videoId) {
      setError("Video ID is required");
      return;
    }

    setIsRefreshingFromYouTube(true);
    setError(null);

    try {
      // Fetch video details and transcript in parallel
      const [videoResponse, transcriptResponse] = await Promise.all([
        fetch("/api/youtube/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: frontmatter.videoId }),
        }),
        fetch("/api/youtube/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: frontmatter.videoId }),
        }),
      ]);

      const videoData = await videoResponse.json();
      const transcriptData = await transcriptResponse.json();

      if (videoData.success && videoData.video) {
        setFrontmatter((prev) => ({
          ...prev,
          title: videoData.video.title,
          description: videoData.video.description,
          image: videoData.video.thumbnail,
          date: videoData.video.publishedAt,
          duration: videoData.video.duration,
          // Update transcript if successfully fetched, otherwise keep existing
          transcript:
            transcriptData.success && transcriptData.transcript
              ? transcriptData.transcript
              : prev.transcript,
        }));
      } else {
        setError(videoData.error || "Failed to fetch video info");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch video info");
    } finally {
      setIsRefreshingFromYouTube(false);
    }
  };

  // Handle tag management
  const addTag = () => {
    const tag = newTag.trim().toLowerCase();
    if (tag && !frontmatter.tags.includes(tag)) {
      setFrontmatter((prev) => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setNewTag("");
    }
  };

  // Generate tags using AI
  const generateTagsWithAI = async () => {
    if (!frontmatter.title) {
      setError("Video title is required to generate tags");
      return;
    }

    setIsGeneratingTags(true);
    setError(null);

    try {
      const response = await fetch("/api/openai/generate-video-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: frontmatter.title,
          description: frontmatter.description,
          transcript: frontmatter.transcript,
        }),
      });

      const data = await response.json();

      if (data.success && data.tags) {
        // Replace all existing tags with the new ones
        setFrontmatter((prev) => ({
          ...prev,
          tags: data.tags,
        }));
      } else {
        setError(data.error || "Failed to generate tags");
      }
    } catch (err: any) {
      setError(err.message || "Failed to generate tags");
    } finally {
      setIsGeneratingTags(false);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFrontmatter((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveVideo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [frontmatter, githubConfig, originalSha, originalPath]);

  if (configLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!githubConfig) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center max-w-md">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            GitHub Not Configured
          </h2>
          <p className="text-gray-600 mb-6">
            Please configure GitHub to edit videos.
          </p>
          <Link href="/settings" className={BUTTON_PRIMARY_CLASSES}>
            Go to Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href={backUrl}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Videos
            </Link>
            {!isNew && originalPath && (
              <span className="text-sm text-gray-500">
                {originalPath.split("/").pop()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saved" && (
              <span className="text-sm text-green-600 font-medium">
                ✓ Saved
              </span>
            )}
            {saveStatus === "staged" && (
              <span className="text-sm text-blue-600 font-medium">
                ✓ Staged
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm text-red-600 font-medium">
                Save failed
              </span>
            )}
            {githubConfig && (
              <StagingPanel
                githubConfig={githubConfig}
                onCommit={() => {
                  if (filePath) {
                    loadVideo();
                  }
                }}
              />
            )}
            <button
                onClick={saveVideo}
                disabled={isSaving}
                className={clsx(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                  isSaving
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                )}
              >
                {isSaving ? (
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
                    Staging...
                  </>
                ) : (
                  <>
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
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                    Stage Changes
                  </>
                )}
              </button>
            <button
              onClick={() => setIsExportModalOpen(true)}
              className={BUTTON_SECONDARY_CLASSES}
            >
              Export to Contentstack
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading video...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="text-xs text-red-600 hover:text-red-800 mt-1 underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Title */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <label
                htmlFor="video-title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Title
              </label>
              <input
                id="video-title"
                type="text"
                value={frontmatter.title}
                onChange={(e) =>
                  setFrontmatter((prev) => ({ ...prev, title: e.target.value }))
                }
                className={`${INPUT_CLASSES} text-xl font-semibold`}
                placeholder="Video title..."
              />
            </div>

            {/* YouTube Embed */}
            <YouTubeEmbed
              videoId={frontmatter.videoId}
              title={frontmatter.title}
            />

            {/* Metadata */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Video Metadata
                </h2>
                <button
                  onClick={refreshFromYouTube}
                  disabled={isRefreshingFromYouTube || !frontmatter.videoId}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    isRefreshingFromYouTube || !frontmatter.videoId
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  )}
                >
                  {isRefreshingFromYouTube ? (
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
                      Refreshing...
                    </>
                  ) : (
                    <>
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
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Refresh from YouTube
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Video ID */}
                <div>
                  <label
                    htmlFor="video-id"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Video ID *
                  </label>
                  <input
                    id="video-id"
                    type="text"
                    value={frontmatter.videoId}
                    onChange={(e) =>
                      setFrontmatter((prev) => ({
                        ...prev,
                        videoId: e.target.value,
                      }))
                    }
                    className={INPUT_CLASSES}
                    placeholder="e.g., dQw4w9WgXcQ"
                  />
                </div>

                {/* Playlist */}
                <div>
                  <label
                    htmlFor="video-playlist"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Playlist *
                  </label>
                  {isPlaylistMissingFromConfig ? (
                    /* Playlist exists in file but not in config */
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm">
                          <span className="font-medium text-amber-800 capitalize">
                            {frontmatter.playlist.replace(/-/g, " ")}
                          </span>
                          <span className="text-amber-600 ml-2">
                            (not in config)
                          </span>
                        </div>
                      </div>
                      {playlistJustAdded ? (
                        <p className="text-sm text-green-600 flex items-center gap-1">
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Added! Go to Settings to add the YouTube Playlist ID.
                        </p>
                      ) : (
                        <button
                          onClick={handleAddPlaylistToConfig}
                          disabled={isAddingPlaylist}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors disabled:opacity-50"
                        >
                          {isAddingPlaylist ? (
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
                              Adding...
                            </>
                          ) : (
                            <>
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
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add &quot;{frontmatter.playlist}&quot; to
                              playlists.json
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ) : (
                    /* Normal playlist dropdown */
                    <select
                      id="video-playlist"
                      value={frontmatter.playlist}
                      onChange={(e) =>
                        setFrontmatter((prev) => ({
                          ...prev,
                          playlist: e.target.value,
                        }))
                      }
                      className={INPUT_CLASSES}
                    >
                      <option value="">Select playlist...</option>
                      {configPlaylists.map((p: Playlist) => (
                        <option key={p.folder} value={p.folder}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Position */}
                <div>
                  <label
                    htmlFor="video-position"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Position
                  </label>
                  <input
                    id="video-position"
                    type="text"
                    value={frontmatter.position}
                    onChange={(e) =>
                      setFrontmatter((prev) => ({
                        ...prev,
                        position: e.target.value,
                      }))
                    }
                    className={INPUT_CLASSES}
                    placeholder="e.g., 001"
                  />
                </div>

                {/* Date */}
                <div>
                  <label
                    htmlFor="video-date"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Date
                  </label>
                  <input
                    id="video-date"
                    type="date"
                    value={
                      frontmatter.date ? frontmatter.date.split("T")[0] : ""
                    }
                    onChange={(e) =>
                      setFrontmatter((prev) => ({
                        ...prev,
                        date: e.target.value
                          ? `${e.target.value}T10:00:00Z`
                          : "",
                      }))
                    }
                    className={INPUT_CLASSES}
                  />
                </div>

                {/* Duration (read-only) */}
                {frontmatter.duration && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duration
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
                      {frontmatter.duration}
                    </div>
                  </div>
                )}

                {/* Thumbnail */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="video-image"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Thumbnail URL
                  </label>
                  <input
                    id="video-image"
                    type="url"
                    value={frontmatter.image}
                    onChange={(e) =>
                      setFrontmatter((prev) => ({
                        ...prev,
                        image: e.target.value,
                      }))
                    }
                    className={INPUT_CLASSES}
                    placeholder="https://i.ytimg.com/vi/..."
                  />
                  {frontmatter.image && (
                    <div className="mt-2 w-48 aspect-video rounded-md overflow-hidden border border-gray-200">
                      <img
                        key={frontmatter.image}
                        src={frontmatter.image}
                        alt="Thumbnail preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label
                    htmlFor="video-description"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Description
                  </label>
                  <textarea
                    id="video-description"
                    value={frontmatter.description}
                    onChange={(e) =>
                      setFrontmatter((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    rows={4}
                    className={`${INPUT_CLASSES} resize-none`}
                    placeholder="Video description..."
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Tags</h2>
                <button
                  onClick={generateTagsWithAI}
                  disabled={isGeneratingTags || !frontmatter.title}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    isGeneratingTags || !frontmatter.title
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  )}
                  title={
                    !frontmatter.title
                      ? "Title required to generate tags"
                      : "Generate tags using AI"
                  }
                >
                  {isGeneratingTags ? (
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
                      Generating...
                    </>
                  ) : (
                    <>
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      Generate with AI
                    </>
                  )}
                </button>
              </div>

              {/* Existing tags */}
              <div className="flex flex-wrap gap-2 mb-4">
                {frontmatter.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-600 transition-colors"
                      aria-label={`Remove tag: ${tag}`}
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
                  </span>
                ))}
                {frontmatter.tags.length === 0 && (
                  <span className="text-sm text-gray-500">
                    No tags added - click "Generate with AI" to suggest tags
                  </span>
                )}
              </div>

              {/* Add tag input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className={`${INPUT_CLASSES} flex-1`}
                  placeholder="Add a tag..."
                />
                <button
                  onClick={addTag}
                  disabled={!newTag.trim()}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    !newTag.trim()
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                >
                  Add
                </button>
              </div>
            </div>

            {/* Transcript */}
            <TranscriptEditor
              transcript={frontmatter.transcript}
              onChange={(transcript) =>
                setFrontmatter((prev) => ({ ...prev, transcript }))
              }
              videoId={frontmatter.videoId}
              onFetchTranscript={fetchTranscript}
              isFetching={isFetchingTranscript}
            />
          </div>
        )}
      </main>

      {/* Contentstack Export Modal */}
      <ContentstackVideoExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        videoFrontmatter={frontmatter}
      />
    </div>
  );
}

export default function VideoEditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-gray-600">Loading...</div>
        </div>
      }
    >
      <VideoEditorContent />
    </Suspense>
  );
}
