"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStagedChanges, type StagedChange } from "../utils/staging";

interface StagingPanelProps {
  githubConfig: {
    repo: string;
    branch: string;
  } | null;
  onCommit?: () => void;
}

export default function StagingPanel({ githubConfig, onCommit }: StagingPanelProps) {
  const router = useRouter();
  const [stagedChanges, setStagedChanges] = useState<StagedChange[]>([]);

  useEffect(() => {
    const loadStaged = () => {
      setStagedChanges(getStagedChanges());
    };

    loadStaged();
    window.addEventListener("staging-changed", loadStaged);
    return () => window.removeEventListener("staging-changed", loadStaged);
  }, []);

  if (stagedChanges.length === 0) {
    return null;
  }

  return (
    <button
      onClick={() => router.push("/staging")}
      className="relative px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
    >
      Staged Changes
      <span className="ml-2 px-2 py-0.5 bg-blue-700 rounded-full text-xs">
        {stagedChanges.length}
      </span>
    </button>
  );
}

