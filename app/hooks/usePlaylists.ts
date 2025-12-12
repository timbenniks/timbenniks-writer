import { useState, useEffect, useCallback } from "react";
import type { PlaylistsConfig, Playlist } from "../types/video";
import type { GitHubConfig } from "../types/github";

export function usePlaylists(config: GitHubConfig | null) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [sha, setSha] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    if (!config || !config.repo || !config.branch) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        repo: config.repo,
        branch: config.branch,
      });

      const response = await fetch(`/api/github/playlists?${params}`);
      const data = await response.json();

      if (data.success) {
        setPlaylists(data.config?.playlists || []);
        setSha(data.sha || null);
      } else {
        setError(data.error || "Failed to load playlists");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load playlists");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const savePlaylists = useCallback(
    async (updatedPlaylists: Playlist[]): Promise<boolean> => {
      if (!config || !config.repo || !config.branch) {
        setError("GitHub not configured");
        return false;
      }

      setIsSaving(true);
      setError(null);

      try {
        const playlistsConfig: PlaylistsConfig = {
          playlists: updatedPlaylists,
        };

        const response = await fetch("/api/github/playlists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repo: config.repo,
            branch: config.branch,
            config: playlistsConfig,
            sha,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setPlaylists(updatedPlaylists);
          setSha(data.sha || null);
          return true;
        } else {
          setError(data.error || "Failed to save playlists");
          return false;
        }
      } catch (err: any) {
        setError(err.message || "Failed to save playlists");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [config, sha]
  );

  const addPlaylist = useCallback(
    async (playlist: Playlist): Promise<boolean> => {
      const updated = [...playlists, playlist];
      return savePlaylists(updated);
    },
    [playlists, savePlaylists]
  );

  const updatePlaylist = useCallback(
    async (index: number, playlist: Playlist): Promise<boolean> => {
      const updated = [...playlists];
      updated[index] = playlist;
      return savePlaylists(updated);
    },
    [playlists, savePlaylists]
  );

  const removePlaylist = useCallback(
    async (index: number): Promise<boolean> => {
      const updated = playlists.filter((_, i) => i !== index);
      return savePlaylists(updated);
    },
    [playlists, savePlaylists]
  );

  useEffect(() => {
    if (config && config.repo && config.branch) {
      loadPlaylists();
    }
  }, [config, loadPlaylists]);

  return {
    playlists,
    isLoading,
    isSaving,
    error,
    loadPlaylists,
    savePlaylists,
    addPlaylist,
    updatePlaylist,
    removePlaylist,
    setError,
  };
}

