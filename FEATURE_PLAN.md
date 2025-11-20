# Feature Implementation Plan

## Overview
This document outlines the phased implementation plan for two major features:
1. **Google Docs Export** - Export articles directly to Google Docs
2. **AI Writing Assistant** - Integrated chat panel with OpenAI GPT for tone-of-voice writing assistance

---

## Feature 1: Google Docs Export

### Phase 1.1: Google API Setup & Authentication
**Goal**: Set up Google Docs API integration and OAuth authentication

**Tasks**:
- [ ] Research Google Docs API v1 and authentication flow
- [ ] Set up Google Cloud Project and enable Google Docs API
- [ ] Create OAuth 2.0 credentials (Client ID/Secret)
- [ ] Add Google API client library (`googleapis` npm package)
- [ ] Create API route `/api/google/auth` for OAuth flow initiation
- [ ] Create API route `/api/google/callback` for OAuth callback handling
- [ ] Store OAuth tokens securely (consider using encrypted storage or session)
- [ ] Add "Connect Google Account" button in settings page
- [ ] Display connection status in settings

**Dependencies**: None
**Complexity**: Medium
**Estimated Time**: 2-3 hours

### Phase 1.2: Export Functionality
**Goal**: Implement core export functionality

**Tasks**:
- [ ] Create API route `/api/google/export` for document creation
- [ ] Convert article content (HTML/Markdown) to Google Docs format
- [ ] Handle frontmatter metadata (title, description, etc.) as document properties
- [ ] Create document with proper formatting:
  - Headings (h1, h2, h3)
  - Bold, italic, lists
  - Links
  - **Images**: Upload images to Google Drive and embed in document
- [ ] Handle code blocks appropriately (formatted text blocks)
- [ ] Return document URL after creation
- [ ] Add "Export to Google Docs" button in editor header
- [ ] Show loading state during export
- [ ] Display success message with link to document
- [ ] Handle errors gracefully

**Dependencies**: Phase 1.1
**Complexity**: Medium-High
**Estimated Time**: 3-4 hours

### Phase 1.3: Polish & Error Handling
**Goal**: Improve UX and handle edge cases

**Tasks**:
- [ ] Add retry mechanism for failed exports
- [ ] Handle token refresh automatically
- [ ] Add confirmation dialog before export
- [ ] Support exporting with/without frontmatter
- [ ] Add export history (optional)
- [ ] Improve error messages
- [ ] Add keyboard shortcut (optional)

**Dependencies**: Phase 1.2
**Complexity**: Low-Medium
**Estimated Time**: 1-2 hours

---

## Feature 2: AI Writing Assistant

### Phase 2.1: OpenAI API Setup & Configuration
**Goal**: Set up OpenAI API integration and settings UI

**Tasks**:
- [ ] Add OpenAI API key to `.env` file (OPENAI_API_KEY)
- [ ] Add model selection dropdown (default: GPT-5.1, with fallback options)
- [ ] Add temperature/settings controls (optional, with defaults)
- [ ] Add "Tone of Voice Instructions" textarea in settings page
- [ ] Store tone instructions in localStorage (user preference)
- [ ] Create API route `/api/openai/chat` for chat completions
- [ ] Implement secure API key handling (read from .env, never expose to client)
- [ ] Add connection test button
- [ ] Display connection status

**Dependencies**: None
**Complexity**: Low-Medium
**Estimated Time**: 1-2 hours

### Phase 2.2: Chat Panel UI
**Goal**: Create the chat interface within the editor

**Tasks**:
- [ ] Design chat panel component (side panel - similar to metadata panel)
- [ ] Add chat panel toggle button in editor header (AI icon)
- [ ] Create chat message components (user/AI messages with markdown rendering)
- [ ] Implement message input with send button
- [ ] Add loading states for streaming AI responses
- [ ] Implement message history/context (session-only, no persistence)
- [ ] Add scroll-to-bottom behavior
- [ ] Style chat panel to match editor design
- [ ] Add "Apply to Editor" button for AI responses
- [ ] Make panel resizable (optional)

**Dependencies**: Phase 2.1
**Complexity**: Medium
**Estimated Time**: 2-3 hours

### Phase 2.3: Streaming & Format Integration
**Goal**: Implement streaming responses and format parsing

**Tasks**:
- [ ] Implement streaming API route using OpenAI streaming API
- [ ] Set up Server-Sent Events (SSE) or streaming response handling
- [ ] Create streaming response parser for markdown/JSON format
- [ ] Implement real-time markdown rendering in chat panel
- [ ] Add instructions to AI to output in article markdown format or JSON
- [ ] Create JSON parser for TipTap editor format
- [ ] Implement real-time preview of formatted content
- [ ] Handle partial responses gracefully
- [ ] Add "Stop Generation" button during streaming
- [ ] Integrate tone instructions into system prompt
- [ ] Include article context (title, description, selected text) in prompts

