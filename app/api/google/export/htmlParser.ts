import * as cheerio from "cheerio";
import type { TextRun, Paragraph } from "./types";

/**
 * Extract text runs with formatting from a cheerio element
 */
function extractTextRuns($: ReturnType<typeof cheerio.load>, element: any, textRuns: TextRun[] = []): TextRun[] {
  const children = element.contents();

  children.each((_: number, node: any) => {
    if (node.type === "text") {
      // Text node
      const text = node.data || "";
      if (text.trim()) {
        textRuns.push({ text });
      }
    } else if (node.type === "tag") {
      // Element node
      const $el = $(node);
      const tagName = $el.prop("tagName")?.toLowerCase() || "";

      // Handle inline formatting
      if (tagName === "strong" || tagName === "b") {
        const text = $el.text() || "";
        if (text.trim()) {
          textRuns.push({ text, bold: true });
        }
      } else if (tagName === "em" || tagName === "i") {
        const text = $el.text() || "";
        if (text.trim()) {
          textRuns.push({ text, italic: true });
        }
      } else if (tagName === "a") {
        const href = $el.attr("href") || "";
        const text = $el.text() || "";
        if (text.trim()) {
          textRuns.push({ text, link: href });
        }
      } else if (tagName === "code" && $el.parent().prop("tagName")?.toLowerCase() !== "pre") {
        // Inline code
        const text = $el.text() || "";
        if (text.trim()) {
          textRuns.push({
            text,
            foregroundColor: {
              color: { rgbColor: { red: 0.8, green: 0.2, blue: 0.2 } },
            },
          });
        }
      } else {
        // Recursively process children
        extractTextRuns($, $el, textRuns);
      }
    }
  });

  return textRuns;
}

/**
 * Parse HTML content and convert to structured Paragraph format
 */
export function parseHTMLToParagraphs(html: string): Paragraph[] {
  const $ = cheerio.load(html);
  const paragraphs: Paragraph[] = [];

  // Process all top-level elements in the body
  const body = $("body");
  const elements = body.children().length > 0 ? body.children() : body;

  elements.each((_: number, element: any) => {
    const $el = $(element);
    const tagName = $el.prop("tagName")?.toLowerCase() || "";

    // Headings
    if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
      const textRuns = extractTextRuns($, $el);
      paragraphs.push({
        textRuns,
        heading: tagName === "h1" ? "HEADING_1" : tagName === "h2" ? "HEADING_2" : "HEADING_3",
      });
    }
    // Paragraphs
    else if (tagName === "p") {
      const textRuns = extractTextRuns($, $el);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
    // Lists
    else if (tagName === "ul" || tagName === "ol") {
      $el.find("li").each((_: number, item: any) => {
        const $item = $(item);
        const textRuns = extractTextRuns($, $item);
        if (textRuns.length > 0) {
          paragraphs.push({
            textRuns,
            listType: tagName === "ul" ? "UNORDERED_LIST" : "ORDERED_LIST",
          });
        }
      });
    }
    // Code blocks
    else if (tagName === "pre") {
      const codeElement = $el.find("code");
      const codeText = codeElement.length > 0 ? codeElement.text() : $el.text();
      if (codeText.trim()) {
        paragraphs.push({
          textRuns: [{ text: codeText }],
          isCodeBlock: true,
        });
      }
    }
    // Blockquotes
    else if (tagName === "blockquote") {
      const textRuns = extractTextRuns($, $el);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
    // Images
    else if (tagName === "img") {
      const src = $el.attr("src") || "";
      const alt = $el.attr("alt") || "";
      if (src) {
        paragraphs.push({
          textRuns: alt ? [{ text: alt }] : [],
          imageUrl: src,
        });
      }
    }
    // Divs - treat as paragraphs
    else if (tagName === "div") {
      const textRuns = extractTextRuns($, $el);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
  });

  return paragraphs;
}
