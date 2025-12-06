import type { Editor as TipTapEditor } from "@tiptap/react";
import { markdownToHtml } from "./markdown";

export interface StreamChunk {
  content: string;
  isComplete: boolean;
}

/**
 * Find safe break points in buffered markdown content
 * Returns array of complete segments that can be safely converted to HTML
 */
export function findSafeBreakPoints(buffer: string): {
  segments: string[];
  remainingBuffer: string;
} {
  const segments: string[] = [];
  let remaining = buffer;

  // Pattern to detect complete blocks:
  // - Paragraphs (text followed by double newline)
  // - Headings (# text followed by newline)
  // - List items (- or * or numbered followed by newline and either another list item or double newline)
  // - Code blocks (``` to ```)
  // - Blockquotes (> text followed by double newline)

  // Check for complete code blocks first (they may contain newlines)
  const codeBlockRegex = /^(```[\s\S]*?```)\n?/;
  const codeBlockMatch = remaining.match(codeBlockRegex);
  if (codeBlockMatch) {
    segments.push(codeBlockMatch[1]);
    remaining = remaining.slice(codeBlockMatch[0].length);
  }

  // Split by double newlines (paragraph boundaries)
  const parts = remaining.split(/\n\n+/);

  // All parts except the last are complete
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].trim();
    if (part) {
      segments.push(part);
    }
  }

  // The last part might be incomplete
  remaining = parts[parts.length - 1] || "";

  // Check if the remaining content looks complete
  // (e.g., ends with a period, question mark, or is a complete heading)
  const isLikelyComplete =
    remaining.trim().length === 0 ||
    /[.!?]$/.test(remaining.trim()) ||
    /^#{1,6}\s+.+$/.test(remaining.trim());

  // If we have segments and remaining looks incomplete, keep it in buffer
  // If we have no segments, we need to return the remaining as-is
  if (segments.length === 0 && remaining.trim()) {
    // No complete segments yet, check if buffer is getting too large
    // Force flush at sentence boundaries more aggressively for smoother scrolling
    if (remaining.length > 150) {
      // Try to find a sentence break
      const sentenceBreak = remaining.lastIndexOf(". ");
      if (sentenceBreak > 50) {
        segments.push(remaining.slice(0, sentenceBreak + 1).trim());
        remaining = remaining.slice(sentenceBreak + 2);
      } else {
        // No sentence break found, try comma or just flush at word boundary
        const commaBreak = remaining.lastIndexOf(", ");
        if (commaBreak > 50) {
          segments.push(remaining.slice(0, commaBreak + 1).trim());
          remaining = remaining.slice(commaBreak + 2);
        } else if (remaining.length > 300) {
          // Really long without breaks, force flush at last space
          const spaceBreak = remaining.lastIndexOf(" ");
          if (spaceBreak > 50) {
            segments.push(remaining.slice(0, spaceBreak).trim());
            remaining = remaining.slice(spaceBreak + 1);
          }
        }
      }
    }
  }

  return {
    segments,
    remainingBuffer: remaining,
  };
}

/**
 * Stream content into a TipTap editor
 * Handles buffering, markdown conversion, and insertion
 */
export class EditorStreamHandler {
  private editor: TipTapEditor;
  private buffer: string = "";
  private insertPosition: number;
  private mode: "replace-all" | "replace-selection" | "append";
  private isFirstChunk: boolean = true;
  private aborted: boolean = false;
  private onContentInserted?: () => void;

  constructor(
    editor: TipTapEditor,
    mode: "replace-all" | "replace-selection" | "append",
    selectionRange?: { from: number; to: number },
    onContentInserted?: () => void
  ) {
    this.editor = editor;
    this.mode = mode;
    this.onContentInserted = onContentInserted;

    // Setup initial state based on mode
    if (mode === "replace-all") {
      // Will clear content on first chunk
      this.insertPosition = 0;
    } else if (mode === "replace-selection" && selectionRange) {
      // Delete selection and note position
      this.editor.commands.deleteRange(selectionRange);
      this.insertPosition = selectionRange.from;
    } else {
      // Append mode - insert at end
      this.insertPosition = this.editor.state.doc.content.size;
    }
  }

  /**
   * Process an incoming chunk of text
   */
  async processChunk(chunk: string): Promise<void> {
    if (this.aborted) return;

    // Clear editor on first chunk if replacing all
    if (this.isFirstChunk && this.mode === "replace-all") {
      this.editor.commands.clearContent();
      this.insertPosition = 0;
      this.isFirstChunk = false;
    }

    this.buffer += chunk;

    // Find complete segments
    const { segments, remainingBuffer } = findSafeBreakPoints(this.buffer);
    this.buffer = remainingBuffer;

    // Insert complete segments
    for (const segment of segments) {
      if (this.aborted) return;
      await this.insertSegment(segment);
    }
  }

  /**
   * Insert a markdown segment into the editor
   */
  private async insertSegment(markdown: string): Promise<void> {
    if (!markdown.trim()) return;

    // Remember document size before insertion to calculate how much was added
    const docSizeBefore = this.editor.state.doc.content.size;

    try {
      const html = await markdownToHtml(markdown);

      // Insert at current position
      this.editor
        .chain()
        .focus()
        .insertContentAt(this.insertPosition, html)
        .run();

      // Calculate how much content was added and update insert position accordingly
      const docSizeAfter = this.editor.state.doc.content.size;
      const addedSize = docSizeAfter - docSizeBefore;
      this.insertPosition += addedSize;
    } catch (error) {
      console.error("Error inserting segment:", error);
      // Fallback: insert as plain text
      const docSizeBeforeFallback = this.editor.state.doc.content.size;
      this.editor
        .chain()
        .focus()
        .insertContentAt(this.insertPosition, markdown)
        .run();
      const docSizeAfterFallback = this.editor.state.doc.content.size;
      const addedSizeFallback = docSizeAfterFallback - docSizeBeforeFallback;
      this.insertPosition += addedSizeFallback;
    }

    // Notify that content was inserted (for scrolling, etc.)
    if (this.onContentInserted) {
      this.onContentInserted();
    }
  }

  /**
   * Flush any remaining buffered content
   */
  async flush(): Promise<void> {
    if (this.aborted) return;

    if (this.buffer.trim()) {
      await this.insertSegment(this.buffer);
      this.buffer = "";
    }
  }

  /**
   * Abort the stream handling
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Check if handler was aborted
   */
  isAborted(): boolean {
    return this.aborted;
  }
}

/**
 * Conversation message for context tracking
 */
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type: "write" | "edit-selection" | "edit-full";
  selectedText?: string;
}

/**
 * Create a new conversation message
 */
export function createConversationMessage(
  role: "user" | "assistant",
  content: string,
  type: "write" | "edit-selection" | "edit-full",
  selectedText?: string
): ConversationMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    role,
    content,
    timestamp: new Date(),
    type,
    selectedText,
  };
}

/**
 * Build conversation history for API request
 * Limits history to last N messages to avoid token limits
 */
export function buildConversationHistory(
  messages: ConversationMessage[],
  maxMessages: number = 10
): Array<{ role: "user" | "assistant"; content: string }> {
  const recentMessages = messages.slice(-maxMessages);

  return recentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

