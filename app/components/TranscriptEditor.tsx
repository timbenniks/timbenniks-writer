"use client";

import { useState } from "react";
import clsx from "clsx";

interface TranscriptEditorProps {
  transcript: string;
  onChange: (transcript: string) => void;
  videoId: string;
  onFetchTranscript?: () => Promise<void>;
  isFetching?: boolean;
}

export default function TranscriptEditor({
  transcript,
  onChange,
  videoId,
  onFetchTranscript,
  isFetching = false,
}: TranscriptEditorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const wordCount = transcript
    ? transcript.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Transcript</h3>
          {transcript && (
            <span className="text-xs text-gray-500">
              {wordCount.toLocaleString()} words
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onFetchTranscript && videoId && (
            <button
              onClick={onFetchTranscript}
              disabled={isFetching || !videoId}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                isFetching || !videoId
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              )}
            >
              {isFetching ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Fetch from YouTube
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {transcript ? (
          <textarea
            value={transcript}
            onChange={(e) => onChange(e.target.value)}
            className={clsx(
              "w-full resize-none border border-gray-200 rounded-md p-3 text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent",
              isExpanded ? "h-96" : "h-32"
            )}
            placeholder="Transcript will appear here..."
          />
        ) : (
          <div
            className={clsx(
              "flex items-center justify-center text-gray-500 text-sm bg-gray-50 rounded-md",
              isExpanded ? "h-96" : "h-32"
            )}
          >
            <div className="text-center">
              <svg
                className="w-8 h-8 mx-auto mb-2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p>No transcript available</p>
              {onFetchTranscript && videoId && (
                <p className="text-xs mt-1">
                  Click &quot;Fetch from YouTube&quot; to get the transcript
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

