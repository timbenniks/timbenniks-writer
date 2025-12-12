"use client";

import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { GitHubVideoFile } from "../types/video";

interface VideoCardProps {
  video: GitHubVideoFile;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export default function VideoCard({
  video,
  isSelectionMode = false,
  isSelected = false,
  onSelect,
  onDelete,
}: VideoCardProps) {
  const router = useRouter();
  const { frontmatter, path } = video;

  // Handle click to navigate while preserving current URL
  const handleClick = () => {
    // Store current URL (with query params) in sessionStorage
    if (typeof window !== "undefined") {
      sessionStorage.setItem("videosListUrl", window.location.pathname + window.location.search);
    }
    router.push(`/video?file=${encodeURIComponent(path)}`);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const cardContent = (
    <>
      {/* Selection Checkbox */}
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <div
            className={clsx(
              "w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors",
              isSelected
                ? "bg-purple-600 border-purple-600"
                : "bg-white/90 border-gray-300 hover:border-purple-400"
            )}
          >
            {isSelected && (
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Delete Button */}
      {!isSelectionMode && onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 z-10 p-2 bg-white/90 backdrop-blur-sm rounded-md shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete video: ${frontmatter.title}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}

      {/* YouTube Play Overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[5]">
        <div className="w-16 h-16 bg-red-600/90 rounded-full flex items-center justify-center shadow-lg">
          <svg
            className="w-8 h-8 text-white ml-1"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      {/* Thumbnail */}
      <div className="w-full aspect-video bg-gray-100 overflow-hidden rounded-t-lg relative">
        {frontmatter.image ? (
          <img
            src={frontmatter.image}
            alt={frontmatter.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
        )}

        {/* Duration badge */}
        {frontmatter.duration && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/80 text-white text-xs font-medium rounded">
            {frontmatter.duration}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Playlist badge and date */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 flex-wrap">
          {frontmatter.playlist && (
            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-medium capitalize">
              {frontmatter.playlist.replace(/-/g, " ")}
            </span>
          )}
          {frontmatter.date && <span>{formatDate(frontmatter.date)}</span>}
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-gray-700 line-clamp-2">
          {frontmatter.title}
        </h3>

        {/* Tags */}
        {frontmatter.tags && frontmatter.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {frontmatter.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-50 text-gray-600 text-xs rounded"
              >
                {tag}
              </span>
            ))}
            {frontmatter.tags.length > 3 && (
              <span className="text-gray-400 text-xs">
                +{frontmatter.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );

  if (isSelectionMode) {
    return (
      <article
        className={clsx(
          "bg-white rounded-lg shadow-sm border overflow-hidden transition-all group relative cursor-pointer",
          isSelected
            ? "border-purple-500 ring-2 ring-purple-200"
            : "border-gray-200 hover:shadow-lg hover:border-gray-300"
        )}
        onClick={onSelect}
      >
        {cardContent}
      </article>
    );
  }

  return (
    <article 
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden transition-all group relative hover:shadow-lg hover:border-gray-300 cursor-pointer"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {cardContent}
    </article>
  );
}

