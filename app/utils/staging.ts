/**
 * Staging Utilities
 * 
 * Client-side utilities for managing staged changes before committing.
 * Uses localStorage to persist staged changes across page reloads.
 */

export interface StagedChange {
  type: "create" | "update" | "delete" | "rename";
  filePath: string;
  oldPath?: string; // For rename operations
  content?: string; // For create/update
  sha?: string; // Current SHA for update/delete operations
  commitMessage?: string; // Individual commit message (optional)
  metadata?: {
    title?: string;
    videoId?: string;
    isArticle?: boolean;
    isVideo?: boolean;
  };
}

const STAGING_KEY = "github_staged_changes";

/**
 * Get all staged changes from localStorage
 */
export function getStagedChanges(): StagedChange[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(STAGING_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error("Failed to load staged changes:", error);
    return [];
  }
}

/**
 * Add a change to staging
 */
export function stageChange(change: StagedChange): void {
  if (typeof window === "undefined") return;

  const staged = getStagedChanges();

  // Remove existing change for same file path (if updating)
  const filtered = staged.filter(
    (c) => c.filePath !== change.filePath && c.oldPath !== change.filePath
  );

  // Add new change
  filtered.push(change);

  try {
    localStorage.setItem(STAGING_KEY, JSON.stringify(filtered));
    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent("staging-changed"));
  } catch (error) {
    console.error("Failed to save staged changes:", error);
  }
}

/**
 * Remove a change from staging
 */
export function unstageChange(filePath: string): void {
  if (typeof window === "undefined") return;

  const staged = getStagedChanges();
  const filtered = staged.filter(
    (c) => c.filePath !== filePath && c.oldPath !== filePath
  );

  try {
    localStorage.setItem(STAGING_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent("staging-changed"));
  } catch (error) {
    console.error("Failed to update staged changes:", error);
  }
}

/**
 * Clear all staged changes
 */
export function clearStagedChanges(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STAGING_KEY);
    window.dispatchEvent(new CustomEvent("staging-changed"));
  } catch (error) {
    console.error("Failed to clear staged changes:", error);
  }
}

/**
 * Get count of staged changes
 */
export function getStagedCount(): number {
  return getStagedChanges().length;
}

/**
 * Check if a file is staged
 */
export function isStaged(filePath: string): boolean {
  const staged = getStagedChanges();
  return staged.some(
    (c) => c.filePath === filePath || c.oldPath === filePath
  );
}

/**
 * Helper: Stage an article create/update
 */
export function stageArticleChange(params: {
  filePath: string;
  content: string;
  sha?: string;
  isNew: boolean;
  title: string;
  commitMessage?: string;
}): void {
  stageChange({
    type: params.isNew ? "create" : "update",
    filePath: params.filePath,
    content: params.content,
    sha: params.sha,
    commitMessage: params.commitMessage || `${params.isNew ? "Create" : "Update"} article: ${params.title}`,
    metadata: {
      title: params.title,
      isArticle: true,
    },
  });
}

/**
 * Helper: Stage a video create/update
 */
export function stageVideoChange(params: {
  filePath: string;
  content: string;
  sha?: string;
  oldPath?: string;
  title: string;
  videoId: string;
  commitMessage?: string;
}): void {
  const isRename = params.oldPath && params.oldPath !== params.filePath;
  stageChange({
    type: isRename ? "rename" : (params.sha ? "update" : "create"),
    filePath: params.filePath,
    oldPath: params.oldPath,
    content: params.content,
    sha: params.sha,
    commitMessage: params.commitMessage || `${params.sha ? "Update" : "Create"} video: ${params.title}`,
    metadata: {
      title: params.title,
      videoId: params.videoId,
      isVideo: true,
    },
  });
}

/**
 * Helper: Stage a file deletion
 */
export function stageDeleteChange(params: {
  filePath: string;
  sha: string;
  title?: string;
  commitMessage?: string;
}): void {
  stageChange({
    type: "delete",
    filePath: params.filePath,
    sha: params.sha,
    commitMessage: params.commitMessage || `Delete: ${params.title || params.filePath}`,
    metadata: {
      title: params.title,
    },
  });
}

