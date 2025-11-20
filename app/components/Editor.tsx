"use client";

import {
  useEditor,
  EditorContent,
  type Editor as TipTapEditor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight } from "lowlight";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import css from "highlight.js/lib/languages/css";
import html from "highlight.js/lib/languages/xml";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import sql from "highlight.js/lib/languages/sql";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NextLink from "next/link";
import clsx from "clsx";
import TurndownService from "turndown";
import ArticleMetadataPanel, { type ArticleMetadata } from "./ArticleMetadata";
import HistoryPanel from "./HistoryPanel";
import type { GitHubConfig } from "../types/github";
import {
  markdownToHtml,
  mapFrontmatterToMetadata,
  combineFrontmatterAndContent,
} from "../utils/markdown";
import { useGitHubConfig } from "../hooks/useGitHubConfig";
import { slugify } from "../utils/helpers";
import DiffView from "./DiffView";

// Initialize Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Configure turndown to handle code blocks with language from TipTap
turndownService.addRule("codeBlock", {
  filter: (node: any) => {
    return node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE";
  },
  replacement: (_content: string, node: any) => {
    const codeElement = node.firstChild as HTMLElement;
    // Try to get language from data-language attribute or class
    const language =
      codeElement.getAttribute("data-language") ||
      codeElement.className
        ?.split(" ")
        .find((cls: string) => cls.startsWith("language-"))
        ?.replace("language-", "") ||
      "";
    const code = codeElement.textContent || "";
    return language
      ? `\n\`\`\`${language}\n${code}\n\`\`\`\n`
      : `\n\`\`\`\n${code}\n\`\`\`\n`;
  },
});

// Create lowlight instance and register languages
const lowlight = createLowlight();
lowlight.register("javascript", javascript);
lowlight.register("typescript", typescript);
lowlight.register("css", css);
lowlight.register("html", html);
lowlight.register("json", json);
lowlight.register("python", python);
lowlight.register("bash", bash);
lowlight.register("sh", bash);
lowlight.register("sql", sql);

// Available languages for code blocks
const CODE_LANGUAGES = [
  { value: "", label: "Auto-detect" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "json", label: "JSON" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
];

// Icon Components
const BoldIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z"
    />
  </svg>
);

const ItalicIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 4h6M8 20h6M12 4l-2 16"
    />
  </svg>
);

const BulletListIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
    />
  </svg>
);

const OrderedListIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
    />
  </svg>
);

const BlockquoteIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    />
  </svg>
);

const CodeBlockIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
    />
  </svg>
);

const LinkIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
    />
  </svg>
);

const ImageIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
);

const UndoIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
    />
  </svg>
);

const RedoIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
    />
  </svg>
);

// Code formatting function - normalizes indentation and removes trailing whitespace
const formatCode = (code: string): string => {
  if (!code) return code;

  const lines = code.split("\n");

  // Step 1: Detect indentation unit (2 spaces, 4 spaces, tabs, etc.)
  let indentUnit = 2; // Default to 2 spaces
  let usesTabs = false;
  const indentSizes: number[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^(\s+)/);
    if (match) {
      const indent = match[1];
      if (indent.includes("\t")) {
        usesTabs = true;
        indentUnit = 1; // 1 tab = 1 indent level
        break;
      } else {
        const spaces = indent.length;
        if (spaces > 0) {
          indentSizes.push(spaces);
        }
      }
    }
  }

  // Find the GCD of all indent sizes to determine base unit
  if (!usesTabs && indentSizes.length > 0) {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    let baseUnit = indentSizes[0];
    for (let i = 1; i < indentSizes.length; i++) {
      baseUnit = gcd(baseUnit, indentSizes[i]);
    }
    // Use the GCD, but prefer 2 or 4 if close
    if (baseUnit > 0) {
      indentUnit = baseUnit;
      // If GCD is 1, try to find a more common unit (2 or 4)
      if (baseUnit === 1 && indentSizes.length > 3) {
        const counts: Record<number, number> = {};
        indentSizes.forEach((size) => {
          const rounded = Math.round(size / 2) * 2; // Round to nearest even
          counts[rounded] = (counts[rounded] || 0) + 1;
        });
        const mostCommon = Object.entries(counts).sort(
          (a, b) => b[1] - a[1]
        )[0];
        if (mostCommon && parseInt(mostCommon[0]) >= 2) {
          indentUnit = parseInt(mostCommon[0]);
        }
      }
    }
  }

  const indentChar = usesTabs ? "\t" : " ".repeat(indentUnit);

  // Step 2: Normalize indentation preserving relative structure
  const normalized: string[] = [];
  let consecutiveEmptyLines = 0;

  // First pass: collect all indent levels
  const indentLevels: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const match = line.match(/^(\s*)/);
    const leadingWhitespace = match ? match[1] : "";

    let spaceCount = 0;
    for (const char of leadingWhitespace) {
      if (char === "\t") {
        spaceCount += indentUnit;
      } else if (char === " ") {
        spaceCount += 1;
      }
    }
    indentLevels.push(spaceCount);
  }

  // Find unique indent levels and map them to normalized levels
  const uniqueIndents = [...new Set(indentLevels)].sort((a, b) => a - b);
  const indentMap = new Map<number, number>();
  uniqueIndents.forEach((indent, index) => {
    const normalizedLevel = Math.round(indent / indentUnit);
    indentMap.set(indent, normalizedLevel);
  });

  // Second pass: apply normalized indentation
  let indentIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      consecutiveEmptyLines++;
      // Only keep single blank lines, remove multiple consecutive ones
      if (consecutiveEmptyLines <= 1) {
        normalized.push("");
      }
      continue;
    }

    consecutiveEmptyLines = 0;

    // Get the original indent level
    const match = line.match(/^(\s*)/);
    const leadingWhitespace = match ? match[1] : "";

    let spaceCount = 0;
    for (const char of leadingWhitespace) {
      if (char === "\t") {
        spaceCount += indentUnit;
      } else if (char === " ") {
        spaceCount += 1;
      }
    }

    // Map to normalized indent level
    let indentLevel =
      indentMap.get(spaceCount) ?? Math.round(spaceCount / indentUnit);
    if (indentLevel < 0) indentLevel = 0;

    // Apply normalized indentation
    const normalizedIndent = indentChar.repeat(indentLevel);
    normalized.push(normalizedIndent + trimmed);
    indentIndex++;
  }

  // Remove trailing empty lines
  while (
    normalized.length > 0 &&
    normalized[normalized.length - 1].trim() === ""
  ) {
    normalized.pop();
  }

  return normalized.join("\n");
};

