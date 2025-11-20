import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getOAuth2Client } from "../utils";
import { parseHTMLToParagraphs } from "./htmlParser";
import { paragraphsToGoogleDocsRequests } from "./converter";
import type { Paragraph } from "./types";

export async function POST(request: NextRequest) {
  try {
    const oauth2Client = await getOAuth2Client();

    if (!oauth2Client) {
      return NextResponse.json(
        {
          success: false,
          error: "Not connected to Google. Please connect your Google account in settings.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, content, html, metadata } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Title is required" },
        { status: 400 }
      );
    }

    if (!content && !html) {
      return NextResponse.json(
        { success: false, error: "Content or HTML is required" },
        { status: 400 }
      );
    }

    const contentToUse = html || content || "";
    const docs = google.docs({ version: "v1", auth: oauth2Client });

    // Create a new document
    const createResponse = await docs.documents.create({
      requestBody: {
        title: title,
      },
    });

    const documentId = createResponse.data.documentId;
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: "Failed to create document" },
        { status: 500 }
      );
    }

    // Build content paragraphs
    let allParagraphs: Paragraph[] = [];

    // Add frontmatter if metadata is provided
    if (metadata) {
      const frontmatterParagraphs: Paragraph[] = [];
      
      // Helper to add a metadata field
      const addMetadataField = (label: string, value: any) => {
        if (value !== undefined && value !== null && value !== "") {
          if (Array.isArray(value) && value.length > 0) {
            frontmatterParagraphs.push({
              textRuns: [{ text: `${label}: ${value.join(", ")}` }],
              heading: "NORMAL_TEXT" as const,
            });
          } else if (typeof value === "object") {
            // Handle FAQs
            if (Array.isArray(value)) {
              value.forEach((item: any) => {
                if (item.question) {
                  frontmatterParagraphs.push({
                    textRuns: [{ text: `Q: ${item.question}`, bold: true }],
                    heading: "NORMAL_TEXT" as const,
                  });
                }
                if (item.answer) {
                  frontmatterParagraphs.push({
                    textRuns: [{ text: `A: ${item.answer}` }],
                    heading: "NORMAL_TEXT" as const,
                  });
                }
              });
            }
          } else {
            frontmatterParagraphs.push({
              textRuns: [{ text: `${label}: ${String(value)}` }],
              heading: "NORMAL_TEXT" as const,
            });
          }
        }
      };

      // Add metadata fields (excluding title since it's the document title)
      if (metadata.slug) addMetadataField("Slug", metadata.slug);
      if (metadata.description) addMetadataField("Description", metadata.description);
      if (metadata.date) addMetadataField("Date", metadata.date);
      if (metadata.canonicalUrl) addMetadataField("Canonical URL", metadata.canonicalUrl);
      if (metadata.readingTime) addMetadataField("Reading Time", metadata.readingTime);
      if (metadata.tags && metadata.tags.length > 0) addMetadataField("Tags", metadata.tags);
      if (metadata.faqs && metadata.faqs.length > 0) addMetadataField("FAQs", metadata.faqs);
      if (metadata.heroImage) addMetadataField("Hero Image", metadata.heroImage);
      if (metadata.draft !== undefined) addMetadataField("Draft", metadata.draft ? "Yes" : "No");

      // Add separator if we have frontmatter
      if (frontmatterParagraphs.length > 0) {
        allParagraphs.push({
          textRuns: [{ text: "Article Metadata", bold: true }],
          heading: "HEADING_2" as const,
        });
        allParagraphs.push(...frontmatterParagraphs);
        allParagraphs.push({
          textRuns: [{ text: "" }], // Empty paragraph as separator
          heading: "NORMAL_TEXT" as const,
        });
      }
    }

    // Parse HTML and convert to Google Docs format
    const contentParagraphs = parseHTMLToParagraphs(contentToUse);
    allParagraphs.push(...contentParagraphs);

    const requests = await paragraphsToGoogleDocsRequests(allParagraphs, title);

    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId: documentId,
        requestBody: {
          requests: requests,
        },
      });
    }

    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    return NextResponse.json({
      success: true,
      documentId: documentId,
      documentUrl: documentUrl,
      message: "Article exported to Google Docs successfully",
    });
  } catch (error: any) {
    console.error("Google Docs export error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to export to Google Docs",
      },
      { status: 500 }
    );
  }
}
