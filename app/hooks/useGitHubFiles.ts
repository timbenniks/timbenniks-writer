import { useState, useEffect } from "react";
import type { GitHubFile } from "../types/github";
import type { GitHubConfig } from "../types/github";

export function useGitHubFiles(config: GitHubConfig | null) {
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = async () => {
    if (!config) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: config.repo,
          branch: config.branch,
          folder: config.folder,
          // Token comes from environment variables on the server
        }),
      });

      const data = await response.json();

      if (data.success) {
        setFiles(data.files || []);
      } else {
        setError(data.error || "Failed to load files");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (config) {
      loadFiles();
    }
  }, [config]);

  return { files, isLoading, error, loadFiles, setFiles, setError };
}

