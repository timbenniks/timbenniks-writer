# Contentstack Export Feature - Implementation Plan

## Overview

Add the ability to export articles directly to Contentstack CMS from the writer application. This includes creating/updating articles, managing taxonomies, uploading images, and converting content to Contentstack's JSON RTE format.

## Status Tracker

### Phase 1: Foundation & Configuration

- [x] **1.1** Create environment variable configuration for Contentstack
- [x] **1.2** Create `/api/contentstack/config` route to check configuration status
- [x] **1.3** Create `/api/contentstack/connect` route to test connection
- [x] **1.4** Add Contentstack settings section to Settings page

### Phase 2: Core API Routes

- [x] **2.1** Create `/api/contentstack/taxonomies` route (list existing terms)
- [x] **2.2** Create `/api/contentstack/taxonomy-term` route (create new term)
- [x] **2.3** Create `/api/contentstack/assets` route (upload image from URL)
- [x] **2.4** Create `/api/contentstack/entries/check` route (check if article exists by title/url)
- [x] **2.5** Create `/api/contentstack/entries/create` route (create new entry)
- [x] **2.6** Create `/api/contentstack/entries/update` route (update existing entry)

### Phase 3: JSON RTE Conversion

- [x] **3.1** Create `utils/contentstackRte.ts` utility for HTML to JSON RTE conversion
- [x] **3.2** Implement YouTube embed custom handler
- [ ] **3.3** Test RTE conversion with various content types

### Phase 4: Single Article Export UI

- [x] **4.1** Create `ExportModal` component with Google Docs and Contentstack options
- [x] **4.2** Create `ContentstackExportModal` component for export progress/status
- [x] **4.3** Integrate export button in Editor header
- [x] **4.4** Handle export workflow (taxonomies → image → entry)

### Phase 5: Bulk Export

- [x] **5.1** Add bulk selection UI to article list page
- [x] **5.2** Create bulk export modal with progress tracking
- [x] **5.3** Implement rate-limited batch processing
- [x] **5.4** Show detailed success/error report

### Phase 6: Testing & Polish

- [ ] **6.1** Test single article export flow
- [ ] **6.2** Test bulk export with rate limiting
- [ ] **6.3** Test error handling (missing taxonomies, failed uploads)
- [x] **6.4** Add to Settings page configuration section

---

## Technical Specifications

### Environment Variables

```env
# Contentstack Configuration
CONTENTSTACK_API_KEY=your_stack_api_key
CONTENTSTACK_MANAGEMENT_TOKEN=your_management_token
CONTENTSTACK_REGION=eu
```

**Region URL Mapping:**

- `eu` → `https://eu-api.contentstack.com`
- `us` → `https://api.contentstack.io`
- `azure-na` → `https://azure-na-api.contentstack.com`
- `azure-eu` → `https://azure-eu-api.contentstack.com`

### Contentstack API Endpoints Used

| Operation             | Method | Endpoint                                                   |
| --------------------- | ------ | ---------------------------------------------------------- |
| Get all entries       | GET    | `/v3/content_types/{content_type_uid}/entries`             |
| Get single entry      | GET    | `/v3/content_types/{content_type_uid}/entries/{entry_uid}` |
| Create entry          | POST   | `/v3/content_types/{content_type_uid}/entries`             |
| Update entry          | PUT    | `/v3/content_types/{content_type_uid}/entries/{entry_uid}` |
| Upload asset from URL | POST   | `/v3/assets` (with `asset[upload_url]`)                    |
| Get taxonomy terms    | GET    | `/v3/taxonomies/{taxonomy_uid}/terms`                      |
| Create taxonomy term  | POST   | `/v3/taxonomies/{taxonomy_uid}/terms`                      |

### Rate Limiting Strategy

Contentstack has rate limits (varies by plan, typically 10 req/sec for Management API).

**Implementation:**

- Single export: Sequential operations with small delays
- Bulk export: Process 1 article every 2 seconds (to allow for taxonomy + image + entry operations)
- Show progress indicator during bulk operations
- Queue system with retry on 429 errors

