import { useState, useEffect, useCallback } from "react";
import type { GitHubVideoFile } from "../types/video";
import type { GitHubConfig } from "../types/github";

export function useGitHubVideos(config: GitHubConfig | null, playlist?: string) {
  const [videos, setVideos] = useState<GitHubVideoFile[]>([]);
  const [playlists, setPlaylists] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    if (!config || !config.repo || !config.branch) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: config.repo,
          branch: config.branch,
          playlist: playlist || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setVideos(data.videos || []);
        setPlaylists(data.playlists || []);
      } else {
        setError(data.error || "Failed to load videos");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load videos");
    } finally {
      setIsLoading(false);
    }
  }, [config, playlist]);

  useEffect(() => {
    if (config && config.repo && config.branch) {
      loadVideos();
    }
  }, [config, loadVideos]);

  return {
    videos,
    playlists,
    isLoading,
    error,
    loadVideos,
    setVideos,
    setError,
  };
}

