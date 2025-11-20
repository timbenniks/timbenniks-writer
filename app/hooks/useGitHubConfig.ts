import { useState, useEffect } from "react";
import type { GitHubConfig } from "../types/github";

export function useGitHubConfig() {
  const [config, setConfig] = useState<GitHubConfig | null>(null);

  useEffect(() => {
    const loadConfig = () => {
      const saved = localStorage.getItem("githubConfig");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setConfig(parsed);
        } catch (e) {
          console.error("Failed to parse saved GitHub config:", e);
          setConfig(null);
        }
      } else {
        setConfig(null);
      }
    };

    loadConfig();
    window.addEventListener("storage", loadConfig);
    return () => window.removeEventListener("storage", loadConfig);
  }, []);

  const saveConfig = (newConfig: GitHubConfig) => {
    localStorage.setItem("githubConfig", JSON.stringify(newConfig));
    setConfig(newConfig);
    // Trigger storage event for other tabs/windows
    window.dispatchEvent(new Event("storage"));
  };

  const clearConfig = () => {
    localStorage.removeItem("githubConfig");
    setConfig(null);
    window.dispatchEvent(new Event("storage"));
  };

  return { config, saveConfig, clearConfig };
}

