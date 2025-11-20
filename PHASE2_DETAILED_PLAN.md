# Phase 2: AI Writing Assistant - Detailed Implementation Plan

## Overview
Integrate an AI writing assistant powered by OpenAI GPT to help with:
1. **Full Article Generation**: Create complete articles from scratch based on a premise and interactive questions
2. **Editing Assistance**: Rewrite, improve, or expand existing content while editing

---

## Phase 2.1: OpenAI API Setup & Configuration
**Goal**: Set up OpenAI API integration and settings UI  
**Estimated Time**: 2-3 hours  
**Complexity**: Low-Medium

### Tasks

#### 2.1.1: Environment & API Setup
- [ ] Add `OPENAI_API_KEY` to `.env.local` (backend only, never expose)
- [ ] Install OpenAI SDK: `npm install openai`
- [ ] Create `/app/api/openai/utils.ts` for:
  - API key validation
  - OpenAI client initialization
  - Error handling utilities
- [ ] Create `/app/api/openai/chat/route.ts` for chat completions
- [ ] Create `/app/api/openai/stream/route.ts` for streaming responses (SSE)

#### 2.1.2: Settings Page Integration
- [ ] Add "AI Writing Assistant" section to `/app/settings/page.tsx`
- [ ] Add model selection dropdown:
  - Default: GPT-4o or GPT-4 Turbo (since GPT-5.1 may not exist yet)
  - Options: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
  - Store selection in localStorage
- [ ] Add temperature slider (0.0 - 2.0, default: 0.7)
- [ ] Add max tokens input (default: 2000, max: 4000)
- [ ] Add "Tone of Voice Instructions" textarea:
  - Large textarea (10-15 rows)
  - Placeholder: "Describe your writing style, tone, voice, and any specific guidelines..."
  - Store in localStorage as `aiToneInstructions`
- [ ] Add "Test Connection" button
- [ ] Display connection status (connected/disconnected)
- [ ] Show API key status (configured/not configured)

#### 2.1.3: API Route Implementation
- [ ] `/api/openai/chat` (non-streaming, for simple requests):
  - Accept: `{ messages: Message[], model, temperature, maxTokens }`
  - Return: `{ success, content, error }`
- [ ] `/api/openai/stream` (streaming, for main chat):
  - Accept: `{ messages: Message[], model, temperature, maxTokens, includeToneInstructions }`
  - Return: Server-Sent Events (SSE) stream
  - Handle errors gracefully
  - Support cancellation

#### 2.1.4: Tone Instructions System
- [ ] Create utility function to build system prompt with tone instructions
- [ ] Format: Combine default system prompt + user tone instructions
- [ ] Store tone instructions in localStorage
- [ ] Load tone instructions on app start
- [ ] Allow editing tone instructions from settings

---

## Phase 2.2: Chat Panel UI
**Goal**: Create the chat interface within the editor  
**Estimated Time**: 3-4 hours  
**Complexity**: Medium

### Tasks

#### 2.2.1: Chat Panel Component Structure
- [ ] Create `/app/components/AIChatPanel.tsx`:
  - Side panel (similar to `ArticleMetadataPanel`)
  - Width: ~400px (resizable, min: 300px, max: 600px)
  - Position: Right side of editor
  - Toggleable visibility
  - Smooth slide-in/slide-out animation

#### 2.2.2: Chat UI Elements
- [ ] **Header**:
  - Title: "AI Writing Assistant"
  - Toggle button (close panel)
  - Clear chat button
- [ ] **Messages Container**:
  - Scrollable area (flex-1)
  - Auto-scroll to bottom on new messages
  - Smooth scrolling
  - Message list component
- [ ] **Message Components**:
  - User message: Right-aligned, blue background
  - AI message: Left-aligned, gray background
  - Markdown rendering for AI messages (use `react-markdown` or similar)
  - Code block syntax highlighting
  - Timestamp (optional, subtle)
