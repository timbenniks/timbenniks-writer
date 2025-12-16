"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import AppHeader from "../../components/AppHeader";

interface TaxonomyTerm {
  uid: string;
  name: string;
  depth?: number;
  parentUid?: string | null;
}

interface AnalysisResult {
  cleanedTerms: string[];
  originalCount: number;
  cleanedCount: number;
  reduction: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export default function TaxonomyManagementPage() {
  const router = useRouter();

  // Terms list
  const [taxonomyTerms, setTaxonomyTerms] = useState<TaxonomyTerm[]>([]);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create term
  const [isCreatingTerm, setIsCreatingTerm] = useState(false);
  const [newTermName, setNewTermName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete term
  const [isDeletingTerm, setIsDeletingTerm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Delete all
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Cleanup/AI Analysis
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Load terms on mount
  useEffect(() => {
    loadTaxonomyTerms();
  }, []);

  const loadTaxonomyTerms = async () => {
    setIsLoadingTerms(true);
    setCreateError(null);
    setDeleteError(null);
    try {
      const response = await fetch("/api/contentstack/taxonomies");
      const data = await response.json();
      if (data.success && data.terms) {
        setTaxonomyTerms(data.terms);
      } else {
        setCreateError(data.error || "Failed to load terms");
      }
    } catch (error: any) {
      setCreateError(error.message || "Failed to load taxonomy terms");
    } finally {
      setIsLoadingTerms(false);
    }
  };

  const handleCreateTerm = async () => {
    if (!newTermName.trim()) return;

    setIsCreatingTerm(true);
    setCreateError(null);

    try {
      const termUid = newTermName
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      const response = await fetch("/api/contentstack/taxonomy-term", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termUid,
          termName: newTermName.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok || data.alreadyExists) {
        setNewTermName("");
        await loadTaxonomyTerms();
      } else {
        setCreateError(data.error || "Failed to create term");
      }
    } catch (error: any) {
      setCreateError(error.message || "Failed to create term");
    } finally {
      setIsCreatingTerm(false);
    }
  };

  const handleDeleteTerm = async (termUid: string, termName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the term "${termName}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    setIsDeletingTerm(termUid);
    setDeleteError(null);

    try {
      const response = await fetch("/api/contentstack/taxonomy-term", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termUid }),
      });

      const data = await response.json();

      if (data.success) {
        await loadTaxonomyTerms();
      } else {
        setDeleteError(data.error || "Failed to delete term");
      }
    } catch (error: any) {
      setDeleteError(error.message || "Failed to delete term");
    } finally {
      setIsDeletingTerm(null);
    }
  };

  const handleDeleteAll = async () => {
    if (taxonomyTerms.length === 0) return;

    const count = taxonomyTerms.length;
    if (
      !confirm(
        `Are you sure you want to delete ALL ${count} taxonomy term${
          count !== 1 ? "s" : ""
        }? This action cannot be undone.`
      )
    ) {
      return;
    }

    setIsDeletingAll(true);
    setDeleteError(null);

    let successCount = 0;
    let errorCount = 0;

    try {
      for (const term of taxonomyTerms) {
        try {
          const response = await fetch("/api/contentstack/taxonomy-term", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ termUid: term.uid }),
          });

          const data = await response.json();
          if (data.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error: any) {
          errorCount++;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (errorCount > 0) {
        setDeleteError(`${successCount} deleted, ${errorCount} failed`);
      }

      await loadTaxonomyTerms();
    } catch (error: any) {
      setDeleteError(error.message || "Failed to delete terms");
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);

    try {
      const response = await fetch(
        "/api/contentstack/taxonomy-cleanup/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze taxonomies");
      }

      setAnalysisResult(data);
    } catch (error: any) {
      setAnalysisError(error.message || "Failed to analyze taxonomies");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!analysisResult) return;

