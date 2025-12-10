/**
 * Contentstack JSON RTE Converter
 *
 * Converts TipTap HTML output to Contentstack JSON RTE format.
 * Includes custom handlers for YouTube embeds.
 */

// Generate unique IDs for JSON RTE nodes
function generateUid(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 32);
}

// Contentstack JSON RTE node types
interface JsonRteDocument {
  type: "doc";
  uid: string;
  attrs: Record<string, any>;
  children: JsonRteNode[];
  _version?: number;
}

interface JsonRteNode {
  type: string;
  uid: string;
  attrs: Record<string, any>;
  children: (JsonRteNode | JsonRteText)[];
}

interface JsonRteText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  attrs?: Record<string, any>;
}

/**
 * Convert HTML string to Contentstack JSON RTE format
 */
export function htmlToContentstackRte(html: string): JsonRteDocument {
  // Use DOMParser to parse HTML (works in Node.js with jsdom or browser)
  let doc: Document;

  if (typeof window !== "undefined") {
    // Browser environment
    const parser = new DOMParser();
    doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  } else {
    // Server environment - use a simple regex-based approach
    // For full server-side support, you'd need jsdom
    return htmlToRteSimple(html);
  }

  const container = doc.body.firstChild as HTMLElement;
  const children = convertChildNodes(container.childNodes);

  return {
    type: "doc",
    uid: generateUid(),
    attrs: {},
    children,
    _version: 1,
  };
}

/**
 * Simple HTML to RTE converter for server-side use
 * This is a fallback when DOM APIs aren't available
 */