- [ ] **Input Area**:
  - Textarea (auto-resize, max 10 rows)
  - Send button (with icon)
  - Character counter (optional)
  - Keyboard shortcut: Enter to send, Shift+Enter for new line

#### 2.2.3: Chat State Management
- [ ] Message state: `{ id, role: 'user' | 'assistant', content, timestamp }[]`
- [ ] Loading state for streaming
- [ ] Error state display
- [ ] Empty state (welcome message with suggestions)
- [ ] Session-only (no persistence across page reloads)

#### 2.2.4: Integration with Editor
- [ ] Add AI chat toggle button to editor header (AI icon)
- [ ] State: `isAIChatOpen` (boolean)
- [ ] Panel slides in from right when opened
- [ ] Editor content adjusts width when panel is open
- [ ] Panel can be resized (drag handle on left edge)

#### 2.2.5: Quick Action Buttons
- [ ] "Improve Selection" button (only visible when text is selected)
- [ ] "Continue Writing" button (inserts at cursor)
- [ ] "Rewrite Selection" button (only visible when text is selected)
- [ ] "Generate Article" button (opens full article generation flow)

---

## Phase 2.3: Streaming & Format Integration
**Goal**: Implement streaming responses and format parsing  
**Estimated Time**: 4-5 hours  
**Complexity**: Medium-High

### Tasks

#### 3.1: Streaming API Implementation
- [ ] Implement SSE endpoint `/api/openai/stream`:
  - Use OpenAI streaming API (`stream: true`)
  - Send chunks as they arrive
  - Format: `data: { type: 'chunk' | 'done' | 'error', content?: string, error?: string }`
  - Handle errors and cancellation
- [ ] Client-side SSE handling:
  - Use `EventSource` or `fetch` with streaming
  - Parse incoming chunks
  - Update UI in real-time
  - Handle connection errors