    if (
      !confirm(
        `Are you sure you want to apply the cleanup? This will:\n\n1. Create ${analysisResult.cleanedCount} new terms with cleaned names\n2. Delete all ${analysisResult.originalCount} existing terms\n\nThis action cannot be undone.`
      )
    ) {
      return;
    }

    setIsApplying(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const response = await fetch("/api/contentstack/taxonomy-cleanup/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanedTerms: analysisResult.cleanedTerms }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to apply cleanup");
      }

      setApplyResult(data);
      setAnalysisResult(null);

      // Show detailed results if there were failures
      if (data.summary.deleted.failed > 0) {
        console.error(
          "Deletion failures:",
          data.results.deleted.filter((d: any) => !d.success)
        );
      }

      await loadTaxonomyTerms();
    } catch (error: any) {
      setApplyError(error.message || "Failed to apply cleanup");
    } finally {
      setIsApplying(false);
    }
  };

  // Filter terms by search query
  const filteredTerms = taxonomyTerms.filter(
    (term) =>
      term.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Taxonomy Management
          </h1>
          <p className="text-gray-600">
            Manage your Contentstack taxonomy terms. Create, delete, and
            consolidate terms using AI.
          </p>
        </div>

        {/* Create New Term */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Create New Term
          </h2>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newTermName}
              onChange={(e) => setNewTermName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isCreatingTerm) {
                  handleCreateTerm();
                }
              }}
              placeholder="Enter term name (e.g., 'Development')"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              disabled={isCreatingTerm}
            />
            <button
              onClick={handleCreateTerm}
              disabled={isCreatingTerm || !newTermName.trim()}
              className={clsx(
                "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                isCreatingTerm || !newTermName.trim()
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              )}
            >
              {isCreatingTerm ? "Creating..." : "Create"}
            </button>
          </div>
          {createError && (
            <p className="mt-2 text-sm text-red-600">{createError}</p>
          )}
          {newTermName && (
            <p className="mt-2 text-xs text-gray-500">
              UID will be:{" "}
              <code className="bg-gray-100 px-1 py-0.5 rounded">
                {newTermName
                  .toLowerCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^a-z0-9_]/g, "")}
              </code>
            </p>
          )}
        </div>

        {/* AI Cleanup Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                AI-Powered Cleanup
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Use OpenAI to consolidate and simplify your taxonomy terms
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className={clsx(
                "px-6 py-2 text-sm font-medium rounded-md transition-colors",
                isAnalyzing
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              )}
            >
              {isAnalyzing ? (
                <span className="flex items-center gap-2">
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
                  Analyzing...
                </span>
              ) : (
                "Analyze & Consolidate"
              )}
            </button>
          </div>

          {analysisError && (
            <div className="mt-4 p-4 bg-red-50 rounded-md border border-red-200">
              <p className="text-sm font-medium text-red-800">
                Analysis Failed
              </p>
              <p className="text-sm text-red-600 mt-1">{analysisError}</p>
            </div>
          )}

          {analysisResult && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-green-50 rounded-md border border-green-200">
                <p className="text-sm font-medium text-green-800">
                  Analysis Complete
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Reduced from {analysisResult.originalCount} terms to{" "}
                  {analysisResult.cleanedCount} terms (
                  {analysisResult.reduction} removed).
                </p>
                {analysisResult.usage && (
                  <p className="text-xs text-green-600 mt-1">
                    Tokens used: {analysisResult.usage.total_tokens} (prompt:{" "}
                    {analysisResult.usage.prompt_tokens}, completion:{" "}
                    {analysisResult.usage.completion_tokens})
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-3 bg-gray-50 rounded-md">
                {analysisResult.cleanedTerms.map((termName, index) => {
                  const termUid = termName
                    .toLowerCase()
                    .replace(/\s+/g, "_")
                    .replace(/[^a-z0-9_]/g, "");

                  return (
                    <div
                      key={index}
                      className="p-2 bg-white rounded border border-gray-200"
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {termName}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {termUid}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleApply}
                  disabled={isApplying}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    isApplying
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  {isApplying ? (
                    <span className="flex items-center gap-2">
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
                      Applying...
                    </span>
                  ) : (
                    "Apply Cleanup"
                  )}
                </button>
                <button
                  onClick={() => {
                    setAnalysisResult(null);
                    setAnalysisError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
              </div>

              {applyError && (
                <div className="p-4 bg-red-50 rounded-md border border-red-200">
                  <p className="text-sm font-medium text-red-800">
                    Apply Failed
                  </p>
                  <p className="text-sm text-red-600 mt-1">{applyError}</p>
                </div>
              )}

              {applyResult && (
                <div className="p-4 bg-green-50 rounded-md border border-green-200">
                  <p className="text-sm font-medium text-green-800">
                    Cleanup Applied
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Created {applyResult.summary.created.success} new term
                    {applyResult.summary.created.success !== 1 ? "s" : ""}.
                    {applyResult.summary.created.failed > 0 && (
                      <span className="ml-1">
                        {applyResult.summary.created.failed} failed to create.
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Deleted {applyResult.summary.deleted.success} old term
                    {applyResult.summary.deleted.success !== 1 ? "s" : ""}.
                    {applyResult.summary.deleted.failed > 0 && (
                      <span className="ml-1 text-red-700">
                        {applyResult.summary.deleted.failed} failed to delete.
                      </span>
                    )}
                  </p>
                  {applyResult.summary.deleted.failed > 0 &&
                    applyResult.results?.deleted && (
                      <details className="mt-3">
                        <summary className="text-sm font-medium text-red-800 cursor-pointer hover:text-red-900">
                          View deletion errors (
                          {applyResult.summary.deleted.failed})
                        </summary>
                        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                          {applyResult.results.deleted
                            .filter((d: any) => !d.success)
                            .map((d: any, idx: number) => (
                              <div
                                key={idx}
                                className="text-xs text-red-700 bg-red-100 p-2 rounded"
                              >
                                <strong>{d.name}</strong> ({d.uid}):{" "}
                                {d.error || "Unknown error"}
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Terms List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search terms..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                {filteredTerms.length} of {taxonomyTerms.length} term
                {taxonomyTerms.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={loadTaxonomyTerms}
                disabled={isLoadingTerms}
                className={clsx(
                  "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                  isLoadingTerms
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                )}
              >
                {isLoadingTerms ? "Loading..." : "Refresh"}
              </button>
              {taxonomyTerms.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll || isDeletingTerm !== null}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    isDeletingAll || isDeletingTerm !== null
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-red-600 text-white hover:bg-red-700"
                  )}
                >
                  {isDeletingAll ? (
                    <span className="flex items-center gap-1.5">
                      <svg
                        className="animate-spin h-3 w-3"
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
                      Deleting All...
                    </span>
                  ) : (
                    `Delete All (${taxonomyTerms.length})`
                  )}
                </button>
              )}
            </div>
          </div>

          {deleteError && (
            <div className="mb-4 p-4 bg-red-50 rounded-md border border-red-200">
              <p className="text-sm font-medium text-red-800">Delete Failed</p>
              <p className="text-sm text-red-600 mt-1">{deleteError}</p>
            </div>
          )}

          {isLoadingTerms ? (
            <div className="p-8 text-center text-gray-600">
              Loading terms...
            </div>
          ) : filteredTerms.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              {searchQuery
                ? "No terms match your search"
                : "No taxonomy terms found"}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredTerms.map((term) => (
                <div
                  key={term.uid}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {term.name}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      UID: {term.uid}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTerm(term.uid, term.name)}
                    disabled={isDeletingTerm === term.uid || isDeletingAll}
                    className={clsx(
                      "ml-4 px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex-shrink-0",
                      isDeletingTerm === term.uid || isDeletingAll
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                    )}
                  >
                    {isDeletingTerm === term.uid ? (
                      <span className="flex items-center gap-1.5">
                        <svg
                          className="animate-spin h-3 w-3"
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
                        Deleting...
                      </span>
                    ) : (
                      "Delete"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