function htmlToRteSimple(html: string): JsonRteDocument {
  const children: JsonRteNode[] = [];

  // Split by block-level elements
  // This is a simplified parser - for production, use jsdom

  // Process paragraphs
  const paragraphRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;

  // First, handle YouTube iframes specially
  const processedHtml = html.replace(
    /<div[^>]*class="[^"]*youtube-embed[^"]*"[^>]*>[\s\S]*?<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([^"?]+)[^"]*"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<\/iframe>[\s\S]*?<\/div>/gi,
    (_, videoId, title) => {
      return `<youtube-embed data-videoid="${videoId}" data-title="${title}"></youtube-embed>`;
    }
  );

  // Also handle standalone iframes
  const htmlWithYouTube = processedHtml.replace(
    /<iframe[^>]*src="https:\/\/www\.youtube\.com\/embed\/([^"?]+)[^"]*"[^>]*title="([^"]*)"[^>]*>[\s\S]*?<\/iframe>/gi,
    (_, videoId, title) => {
      return `<youtube-embed data-videoid="${videoId}" data-title="${title}"></youtube-embed>`;
    }
  );

  // Process the HTML block by block
  let remaining = htmlWithYouTube.trim();

  while (remaining.length > 0) {
    // Try to match block elements
    let matched = false;

    // YouTube embed
    const youtubeMatch = remaining.match(
      /^<youtube-embed[^>]*data-videoid="([^"]*)"[^>]*data-title="([^"]*)"[^>]*><\/youtube-embed>/i
    );
    if (youtubeMatch) {
      children.push(createYouTubeNode(youtubeMatch[1], youtubeMatch[2]));
      remaining = remaining.slice(youtubeMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Headings h1-h6
    const headingMatch = remaining.match(/^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (headingMatch) {
      const level = parseInt(headingMatch[1]);
      children.push(createHeadingNode(level, headingMatch[2]));
      remaining = remaining.slice(headingMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Paragraph
    const paragraphMatch = remaining.match(/^<p[^>]*>([\s\S]*?)<\/p>/i);
    if (paragraphMatch) {
      children.push(createParagraphNode(paragraphMatch[1]));
      remaining = remaining.slice(paragraphMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Unordered list
    const ulMatch = remaining.match(/^<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (ulMatch) {
      children.push(createListNode("ul", ulMatch[1]));
      remaining = remaining.slice(ulMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Ordered list
    const olMatch = remaining.match(/^<ol[^>]*>([\s\S]*?)<\/ol>/i);
    if (olMatch) {
      children.push(createListNode("ol", olMatch[1]));
      remaining = remaining.slice(olMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Blockquote
    const blockquoteMatch = remaining.match(
      /^<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i
    );
    if (blockquoteMatch) {
      children.push(createBlockquoteNode(blockquoteMatch[1]));
      remaining = remaining.slice(blockquoteMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Code block (pre > code)
    const codeBlockMatch = remaining.match(
      /^<pre[^>]*><code[^>]*(?:class="[^"]*language-(\w+)[^"]*")?[^>]*>([\s\S]*?)<\/code><\/pre>/i
    );
    if (codeBlockMatch) {
      children.push(
        createCodeBlockNode(
          decodeHtmlEntities(codeBlockMatch[2]),
          codeBlockMatch[1] || "plaintext"
        )
      );
      remaining = remaining.slice(codeBlockMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Image
    const imgMatch = remaining.match(
      /^<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/i
    );
    if (imgMatch) {
      children.push(createImageNode(imgMatch[1], imgMatch[2] || ""));
      remaining = remaining.slice(imgMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Figure with image
    const figureMatch = remaining.match(
      /^<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>[\s\S]*?(?:<figcaption[^>]*>([\s\S]*?)<\/figcaption>)?[\s\S]*?<\/figure>/i
    );
    if (figureMatch) {
      children.push(
        createImageNode(
          figureMatch[1],
          figureMatch[3] || figureMatch[2] || ""
        )
      );
      remaining = remaining.slice(figureMatch[0].length).trim();
      matched = true;
      continue;
    }

    // Horizontal rule
    const hrMatch = remaining.match(/^<hr[^>]*\/?>/i);
    if (hrMatch) {
      children.push({
        type: "hr",
        uid: generateUid(),
        attrs: {},
        children: [{ text: "" }],
      });
      remaining = remaining.slice(hrMatch[0].length).trim();
      matched = true;
      continue;
    }

    // If nothing matched, try to find the next tag or treat as text
    if (!matched) {
      // Skip whitespace and line breaks
      const whitespaceMatch = remaining.match(/^[\s\n]+/);
      if (whitespaceMatch) {
        remaining = remaining.slice(whitespaceMatch[0].length);
        continue;
      }

      // Skip any other standalone tag or content
      const anyTagMatch = remaining.match(/^<[^>]+>/);
      if (anyTagMatch) {
        remaining = remaining.slice(anyTagMatch[0].length).trim();
        continue;
      }

      // Text content without tags - wrap in paragraph
      const textMatch = remaining.match(/^[^<]+/);
      if (textMatch) {
        const text = textMatch[0].trim();
        if (text) {
          children.push(createParagraphNode(text));
        }
        remaining = remaining.slice(textMatch[0].length).trim();
        continue;
      }

      // If we still haven't matched anything, skip a character to avoid infinite loop
      remaining = remaining.slice(1);
    }
  }

  return {
    type: "doc",
    uid: generateUid(),
    attrs: {},
    children: children.length > 0 ? children : [createParagraphNode("")],
    _version: 1,
  };
}

/**
 * Create a YouTube embed node
 */
function createYouTubeNode(videoId: string, title: string): JsonRteNode {
  return {
    type: "youtube-embed",
    uid: generateUid(),
    attrs: {
      videoid: videoId,
      title: title || "YouTube Video",
      src: `https://www.youtube.com/embed/${videoId}`,
      frameborder: "0",
      allow:
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      allowfullscreen: true,
    },
    children: [{ text: "" }],
  };
}

/**
 * Create a heading node
 */
function createHeadingNode(level: number, content: string): JsonRteNode {
  return {
    type: `h${level}`,
    uid: generateUid(),
    attrs: {},
    children: parseInlineContent(content),
  };
}

/**
 * Create a paragraph node
 */
function createParagraphNode(content: string): JsonRteNode {
  return {
    type: "p",
    uid: generateUid(),
    attrs: {},
    children: parseInlineContent(content),
  };
}

/**
 * Create a list node (ul or ol)
 */
function createListNode(type: "ul" | "ol", content: string): JsonRteNode {
  const listItems: JsonRteNode[] = [];

  // Parse list items
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(content)) !== null) {
    listItems.push({
      type: "li",
      uid: generateUid(),
      attrs: {},
      children: parseInlineContent(match[1]),
    });
  }

  return {
    type,
    uid: generateUid(),
    attrs: {},
    children: listItems.length > 0 ? listItems : [{ text: "" }],
  };
}

/**
 * Create a blockquote node
 */
function createBlockquoteNode(content: string): JsonRteNode {
  // Blockquotes may contain multiple paragraphs
  const paragraphs = content
    .split(/<p[^>]*>|<\/p>/i)
    .filter((p) => p.trim());

  const children: JsonRteNode[] = paragraphs.map((p) => ({
    type: "p",
    uid: generateUid(),
    attrs: {},
    children: parseInlineContent(p),
  }));

  return {
    type: "blockquote",
    uid: generateUid(),
    attrs: {},
    children: children.length > 0 ? children : [createParagraphNode("")],
  };
}

/**
 * Create a code block node
 */
function createCodeBlockNode(code: string, language: string): JsonRteNode {
  return {
    type: "code",
    uid: generateUid(),
    attrs: {
      language: language || "plaintext",
    },
    children: [{ text: code }],
  };
}

/**
 * Create an image node
 */
function createImageNode(src: string, alt: string): JsonRteNode {
  return {
    type: "img",
    uid: generateUid(),
    attrs: {
      url: src,
      "redactor-attributes": {
        src,
        alt,
      },
    },
    children: [{ text: "" }],
  };
}

/**
 * Parse inline content (bold, italic, links, etc.)
 */
function parseInlineContent(html: string): (JsonRteNode | JsonRteText)[] {
  const result: (JsonRteNode | JsonRteText)[] = [];

  if (!html || !html.trim()) {
    return [{ text: "" }];
  }

  let remaining = html;

  while (remaining.length > 0) {
    // Link
    const linkMatch = remaining.match(/^<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (linkMatch) {
      const linkChildren = parseInlineContent(linkMatch[2]);
      result.push({
        type: "a",
        uid: generateUid(),
        attrs: {
          url: linkMatch[1],
          "redactor-attributes": {
            href: linkMatch[1],
          },
        },
        children: linkChildren,
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Bold (strong or b)
    const boldMatch = remaining.match(/^<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i);
    if (boldMatch) {
      const boldChildren = parseInlineContent(boldMatch[1]);
      // Apply bold mark to children
      applyMarkToChildren(boldChildren, "bold");
      result.push(...boldChildren);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic (em or i)
    const italicMatch = remaining.match(/^<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/i);
    if (italicMatch) {
      const italicChildren = parseInlineContent(italicMatch[1]);
      applyMarkToChildren(italicChildren, "italic");
      result.push(...italicChildren);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Underline
    const underlineMatch = remaining.match(/^<u[^>]*>([\s\S]*?)<\/u>/i);
    if (underlineMatch) {
      const underlineChildren = parseInlineContent(underlineMatch[1]);
      applyMarkToChildren(underlineChildren, "underline");
      result.push(...underlineChildren);
      remaining = remaining.slice(underlineMatch[0].length);
      continue;
    }

    // Strikethrough
    const strikeMatch = remaining.match(/^<(?:s|strike|del)[^>]*>([\s\S]*?)<\/(?:s|strike|del)>/i);
    if (strikeMatch) {
      const strikeChildren = parseInlineContent(strikeMatch[1]);
      applyMarkToChildren(strikeChildren, "strikethrough");
      result.push(...strikeChildren);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Inline code
    const codeMatch = remaining.match(/^<code[^>]*>([\s\S]*?)<\/code>/i);
    if (codeMatch) {
      result.push({
        text: decodeHtmlEntities(codeMatch[1]),
        code: true,
      });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Line break
    const brMatch = remaining.match(/^<br\s*\/?>/i);
    if (brMatch) {
      result.push({ text: "\n" });
      remaining = remaining.slice(brMatch[0].length);
      continue;
    }

    // Skip other tags but keep content
    const otherTagMatch = remaining.match(/^<[^>]+>/);
    if (otherTagMatch) {
      remaining = remaining.slice(otherTagMatch[0].length);
      continue;
    }

    // Plain text
    const textMatch = remaining.match(/^[^<]+/);
    if (textMatch) {
      const text = decodeHtmlEntities(textMatch[0]);
      if (text) {
        result.push({ text });
      }
      remaining = remaining.slice(textMatch[0].length);
      continue;
    }

    // Skip unmatched characters
    remaining = remaining.slice(1);
  }

  return result.length > 0 ? result : [{ text: "" }];
}

/**
 * Apply a mark (bold, italic, etc.) to all text children
 */
function applyMarkToChildren(
  children: (JsonRteNode | JsonRteText)[],
  mark: "bold" | "italic" | "underline" | "strikethrough"
): void {
  for (const child of children) {
    if ("text" in child) {
      child[mark] = true;
    } else if (child.children) {
      applyMarkToChildren(child.children, mark);
    }
  }
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Convert DOM child nodes to JSON RTE nodes (browser only)
 */
function convertChildNodes(nodes: NodeListOf<ChildNode>): JsonRteNode[] {
  const result: JsonRteNode[] = [];

  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        result.push(createParagraphNode(text));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      switch (tagName) {
        case "p":
          result.push(createParagraphNode(element.innerHTML));
          break;
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          result.push(
            createHeadingNode(parseInt(tagName[1]), element.innerHTML)
          );
          break;
        case "ul":
          result.push(createListNode("ul", element.innerHTML));
          break;
        case "ol":
          result.push(createListNode("ol", element.innerHTML));
          break;
        case "blockquote":
          result.push(createBlockquoteNode(element.innerHTML));
          break;
        case "pre":
          const code = element.querySelector("code");
          const language =
            code?.className.match(/language-(\w+)/)?.[1] || "plaintext";
          result.push(createCodeBlockNode(code?.textContent || "", language));
          break;
        case "img":
          result.push(
            createImageNode(
              element.getAttribute("src") || "",
              element.getAttribute("alt") || ""
            )
          );
          break;
        case "figure":
          const img = element.querySelector("img");
          const caption = element.querySelector("figcaption");
          if (img) {
            result.push(
              createImageNode(
                img.getAttribute("src") || "",
                caption?.textContent || img.getAttribute("alt") || ""
              )
            );
          }
          break;
        case "hr":
          result.push({
            type: "hr",
            uid: generateUid(),
            attrs: {},
            children: [{ text: "" }],
          });
          break;
        case "div":
          // Check for YouTube embed
          if (element.classList.contains("youtube-embed")) {
            const iframe = element.querySelector("iframe");
            if (iframe) {
              const src = iframe.getAttribute("src") || "";
              const videoIdMatch = src.match(/embed\/([^?&]+)/);
              if (videoIdMatch) {
                result.push(
                  createYouTubeNode(
                    videoIdMatch[1],
                    iframe.getAttribute("title") || "YouTube Video"
                  )
                );
              }
            }
          } else {
            // Process div contents recursively
            result.push(...convertChildNodes(element.childNodes));
          }
          break;
        default:
          // Process other elements recursively
          result.push(...convertChildNodes(element.childNodes));
      }
    }
  });

  return result;
}

/**
 * Export type for use in other files
 */
export type { JsonRteDocument, JsonRteNode, JsonRteText };