#### 3.2: Streaming UI Updates
- [ ] Real-time markdown rendering as chunks arrive
- [ ] Smooth typing effect (optional, can be instant)
- [ ] Loading indicator during streaming
- [ ] "Stop Generation" button (cancels stream)
- [ ] Handle partial markdown gracefully (don't break on incomplete code blocks, etc.)

#### 3.3: Format Detection & Parsing
- [ ] Detect output format from AI:
  - Markdown (default for articles)
  - JSON (TipTap format, optional)
- [ ] Create markdown parser utility
- [ ] Create JSON parser for TipTap format
- [ ] Handle mixed formats gracefully

#### 3.4: Context Integration
- [ ] Build context-aware prompts:
  - Include article title (if available)
  - Include article description (if available)
  - Include selected text (for editing assistance)
  - Include surrounding context (paragraph before/after selection)
  - Include article metadata (tags, etc.) when relevant
- [ ] Create prompt builder utility:
  - `buildFullArticlePrompt(premise, questions)`
  - `buildRewritePrompt(selectedText, instruction)`
  - `buildContinuePrompt(currentContent, cursorPosition)`
  - `buildImprovePrompt(selectedText)`

#### 3.5: Tone Instructions Integration
- [ ] Load tone instructions from localStorage
- [ ] Include in system prompt for all requests
- [ ] Format: Append to default system prompt
- [ ] Allow per-request override (optional)

---

## Phase 2.4: Editor Integration & Actions
**Goal**: Allow AI suggestions to be applied to editor  
**Estimated Time**: 3-4 hours  
**Complexity**: Medium

### Tasks

#### 4.1: Content Insertion Utilities
- [ ] Create `/app/utils/editorHelpers.ts`:
  - `insertMarkdownAtCursor(editor, markdown)` - Convert markdown to TipTap and insert
  - `replaceSelection(editor, markdown)` - Replace selected text
  - `insertAtEnd(editor, markdown)` - Append to end
  - `getSelectedText(editor)` - Get current selection
  - `getContextAroundSelection(editor, linesBefore, linesAfter)` - Get surrounding context

#### 4.2: Markdown to TipTap Conversion
- [ ] Use existing `markdownToHtml` utility
- [ ] Convert HTML to TipTap JSON using editor's `setContent` or `insertContent`
- [ ] Handle all TipTap node types:
  - Headings (h1, h2, h3)
  - Paragraphs
  - Bold, italic, underline
  - Lists (ordered, unordered)
  - Links
  - Code blocks (with language detection)
  - Blockquotes
  - Images

#### 4.3: Quick Actions Implementation
- [ ] **Improve Selection**:
  - Get selected text
  - Send to AI with "improve this text" prompt
  - Replace selection with improved version
- [ ] **Rewrite Selection**:
  - Get selected text
  - Send to AI with "rewrite this text" prompt + user instruction
  - Replace selection with rewritten version
- [ ] **Continue Writing**:
  - Get content from cursor to end (or just cursor position)
  - Send to AI with "continue writing from here" prompt
  - Insert at cursor position
- [ ] **Generate Article**:
  - Opens modal/dialog for article generation
  - Asks for premise/topic
  - AI asks clarifying questions
  - Generates full article
  - Option to insert at cursor or replace entire content

#### 4.4: Apply to Editor Flow
- [ ] "Apply to Editor" button on AI messages
- [ ] Preview modal (optional, can skip):
  - Show markdown preview
  - Options: Insert at cursor, Replace selection, Append to end
- [ ] Direct apply (if no preview):
  - Insert at cursor by default
  - Replace selection if text is selected
- [ ] Undo/redo support (TipTap native)

#### 4.5: Streaming Insertion (Optional)
- [ ] Option to insert content as it streams
- [ ] Update editor in real-time
- [ ] Can be disabled (wait for complete response)

---

## Phase 2.5: Full Article Generation Flow
**Goal**: Interactive article generation with AI questions  
**Estimated Time**: 3-4 hours  
**Complexity**: Medium-High

### Tasks

#### 5.1: Article Generation Modal/Dialog
- [ ] Create `/app/components/ArticleGenerationModal.tsx`
- [ ] Multi-step flow:
  1. **Step 1: Premise Input**
     - Textarea for article topic/premise
     - Optional: Article title, description, tags
     - "Start Generation" button
  2. **Step 2: AI Questions** (if AI requests clarification)
     - Display AI's questions
     - Input fields for answers
     - "Continue" button
  3. **Step 3: Generation**
     - Show progress/streaming
     - "Stop" button
  4. **Step 4: Review & Apply**
     - Show generated article preview
     - Options: Insert at cursor, Replace content, Cancel

#### 5.2: AI Question Flow Logic
- [ ] AI analyzes premise and asks clarifying questions:
  - Target audience?
  - Article length?
  - Specific points to cover?
  - Tone/style preferences?
- [ ] Handle multiple rounds of questions
- [ ] Allow skipping questions (optional)
- [ ] Build comprehensive prompt from answers

#### 5.3: Article Generation Prompt
- [ ] Create comprehensive prompt:
  - Include premise
  - Include user answers to questions
  - Include tone instructions
  - Include article metadata (title, description, tags)
  - Specify output format (markdown)
  - Specify structure (introduction, body, conclusion)

#### 5.4: Apply Generated Article
- [ ] Parse generated markdown
- [ ] Convert to TipTap format
- [ ] Insert/replace in editor
- [ ] Update article metadata if provided
- [ ] Show success message

---

## Phase 2.6: Advanced Features & Polish
**Goal**: Add advanced features and improve UX  
**Estimated Time**: 2-3 hours  
**Complexity**: Medium

### Tasks

#### 6.1: Chat Features
- [ ] "Regenerate Response" button (re-send last user message)
- [ ] "Copy Response" button (copy as plain text)
- [ ] "Copy as Markdown" button
- [ ] "Clear Chat" button (with confirmation)
- [ ] Message actions menu (copy, regenerate, delete)

#### 6.2: Editor Integration Enhancements
- [ ] Keyboard shortcuts:
  - `Cmd/Ctrl + K`: Open AI chat
  - `Cmd/Ctrl + Shift + I`: Improve selection
  - `Cmd/Ctrl + Shift + R`: Rewrite selection
  - `Cmd/Ctrl + Shift + C`: Continue writing
- [ ] Context menu (right-click on selection):
  - "Improve with AI"
  - "Rewrite with AI"
  - "Expand with AI"

#### 6.3: Error Handling & UX
- [ ] Better error messages:
  - API key missing
  - Rate limit exceeded
  - Network errors
  - Invalid response format
- [ ] Retry mechanism for failed requests
- [ ] Loading states for all actions
- [ ] Toast notifications for success/errors

#### 6.4: Performance & Optimization
- [ ] Debounce streaming updates (if needed)
- [ ] Optimize markdown rendering
- [ ] Lazy load chat panel (only load when opened)
- [ ] Cache tone instructions
- [ ] Token usage tracking (optional, display in UI)

#### 6.5: Polish & Documentation
- [ ] Tooltips for all buttons
- [ ] Help text in chat panel
- [ ] Keyboard shortcuts help modal
- [ ] Welcome message with usage tips
- [ ] Smooth animations and transitions

---

## Technical Considerations

### Dependencies to Add
```json
{
  "openai": "^4.0.0",
  "react-markdown": "^9.0.0",
  "remark-gfm": "^4.0.0",
  "rehype-highlight": "^7.0.0"
}
```

### Environment Variables
```env
OPENAI_API_KEY=your_openai_api_key_here
```

### API Route Structure
```
/app/api/openai/
  ├── chat/route.ts          # Non-streaming chat
  ├── stream/route.ts        # Streaming chat (SSE)
  └── utils.ts               # Shared utilities
```

### Component Structure
```
/app/components/
  ├── AIChatPanel.tsx        # Main chat panel
  ├── ChatMessage.tsx        # Individual message component
  ├── ArticleGenerationModal.tsx  # Article generation flow
  └── Editor.tsx             # Updated with AI integration
```

### State Management
- Chat messages: Local state in `AIChatPanel`
- Tone instructions: localStorage
- Model settings: localStorage
- Editor integration: Props/callbacks from `Editor` component

### Prompt Engineering
- System prompt: Default + user tone instructions
- Context: Article metadata, selected text, surrounding content
- Format: Always request markdown output for articles
- Structure: Guide AI to create well-structured articles

---

## Implementation Order

### Week 1: Foundation
1. **Day 1**: Phase 2.1 (API Setup & Configuration)
2. **Day 2**: Phase 2.2 (Chat Panel UI)
3. **Day 3**: Phase 2.3 (Streaming & Format Integration)

### Week 2: Integration & Features
4. **Day 4**: Phase 2.4 (Editor Integration)
5. **Day 5**: Phase 2.5 (Full Article Generation)
6. **Day 6**: Phase 2.6 (Advanced Features & Polish)

---

## Success Criteria

- [ ] User can configure OpenAI API and tone instructions
- [ ] Chat panel opens/closes smoothly
- [ ] Streaming responses work reliably
- [ ] AI responses can be applied to editor
- [ ] Quick actions (improve, rewrite, continue) work
- [ ] Full article generation flow works end-to-end
- [ ] Tone instructions are consistently applied
- [ ] Error handling is robust
- [ ] UI is polished and intuitive

---

## Open Questions / Decisions Needed

1. **Model Selection**: Confirm GPT-5.1 availability or use GPT-4o/GPT-4 Turbo
2. **Streaming Insertion**: Should content be inserted as it streams, or wait for completion?
3. **Preview Modal**: Show preview before applying, or apply directly?
4. **Context Window**: How much article content to include in context? (token limits)
5. **Article Generation**: Single-shot or iterative refinement?
6. **Persistence**: Should chat history persist across sessions? (Currently planned as session-only)

---

## Notes

- Tone instructions are critical - ensure they're always included in prompts
- Streaming is essential for good UX - implement early
- Editor integration needs careful testing with various content types
- Article generation flow should feel conversational and helpful
- Consider rate limits and token costs in implementation

