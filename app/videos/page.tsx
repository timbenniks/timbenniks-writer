"use client";

import { useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import AppHeader from "../components/AppHeader";
import VideoCard from "../components/VideoCard";
import DeleteConfirmModal from "../components/ui/DeleteConfirmModal";
import VideoImportModal from "../components/VideoImportModal";
import BulkVideoExportModal from "../components/BulkVideoExportModal";
import ProgressBar from "../components/ui/ProgressBar";
import type { GitHubVideoFile, Playlist } from "../types/video";
import { useGitHubConfig } from "../hooks/useGitHubConfig";
import { useGitHubVideos } from "../hooks/useGitHubVideos";
import { usePlaylists } from "../hooks/usePlaylists";
import {
  INPUT_CLASSES,
  BUTTON_PRIMARY_CLASSES,
  BUTTON_SECONDARY_CLASSES,
} from "../utils/constants";

// Inner component that uses useSearchParams
function VideosPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const {
    config: githubConfig,
    loading: configLoading,
    error: configError,
  } = useGitHubConfig();
  const {
    videos,
    playlists: folderPlaylists,
    isLoading,
    error,
    loadVideos,
    setVideos,
    setError,
  } = useGitHubVideos(githubConfig);
  const {
    playlists: configPlaylists,
    addPlaylist,
    isSaving: isAddingPlaylist,
  } = usePlaylists(githubConfig);

  // Initialize state from URL params
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(
    searchParams.get("playlist") || null
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagsParam = searchParams.get("tags");
    return tagsParam ? tagsParam.split(",") : [];
  });
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">(
    (searchParams.get("sort") as "newest" | "oldest") || "newest"
  );
  const [addedPlaylists, setAddedPlaylists] = useState<Set<string>>(new Set());

  // Update URL when filters change
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (
          value === null ||
          value === "" ||
          (key === "sort" && value === "newest")
        ) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      const newUrl = params.toString() ? `?${params.toString()}` : "/videos";
      router.replace(newUrl, { scroll: false });
    },
    [searchParams, router]
  );

  // Handlers that update both state and URL
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      updateUrlParams({ q: value || null });
    },
    [updateUrlParams]
  );

  const handlePlaylistChange = useCallback(
    (value: string | null) => {
      setSelectedPlaylist(value);
      updateUrlParams({ playlist: value });
    },
    [updateUrlParams]
  );

  const handleTagToggle = useCallback(
    (tag: string) => {
      // Calculate new tags outside of setState to avoid updating router during render
      const newTags = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];

      setSelectedTags(newTags);
      // Use setTimeout to defer router update to avoid "setState during render" error
      setTimeout(() => {
        updateUrlParams({
          tags: newTags.length > 0 ? newTags.join(",") : null,
        });
      }, 0);
    },
    [selectedTags, updateUrlParams]
  );

  const handleSortChange = useCallback(
    (value: "newest" | "oldest") => {
      setSortOrder(value);
      updateUrlParams({ sort: value === "newest" ? null : value });
    },
    [updateUrlParams]
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedPlaylist(null);
    setSelectedTags([]);
    setSortOrder("newest");
    router.replace("/videos", { scroll: false });
  }, [router]);

  // Find playlists that exist in GitHub but not in config
  const missingPlaylists = useMemo(() => {
    const configFolders = new Set(configPlaylists.map((p) => p.folder));
    return folderPlaylists.filter((folder) => !configFolders.has(folder));
  }, [folderPlaylists, configPlaylists]);

  // Add a missing playlist to config
  const handleAddMissingPlaylist = async (folder: string) => {
    const newPlaylist: Playlist = {
      id: "", // User will need to add this in settings
      name: folder.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      folder,
      enabled: true,
    };

    const success = await addPlaylist(newPlaylist);
    if (success) {
      setAddedPlaylists((prev) => new Set([...prev, folder]));
    }
  };
  const [deleteVideo, setDeleteVideo] = useState<GitHubVideoFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBulkExportModalOpen, setIsBulkExportModalOpen] = useState(false);

  // Bulk refresh state
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState({
    current: 0,
    total: 0,
    currentVideo: "",
    status: "" as "fetching" | "transcript" | "saving" | "",
  });

  // Bulk tag generation state
  const [isBulkGeneratingTags, setIsBulkGeneratingTags] = useState(false);
  const [bulkTagProgress, setBulkTagProgress] = useState({
    current: 0,
    total: 0,
    currentVideo: "",
    status: "" as "generating" | "saving" | "",
  });

  // Extract unique tags from videos
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    videos.forEach((video) => {
      video.frontmatter.tags?.forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [videos]);

  // Get playlist display names from config
  const getPlaylistDisplayName = (folder: string): string => {
    const configPlaylist = configPlaylists.find((p) => p.folder === folder);
    return configPlaylist?.name || folder.replace(/-/g, " ");
  };

  // Filter and sort videos
  const filteredVideos = useMemo(() => {
    const lowerSearchQuery = searchQuery.toLowerCase();

    return videos
      .filter((video) => {
        // Search filter
        const matchesSearch =
          searchQuery === "" ||
          video.frontmatter.title.toLowerCase().includes(lowerSearchQuery) ||
          video.frontmatter.description
            ?.toLowerCase()
            .includes(lowerSearchQuery) ||
          video.name.toLowerCase().includes(lowerSearchQuery);

        // Playlist filter
        const matchesPlaylist =
          !selectedPlaylist || video.frontmatter.playlist === selectedPlaylist;

        // Tag filter
        const matchesTags =
          selectedTags.length === 0 ||
          selectedTags.some((tag) => video.frontmatter.tags?.includes(tag));

        return matchesSearch && matchesPlaylist && matchesTags;
      })
      .sort((a, b) => {
        const dateA = a.frontmatter.date || "";
        const dateB = b.frontmatter.date || "";
        return sortOrder === "newest"
          ? dateB.localeCompare(dateA)
          : dateA.localeCompare(dateB);
      });
  }, [videos, searchQuery, selectedPlaylist, selectedTags, sortOrder]);

  const handleDeleteClick = (e: React.MouseEvent, video: GitHubVideoFile) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteVideo(video);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteVideo || !githubConfig) return;

    setIsDeleting(true);

    try {
      const response = await fetch("/api/github/videos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath: deleteVideo.path,
          sha: deleteVideo.sha,
          videoTitle: deleteVideo.frontmatter.title,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to delete video");
      }

      setVideos((prev) => prev.filter((v) => v.sha !== deleteVideo.sha));
      setDeleteVideo(null);
    } catch (error: any) {
      console.error("Failed to delete video:", error);
      setError(error.message || "Failed to delete video from GitHub");
      setDeleteVideo(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleVideoSelection = (videoSha: string) => {
    setSelectedVideos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(videoSha)) {
        newSet.delete(videoSha);
      } else {
        newSet.add(videoSha);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedVideos.size === filteredVideos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(filteredVideos.map((v) => v.sha)));
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedVideos(new Set());
  };

  // Bulk refresh videos from YouTube
  const bulkRefreshFromYouTube = async () => {
    if (!githubConfig || selectedVideos.size === 0) return;

    const selectedVideosList = videos.filter((v) => selectedVideos.has(v.sha));
    setIsBulkRefreshing(true);
    setBulkRefreshProgress({
      current: 0,
      total: selectedVideosList.length,
      currentVideo: "",
      status: "",
    });

    const updatedVideos: GitHubVideoFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < selectedVideosList.length; i++) {
      const video = selectedVideosList[i];
      const videoId = video.frontmatter.videoId;

      setBulkRefreshProgress({
        current: i + 1,
        total: selectedVideosList.length,
        currentVideo: video.frontmatter.title || videoId,
        status: "fetching",
      });

      try {
        // Step 1: Fetch video details from YouTube
        const videoResponse = await fetch("/api/youtube/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });

        const videoData = await videoResponse.json();

        if (!videoData.success || !videoData.video) {
          errors.push(
            `${video.frontmatter.title}: Failed to fetch from YouTube`
          );
          continue;
        }

        // Step 2: Fetch transcript
        setBulkRefreshProgress((prev) => ({ ...prev, status: "transcript" }));

        const transcriptResponse = await fetch("/api/youtube/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });

        const transcriptData = await transcriptResponse.json();

        // Step 3: Prepare updated frontmatter
        const updatedFrontmatter = {
          ...video.frontmatter,
          title: videoData.video.title,
          description: videoData.video.description,
          image: videoData.video.thumbnail,
          date: videoData.video.publishedAt || video.frontmatter.date,
          duration: videoData.video.duration,
          transcript: transcriptData.success
            ? transcriptData.transcript
            : video.frontmatter.transcript,
        };

        // Step 4: Save to GitHub
        setBulkRefreshProgress((prev) => ({ ...prev, status: "saving" }));

        const saveResponse = await fetch("/api/github/videos/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: githubConfig.repo,
            branch: githubConfig.branch,
            frontmatter: updatedFrontmatter,
            filePath: video.path,
            sha: video.sha,
          }),
        });

        const saveData = await saveResponse.json();

        if (saveData.success) {
          updatedVideos.push({
            ...video,
            sha: saveData.sha,
            frontmatter: updatedFrontmatter,
          });
        } else {
          errors.push(
            `${video.frontmatter.title}: ${saveData.error || "Failed to save"}`
          );
        }

        // Small delay between videos to avoid rate limiting
        if (i < selectedVideosList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (err: any) {
        errors.push(
          `${video.frontmatter.title}: ${err.message || "Unknown error"}`
        );
      }
    }

    // Update local state with new data
    if (updatedVideos.length > 0) {
      setVideos((prev) => {
        // Create a map of updated videos by videoId for quick lookup
        const updatedMap = new Map(
          updatedVideos.map((v) => [v.frontmatter.videoId, v])
        );
        
        // Filter out videos that were updated, then add the updated versions
        // This prevents duplicates when videos have new SHAs
        const filtered = prev.filter(
          (v) => !updatedMap.has(v.frontmatter.videoId)
        );
        
        return [...filtered, ...updatedVideos];
      });
    }

    // Show results
    if (errors.length > 0) {
      setError(
        `Refreshed ${updatedVideos.length}/${
          selectedVideosList.length
        } videos. Errors:\n${errors.join("\n")}`
      );
    }

    setIsBulkRefreshing(false);
    setBulkRefreshProgress({
      current: 0,
      total: 0,
      currentVideo: "",
      status: "",
    });
    exitSelectionMode();
  };

  // Bulk generate tags using AI
  const bulkGenerateTagsWithAI = async () => {
    if (!githubConfig || selectedVideos.size === 0) return;

    const selectedVideosList = videos.filter((v) => selectedVideos.has(v.sha));
    setIsBulkGeneratingTags(true);
    setBulkTagProgress({
      current: 0,
      total: selectedVideosList.length,
      currentVideo: "",
      status: "",
    });

    const updatedVideos: GitHubVideoFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < selectedVideosList.length; i++) {
      const video = selectedVideosList[i];

      setBulkTagProgress({
        current: i + 1,
        total: selectedVideosList.length,
        currentVideo: video.frontmatter.title || video.frontmatter.videoId,
        status: "generating",
      });

      try {
        // Skip videos that already have tags
        if (video.frontmatter.tags && video.frontmatter.tags.length > 0) {
          continue;
        }

        // Step 1: Generate tags using AI
        const tagsResponse = await fetch("/api/openai/generate-video-tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: video.frontmatter.title,
            description: video.frontmatter.description,
            transcript: video.frontmatter.transcript,
          }),
        });

        const tagsData = await tagsResponse.json();

        if (!tagsData.success || !tagsData.tags) {
          errors.push(`${video.frontmatter.title}: Failed to generate tags`);
          continue;
        }

        // Step 2: Save to GitHub
        setBulkTagProgress((prev) => ({ ...prev, status: "saving" }));

        const updatedFrontmatter = {
          ...video.frontmatter,
          tags: tagsData.tags,
        };

        const saveResponse = await fetch("/api/github/videos/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: githubConfig.repo,
            branch: githubConfig.branch,
            frontmatter: updatedFrontmatter,
            filePath: video.path,
            sha: video.sha,
          }),
        });

        const saveData = await saveResponse.json();

        if (saveData.success) {
          updatedVideos.push({
            ...video,
            sha: saveData.sha,
            frontmatter: updatedFrontmatter,
          });
        } else {
          errors.push(
            `${video.frontmatter.title}: ${saveData.error || "Failed to save"}`
          );
        }

        // Small delay between videos to avoid rate limiting
        if (i < selectedVideosList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Longer delay for OpenAI
        }
      } catch (err: any) {
        errors.push(
          `${video.frontmatter.title}: ${err.message || "Unknown error"}`
        );
      }
    }

    // Update local state with new data
    if (updatedVideos.length > 0) {
      setVideos((prev) => {
        // Create a map of updated videos by videoId for quick lookup
        const updatedMap = new Map(
          updatedVideos.map((v) => [v.frontmatter.videoId, v])
        );
        
        // Filter out videos that were updated, then add the updated versions
        // This prevents duplicates when videos have new SHAs
        const filtered = prev.filter(
          (v) => !updatedMap.has(v.frontmatter.videoId)
        );
        
        return [...filtered, ...updatedVideos];
      });
    }

    // Show results
    const skippedCount = selectedVideosList.filter(
      (v) => v.frontmatter.tags?.length > 0
    ).length;
    const successCount = updatedVideos.length;

    if (errors.length > 0 || skippedCount > 0) {
      let message = `Generated tags for ${successCount} video${
        successCount !== 1 ? "s" : ""
      }.`;
      if (skippedCount > 0) {
        message += ` Skipped ${skippedCount} (already had tags).`;
      }
      if (errors.length > 0) {
        message += ` Errors:\n${errors.join("\n")}`;
      }
      setError(message);
    }

    setIsBulkGeneratingTags(false);
    setBulkTagProgress({ current: 0, total: 0, currentVideo: "", status: "" });
    exitSelectionMode();
  };

  // Header actions
  const headerActions = githubConfig && (
    <>
      {isSelectionMode ? (
        <>
          <span className="text-sm text-gray-600">
            {selectedVideos.size} selected
          </span>
          <button
            onClick={toggleSelectAll}
            className={BUTTON_SECONDARY_CLASSES}
          >
            {selectedVideos.size === filteredVideos.length
              ? "Deselect All"
              : "Select All"}
          </button>
          <button
            onClick={bulkRefreshFromYouTube}
            disabled={selectedVideos.size === 0 || isBulkRefreshing}
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
              selectedVideos.size === 0 || isBulkRefreshing
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {isBulkRefreshing ? (
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
          <button
            onClick={bulkGenerateTagsWithAI}
            disabled={
              selectedVideos.size === 0 ||
              isBulkRefreshing ||
              isBulkGeneratingTags
            }
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
              selectedVideos.size === 0 ||
                isBulkRefreshing ||
                isBulkGeneratingTags
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-amber-600 text-white hover:bg-amber-700"
            )}
          >
            {isBulkGeneratingTags ? (
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
                Generate Tags
              </>
            )}
          </button>
          <button
            onClick={() => setIsBulkExportModalOpen(true)}
            disabled={
              selectedVideos.size === 0 ||
              isBulkRefreshing ||
              isBulkGeneratingTags
            }
            className={clsx(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              selectedVideos.size === 0 ||
                isBulkRefreshing ||
                isBulkGeneratingTags
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700"
            )}
          >
            Export to Contentstack
          </button>
          <button
            onClick={exitSelectionMode}
            disabled={isBulkRefreshing || isBulkGeneratingTags}
            className={BUTTON_SECONDARY_CLASSES}
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className={BUTTON_SECONDARY_CLASSES}
          >
            Import from YouTube
          </button>
          <button
            onClick={() => setIsSelectionMode(true)}
            className={BUTTON_SECONDARY_CLASSES}
          >
            Select
          </button>
          <button
            onClick={loadVideos}
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
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        actions={headerActions}
        subtitle={
          githubConfig
            ? `Connected to ${githubConfig.repo} / content/3.videos`
            : "Connect to GitHub to view videos"
        }
      />

      {/* Bulk Refresh Progress */}
      {isBulkRefreshing && (
        <ProgressBar
          current={bulkRefreshProgress.current}
          total={bulkRefreshProgress.total}
          currentItem={bulkRefreshProgress.currentVideo}
          statusLabel={
            bulkRefreshProgress.status === "fetching"
              ? "Fetching video data..."
              : bulkRefreshProgress.status === "transcript"
              ? "Getting transcript..."
              : bulkRefreshProgress.status === "saving"
              ? "Saving to GitHub..."
              : ""
          }
          color="blue"
        />
      )}

      {/* Bulk Tag Generation Progress */}
      {isBulkGeneratingTags && (
        <ProgressBar
          current={bulkTagProgress.current}
          total={bulkTagProgress.total}
          currentItem={bulkTagProgress.currentVideo}
          statusLabel={
            bulkTagProgress.status === "generating"
              ? "Generating tags with AI..."
              : bulkTagProgress.status === "saving"
              ? "Saving to GitHub..."
              : ""
          }
          color="amber"
        />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {configLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading configuration...</p>
          </div>
        ) : !githubConfig ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              GitHub Not Configured
            </h2>
            <p className="text-gray-600 mb-6">
              {configError ||
                "Please add your GitHub configuration to .env.local to view and edit videos."}
            </p>
            <a href="/settings" className={BUTTON_PRIMARY_CLASSES}>
              View Settings
            </a>
          </div>
        ) : (
          <div className="flex gap-8">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Filters
                </h2>

                {/* Playlist Filter */}
                {folderPlaylists.length > 0 && (
                  <nav aria-label="Playlist filters" className="mb-6">
                    <h3 className="block text-sm font-medium text-gray-700 mb-3">
                      Playlists
                    </h3>
                    <div className="space-y-2" role="list">
                      <button
                        onClick={() => handlePlaylistChange(null)}
                        className={clsx(
                          "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                          selectedPlaylist === null
                            ? "bg-gray-900 text-white"
                            : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                        )}
                        role="listitem"
                      >
                        All Videos ({videos.length})
                      </button>
                      {folderPlaylists.map((playlist) => {
                        const count = videos.filter(
                          (v) => v.frontmatter.playlist === playlist
                        ).length;
                        return (
                          <button
                            key={playlist}
                            onClick={() => handlePlaylistChange(playlist)}
                            className={clsx(
                              "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors capitalize",
                              selectedPlaylist === playlist
                                ? "bg-gray-900 text-white"
                                : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                            )}
                            role="listitem"
                          >
                            {getPlaylistDisplayName(playlist)} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </nav>
                )}

                {/* Tag Filters */}
                {allTags.length > 0 && (
                  <nav aria-label="Tag filters">
                    <h3 className="block text-sm font-medium text-gray-700 mb-3">
                      Tags
                    </h3>
                    <div
                      className="space-y-2 max-h-64 overflow-y-auto"
                      role="list"
                    >
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => handleTagToggle(tag)}
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
                        onClick={() => {
                          setSelectedTags([]);
                          updateUrlParams({ tags: null });
                        }}
                        className="mt-4 w-full px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 underline"
                      >
                        Clear tag filters
                      </button>
                    )}
                  </nav>
                )}
              </div>
            </aside>

            {/* Videos Grid */}
            <div className="flex-1 min-w-0">
              {/* Missing Playlists Banner */}
              {missingPlaylists.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
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
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">
                        {missingPlaylists.length} playlist
                        {missingPlaylists.length > 1 ? "s" : ""} found in GitHub
                        but not configured
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        Add them to playlists.json to enable YouTube import for
                        these playlists.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {missingPlaylists.map((folder) =>
                          addedPlaylists.has(folder) ? (
                            <span
                              key={folder}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-md"
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
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              {folder} added!
                            </span>
                          ) : (
                            <button
                              key={folder}
                              onClick={() => handleAddMissingPlaylist(folder)}
                              disabled={isAddingPlaylist}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-amber-100 text-amber-800 rounded-md hover:bg-amber-200 transition-colors disabled:opacity-50"
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
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              Add &quot;{folder}&quot;
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Search and Sort */}
              <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <label htmlFor="search-videos" className="sr-only">
                    Search videos
                  </label>
                  <input
                    id="search-videos"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search videos..."
                    className={`${INPUT_CLASSES} px-4`}
                    aria-label="Search videos"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="sort-videos"
                    className="text-sm text-gray-700 font-medium"
                  >
                    Sort:
                  </label>
                  <select
                    id="sort-videos"
                    value={sortOrder}
                    onChange={(e) =>
                      handleSortChange(e.target.value as "newest" | "oldest")
                    }
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
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
                  <p className="mt-4 text-gray-600">Loading videos...</p>
                </div>
              )}

              {/* Video Grid */}
              {!isLoading && filteredVideos.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredVideos.map((video) => (
                    <VideoCard
                      key={video.sha}
                      video={video}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedVideos.has(video.sha)}
                      onSelect={() => toggleVideoSelection(video.sha)}
                      onDelete={(e) => handleDeleteClick(e, video)}
                    />
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!isLoading &&
                filteredVideos.length === 0 &&
                videos.length === 0 &&
                !error && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                    <svg
                      className="w-16 h-16 mx-auto text-gray-300 mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No videos yet
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Click &quot;Import from YouTube&quot; to import videos
                      from your configured playlists.
                    </p>
                    {configPlaylists.length === 0 && (
                      <p className="text-sm text-amber-600">
                        No playlists configured. Go to Settings to add YouTube
                        playlists first.
                      </p>
                    )}
                  </div>
                )}

              {/* No Search Results */}
              {!isLoading &&
                filteredVideos.length === 0 &&
                videos.length > 0 && (
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                    <p className="text-gray-600">
                      No videos match your search
                      {selectedPlaylist || selectedTags.length > 0
                        ? " and filters"
                        : ""}
                      .
                    </p>
                  </div>
                )}
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteVideo}
        title={deleteVideo?.frontmatter?.title || deleteVideo?.name || ""}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteVideo(null)}
        isDeleting={isDeleting}
      />

      {/* Video Import Modal */}
      {githubConfig && (
        <VideoImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          playlists={configPlaylists}
          existingVideos={videos}
          githubConfig={githubConfig}
          onImportComplete={loadVideos}
        />
      )}

      {/* Bulk Export Modal */}
      <BulkVideoExportModal
        isOpen={isBulkExportModalOpen}
        onClose={() => {
          setIsBulkExportModalOpen(false);
          exitSelectionMode();
        }}
        videos={videos.filter((v) => selectedVideos.has(v.sha))}
      />
    </div>
  );
}

// Wrap with Suspense for useSearchParams
export default function VideosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <VideosPageContent />
    </Suspense>
  );
}
