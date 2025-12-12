import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { parseRepo, validateGitHubFields } from "../utils";
import matter from "gray-matter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validateGitHubFields(body, ["repo", "branch"]);
    if (!validation.isValid) {
      return validation.error!;
    }

    // Get token from environment variables
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { success: false, error: "GitHub token not configured. Please set GITHUB_TOKEN in .env.local" },
        { status: 500 }
      );
    }

    const repoResult = parseRepo(body.repo);
    if (repoResult instanceof NextResponse) {
      return repoResult;
    }
    const { owner, repoName } = repoResult;
    const { folder, branch } = body;

    // Initialize Octokit
    const octokit = new Octokit({
      auth: token,
    });

    // Build path (folder path or root)
    const path = folder || "";

    // Get contents of the folder
    let contents;
    try {
      const response = await octokit.repos.getContent({
        owner,
        repo: repoName,
        path,
        ref: branch,
      });

      // Handle both file and directory responses
      if (Array.isArray(response.data)) {
        contents = response.data;
      } else {
        // If it's a single file, return it in an array
        contents = [response.data];
      }
    } catch (error: any) {
      if (error.status === 404) {
        return NextResponse.json(
          { success: false, error: `Path '${path}' not found in repository` },
          { status: 404 }
        );
      }
      throw error;
    }

    // Filter markdown files and fetch frontmatter
    const markdownFiles = contents.filter((item: any) => {
      if (item.type !== "file") return false;
      const fileName = item.name.toLowerCase();
      return fileName.endsWith(".md") || fileName.endsWith(".markdown");
    });

    // Fetch frontmatter for each file
    const filesWithFrontmatter = await Promise.all(
      markdownFiles.map(async (item: any) => {
        try {
          // Get file content
          const fileResponse = await octokit.repos.getContent({
            owner,
            repo: repoName,
            path: item.path,
            ref: branch,
          });

          // Decode and parse frontmatter
          if ("content" in fileResponse.data && fileResponse.data.encoding === "base64") {
            const fileContent = Buffer.from(fileResponse.data.content, "base64").toString("utf-8");
            const parsed = matter(fileContent);

            // Extract date for sorting (handle ISO datetime strings)
            let dateValue = parsed.data.date || null;
            if (dateValue && typeof dateValue === "string" && dateValue.includes("T")) {
              dateValue = dateValue.split("T")[0];
            }

            return {
              name: item.name,
              path: item.path,
              sha: item.sha,
              size: item.size,
              url: item.html_url,
              downloadUrl: item.download_url,
              frontmatter: {
                title: parsed.data.title || item.name.replace(/\.(md|markdown)$/i, ""),
                description: parsed.data.description || "",
                date: dateValue,
                tags: Array.isArray(parsed.data.tags)
                  ? parsed.data.tags
                  : parsed.data.tags
                  ? String(parsed.data.tags).split(",").map((t: string) => t.trim())
                  : [],
                heroImage: parsed.data.heroImage || parsed.data.image || "",
                slug: parsed.data.slug || "",
                readingTime: parsed.data.reading_time || parsed.data.readingTime || "",
                draft: parsed.data.draft === true || 
                       parsed.data.draft === "true" || 
                       String(parsed.data.draft).toLowerCase() === "true",
              },
            };
          }
        } catch (error) {
          // If we can't parse frontmatter, return basic info
          console.warn(`Failed to parse frontmatter for ${item.path}:`, error);
        }

        // Fallback if frontmatter parsing fails
        return {
          name: item.name,
          path: item.path,
          sha: item.sha,
          size: item.size,
          url: item.html_url,
          downloadUrl: item.download_url,
          frontmatter: {
            title: item.name.replace(/\.(md|markdown)$/i, ""),
            description: "",
            date: null,
            tags: [],
            heroImage: "",
            slug: "",
            readingTime: "",
            draft: false,
          },
        };
      })
    );

    // Filter out "index" articles
    const filteredFiles = filesWithFrontmatter.filter((file) => {
      const slug = file.frontmatter.slug || file.name.replace(/\.(md|markdown)$/i, "");
      return slug !== "index";
    });

    return NextResponse.json({
      success: true,
      files: filteredFiles,
    });
  } catch (error: any) {
    console.error("GitHub files error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch files from GitHub",
      },
      { status: 500 }
    );
  }
}