### Data Mapping

#### ArticleMetadata → Contentstack Entry

```typescript
// Input: ArticleMetadata from our app
interface ArticleMetadata {
  slug: string;
  title: string;
  description: string;
  date: string;
  image: string; // Hero image URL
  canonicalUrl: string;
  tags: string[];
  readingTime: string;
  faqs: Array<{ question: string; answer: string }>;
  heroImage: string;
  draft?: boolean;
}

// Output: Contentstack Entry
interface ContentstackArticleEntry {
  entry: {
    title: string;
    url: string; // slug with /writing/ prefix
    description: string;
    date: string; // ISO format
    canonical_url: string;
    reading_time: string;
    content: ContentstackJsonRte; // JSON RTE format
    thumbnail: {
      // Asset reference
      uid: string;
      // ... other asset fields
    };
    taxonomies: Array<{
      taxonomy_uid: string; // "content_tags"
      term_uid: string; // lowercase tag name
    }>;
    faqs: Array<{
      qa: {
        question: string;
        answer: string;
      };
    }>;
  };
}
```

### JSON RTE Structure

Contentstack JSON RTE uses a specific structure:

```typescript
interface JsonRteDocument {
  type: "doc";
  uid: string;
  attrs: Record<string, any>;
  children: JsonRteNode[];
}

interface JsonRteNode {
  type: string; // "p", "h2", "h3", "ul", "ol", "li", "img", "a", etc.
  uid: string;
  attrs: Record<string, any>;
  children: (JsonRteNode | JsonRteText)[];
}

interface JsonRteText {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  // ... other marks
}
```

**Custom YouTube Embed Node:**

```typescript
{
  type: "youtube-embed",
  attrs: {
    videoid: string;
    title: string;
    src: string;
  },
  uid: string,
  children: [{ text: "" }]
}
```

---

## File Structure

```
/app
  /api/contentstack
    /config
      route.ts          # Check if Contentstack is configured
    /connect
      route.ts          # Test connection to Contentstack
    /taxonomies
      route.ts          # Get taxonomy terms
    /taxonomy-term
      route.ts          # Create new taxonomy term
    /assets
      route.ts          # Upload asset from URL
    /entries
      /check
        route.ts        # Check if entry exists by title/url
      /create
        route.ts        # Create new entry
      /update
        route.ts        # Update existing entry
    utils.ts            # Shared Contentstack utilities
  /components
    ExportDropdown.tsx           # Dropdown with export options
    ContentstackExportModal.tsx  # Export progress modal
  /utils
    contentstackRte.ts  # HTML to JSON RTE converter
```

---

## Implementation Details

### 1. Contentstack Utils (`/api/contentstack/utils.ts`)

```typescript
// Base URL based on region
export function getContentstackBaseUrl(): string {
  const region = process.env.CONTENTSTACK_REGION || "eu";
  const regionUrls: Record<string, string> = {
    eu: "https://eu-api.contentstack.com",
    us: "https://api.contentstack.io",
    "azure-na": "https://azure-na-api.contentstack.com",
    "azure-eu": "https://azure-eu-api.contentstack.com",
  };
  return regionUrls[region] || regionUrls["eu"];
}

// Standard headers for Management API
export function getContentstackHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    api_key: process.env.CONTENTSTACK_API_KEY || "",
    authorization: process.env.CONTENTSTACK_MANAGEMENT_TOKEN || "",
  };
}

// Rate limit helper - delay between operations
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### 2. HTML to JSON RTE Converter

Use `jsdom` to parse HTML and convert to Contentstack JSON RTE format:

```typescript
// Convert TipTap HTML output to Contentstack JSON RTE
export function htmlToContentstackRte(html: string): ContentstackJsonRte {
  // Parse HTML using jsdom
  // Walk DOM tree and convert to JSON RTE nodes
  // Handle special cases: images, links, code blocks, YouTube embeds
}
```

### 3. Export Workflow (Single Article)

```
1. User clicks "Export" → "To Contentstack"
2. Show ContentstackExportModal with status
3. Process taxonomies:
   a. For each tag, check if term exists in content_tags
   b. If not, create the term
   c. Collect taxonomy references
