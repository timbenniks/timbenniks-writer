import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import { purgeArticlesCache, purgeVideosCache } from "../../../utils/cache";

/**
 * POST /api/github/commit
 * Commit all staged changes in a single commit
 * 
 * Body: {
 *   repo: string,
 *   branch: string,
 *   commitMessage: string,
 *   changes: Array<{
 *     type: "create" | "update" | "delete" | "rename",
 *     filePath: string,
 *     oldPath?: string,
 *     content?: string,
 *     sha?: string
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, [
      "repo",
      "branch",
      "commitMessage",
      "changes",
    ]);
    if (!validation.isValid) {
      return validation.error!;
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured" },
        { status: 500 }
      );
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const { branch, commitMessage, changes } = body;

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { success: false, error: "No changes to commit" },
        { status: 400 }
      );
    }

    const octokit = new Octokit({ auth: token });
    const authorName = process.env.GITHUB_AUTHOR_NAME || "Turbo Content";
    const authorEmail = process.env.GITHUB_AUTHOR_EMAIL || "noreply@timbenniks.dev";
    const author = { name: authorName, email: authorEmail };

    // Get current tree SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
    });
    const baseTreeSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo: repoName,
      commit_sha: baseTreeSha,
    });
    const treeSha = commitData.tree.sha;

    // Get current tree to build new tree
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo: repoName,
      tree_sha: treeSha,
      recursive: "1",
    });

    // Build file changes map
    const fileChanges = new Map<string, { mode: string; type: string; sha?: string; content?: string }>();
    
    // Add existing files to map
    if (treeData.tree) {
      for (const item of treeData.tree) {
        if (item.type === "blob") {
          fileChanges.set(item.path!, {
            mode: item.mode || "100644",
            type: "blob",
            sha: item.sha,
          });
        }
      }
    }

    // Process changes
    const blobsToCreate: Array<{ path: string; content: string; mode: string }> = [];
    const pathsToDelete: string[] = [];
    const pathsToRename: Array<{ oldPath: string; newPath: string }> = [];

    for (const change of changes) {
      if (change.type === "delete") {
        pathsToDelete.push(change.filePath);
        fileChanges.delete(change.filePath);
      } else if (change.type === "rename") {
        pathsToRename.push({
          oldPath: change.oldPath!,
          newPath: change.filePath,
        });
        // Move the file entry
        const existing = fileChanges.get(change.oldPath!);
        if (existing) {
          fileChanges.delete(change.oldPath!);
          fileChanges.set(change.filePath, existing);
        }
      } else if (change.type === "create" || change.type === "update") {
        // Create blob for new/updated content
        blobsToCreate.push({
          path: change.filePath,
          content: change.content!,
          mode: "100644",
        });
      }
    }

    // Create blobs for new/updated files
    const blobShas = new Map<string, string>();
    for (const blob of blobsToCreate) {
      const { data: blobData } = await octokit.git.createBlob({
        owner,
        repo: repoName,
        content: Buffer.from(blob.content).toString("base64"),
        encoding: "base64",
      });
      blobShas.set(blob.path, blobData.sha);
    }

    // Build new tree
    const newTree: Array<{
      path: string;
      mode: "100644" | "100755" | "040000" | "160000" | "120000";
      type: "blob" | "tree" | "commit";
      sha: string;
    }> = [];

    // Add all files from fileChanges map
    for (const [path, file] of fileChanges.entries()) {
      // Skip deleted files
      if (pathsToDelete.includes(path)) continue;

      // Use new blob SHA if available, otherwise use existing
      const sha = blobShas.get(path) || file.sha;
      if (sha) {
        newTree.push({
          path,
          mode: (file.mode as "100644" | "100755" | "040000" | "160000" | "120000") || "100644",
          type: (file.type as "blob" | "tree" | "commit") || "blob",
          sha,
        });
      }
    }

    // Add new files that weren't in the original tree
    for (const [path, sha] of blobShas.entries()) {
      if (!fileChanges.has(path)) {
        newTree.push({
          path,
          mode: "100644",
          type: "blob",
          sha,
        });
      }
    }

    // Create new tree
    const { data: newTreeData } = await octokit.git.createTree({
      owner,
      repo: repoName,
      base_tree: treeSha,
      tree: newTree,
    });

    // Create commit
    const { data: commit } = await octokit.git.createCommit({
      owner,
      repo: repoName,
      message: commitMessage,
      tree: newTreeData.sha,
      parents: [baseTreeSha],
      author,
      committer: author,
    });

    // Update branch reference
    await octokit.git.updateRef({
      owner,
      repo: repoName,
      ref: `heads/${branch}`,
      sha: commit.sha,
    });

    // Purge caches
    const articlesFolder = process.env.GITHUB_FOLDER || "";
    const videosFolder = process.env.GITHUB_VIDEOS_FOLDER || "content/3.videos";
    
    let shouldPurgeArticles = false;
    let shouldPurgeVideos = false;

    for (const change of changes) {
      const path = change.oldPath || change.filePath;
      if (articlesFolder && path.startsWith(articlesFolder)) {
        shouldPurgeArticles = true;
      }
      if (path.startsWith(videosFolder)) {
        shouldPurgeVideos = true;
      }
    }

    if (shouldPurgeArticles) await purgeArticlesCache();
    if (shouldPurgeVideos) await purgeVideosCache();

    return NextResponse.json({
      success: true,
      commit: {
        sha: commit.sha,
        message: commit.message,
        url: `https://github.com/${owner}/${repoName}/commit/${commit.sha}`,
      },
      filesChanged: changes.length,
    });
  } catch (error: any) {
    console.error("Bulk commit error:", error);

    if (error.status === 409) {
      return NextResponse.json(
        {
          success: false,
          error: "Conflict: Repository has been updated. Please refresh and try again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to commit changes",
      },
      { status: 500 }
    );
  }
}

