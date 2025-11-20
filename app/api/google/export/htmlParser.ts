import { JSDOM } from "jsdom";
import type { TextRun, Paragraph } from "./types";

/**
 * Extract text runs with formatting from a DOM node
 */
function extractTextRuns(node: Node, textRuns: TextRun[] = []): TextRun[] {
  if (node.nodeType === 3) {
    // Text node
    const text = node.textContent || "";
    if (text.trim()) {
      textRuns.push({ text });
    }
  } else if (node.nodeType === 1) {
    // Element node
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes);

    // Handle inline formatting
    if (tagName === "strong" || tagName === "b") {
      const text = element.textContent || "";
      if (text.trim()) {
        textRuns.push({ text, bold: true });
      }
    } else if (tagName === "em" || tagName === "i") {
      const text = element.textContent || "";
      if (text.trim()) {
        textRuns.push({ text, italic: true });
      }
    } else if (tagName === "a") {
      const href = element.getAttribute("href") || "";
      const text = element.textContent || "";
      if (text.trim()) {
        textRuns.push({ text, link: href });
      }
    } else if (tagName === "code" && element.parentElement?.tagName.toLowerCase() !== "pre") {
      // Inline code
      const text = element.textContent || "";
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
      for (const child of children) {
        extractTextRuns(child, textRuns);
      }
    }
  }

  return textRuns;
}

/**
 * Parse HTML content and convert to structured Paragraph format
 */
export function parseHTMLToParagraphs(html: string): Paragraph[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const paragraphs: Paragraph[] = [];

  // Process all top-level elements
  const body = document.body || document;
  const bodyElement = body as Element;
  const elements = Array.from(
    bodyElement.children.length > 0 ? bodyElement.children : [bodyElement]
  ) as Element[];

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();

    // Headings
    if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
      const textRuns = extractTextRuns(element);
      paragraphs.push({
        textRuns,
        heading: tagName === "h1" ? "HEADING_1" : tagName === "h2" ? "HEADING_2" : "HEADING_3",
      });
    }
    // Paragraphs
    else if (tagName === "p") {
      const textRuns = extractTextRuns(element);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
    // Lists
    else if (tagName === "ul" || tagName === "ol") {
      const listItems = element.querySelectorAll("li");
      for (const item of Array.from(listItems) as Element[]) {
        const textRuns = extractTextRuns(item);
        if (textRuns.length > 0) {
          paragraphs.push({
            textRuns,
            listType: tagName === "ul" ? "UNORDERED_LIST" : "ORDERED_LIST",
          });
        }
      }
    }
    // Code blocks
    else if (tagName === "pre") {
      const codeElement = element.querySelector("code");
      const codeText = codeElement?.textContent || element.textContent || "";
      if (codeText.trim()) {
        paragraphs.push({
          textRuns: [{ text: codeText }],
          isCodeBlock: true,
        });
      }
    }
    // Blockquotes
    else if (tagName === "blockquote") {
      const textRuns = extractTextRuns(element);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
    // Images
    else if (tagName === "img") {
      const src = element.getAttribute("src") || "";
      const alt = element.getAttribute("alt") || "";
      if (src) {
        paragraphs.push({
          textRuns: alt ? [{ text: alt }] : [],
          imageUrl: src,
        });
      }
    }
    // Divs - treat as paragraphs
    else if (tagName === "div") {
      const textRuns = extractTextRuns(element);
      if (textRuns.length > 0) {
        paragraphs.push({ textRuns, heading: "NORMAL_TEXT" });
      }
    }
  }

  return paragraphs;
}

