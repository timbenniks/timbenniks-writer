export interface GitHubConfig {
  repo: string; // Format: "owner/repo"
  branch: string; // Branch name, e.g., "main"
  folder: string; // Subfolder path, e.g., "content/articles" or ""
  token: string; // Personal Access Token
  authorName?: string; // Optional commit author name
  authorEmail?: string; // Optional commit author email
}

export interface ArticleFrontmatter {
  title: string;
  description: string;
  date: string | null;
  tags: string[];
  heroImage: string;
  slug: string;
  readingTime: string;
  draft?: boolean;
}

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  downloadUrl: string;
  frontmatter: ArticleFrontmatter;
}

export interface GitHubConnectResponse {
  success: boolean;
  repo?: {
    name: string;
    fullName: string;
    defaultBranch: string;
    branches?: string[];
  };
  error?: string;
}

