// Video frontmatter structure (stored in GitHub markdown files)
export interface VideoFrontmatter {
  date: string;
  position: string;
  title: string;
  description: string;
  image: string;
  videoId: string;
  transcript: string;
  tags: string[];
  playlist: string;
  duration?: string;
}

// Video file from GitHub (like GitHubFile but for videos)
export interface GitHubVideoFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  downloadUrl: string;
  frontmatter: VideoFrontmatter;
}

// Playlist configuration (stored in playlists.json)
export interface Playlist {
  id: string; // YouTube playlist ID
  name: string; // Display name
  folder: string; // GitHub folder name (e.g., "tim", "contentstack")
  enabled: boolean; // Whether to show in UI
}

export interface PlaylistsConfig {
  playlists: Playlist[];
}

// YouTube API response types
export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  position: number;
  duration?: string;
  channelTitle?: string;
}

export interface YouTubePlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  channelTitle: string;
}

// Import status for batch imports
export interface VideoImportStatus {
  videoId: string;
  title: string;
  status: "pending" | "importing" | "completed" | "error" | "exists";
  error?: string;
}

// Contentstack video export mapping
export interface ContentstackVideoPayload {
  title: string;
  description?: string;
  date?: string;
  video_id: string;
  image_url?: string;
  transcript?: string;
  taxonomies?: Array<{ taxonomy_uid: string; term_uid: string }>;
}

// Playlist to Contentstack video_categories mapping
export const PLAYLIST_TO_CATEGORY: Record<string, string> = {
  tim: "tim",
  contentstack: "contentstack",
  "live-contentstack": "contentstack_live",
  hygraph: "hygraph",
  "live-hygraph": "hygraph_live",
  uniform: "uniform",
  "live-uniform": "uniform_live",
  "headless-creator": "headless_creator",
  mp: "middleware_productions",
  "alive-and-kicking": "alive_and_kicking",
  "misc-streams": "personal_live",
};

// Helper function to map playlist folder to Contentstack category
export function getContentstackCategory(
  playlistFolder: string
): string | undefined {
  return PLAYLIST_TO_CATEGORY[playlistFolder];
}

// Helper to generate position string (001, 002, etc.)
export function generatePosition(index: number): string {
  return index.toString().padStart(3, "0");
}

// Helper to parse position string to number
export function parsePosition(position: string): number {
  return parseInt(position, 10) || 0;
}