**Dependencies**: Phase 2.2
**Complexity**: Medium-High
**Estimated Time**: 3-4 hours

### Phase 2.4: Editor Integration & Actions
**Goal**: Allow AI suggestions to be applied to editor in real-time

**Tasks**:
- [ ] Implement "Apply to Editor" functionality for markdown responses
- [ ] Convert markdown to TipTap JSON format
- [ ] Insert content at cursor position or replace selection
- [ ] Add "Improve Selection" quick action (select text → AI suggestion)
- [ ] Add "Continue Writing" functionality (insert at end or cursor)
- [ ] Add "Rewrite Selection" functionality
- [ ] Implement undo/redo for AI edits (TipTap native)
- [ ] Add keyboard shortcuts for common actions
- [ ] Show preview of content before applying (optional)
- [ ] Handle streaming insertion (insert as it streams, optional)

**Dependencies**: Phase 2.3
**Complexity**: Medium
**Estimated Time**: 2-3 hours

### Phase 2.5: Advanced Features & Polish
**Goal**: Add advanced features and improve UX

**Tasks**:
- [ ] Add "Regenerate Response" functionality
- [ ] Add "Copy Response" button
- [ ] Add "Copy as Markdown" button
- [ ] Add token usage tracking/display (optional)
- [ ] Add rate limiting handling
- [ ] Improve error messages and retry logic
- [ ] Add keyboard shortcuts documentation
- [ ] Add tooltips and help text
- [ ] Add "Clear Chat" button
- [ ] Optimize streaming performance
- [ ] Add loading skeleton for better UX

**Dependencies**: Phase 2.4
**Complexity**: Medium
**Estimated Time**: 2-3 hours

---

## Implementation Order Recommendation

### Week 1: Google Docs Export
1. **Day 1**: Phase 1.1 (Google API Setup)
2. **Day 2**: Phase 1.2 (Export Functionality)
3. **Day 3**: Phase 1.3 (Polish & Error Handling)

### Week 2: AI Writing Assistant
4. **Day 4**: Phase 2.1 (OpenAI Setup)
5. **Day 5**: Phase 2.2 (Chat Panel UI)
6. **Day 6**: Phase 2.3 (Tone of Voice Integration)
7. **Day 7**: Phase 2.4 (Editor Integration)
8. **Day 8**: Phase 2.5 (Advanced Features)

---

## Technical Considerations

### Security
- **API Keys**: Store in `.env` variables, never expose to client-side code
- **OAuth Tokens**: Store securely in session/encrypted storage, implement token refresh
- **Rate Limiting**: Implement rate limiting for API calls
- **Input Validation**: Validate all user inputs before API calls
- **Streaming Security**: Ensure streaming endpoints are secure and don't leak tokens

### Performance
- **Streaming**: Implement Server-Sent Events (SSE) or streaming responses for real-time AI output
- **Caching**: Cache tone instructions and settings in localStorage
- **Debouncing**: Debounce API calls where appropriate
- **Context Window**: Manage context window size for long articles (truncate if needed)
- **Streaming Parsing**: Parse markdown/JSON incrementally as it streams
- **Editor Updates**: Batch editor updates during streaming to avoid performance issues

### UX
- **Loading States**: Always show loading indicators
- **Error Handling**: Clear, actionable error messages
- **Undo/Redo**: Support undo for AI edits
- **Keyboard Shortcuts**: Add shortcuts for power users

### Dependencies to Add
```json
{
  "googleapis": "^latest",
  "openai": "^latest"
}
```

### Environment Variables
Add to `.env.local`:
```env
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

---

## Implementation Decisions

### Google Docs Export
- ✅ **Images**: Export images to Google Docs (if API supports)
- ✅ **Frontmatter**: Include as document properties/metadata
- ❌ **Update existing**: Only create new documents (keep it simple)

### AI Writing Assistant
- ✅ **Model**: GPT-5.1 via OpenAI API
- ❌ **Chat persistence**: No persistence - fresh chat each session
- ✅ **Streaming**: Streaming responses with real-time typing effect
- ✅ **Format**: Export as markdown (in article format) or JSON that can be parsed and inserted into TipTap editor in real-time
- ❌ **Multiple threads**: Single conversation per session

### Settings Storage
- ✅ **API Keys**: Stored in `.env` variables (backend only, never exposed to client)
- ✅ **Single user**: No user accounts needed

---

## Next Steps

1. Review and approve this plan
2. Clarify questions above
3. Set up development environment with new dependencies
4. Begin Phase 1.1 implementation