const FormatIcon = () => (
  <svg
    className="w-5 h-5"
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
);

const MenuBar = ({ editor }: { editor: TipTapEditor | null }) => {
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      setLinkUrl("");
      setShowLinkInput(false);
    }
  };

  const unsetLink = () => {
    editor.chain().focus().unsetLink().run();
    setShowLinkInput(false);
  };

  const setImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl, alt: imageAlt }).run();
      setImageUrl("");
      setImageAlt("");
      setShowImageInput(false);
    }
  };

  const deleteImage = () => {
    editor.chain().focus().deleteSelection().run();
  };

  const formatCodeBlock = () => {
    if (!editor.isActive("codeBlock")) return;

    const { state } = editor;
    const { selection } = state;
    const { $from } = selection;

    // Find the code block node
    let codeBlockNode = null;
    let codeBlockDepth = 0;

    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "codeBlock") {
        codeBlockNode = node;
        codeBlockDepth = depth;
        break;
      }
    }

    if (codeBlockNode) {
      const currentCode = codeBlockNode.textContent;
      const formattedCode = formatCode(currentCode);
      const language = codeBlockNode.attrs.language || null;

      // Only format if code actually changed
      if (currentCode === formattedCode) {
        return;
      }

      // Get the text content range inside the code block
      const codeBlockStart = $from.start(codeBlockDepth);
      const codeBlockEnd = $from.end(codeBlockDepth);

      // Select all text in the code block, delete it, and insert formatted code
      editor
        .chain()
        .focus()
        .setTextSelection({ from: codeBlockStart, to: codeBlockEnd })
        .deleteSelection()
        .insertContent(formattedCode)
        .run();

      // Ensure we're still in code block and update language
      setTimeout(() => {
        if (language) {
          editor
            .chain()
            .focus()
            .updateAttributes("codeBlock", { language })
            .run();
        }
      }, 10);
    }
  };

  const getCurrentStyle = () => {
    if (editor.isActive("heading", { level: 2 })) {
      return "heading";
    }
    if (editor.isActive("heading", { level: 3 })) {
      return "subheading";
    }
    return "normal";
  };

  const handleStyleChange = (value: string) => {
    if (value === "heading") {
      editor.chain().focus().setHeading({ level: 2 }).run();
    } else if (value === "subheading") {
      editor.chain().focus().setHeading({ level: 3 }).run();
    } else {
      editor.chain().focus().setParagraph().run();
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-center gap-2 flex-wrap shadow-sm w-full">
      <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
        <label htmlFor="text-style-select" className="sr-only">
          Text style
        </label>
        <select
          id="text-style-select"
          value={getCurrentStyle()}
          onChange={(e) => handleStyleChange(e.target.value)}
          className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent cursor-pointer"
          aria-label="Text style"
        >
          <option value="normal">Normal</option>
          <option value="heading">Heading</option>
          <option value="subheading">Subheading</option>
        </select>
      </div>

      <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("bold")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          title="Bold"
        >
          <BoldIcon />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("italic")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          title="Italic"
        >
          <ItalicIcon />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("bulletList")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          aria-label="Bullet List"
          aria-pressed={editor.isActive("bulletList")}
        >
          <BulletListIcon />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("orderedList")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          aria-label="Ordered List"
          aria-pressed={editor.isActive("orderedList")}
        >
          <OrderedListIcon />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("blockquote")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          aria-label="Blockquote"
          aria-pressed={editor.isActive("blockquote")}
        >
          <BlockquoteIcon />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.isActive("codeBlock")
              ? "bg-gray-900 text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          aria-label="Code Block"
          aria-pressed={editor.isActive("codeBlock")}
        >
          <CodeBlockIcon />
        </button>
        {editor.isActive("codeBlock") && (
          <>
            <button
              onClick={formatCodeBlock}
              className="p-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Format Code"
            >
              <FormatIcon />
            </button>
            <label htmlFor="code-language-select" className="sr-only">
              Select code language
            </label>
            <select
              id="code-language-select"
              value={editor.getAttributes("codeBlock").language || ""}
              onChange={(e) => {
                const language = e.target.value;
                editor
                  .chain()
                  .focus()
                  .updateAttributes("codeBlock", { language: language || null })
                  .run();
              }}
              className="px-2 py-1.5 rounded-md text-xs font-medium border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent cursor-pointer"
              aria-label="Select code language"
              onClick={(e) => e.stopPropagation()}
            >
              {CODE_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
        {showLinkInput ? (
          <div className="flex items-center gap-2">
            <label htmlFor="link-url-input" className="sr-only">
              Link URL
            </label>
            <input
              id="link-url-input"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Enter URL..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setLink();
                } else if (e.key === "Escape") {
                  setShowLinkInput(false);
                  setLinkUrl("");
                }
              }}
              autoFocus
              aria-label="Link URL"
            />
            <button
              onClick={setLink}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowLinkInput(false);
                setLinkUrl("");
              }}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                const url = editor.getAttributes("link").href;
                if (url) {
                  setLinkUrl(url);
                }
                setShowLinkInput(true);
              }}
              className={clsx(
                "p-2 rounded-md transition-colors",
                editor.isActive("link")
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              )}
              aria-label="Add or edit link"
              aria-pressed={editor.isActive("link")}
            >
              <LinkIcon />
            </button>
            {editor.isActive("link") && (
              <button
                onClick={unsetLink}
                className="p-2 rounded-md text-gray-700 hover:bg-gray-100 transition-colors text-sm"
                aria-label="Remove link"
              >
                Unlink
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        {showImageInput ? (
          <div className="flex flex-col gap-2 p-3 bg-white border border-gray-300 rounded-md shadow-lg">
            <label htmlFor="image-url-input-toolbar" className="sr-only">
              Image URL
            </label>
            <input
              id="image-url-input-toolbar"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Enter image URL..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  setImage();
                } else if (e.key === "Escape") {
                  setShowImageInput(false);
                  setImageUrl("");
                  setImageAlt("");
                }
              }}
              autoFocus
              aria-label="Image URL"
            />
            <label htmlFor="image-alt-input-toolbar" className="sr-only">
              Image alt text
            </label>
            <input
              id="image-alt-input-toolbar"
              type="text"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              placeholder="Alt text (optional)..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) {
                  setImage();
                } else if (e.key === "Escape") {
                  setShowImageInput(false);
                  setImageUrl("");
                  setImageAlt("");
                }
              }}
              aria-label="Image alt text"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={setImage}
                className="px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Add Image
              </button>
              <button
                onClick={() => {
                  setShowImageInput(false);
                  setImageUrl("");
                  setImageAlt("");
                }}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                if (editor.isActive("image")) {
                  const attrs = editor.getAttributes("image");
                  setImageUrl(attrs.src || "");
                  setImageAlt(attrs.alt || "");
                } else {
                  setImageUrl("");
                  setImageAlt("");
                }
                setShowImageInput(true);
              }}
              className={clsx(
                "p-2 rounded-md transition-colors",
                editor.isActive("image")
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              )}
              aria-label="Add image"
              aria-pressed={editor.isActive("image")}
            >
              <ImageIcon />
            </button>
            {editor.isActive("image") && (
              <button
                onClick={deleteImage}
                className="p-2 rounded-md text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Delete image"
              >
                <svg
                  className="w-5 h-5"
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
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.can().undo()
              ? "text-gray-700 hover:bg-gray-100"
              : "text-gray-300 cursor-not-allowed"
          )}
          aria-label="Undo"
          aria-disabled={!editor.can().undo()}
        >
          <UndoIcon />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className={clsx(
            "p-2 rounded-md transition-colors",
            editor.can().redo()
              ? "text-gray-700 hover:bg-gray-100"
              : "text-gray-300 cursor-not-allowed"
          )}
          aria-label="Redo"
          aria-disabled={!editor.can().redo()}
        >
          <RedoIcon />
        </button>
      </div>
    </div>
  );
};

