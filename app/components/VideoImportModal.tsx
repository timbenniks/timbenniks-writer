"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import type { Playlist, YouTubeVideo, VideoFrontmatter, GitHubVideoFile } from "../types/video";
import type { GitHubConfig } from "../types/github";
import { generatePosition } from "../types/video";
import { stageVideoChange } from "../utils/staging";
import yaml from "js-yaml";

interface VideoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  existingVideos: GitHubVideoFile[];
  githubConfig: GitHubConfig;
  onImportComplete: () => void;
}

interface ImportableVideo extends YouTubeVideo {
  exists: boolean;
  selected: boolean;
  importing: boolean;
  imported: boolean;
  error?: string;
}

export default function VideoImportModal({
  isOpen,
  onClose,
  playlists,
  existingVideos,
  githubConfig,
  onImportComplete,
}: VideoImportModalProps) {
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [videos, setVideos] = useState<ImportableVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedPlaylist(null);
      setVideos([]);
      setError(null);
      setImportProgress({ current: 0, total: 0 });
    }
  }, [isOpen]);

  // Check if a video already exists
  const videoExists = (videoId: string): boolean => {
    return existingVideos.some((v) => v.frontmatter.videoId === videoId);
  };

  // Fetch videos from YouTube playlist
  const fetchPlaylistVideos = async () => {
    if (!selectedPlaylist) return;

    setIsLoading(true);
    setError(null);
    setVideos([]);

    try {
      const response = await fetch("/api/youtube/playlist-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: selectedPlaylist.id,
          includeDurations: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const importableVideos: ImportableVideo[] = data.videos.map(
          (video: YouTubeVideo) => ({
            ...video,
            exists: videoExists(video.videoId),
            selected: !videoExists(video.videoId), // Pre-select new videos
            importing: false,
            imported: false,
          })
        );
        setVideos(importableVideos);
      } else {
        setError(data.error || "Failed to fetch playlist videos");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch playlist videos");
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle video selection
  const toggleVideoSelection = (videoId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.videoId === videoId ? { ...v, selected: !v.selected } : v
      )
    );
  };

  // Select all new videos
  const selectAllNew = () => {
    setVideos((prev) =>
      prev.map((v) => ({ ...v, selected: !v.exists }))
    );
  };

  // Deselect all
  const deselectAll = () => {
    setVideos((prev) => prev.map((v) => ({ ...v, selected: false })));
  };

  // Fetch transcript for a video
  const fetchTranscript = async (videoId: string): Promise<string> => {
    try {
      const response = await fetch("/api/youtube/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });

      const data = await response.json();
      return data.transcript || "";
    } catch {
      return "";
    }
  };

  // Import selected videos
  const importVideos = async () => {
    if (!selectedPlaylist || !githubConfig) return;

    const selectedVideos = videos.filter((v) => v.selected && !v.exists);
    if (selectedVideos.length === 0) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: selectedVideos.length });
    setError(null);

    // Calculate starting position
    const existingInPlaylist = existingVideos.filter(
      (v) => v.frontmatter.playlist === selectedPlaylist.folder
    );
    let nextPosition = existingInPlaylist.length;

    for (let i = 0; i < selectedVideos.length; i++) {
      const video = selectedVideos[i];
      setImportProgress({ current: i + 1, total: selectedVideos.length });

      // Mark as importing
      setVideos((prev) =>
        prev.map((v) =>
          v.videoId === video.videoId ? { ...v, importing: true } : v
        )
      );

      try {
        // Fetch transcript
        const transcript = await fetchTranscript(video.videoId);

        // Create frontmatter
        const frontmatter: VideoFrontmatter = {
          date: video.publishedAt,
          position: generatePosition(nextPosition),
          title: video.title,
          description: video.description,
          image: video.thumbnail,
          videoId: video.videoId,
          transcript,
          tags: [],
          playlist: selectedPlaylist.folder,
          duration: video.duration,
        };

        // Build file content
        const videosFolder =
          process.env.NEXT_PUBLIC_GITHUB_VIDEOS_FOLDER || "content/3.videos";
        const filename = `${frontmatter.position}-${frontmatter.videoId}.md`;
        const filePath = `${videosFolder}/${frontmatter.playlist}/${filename}`;

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

        // Always stage changes
        stageVideoChange({
          filePath: filePath,
          content: fileContent,
          title: frontmatter.title,
          videoId: frontmatter.videoId,
          commitMessage: `Import video: ${frontmatter.title}`,
        });

        setVideos((prev) =>
          prev.map((v) =>
            v.videoId === video.videoId
              ? { ...v, importing: false, imported: true, exists: true }
              : v
          )
        );
        nextPosition++;
      } catch (err: any) {
        setVideos((prev) =>
          prev.map((v) =>
            v.videoId === video.videoId
              ? { ...v, importing: false, error: err.message }
              : v
          )
        );
      }

      // Small delay between imports to avoid rate limiting
      if (i < selectedVideos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    setIsImporting(false);
    onImportComplete();
  };

  const selectedCount = videos.filter((v) => v.selected && !v.exists).length;
  const newCount = videos.filter((v) => !v.exists).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={!isImporting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Import Videos from YouTube
              </h2>
              {!isImporting && (
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
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Playlist selector */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Playlist
              </label>
              <div className="flex gap-3">
                <select
                  value={selectedPlaylist?.id || ""}
                  onChange={(e) => {
                    const playlist = playlists.find((p) => p.id === e.target.value);
                    setSelectedPlaylist(playlist || null);
                    setVideos([]);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  disabled={isImporting}
                >
                  <option value="">Choose a playlist...</option>
                  {playlists
                    .filter((p) => p.enabled)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={fetchPlaylistVideos}
                  disabled={!selectedPlaylist || isLoading || isImporting}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    !selectedPlaylist || isLoading || isImporting
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                >
                  {isLoading ? "Loading..." : "Fetch Videos"}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Videos list */}
            {videos.length > 0 && (
              <>
                {/* Selection controls */}
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600">
                    {newCount} new video{newCount !== 1 ? "s" : ""} found
                    {selectedCount > 0 && `, ${selectedCount} selected`}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllNew}
                      disabled={isImporting}
                      className="text-sm text-gray-600 hover:text-gray-900 underline"
                    >
                      Select All New
                    </button>
                    <button
                      onClick={deselectAll}
                      disabled={isImporting}
                      className="text-sm text-gray-600 hover:text-gray-900 underline"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Video list */}
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 max-h-80 overflow-y-auto">
                  {videos.map((video) => (
                    <div
                      key={video.videoId}
                      className={clsx(
                        "flex items-center gap-4 p-3 transition-colors",
                        video.exists
                          ? "bg-gray-50"
                          : video.selected
                            ? "bg-blue-50"
                            : "hover:bg-gray-50"
                      )}
                    >
                      {/* Checkbox / Status */}
                      <div className="flex-shrink-0">
                        {video.importing ? (
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
                        ) : video.imported ? (
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
                        ) : video.error ? (
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
                        ) : (
                          <input
                            type="checkbox"
                            checked={video.selected}
                            onChange={() => toggleVideoSelection(video.videoId)}
                            disabled={video.exists || isImporting}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
                          />
                        )}
                      </div>

                      {/* Thumbnail */}
                      <div className="w-24 aspect-video flex-shrink-0 bg-gray-200 rounded overflow-hidden">
                        {video.thumbnail && (
                          <img
                            src={video.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {video.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {video.duration && (
                            <span className="text-xs text-gray-500">
                              {video.duration}
                            </span>
                          )}
                          {video.exists && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                              Already imported
                            </span>
                          )}
                          {video.imported && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                              Imported
                            </span>
                          )}
                          {video.error && (
                            <span className="text-xs text-red-600">
                              {video.error}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Import progress */}
            {isImporting && (
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-3">
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
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Importing videos...
                    </p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      {importProgress.current} of {importProgress.total} (including
                      transcript fetch)
                    </p>
                  </div>
                </div>
                <div className="mt-3 h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{
                      width: `${(importProgress.current / importProgress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isImporting}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                isImporting
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              )}
            >
              {videos.some((v) => v.imported) ? "Done" : "Cancel"}
            </button>
            <button
              onClick={importVideos}
              disabled={isImporting || selectedCount === 0}
              className={clsx(
                "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                isImporting || selectedCount === 0
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              )}
            >
              {isImporting ? (
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
                  Importing...
                </>
              ) : (
                `Import ${selectedCount} Video${selectedCount !== 1 ? "s" : ""}`
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

