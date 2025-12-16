import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  CONTENT_TAGS_TAXONOMY,
  ARTICLE_CONTENT_TYPE,
} from "../../utils";

/**
 * POST /api/contentstack/taxonomy-cleanup/apply
 * Apply taxonomy cleanup by:
 * 1. Creating new terms with cleaned names and proper UIDs (using _ instead of spaces)
 * 2. Deleting all old terms
 * 
 * Body: { cleanedTerms: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Contentstack configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const body = await request.json();
    const { cleanedTerms } = body;

    if (!Array.isArray(cleanedTerms) || cleanedTerms.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "cleanedTerms array is required",
        },
        { status: 400 }
      );
    }

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // First, fetch all existing terms to delete them later
    const allTerms: any[] = [];
    let skip = 0;
    const limit = 100;
    let hasMore = true;
    let totalCount = 0;

    while (hasMore) {
      const response = await fetch(
        `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms?include_count=true&limit=${limit}&skip=${skip}`,
        {
          method: "GET",
          headers,
        }
      );

      if (!response.ok) {
        return handleContentstackError(response, "Fetch taxonomy terms");
      }

      const data = await response.json();

      if (skip === 0) {
        totalCount = data.count || 0;
      }

      const terms = data.terms || [];
      allTerms.push(...terms);

      if (terms.length < limit || allTerms.length >= totalCount) {
        hasMore = false;
      } else {
        skip += limit;
      }
    }

    const results = {
      created: [] as Array<{ name: string; uid: string; success: boolean; error?: string }>,
      deleted: [] as Array<{ name: string; uid: string; success: boolean; error?: string }>,
    };

    // Step 1: Create new terms with cleaned names
    // Generate UID from name: lowercase, replace spaces with _, remove invalid chars
    for (const termName of cleanedTerms) {
      const termUid = termName
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

      try {
        const createResponse = await fetch(
          `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              term: {
                uid: termUid,
                name: termName,
              },
            }),
          }
        );

        const createData = await createResponse.json();

        if (createResponse.ok || createResponse.status === 409 || createResponse.status === 422) {
          // Success or already exists
          results.created.push({
            name: termName,
            uid: termUid,
            success: true,
          });
        } else {
          results.created.push({
            name: termName,
            uid: termUid,
            success: false,
            error: createData.error || `HTTP ${createResponse.status}`,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error: any) {
        results.created.push({
          name: termName,
          uid: termUid,
          success: false,
          error: error.message || "Failed to create term",
        });
      }
    }

    // Step 2: Remove taxonomy references from entries before deleting terms
    // Create a set of newly created UIDs to avoid deleting them
    const newlyCreatedUids = new Set(
      cleanedTerms.map((name) =>
        name
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
      )
    );

    // Helper function to remove taxonomy references from entries
    const removeTaxonomyFromEntries = async (termUid: string) => {
      const entriesToUpdate: Array<{ uid: string; contentType: string; taxonomies: any[] }> = [];

      // Find entries in articles content type
      try {
        const articleResponse = await fetch(
          `${baseUrl}/v3/content_types/${ARTICLE_CONTENT_TYPE}/entries?query=${encodeURIComponent(
            JSON.stringify({
              "taxonomies.term_uid": termUid,
            })
          )}&limit=100`,
          {
            method: "GET",
            headers,
          }
        );

        if (articleResponse.ok) {
          const articleData = await articleResponse.json();
          const articles = articleData.entries || [];
          for (const entry of articles) {
            if (entry.taxonomies && Array.isArray(entry.taxonomies)) {
              const filteredTaxonomies = entry.taxonomies.filter(
                (t: any) => !(t.taxonomy_uid === CONTENT_TAGS_TAXONOMY && t.term_uid === termUid)
              );
              if (filteredTaxonomies.length !== entry.taxonomies.length) {
                entriesToUpdate.push({
                  uid: entry.uid,
                  contentType: ARTICLE_CONTENT_TYPE,
                  taxonomies: filteredTaxonomies,
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error finding article entries for term ${termUid}:`, error);
      }

      // Find entries in videos content type
      try {
        const videoResponse = await fetch(
          `${baseUrl}/v3/content_types/video/entries?query=${encodeURIComponent(
            JSON.stringify({
              taxonomies: {
                $elemMatch: {
                  taxonomy_uid: CONTENT_TAGS_TAXONOMY,
                  term_uid: termUid,
                },
              },
            })
          )}&limit=100`,
          {
            method: "GET",
            headers,
          }
        );

        if (videoResponse.ok) {
          const videoData = await videoResponse.json();
          const videos = videoData.entries || [];
          for (const entry of videos) {
            if (entry.taxonomies && Array.isArray(entry.taxonomies)) {
              const filteredTaxonomies = entry.taxonomies.filter(
                (t: any) => !(t.taxonomy_uid === CONTENT_TAGS_TAXONOMY && t.term_uid === termUid)
              );
              if (filteredTaxonomies.length !== entry.taxonomies.length) {
                entriesToUpdate.push({
                  uid: entry.uid,
                  contentType: "video",
                  taxonomies: filteredTaxonomies,
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error finding video entries for term ${termUid}:`, error);
      }

      // Update entries to remove taxonomy references
      for (const entryInfo of entriesToUpdate) {
        try {
          // Fetch current entry to preserve other fields
          const getEntryResponse = await fetch(
            `${baseUrl}/v3/content_types/${entryInfo.contentType}/entries/${entryInfo.uid}?locale=en-us`,
            {
              method: "GET",
              headers,
            }
          );

          if (getEntryResponse.ok) {
            const entryData = await getEntryResponse.json();
            const entry = entryData.entry || {};

            // Update entry with filtered taxonomies
            const updatePayload: any = {
              ...entry,
              taxonomies: entryInfo.taxonomies.length > 0 ? entryInfo.taxonomies : [],
            };

            const updateResponse = await fetch(
              `${baseUrl}/v3/content_types/${entryInfo.contentType}/entries/${entryInfo.uid}?locale=en-us`,
              {
                method: "PUT",
                headers,
                body: JSON.stringify({ entry: updatePayload }),
              }
            );

            if (!updateResponse.ok) {
              console.error(`Failed to update entry ${entryInfo.uid}:`, await updateResponse.text());
            }
          }

          // Small delay between updates
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch (error: any) {
          console.error(`Error updating entry ${entryInfo.uid}:`, error);
        }
      }

      return entriesToUpdate.length;
    };

    // Step 3: Delete all old terms (after removing references)
    for (const term of allTerms) {
      // Skip if this term was just created (same UID)
      if (newlyCreatedUids.has(term.uid)) {
        results.deleted.push({
          name: term.name,
          uid: term.uid,
          success: true,
          error: "Skipped (newly created term)",
        });
        continue;
      }

      try {
        // First, remove taxonomy references from entries
        const entriesUpdated = await removeTaxonomyFromEntries(term.uid);
        if (entriesUpdated > 0) {
          console.log(`Removed term ${term.uid} from ${entriesUpdated} entries`);
        }

        // Now try to delete the term with force=true to remove from entries automatically
        const deleteResponse = await fetch(
          `${baseUrl}/v3/taxonomies/${CONTENT_TAGS_TAXONOMY}/terms/${term.uid}?force=true`,
          {
            method: "DELETE",
            headers,
          }
        );

        const responseText = await deleteResponse.text();
        let errorData: any = {};

        if (responseText) {
          try {
            errorData = JSON.parse(responseText);
          } catch {
            // Not JSON, use text as error
            errorData = { error: responseText };
          }
        }

        if (deleteResponse.ok || deleteResponse.status === 404) {
          results.deleted.push({
            name: term.name,
            uid: term.uid,
            success: true,
          });
        } else {
          console.error(`Failed to delete term ${term.uid} (${term.name}):`, {
            status: deleteResponse.status,
            statusText: deleteResponse.statusText,
            error: errorData,
          });
          results.deleted.push({
            name: term.name,
            uid: term.uid,
            success: false,
            error: errorData.error || errorData.message || `HTTP ${deleteResponse.status}: ${deleteResponse.statusText}`,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error: any) {
        console.error(`Exception deleting term ${term.uid} (${term.name}):`, error);
        results.deleted.push({
          name: term.name,
          uid: term.uid,
          success: false,
          error: error.message || "Failed to delete term",
        });
      }
    }

    const createdCount = results.created.filter((r) => r.success).length;
    const createdFailed = results.created.filter((r) => !r.success).length;
    const deletedCount = results.deleted.filter((r) => r.success).length;
    const deletedFailed = results.deleted.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      results,
      summary: {
        created: {
          total: cleanedTerms.length,
          success: createdCount,
          failed: createdFailed,
        },
        deleted: {
          total: allTerms.length,
          success: deletedCount,
          failed: deletedFailed,
        },
      },
    });

  } catch (error: any) {
    console.error("Taxonomy cleanup apply error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to apply taxonomy cleanup",
      },
      { status: 500 }
    );
  }
}

