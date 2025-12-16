import { NextRequest, NextResponse } from "next/server";
import {
  getContentstackBaseUrl,
  getContentstackHeaders,
  validateContentstackConfig,
  handleContentstackError,
  CONTENT_TAGS_TAXONOMY,
} from "../../utils";
import { createOpenAIClient } from "../../../openai/utils";
import type { ChatMessage } from "../../../openai/types";

/**
 * POST /api/contentstack/taxonomy-cleanup/analyze
 * Analyze taxonomy terms using OpenAI to suggest merges
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Contentstack configuration
    const configError = validateContentstackConfig();
    if (configError) return configError;

    const baseUrl = getContentstackBaseUrl();
    const headers = getContentstackHeaders();

    // Fetch all taxonomy terms
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

    // Extract term names
    const termNames = allTerms.map((term: any) => term.name);

    if (termNames.length === 0) {
      return NextResponse.json({
        success: true,
        merges: [],
        message: "No taxonomy terms found",
      });
    }

    // Use OpenAI to analyze and suggest merges
    const openai = createOpenAIClient();

    const systemPrompt = `You are a taxonomy cleanup assistant. Your task is to drastically simplify and consolidate taxonomy terms into high-level categories.

CRITICAL RULES - Be VERY aggressive about consolidation:
1. Group all development-related terms into "Development" (e.g., GraphQL, Gatsby, SDK, NPM package, npm, package manager, build tools, bundlers, compilers, etc.)
2. Group all CMS/platform terms into "CMS" (e.g., headless CMS, content management, Contentstack, Strapi, etc.)
3. Group all framework/library terms into "Frameworks" (e.g., React, Vue, Angular, Next.js, Svelte, etc.)
4. Group all language terms into "Languages" (e.g., JavaScript, TypeScript, Python, etc.)
5. Group all API-related terms into "API" (e.g., REST API, GraphQL API, APIs, etc.)
6. Group all design/UI terms into "Design" (e.g., UI, UX, design system, components, etc.)
7. Group all deployment/hosting terms into "Deployment" (e.g., hosting, serverless, cloud, AWS, Vercel, etc.)
8. Group all testing/QA terms into "Testing" (e.g., unit testing, integration testing, QA, etc.)
9. Group all database terms into "Database" (e.g., SQL, NoSQL, MongoDB, PostgreSQL, etc.)
10. Group all security terms into "Security" (e.g., authentication, authorization, encryption, etc.)

Additional consolidation rules:
- Merge singular/plural forms (e.g., "API" and "APIs" → "API")
- Merge abbreviations and full forms (e.g., "JS" and "JavaScript" → "JavaScript")
- Merge specific tools into their category (e.g., "Webpack" → "Development", "Jest" → "Testing")
- Merge brand names into categories when appropriate (e.g., "Vercel" → "Deployment")
- Only keep truly distinct high-level concepts separate
- Aim for 20-50 total terms maximum, not hundreds

Return ONLY a valid JSON array of strings - the consolidated category names. No additional text or explanation.

Example:
Input: ["GraphQL", "Gatsby", "SDK", "NPM package", "React", "Next.js", "JavaScript", "TypeScript", "CMS", "headless CMS", "API", "REST API"]
Output: ["Development", "Frameworks", "Languages", "CMS", "API"]`;

    const userMessage = `Clean up and simplify these ${termNames.length} taxonomy terms. Return only the cleaned term names as a JSON array:

${termNames.map((name: string, idx: number) => `${idx + 1}. ${name}`).join("\n")}

Return ONLY the JSON array of cleaned term names, no additional text or explanation.`;

    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      temperature: 0.3,
      max_completion_tokens: 4000,
    });

    const responseContent = completion.choices[0]?.message?.content || "";

    // Parse JSON response
    let cleanedTermNames: string[] = [];

    try {
      let cleanedContent = responseContent.trim();

      // Remove markdown code block if present
      if (cleanedContent.startsWith("```json")) {
        cleanedContent = cleanedContent.slice(7);
      } else if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent.slice(3);
      }

      if (cleanedContent.endsWith("```")) {
        cleanedContent = cleanedContent.slice(0, -3);
      }

      cleanedContent = cleanedContent.trim();
      cleanedTermNames = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse cleaned terms JSON:", parseError);
      console.error("Raw response:", responseContent);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to parse AI response as JSON. Please try again.",
          rawResponse: responseContent,
        },
        { status: 500 }
      );
    }

    // Validate response structure
    if (!Array.isArray(cleanedTermNames)) {
      return NextResponse.json(
        {
          success: false,
          error: "AI response is not an array",
          rawResponse: responseContent,
        },
        { status: 500 }
      );
    }

    // Filter out invalid entries and ensure all are strings
    cleanedTermNames = cleanedTermNames
      .filter((name: any) => typeof name === "string" && name.trim().length > 0)
      .map((name: string) => name.trim());

    return NextResponse.json({
      success: true,
      cleanedTerms: cleanedTermNames,
      originalCount: termNames.length,
      cleanedCount: cleanedTermNames.length,
      reduction: termNames.length - cleanedTermNames.length,
      usage: completion.usage,
    });

  } catch (error: any) {
    console.error("Taxonomy cleanup analysis error:", error);

    let status = 500;
    let errorMessage = error.message || "Failed to analyze taxonomy terms";

    if (error.status === 401) {
      status = 401;
      errorMessage = "Invalid OpenAI API key. Please check your configuration.";
    } else if (error.status === 429) {
      status = 429;
      errorMessage = "Rate limit exceeded. Please try again later.";
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status }
    );
  }
}