interface EditorProps {
  onMetadataChange?: (metadata: ArticleMetadata) => void;
}

export default function Editor({ onMetadataChange }: EditorProps = {}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [isMarkdownOpen, setIsMarkdownOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollYRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { config: githubConfig } = useGitHubConfig();

  // Constants for header and menu bar heights
  const HEADER_HEIGHT = 57; // Approximate header height in pixels
  const MENUBAR_HEIGHT = 57; // Approximate menu bar height in pixels
  const SCROLL_THRESHOLD = 100; // Pixels to scroll before hiding header
  const TOP_THRESHOLD = 10; // Pixels from top to always show header
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [currentFileSha, setCurrentFileSha] = useState<string | null>(null);
  const [originalMarkdown, setOriginalMarkdown] = useState<string>("");
  const [originalFrontmatterString, setOriginalFrontmatterString] =
    useState<string>("");
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileChangedRemotely, setFileChangedRemotely] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [autoGeneratedSlug, setAutoGeneratedSlug] = useState<string | null>(
    null
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [includeFrontmatter, setIncludeFrontmatter] = useState(false);
  const [exportRetryCount, setExportRetryCount] = useState(0);
  const [articleMetadata, setArticleMetadata] = useState<ArticleMetadata>({
    slug: "",
    title: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    image: "",
    canonicalUrl: "",
    tags: [],
    readingTime: "",
    faqs: [],
    heroImage: "",
    draft: false,
  });

  const handleMetadataChange = (metadata: ArticleMetadata) => {
    setArticleMetadata(metadata);
    onMetadataChange?.(metadata);
  };

  const updateTitle = (title: string) => {
    // Auto-generate slug from title only for new files
    let slug = articleMetadata.slug;
    if (isNewFile && (!slug || slug === autoGeneratedSlug)) {
      const newSlug = slugify(title);
      slug = newSlug;
      setAutoGeneratedSlug(newSlug);
    }

    const updated = { ...articleMetadata, title, slug };
    setArticleMetadata(updated);
    onMetadataChange?.(updated);
  };

  const updateHeroImage = (heroImage: string) => {
    const updated = { ...articleMetadata, heroImage };
    setArticleMetadata(updated);
    onMetadataChange?.(updated);
  };

  // Load file from GitHub when file parameter is present
  const loadFileFromGitHub = async (filePath: string) => {
    if (!githubConfig || !editor) {
      return;
    }

    setIsLoadingFile(true);
    setLoadError(null);

    try {
      // Fetch file content from GitHub
      const response = await fetch("/api/github/load", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath,
          token: githubConfig.token,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load file");
      }

      // Store original markdown content for diff comparison
      const originalContent = data.original || "";
      setOriginalMarkdown(originalContent);
      setOriginalFrontmatterString(data.frontmatterString || "");
      setCurrentFileSha(data.sha || null);
      setLastSavedAt(null); // Reset last saved time when loading new file
      setSaveStatus("idle");
      setSaveError(null);
      setFileChangedRemotely(false);
      setIsNewFile(false);

      // Parse frontmatter and update metadata
      console.log("Frontmatter received:", data.frontmatter);
      const frontmatterMetadata = mapFrontmatterToMetadata(
        data.frontmatter || {}
      );
      console.log("Mapped metadata:", frontmatterMetadata);
      const loadedSlug = frontmatterMetadata.slug || "";
      setAutoGeneratedSlug(null); // Reset auto-generated slug when loading existing file

      const updatedMetadata: ArticleMetadata = {
        slug: loadedSlug,
        title: frontmatterMetadata.title || "",
        description: frontmatterMetadata.description || "",
        date:
          frontmatterMetadata.date ||
          new Date().toISOString().split("T")[0] + "T00:00:00Z",
        image: frontmatterMetadata.image || "",
        canonicalUrl: frontmatterMetadata.canonicalUrl || "",
        tags: frontmatterMetadata.tags || [],
        readingTime: frontmatterMetadata.readingTime || "",
        faqs: frontmatterMetadata.faqs || [],
        heroImage: frontmatterMetadata.heroImage || "",
        draft: frontmatterMetadata.draft ?? false,
      };
      console.log("Final metadata being set:", updatedMetadata);
      setArticleMetadata(updatedMetadata);
      onMetadataChange?.(updatedMetadata);

      // Convert markdown to HTML and set editor content
      console.log(
        "Converting markdown to HTML, content length:",
        data.content?.length || 0
      );
      const html = await markdownToHtml(data.content || "");
      console.log("Setting editor content, HTML length:", html.length);
      editor.commands.setContent(html);
      console.log("File loaded successfully");
    } catch (error: any) {
      console.error("Failed to load file:", error);
      setLoadError(error.message || "Failed to load file from GitHub");
    } finally {
      setIsLoadingFile(false);
    }
  };

  const getMarkdown = (): string => {
    if (!editor) return "";

    // Get JSON from editor to preserve code block language
    const json = editor.getJSON();

    // Convert TipTap JSON to HTML first
    const html = editor.getHTML();

    // Process HTML to add language attributes to code blocks
    let processedHtml = html;

    // Walk through the JSON to find code blocks and their languages
    const codeBlockLanguages: (string | null)[] = [];
    const walkNodes = (nodes: any[]): void => {
      for (const node of nodes) {
        if (node.type === "codeBlock") {
          codeBlockLanguages.push(node.attrs?.language || null);
        }
        if (node.content) {
          walkNodes(node.content);
        }
      }
    };

    if (json.content) {
      walkNodes(json.content);
    }

    // Add language attributes to code blocks in HTML
    if (typeof window !== "undefined" && codeBlockLanguages.length > 0) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const codeBlocks = tempDiv.querySelectorAll("pre code");

      codeBlockLanguages.forEach((language, index) => {
        if (codeBlocks[index] && language) {
          (codeBlocks[index] as HTMLElement).setAttribute(
            "data-language",
            language
          );
        }
      });

      processedHtml = tempDiv.innerHTML;
    }

    // Convert HTML to Markdown
    let markdown = turndownService.turndown(processedHtml);

    // Clean up any extra whitespace
    markdown = markdown.trim();

    return markdown;
  };

  const getFullMarkdown = (): string => {
    const content = getMarkdown();
    return combineFrontmatterAndContent(
      articleMetadata,
      content,
      originalFrontmatterString
    );
  };

  const handleExportToGoogleDocsClick = () => {
    setIsExportModalOpen(true);
    setExportError(null);
    setExportSuccess(null);
    setExportRetryCount(0);
  };

  const handleExportToGoogleDocs = async (retryAttempt = 0) => {
    if (!editor) return;

    const MAX_RETRIES = 3;
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);
    setExportRetryCount(retryAttempt);

    try {
      const title = articleMetadata.title || "Untitled Article";
      const html = editor.getHTML();

      const response = await fetch("/api/google/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          html,
          metadata: includeFrontmatter ? articleMetadata : undefined,
        }),
      });

      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to export to Google Docs";

        if (response.status === 401) {
          errorMessage =
            "Not connected to Google. Please connect your Google account in settings.";
        } else if (response.status === 400) {
          errorMessage = "Invalid request. Please check your article content.";
        } else if (response.status === 500) {
          errorMessage = "Server error. Please try again later.";
        } else if (response.status === 429) {
          errorMessage =
            "Too many requests. Please wait a moment and try again.";
        }

        // Try to parse JSON error if available
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Use default error message
        }

        // Retry logic for transient errors
        if (
          (response.status === 500 || response.status === 429) &&
          retryAttempt < MAX_RETRIES
        ) {
          const delay = Math.pow(2, retryAttempt) * 1000; // Exponential backoff: 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, delay));
          return handleExportToGoogleDocs(retryAttempt + 1);
        }

        setExportError(errorMessage);
        setIsExportModalOpen(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setExportSuccess(data.documentUrl);
        setIsExportModalOpen(false);
        // Clear success message after 5 seconds
        setTimeout(() => {
          setExportSuccess(null);
        }, 5000);
        // Optionally open the document in a new tab
        if (data.documentUrl) {
          window.open(data.documentUrl, "_blank");
        }
      } else {
        // Retry logic for API-level errors
        if (retryAttempt < MAX_RETRIES) {
          const delay = Math.pow(2, retryAttempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          return handleExportToGoogleDocs(retryAttempt + 1);
        }

        const errorMessage =
          data.error ||
          "Failed to export to Google Docs. Please check your connection and try again.";
        setExportError(errorMessage);
        setIsExportModalOpen(false);
      }
    } catch (error: any) {
      console.error("Export error:", error);

      // Retry logic for network errors
      if (retryAttempt < MAX_RETRIES) {
        const delay = Math.pow(2, retryAttempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return handleExportToGoogleDocs(retryAttempt + 1);
      }

      let errorMessage = "Failed to export to Google Docs";
      if (error.message?.includes("fetch")) {
        errorMessage =
          "Network error. Please check your internet connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setExportError(errorMessage);
      setIsExportModalOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = (): boolean => {
    if (!originalMarkdown) return false;
    const currentMarkdown = getFullMarkdown();
    return currentMarkdown !== originalMarkdown;
  };

  // Check if file has changed on GitHub
  const checkFileStatus = async () => {
    if (!currentFilePath || !githubConfig || !currentFileSha) {
      return;
    }

    setIsCheckingStatus(true);
    try {
      const response = await fetch("/api/github/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath: currentFilePath,
          token: githubConfig.token,
          currentSha: currentFileSha,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setFileChangedRemotely(data.hasChanged || false);
      }
    } catch (error) {
      console.error("Failed to check file status:", error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSaveClick = async () => {
    if (!githubConfig) {
      setSaveStatus("error");
      setSaveError("Please configure GitHub repository first");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 3000);
      return;
    }

    if (!isNewFile && !currentFilePath) {
      setSaveStatus("error");
      setSaveError("Please load a file first");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 3000);
      return;
    }

    // Check if file has changed remotely before showing save modal
    if (currentFileSha && !isNewFile) {
      await checkFileStatus();
    }

    setIsSaveModalOpen(true);
    setCommitMessage("");
  };

  const handleSave = async () => {
    if (!commitMessage.trim()) {
      setSaveStatus("error");
      setSaveError("Please enter a commit message");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 3000);
      return;
    }

    if (!githubConfig) {
      setSaveStatus("error");
      setSaveError("Missing GitHub configuration");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 3000);
      return;
    }

    // For new files, generate file path from slug or title
    let filePath = currentFilePath;
    if (isNewFile && !filePath) {
      const slug = articleMetadata.slug.trim();
      if (!slug) {
        setSaveStatus("error");
        setSaveError("Please provide a slug for the new article");
        setTimeout(() => {
          setSaveStatus("idle");
          setSaveError(null);
        }, 3000);
        return;
      }
      const folder = githubConfig.folder || "";
      const fileName = `${slug}.md`;
      filePath = folder ? `${folder}/${fileName}` : fileName;
      setCurrentFilePath(filePath);
    }

    if (!filePath) {
      setSaveStatus("error");
      setSaveError("Missing file path");
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 3000);
      return;
    }

    setIsSaving(true);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const fullMarkdown = getFullMarkdown();
      const response = await fetch("/api/github/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: githubConfig.repo,
          branch: githubConfig.branch,
          filePath: filePath,
          content: fullMarkdown,
          commitMessage: commitMessage.trim(),
          sha: isNewFile ? undefined : currentFileSha, // Omit SHA for new files
          token: githubConfig.token,
          authorName: githubConfig.authorName,
          authorEmail: githubConfig.authorEmail,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to save file");
      }

      // Update original markdown to reflect saved state
      setOriginalMarkdown(fullMarkdown);
      setCurrentFileSha(data.sha || null);
      setIsSaveModalOpen(false);
      setCommitMessage("");
      setLastSavedAt(new Date());
      setSaveStatus("saved");
      setSaveError(null);
      setFileChangedRemotely(false);

      // If this was a new file, reload it from GitHub and redirect
      if (isNewFile) {
        setIsNewFile(false);
        // Update currentFilePath first
        setCurrentFilePath(filePath);
        // Reload the file from GitHub to get the full content
        try {
          await loadFileFromGitHub(filePath);
          // Redirect to the article with the file path
          router.push(`/article?file=${encodeURIComponent(filePath)}`);
        } catch (error) {
          console.error("Failed to reload file after save:", error);
          // Still redirect even if reload fails
          router.push(`/article?file=${encodeURIComponent(filePath)}`);
        }
      } else {
        setIsNewFile(false);
      }

      // Clear saved status after 3 seconds
      setTimeout(() => {
        if (saveStatus === "saved") {
          setSaveStatus("idle");
        }
      }, 3000);
    } catch (error: any) {
      console.error("Failed to save file:", error);
      setSaveStatus("error");
      setSaveError(error.message || "Failed to save file to GitHub");

      // Clear error status after 5 seconds
      setTimeout(() => {
        setSaveStatus("idle");
        setSaveError(null);
      }, 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false, // Disable default codeBlock, use CodeBlockLowlight instead
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: null,
        HTMLAttributes: {
          class: "hljs",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: "Start writing your article...",
      }),
      Underline,
      Image.configure({
        inline: true,
        allowBase64: false,
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md",
        },
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-lg max-w-none focus:outline-none",
      },
      handlePaste: (view, event) => {
        const { state, dispatch } = view;
        const { selection } = state;

        // Check if we're in a code block
        const $from = selection.$from;
        let inCodeBlock = false;
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === "codeBlock") {
            inCodeBlock = true;
            break;
          }
        }

        if (inCodeBlock && event.clipboardData) {
          const pastedText = event.clipboardData.getData("text/plain");
          if (pastedText) {
            // Format the pasted code
            const formattedCode = formatCode(pastedText);

            // Insert the formatted code
            const { tr } = state;
            tr.replaceSelectionWith(state.schema.text(formattedCode));
            dispatch(tr);
            return true;
          }
        }

        return false; // Let default paste handler handle it
      },
    },
  });

  // Keyboard shortcut for save (Cmd/Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (
          (currentFilePath || isNewFile) &&
          githubConfig &&
          !isSaveModalOpen
        ) {
          handleSaveClick();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFilePath, githubConfig, isSaveModalOpen]);

  // Check for file parameter in URL and load it (after editor is initialized)
  useEffect(() => {
    const fileParam = searchParams?.get("file");
    const isNew = searchParams?.get("new") === "true";

    if (isNew && githubConfig && editor) {
      // New file mode - initialize empty editor
      setIsNewFile(true);
      setCurrentFilePath(null);
      setOriginalMarkdown("");
      setOriginalFrontmatterString("");
      setCurrentFileSha(null);
      setFileChangedRemotely(false);
      setAutoGeneratedSlug(null); // Reset for new file
      editor.commands.clearContent();
      setArticleMetadata({
        slug: "",
        title: "",
        description: "",
        date: new Date().toISOString().split("T")[0] + "T00:00:00Z",
        image: "",
        canonicalUrl: "",
        tags: [],
        readingTime: "",
        faqs: [],
        heroImage: "",
        draft: false,
      });
    } else if (
      fileParam &&
      githubConfig &&
      fileParam !== currentFilePath &&
      editor
    ) {
      console.log("Loading file:", fileParam);
      setIsNewFile(false);
      setCurrentFilePath(fileParam);
      loadFileFromGitHub(fileParam);
    } else {
      console.log("File loading conditions:", {
        fileParam,
        isNew,
        hasGitHubConfig: !!githubConfig,
        currentFilePath,
        hasEditor: !!editor,
      });
    }
  }, [searchParams, githubConfig, currentFilePath, editor]);

  // Periodically check if file has changed remotely
  useEffect(() => {
    if (!currentFilePath || !githubConfig || !currentFileSha || isNewFile) {
      return;
    }

    const interval = setInterval(() => {
      checkFileStatus();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [currentFilePath, githubConfig, currentFileSha, isNewFile]);

  // Create scroll handler function
  const createScrollHandler = (element: HTMLDivElement) => {
    return () => {
      const currentScrollY = element.scrollTop;
      const lastScrollY = lastScrollYRef.current;

      // Always show header when near the top
      if (currentScrollY < TOP_THRESHOLD) {
        setIsHeaderVisible(true);
      }
      // Show header when scrolling up
      else if (currentScrollY < lastScrollY) {
        setIsHeaderVisible(true);
      }
      // Hide header when scrolling down past threshold
      else if (
        currentScrollY > lastScrollY &&
        currentScrollY > SCROLL_THRESHOLD
      ) {
        setIsHeaderVisible(false);
      }

      lastScrollYRef.current = currentScrollY;
    };
  };

  // Callback ref to attach scroll listener when element is ready
  const setScrollContainerRef = (element: HTMLDivElement | null) => {
    // Remove listener from old element if it exists
    const oldElement = scrollContainerRef.current;
    if (oldElement && oldElement !== element) {
      // We can't remove the old handler without storing it, so we'll rely on cleanup
      // The element will be replaced anyway
    }

    scrollContainerRef.current = element;

    // Attach scroll listener immediately when element is available
    if (element) {
      const handleScroll = createScrollHandler(element);
      element.addEventListener("scroll", handleScroll, { passive: true });

      // Store cleanup function on the element for later removal
      (element as any).__scrollHandler = handleScroll;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer && (scrollContainer as any).__scrollHandler) {
        scrollContainer.removeEventListener(
          "scroll",
          (scrollContainer as any).__scrollHandler
        );
      }
    };
  }, []);

  if (!editor) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header Bar */}
      <header
        className={clsx(
          "bg-white border-b border-gray-200 px-6 py-3 fixed top-0 left-0 right-0 z-30 transition-transform duration-300 ease-in-out",
          isHeaderVisible ? "translate-y-0" : "-translate-y-full"
        )}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left Side: File Info & Back Link */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <NextLink
              href="/"
              className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center gap-1 transition-colors shrink-0"
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
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to articles
            </NextLink>
            <div className="h-6 w-px bg-gray-300" aria-hidden="true" />
            <div className="flex items-center gap-3 min-w-0">
              {currentFilePath ? (
                <div className="flex items-center gap-2 text-gray-700 min-w-0">
                  <svg
                    className="w-4 h-4 text-gray-500 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="font-medium truncate">
                    {currentFilePath}
                  </span>
                </div>
              ) : isNewFile ? (
                <span className="text-gray-700 font-medium">New Article</span>
              ) : null}
              {hasUnsavedChanges() && (
                <span
                  className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium shrink-0"
                  aria-label="Unsaved changes"
                >
                  Unsaved
                </span>
              )}
            </div>
          </div>

          {/* Right Side: Status & Actions */}
          <div className="flex items-center gap-4 shrink-0">
            {/* Status Indicators */}
            <div
              className="flex items-center gap-3 text-sm"
              role="status"
              aria-live="polite"
            >
              {saveStatus === "saving" && (
                <span className="text-blue-600 flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
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
                  Saving...
                </span>
              )}
              {saveStatus === "saved" && lastSavedAt && (
                <span className="text-green-600 flex items-center gap-2">
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Saved {lastSavedAt.toLocaleTimeString()}
                </span>
              )}
              {saveStatus === "error" && saveError && (
                <span
                  className="text-red-600 flex items-center gap-2"
                  role="alert"
                  aria-live="assertive"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {saveError}
                </span>
              )}
              {fileChangedRemotely && (
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs font-medium"
                    role="alert"
                    aria-live="assertive"
                  >
                    Changed remotely
                  </span>
                  <button
                    onClick={async () => {
                      if (currentFilePath) {
                        await loadFileFromGitHub(currentFilePath);
                        setFileChangedRemotely(false);
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                    aria-label="Reload file"
                  >
                    Reload
                  </button>
                </div>
              )}
              {isCheckingStatus && (
                <span className="text-gray-500 text-xs flex items-center gap-1">
                  <svg
                    className="animate-spin h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
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
                  Checking...
                </span>
              )}
              {exportError && (
                <span
                  className="text-red-600 text-xs flex items-center gap-1"
                  role="alert"
                  aria-live="assertive"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  {exportError}
                </span>
              )}
              {exportSuccess && (
                <span
                  className="text-green-600 text-xs flex items-center gap-1"
                  role="status"
                  aria-live="polite"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Exported!
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {/* History Button */}
              {currentFilePath && githubConfig && (
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className={clsx(
                    "p-2 rounded-md transition-colors",
                    isHistoryOpen
                      ? "bg-gray-900 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  aria-label="View commit history"
                  aria-pressed={isHistoryOpen}
                  title="Commit History"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
              )}

              {/* Export to Google Docs Button */}
              <button
                onClick={handleExportToGoogleDocsClick}
                disabled={isExporting || !editor}
                className={clsx(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                  isExporting || !editor
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-green-600 text-white hover:bg-green-700"
                )}
                aria-label="Export to Google Docs"
                aria-disabled={isExporting || !editor}
                title="Export to Google Docs"
              >
                {isExporting ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
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
                    Exporting...
                  </>
                ) : (
                  <>
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
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Export to Docs
                  </>
                )}
              </button>

              {/* Save Button */}
              {(currentFilePath || isNewFile) && githubConfig && (
                <button
                  onClick={handleSaveClick}
                  disabled={saveStatus === "saving"}
                  className={clsx(
                    "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                    saveStatus === "saving"
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gray-900 text-white hover:bg-gray-800"
                  )}
                  aria-label="Save to GitHub (Cmd/Ctrl+S)"
                  aria-disabled={saveStatus === "saving"}
                  title="Save to GitHub (Cmd/Ctrl+S)"
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Save
                </button>
              )}

              {/* Settings Button */}
              <button
                onClick={() => setIsMetadataOpen(true)}
                className={clsx(
                  "p-2 rounded-md transition-colors",
                  isMetadataOpen
                    ? "bg-gray-900 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )}
                aria-label="Open article settings"
                aria-pressed={isMetadataOpen}
                title="Article Settings"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Menu Bar - Fixed position, moves to top when header hides */}
      <div
        className="fixed left-0 right-0 z-20 bg-white border-b border-gray-200 transition-all duration-300"
        style={{
          top: isHeaderVisible ? `${HEADER_HEIGHT}px` : "0px",
        }}
      >
        <MenuBar editor={editor} />
      </div>

      {/* Scrollable Content Area */}
      <div
        ref={setScrollContainerRef}
        className="flex-1 overflow-auto"
        style={{
          paddingTop: isHeaderVisible
            ? `${HEADER_HEIGHT + MENUBAR_HEIGHT}px`
            : `${MENUBAR_HEIGHT}px`,
        }}
      >
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Cover Image Section */}
          <div className="mb-6">
            <div className="relative w-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden group hover:border-gray-400 transition-colors aspect-video">
              {articleMetadata.heroImage ? (
                <div className="relative w-full h-full">
                  <img
                    src={articleMetadata.heroImage}
                    alt="Cover"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <button
                    onClick={() => updateHeroImage("")}
                    className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-md hover:bg-black/70 transition-colors"
                    aria-label="Remove cover image"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/50 to-transparent">
                    <label htmlFor="hero-image-url-overlay" className="sr-only">
                      Hero image URL
                    </label>
                    <input
                      id="hero-image-url-overlay"
                      type="url"
                      value={articleMetadata.heroImage}
                      onChange={(e) => updateHeroImage(e.target.value)}
                      placeholder="Change image URL..."
                      className="w-full px-3 py-2 bg-white/90 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Hero image URL"
                    />
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-4 cursor-pointer">
                  <div className="text-gray-400">
                    <ImageIcon />
                  </div>
                  <p className="mt-4 text-sm text-gray-600 font-medium">
                    Add a cover image to your article.
                  </p>
                  <div className="mt-4 w-full max-w-md">
                    <label htmlFor="hero-image-url" className="sr-only">
                      Hero image URL
                    </label>
                    <input
                      id="hero-image-url"
                      type="url"
                      value={articleMetadata.heroImage}
                      onChange={(e) => updateHeroImage(e.target.value)}
                      placeholder="Paste image URL here..."
                      className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Hero image URL"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Loading/Error States */}
          {isLoadingFile && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center gap-3">
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <p className="text-sm text-blue-800">
                  Loading file from GitHub...
                </p>
              </div>
            </div>
          )}

          {loadError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                <strong>Error loading file:</strong> {loadError}
              </p>
            </div>
          )}

          {/* Title Field */}
          <div className="mb-6">
            <label htmlFor="article-title" className="sr-only">
              Article title
            </label>
            <input
              id="article-title"
              type="text"
              value={articleMetadata.title}
              onChange={(e) => updateTitle(e.target.value)}
              placeholder="Title"
              className="w-full text-4xl font-bold text-gray-900 placeholder-gray-400 border-none outline-none focus:outline-none bg-transparent"
              aria-label="Article title"
            />
          </div>

          {/* Editor Content */}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Article Metadata Sidebar */}
      <ArticleMetadataPanel
        metadata={articleMetadata}
        onChange={handleMetadataChange}
        isOpen={isMetadataOpen}
        onClose={() => setIsMetadataOpen(false)}
        isNewFile={isNewFile}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        filePath={currentFilePath}
        githubConfig={githubConfig}
        onRevert={async (commitSha) => {
          // Reload the file after revert
          if (currentFilePath) {
            await loadFileFromGitHub(currentFilePath);
          }
          setIsHistoryOpen(false);
        }}
      />

      {/* Markdown Preview Modal */}
      {isMarkdownOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => setIsMarkdownOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Markdown Preview
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(getMarkdown());
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    aria-label="Copy markdown to clipboard"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => setIsMarkdownOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-md transition-colors"
                    aria-label="Close markdown preview"
                  >
                    <svg
                      className="w-5 h-5 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-6">
                <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800 bg-gray-50 p-4 rounded-md border border-gray-200 overflow-x-auto">
                  <code>{getMarkdown()}</code>
                </pre>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save Modal with Diff View */}
      {isSaveModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40 transition-opacity"
            onClick={() => !isSaving && setIsSaveModalOpen(false)}
            aria-hidden="true"
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-modal-title"
          >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2
                  id="save-modal-title"
                  className="text-xl font-semibold text-gray-900"
                >
                  Review Changes Before Saving
                </h2>
                <button
                  onClick={() => !isSaving && setIsSaveModalOpen(false)}
                  disabled={isSaving}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close save modal"
                  aria-disabled={isSaving}
                >
                  <svg
                    className="w-5 h-5 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Diff Content */}
              <div className="flex-1 overflow-auto p-6">
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">
                    {isNewFile ? (
                      <>
                        Creating new file:{" "}
                        <code className="bg-gray-100 px-1 rounded">
                          {currentFilePath ||
                            `${articleMetadata.slug || "untitled"}.md`}
                        </code>
                      </>
                    ) : (
                      <>
                        Changes to{" "}
                        <code className="bg-gray-100 px-1 rounded">
                          {currentFilePath}
                        </code>
                      </>
                    )}
                  </p>
                  {fileChangedRemotely && (
                    <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <p className="text-sm text-orange-800">
                        ⚠️ This file has been modified on GitHub. Saving will
                        overwrite remote changes. Consider reloading first to
                        see the latest version.
                      </p>
                    </div>
                  )}
                </div>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-700">
                    <span className="text-red-600">-</span> Removed lines |{" "}
                    <span className="text-green-600">+</span> Added lines
                  </div>
                  <div className="max-h-96 overflow-auto p-4 bg-white">
                    <DiffView
                      oldContent={originalMarkdown}
                      newContent={getFullMarkdown()}
                    />
                  </div>
                </div>
              </div>

              {/* Commit Message Input */}
              <div className="px-6 py-4 border-t border-gray-200 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Commit Message <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Describe your changes..."
                    disabled={isSaving}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Press Cmd/Ctrl+Enter to save
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setIsSaveModalOpen(false)}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !commitMessage.trim()}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                      isSaving || !commitMessage.trim()
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    )}
                  >
                    {isSaving ? "Saving..." : "Save & Commit"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Export to Google Docs Confirmation Modal */}
      {isExportModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => !isExporting && setIsExportModalOpen(false)}
            aria-hidden="true"
          />

          {/* Modal */}
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
          >
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2
                  id="export-modal-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Export to Google Docs
                </h2>
                <button
                  onClick={() => !isExporting && setIsExportModalOpen(false)}
                  disabled={isExporting}
                  className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Close export modal"
                >
                  <svg
                    className="w-5 h-5 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-4 space-y-4">
                <p className="text-sm text-gray-700">
                  Export your article to Google Docs. The document will be
                  created with the current content and formatting.
                </p>

                {/* Frontmatter Option */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="include-frontmatter"
                    checked={includeFrontmatter}
                    onChange={(e) => setIncludeFrontmatter(e.target.checked)}
                    disabled={isExporting}
                    className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label
                    htmlFor="include-frontmatter"
                    className="text-sm text-gray-700 cursor-pointer"
                  >
                    Include article metadata (title, description, tags, etc.) as
                    formatted text at the beginning of the document
                  </label>
                </div>

                {/* Retry Indicator */}
                {exportRetryCount > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      Retrying export... (Attempt {exportRetryCount + 1} of 4)
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  disabled={isExporting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleExportToGoogleDocs(0)}
                  disabled={isExporting || !editor}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                    isExporting || !editor
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  )}
                >
                  {isExporting ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
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
                      Exporting...
                    </>
                  ) : (
                    "Export to Google Docs"
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
