import { useState, useEffect } from "react";
import type { GitHubConfig } from "../types/github";

interface GitHubConfigState {
  config: GitHubConfig | null;
  configured: boolean;
  loading: boolean;
  error: string | null;
}

export function useGitHubConfig() {
  const [state, setState] = useState<GitHubConfigState>({
    config: null,
    configured: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch("/api/github/config");
        const data = await response.json();

        if (data.success && data.configured && data.config) {
          setState({
            config: {
              repo: data.config.repo,
              branch: data.config.branch,
              folder: data.config.folder,
              token: "", // Token is server-side only
              authorName: data.config.authorName,
              authorEmail: data.config.authorEmail,
            },
            configured: true,
            loading: false,
            error: null,
          });
        } else {
          setState({
            config: null,
            configured: false,
            loading: false,
            error: data.error || "GitHub not configured",
          });
        }
      } catch (e: any) {
        console.error("Failed to load GitHub config:", e);
        setState({
          config: null,
          configured: false,
          loading: false,
          error: e.message || "Failed to load GitHub configuration",
        });
      }
    };

    loadConfig();
  }, []);

  return {
    config: state.config,
    configured: state.configured,
    loading: state.loading,
    error: state.error,
  };
}