4. Process image:
   a. Upload hero image URL to Contentstack assets
   b. Get asset UID
5. Check if article exists:
   a. Query by title OR url
   b. If exists, get entry UID for update
6. Convert content:
   a. Get HTML from TipTap editor
   b. Convert to JSON RTE format
7. Create or update entry:
   a. Build entry payload
   b. POST (create) or PUT (update)
8. Show success/error in modal
```

### 4. Bulk Export Workflow

```
1. User selects multiple articles in list view
2. Clicks "Export Selected to Contentstack"
3. Show bulk export modal with:
   - Total articles count
   - Progress bar
   - Current article being processed
   - Success/error log
4. Process each article with 2-second delay:
   a. Load article content from GitHub
   b. Run single export workflow
   c. Update progress
   d. Log result
5. Show summary when complete:
   - X articles exported successfully
   - Y articles failed (with reasons)
```

---

## UI Components

### ExportDropdown Component

Replace single "Export to Google Docs" button with dropdown:

```tsx
<ExportDropdown
  onGoogleDocsExport={handleGoogleDocsExport}
  onContentstackExport={handleContentstackExport}
  disabled={!hasContent}
/>
```

### ContentstackExportModal Component

Shows export progress with steps:

- [ ] Processing taxonomies (3/5)
- [ ] Uploading image...
- [ ] Creating entry...
- [x] Export complete!

Error display:

- Clear error message
- Option to retry
- Details expandable

---

## Error Handling

### Taxonomy Creation Failure

```
If creating term fails:
1. Show error: "Failed to create taxonomy term: {tag}"
2. Option: "Skip this tag" or "Retry"
3. Continue with remaining tags
```

### Image Upload Failure

```
If image upload fails:
1. Show error: "Failed to upload image: {reason}"
2. Option: "Continue without image" or "Retry"
3. Allow export to proceed with thumbnail: null
```

### Entry Creation Failure

```
If entry creation fails:
1. Show detailed error message
2. Show API response if available
3. Option to retry or cancel
```

### Rate Limit (429) Handling

```
If rate limited:
1. Show: "Rate limited. Waiting 60 seconds..."
2. Auto-retry after delay
3. Exponential backoff for repeated 429s
```

---

## Dependencies

**New packages needed:**

- `jsdom` - Already used in project script, may need to add to package.json
- `@contentstack/json-rte-serializer` - For RTE conversion (optional, can build custom)
- `uuid` - For generating UIDs (or use crypto.randomUUID())

---

## Security Considerations

1. Management tokens should NEVER be exposed to client
2. All Contentstack API calls happen server-side via API routes
3. Validate inputs before sending to Contentstack API
4. Sanitize HTML content before conversion

---

## Future Enhancements (Out of Scope)

- [ ] Publish workflow integration
- [ ] Two-way sync (Contentstack → GitHub)
- [ ] Webhook for real-time updates
- [ ] Version comparison before export
- [ ] Asset management (inline images)

---

## Questions Resolved

| Question                         | Answer                               |
| -------------------------------- | ------------------------------------ |
| Contentstack credentials storage | Environment variables                |
| Region                           | EU (`eu-api.contentstack.com`)       |
| Content type UID                 | `article`                            |
| Article matching                 | By title (unique) and URL (unique)   |
| Taxonomy                         | `content_tags`, auto-create terms    |
| Image handling                   | Upload via URL to asset manager      |
| Draft handling                   | Always unpublished                   |
| Export trigger                   | Separate button + bulk from list     |
| Custom RTE handlers              | YouTube (keep), Questionnaire (drop) |
| Error handling                   | Detailed modal, no silent failures   |

---

## Next Steps

1. Review this plan and confirm approach
2. Start with Phase 1: Configuration setup
3. Build API routes incrementally with testing
4. Integrate UI components
5. Test end-to-end flow
6. Add bulk export functionality

Ready to proceed with implementation?
