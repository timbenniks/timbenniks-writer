/**
 * API Helper Utilities
 * 
 * Shared utilities for parsing query parameters, handling cache purges,
 * and formatting error responses.
 */

import { NextRequest, NextResponse } from "next/server";

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface SortParams {
  order: "asc" | "desc";
  orderBy: string;
}

export interface FilterParams {
  tags: string[];
  [key: string]: any;
}

/**
 * Parse pagination parameters from query string or body
 */
export function parsePaginationParams(
  params: URLSearchParams | Record<string, any>
): PaginationParams {
  const getValue = (key: string, defaultValue: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key) || defaultValue;
    }
    return params[key] || defaultValue;
  };

  const limit = Math.min(Math.max(1, parseInt(getValue("limit", "10"), 10)), 100);
  const offset = Math.max(0, parseInt(getValue("offset", "0"), 10));

  return { limit, offset };
}

/**
 * Parse sort parameters from query string or body
 */
export function parseSortParams(
  params: URLSearchParams | Record<string, any>,
  defaultOrderBy: string = "date",
  defaultOrder: "asc" | "desc" = "desc"
): SortParams {
  const getValue = (key: string, defaultValue: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key) || defaultValue;
    }
    return params[key] || defaultValue;
  };

  return {
    order: (getValue("order", defaultOrder) as "asc" | "desc"),
    orderBy: getValue("orderBy", defaultOrderBy),
  };
}

/**
 * Parse tags from query string or body
 */
export function parseTags(params: URLSearchParams | Record<string, any>): string[] {
  const getValue = (key: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    return params[key];
  };

  const tagsValue = getValue("tags");
  if (!tagsValue) return [];

  if (Array.isArray(tagsValue)) {
    return tagsValue.map((t: string) => t.toLowerCase().trim()).filter(Boolean);
  }

  return String(tagsValue)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Check if cache should be purged from request
 */
export function shouldPurgeCache(
  params: URLSearchParams | Record<string, any>,
  cacheType?: "articles" | "videos"
): boolean {
  const getValue = (key: string) => {
    if (params instanceof URLSearchParams) {
      return params.get(key);
    }
    return params[key];
  };

  const purge = getValue("purge");
  if (!purge) return false;

  if (purge === "true" || purge === true) return true;
  if (cacheType && purge === cacheType) return true;

  return false;
}

/**
 * Create error response with consistent format
 */
export function createErrorResponse(
  error: string,
  status: number = 500,
  defaultData: Record<string, any> = {}
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      ...defaultData,
    },
    { status }
  );
}

/**
 * Create success response with cache headers
 */
export function createSuccessResponse(
  data: Record<string, any>,
  cacheMaxAge: number = 86400,
  staleWhileRevalidate: number = 604800
): NextResponse {
  return NextResponse.json(
    {
      success: true,
      ...data,
    },
    {
      headers: {
        "Cache-Control": `public, s-maxage=${cacheMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
      },
    }
  );
}

/**
 * Handle API errors consistently
 */
export function handleApiError(
  error: any,
  defaultMessage: string = "An error occurred",
  emptyData: Record<string, any> = {}
): NextResponse {
  console.error("API error:", error);

  if (error.status === 404) {
    return createErrorResponse(
      "Repository path not found",
      404,
      emptyData
    );
  }

  return createErrorResponse(
    error.message || defaultMessage,
    500,
    emptyData
  );
}

