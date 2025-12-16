# Turbo Content

A comprehensive content management and writing platform built with Next.js 16, React 19, and TipTap. This application provides a distraction-free writing experience for creating articles and managing videos with full GitHub integration, Contentstack export capabilities, AI-powered features, and more.

## 🚀 Features

### 📝 Rich Text Editor
- **Full-screen editing experience** - Distraction-free writing interface
- **Comprehensive formatting** - Headings, bold, italic, underline, lists, blockquotes, links, images
- **Code blocks** - Syntax highlighting with language selection (JavaScript, TypeScript, CSS, HTML, JSON, Python, Bash, SQL)
- **Markdown export** - View and copy markdown preview
- **Auto-formatting** - Code blocks auto-format on paste
- **Keyboard shortcuts** - Standard shortcuts (Cmd/Ctrl+S to save, etc.)

### 📄 Article Management
- **Article editor** - Full-featured editor with metadata panel
- **Article metadata** - Slug, title, description, date, canonical URL, reading time, tags, FAQs, hero image, draft status
- **Auto-slug generation** - Automatically generates URL-friendly slugs from titles
- **Article list** - Grid view with hero images, search, tag filtering, date sorting
- **Draft management** - Mark articles as drafts, filter by draft status

### 🎥 Video Management
- **Video editor** - Manage video metadata and transcripts
- **Playlist organization** - Organize videos by playlists (YouTube playlists)
- **Video import** - Import videos from YouTube playlists
- **Transcript editing** - Edit and manage video transcripts
- **Bulk operations** - Bulk tag generation with AI, bulk export to Contentstack
- **Video list** - Grid view with filtering, search, and sorting

### 🔗 GitHub Integration
- **Repository management** - Connect to GitHub repositories via Personal Access Token
- **File operations** - List, load, create, update, and delete files
- **Version control** - View commit history, revert to previous versions
- **Conflict detection** - Automatic conflict detection before saving
- **Diff view** - Visual diff before committing changes
- **Auto-commit** - Commit messages with author information

### 📊 Contentstack Integration
- **Article export** - Export articles to Contentstack with full metadata
- **Video export** - Export videos to Contentstack with taxonomies
- **Bulk export** - Export multiple articles/videos at once
- **Asset management** - Upload images to Contentstack
- **Taxonomy mapping** - Automatic tag to taxonomy mapping
- **Entry management** - Create and update Contentstack entries

### 🤖 AI Features
- **OpenAI integration** - Chat, streaming, image generation prompts
- **Metadata generation** - AI-powered article metadata generation
- **Tag generation** - AI-powered video tag generation
- **Writing assistance** - AI writing bar with streaming responses
- **Image generation** - Generate images using Gemini AI

### 🎨 Media Management
- **Cloudinary integration** - Image upload and management
- **Image generator** - AI-powered image generation
- **Hero images** - 16:9 aspect ratio enforcement
- **Image optimization** - Automatic image optimization

### 📡 API Endpoints
- **Articles API** (`/api/articles`) - RESTful API for articles with filtering, pagination, sorting
- **Videos API** (`/api/videos`) - RESTful API for videos with playlist filtering
- **GitHub API** - Full GitHub integration endpoints
- **Contentstack API** - Contentstack export endpoints
- **OpenAI API** - AI-powered features
- **YouTube API** - Video import and transcript fetching
- **Google API** - Google Docs export

### ⚡ Performance
- **Caching** - Multi-level caching (24 hours file listings, 7 days processed content)
- **Cache purging** - URL-based cache purge mechanism (`?purge=true`)
- **Optimized fetching** - Uses GitHub `download_url` for faster file fetching
- **Batch processing** - Processes files in batches of 20
- **HTTP caching** - Client-side caching with stale-while-revalidate

## 🛠️ Tech Stack

### Core Framework
- **Next.js 16.0.10** - React framework with App Router
- **React 19.2.1** - UI library
- **TypeScript 5.9.3** - Type safety

### Rich Text Editor
- **TipTap 2.27.1** - Headless rich text editor framework
  - `@tiptap/react` - React integration
  - `@tiptap/starter-kit` - Basic formatting
  - `@tiptap/extension-link` - Link support
  - `@tiptap/extension-placeholder` - Placeholder text
  - `@tiptap/extension-underline` - Underline formatting
  - `@tiptap/extension-image` - Image insertion
  - `@tiptap/extension-code-block-lowlight` - Code blocks with syntax highlighting

### Syntax Highlighting
- **lowlight 3.3.0** - Code syntax highlighting (uses highlight.js)
- Supported languages: JavaScript, TypeScript, CSS, HTML, JSON, Python, Bash, SQL

### Markdown & Content Processing
- **turndown 7.2.2** - HTML to Markdown conversion
- **gray-matter 4.0.3** - YAML frontmatter parsing
- **js-yaml 4.1.1** - YAML parsing and formatting
- **remark** - Markdown processing
  - `remark-parse` - Markdown parsing
  - `remark-rehype` - Markdown to HTML AST
  - `rehype-stringify` - HTML AST to string
- **react-markdown 10.1.0** - React markdown renderer
- **rehype-highlight 7.0.2** - Syntax highlighting for markdown

### Integrations
- **@octokit/rest 22.0.1** - GitHub REST API client
- **openai 6.10.0** - OpenAI API client
- **@google/generative-ai 0.24.1** - Google Gemini AI
- **googleapis 167.0.0** - Google APIs (YouTube, Docs)
- **cloudinary 2.8.0** - Cloudinary image management
- **youtubei.js 16.0.1** - YouTube API client
- **diff 8.0.2** - Text diff generation

### Styling
- **Tailwind CSS 3.4.18** - Utility-first CSS framework
- **Google Fonts** - JetBrains Mono for code blocks (via Next.js font optimization)

### Utilities
- **clsx 2.1.1** - Conditional class names
- **cheerio 1.1.2** - HTML parsing and manipulation

## 📁 Project Structure

```
/app
  /api
    /articles          # Articles API endpoints
    /videos            # Videos API endpoints
    /github            # GitHub integration endpoints
    /contentstack      # Contentstack export endpoints
    /openai            # OpenAI integration endpoints
    /youtube           # YouTube integration endpoints
    /google            # Google Docs export endpoints
    /cloudinary        # Cloudinary image upload endpoints
    /gemini            # Gemini AI endpoints
  /article             # Article editor page
  /video               # Video editor page
  /videos              # Videos list page
  /settings            # Settings page
  /components          # React components
    /ui                # Reusable UI components
  /hooks               # Custom React hooks
  /types               # TypeScript type definitions
  /utils               # Utility functions
    - githubConfig.ts   # GitHub configuration utilities
    - apiHelpers.ts     # API helper utilities
    - fileFetcher.ts    # File fetching utilities
    - cache.ts          # Caching utilities
    - articleTransform.ts # Article transformation utilities
    - videoTransform.ts  # Video transformation utilities
    - markdown.ts       # Markdown utilities
    - contentstackRte.ts # Contentstack RTE utilities
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- GitHub Personal Access Token (for GitHub integration)
- Environment variables (see `.env.example`)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd timbenniks-writer
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
# GitHub Configuration
GITHUB_TOKEN=your_github_token
GITHUB_REPO=owner/repo
GITHUB_BRANCH=main
GITHUB_FOLDER=content/articles
GITHUB_VIDEOS_FOLDER=content/3.videos
GITHUB_AUTHOR_NAME=Your Name
GITHUB_AUTHOR_EMAIL=your.email@example.com

# OpenAI (optional)
OPENAI_API_KEY=your_openai_key

# Contentstack (optional)
CONTENTSTACK_API_KEY=your_api_key
CONTENTSTACK_MANAGEMENT_TOKEN=your_management_token
CONTENTSTACK_REGION=eu

# Cloudinary (optional)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Google (optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage

### Articles

1. **Create a new article**: Navigate to `/article?new=true`
2. **Edit an article**: Click on an article from the home page or navigate to `/article?file=<path>`
3. **Save article**: Use Cmd/Ctrl+S or click the Save button
4. **View history**: Click the History button to see commit history
5. **Export to Contentstack**: Use the export modal from the article editor

### Videos

1. **Import videos**: Navigate to `/videos` and click "Import Videos"
2. **Edit video**: Click on a video to edit metadata and transcript
3. **Generate tags**: Use AI to generate tags for videos
4. **Export to Contentstack**: Use bulk export for multiple videos

### API Usage

#### Articles API
```bash
# Get articles
GET /api/articles?limit=10&offset=0&order=desc&orderBy=date&tags=javascript,react&draft=false

# Get single article
GET /api/articles/[slug]

# Purge cache
GET /api/articles?purge=true
```

#### Videos API
```bash
# Get videos
GET /api/videos?limit=10&offset=0&order=desc&orderBy=date&tags=tutorial&playlist=tim

# Get single video
GET /api/videos/[slug]

# Purge cache
GET /api/videos?purge=true
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Code Architecture

The codebase follows DRY (Don't Repeat Yourself) principles with shared utilities:

- **`app/utils/githubConfig.ts`** - GitHub configuration parsing
- **`app/utils/apiHelpers.ts`** - API parameter parsing and response formatting
- **`app/utils/fileFetcher.ts`** - File fetching and batch processing
- **`app/utils/cache.ts`** - Caching utilities with purge support
- **`app/utils/articleTransform.ts`** - Article transformation utilities
- **`app/utils/videoTransform.ts`** - Video transformation utilities

### Adding New Features

1. Follow existing component patterns
2. Use TypeScript interfaces for props
3. Maintain consistent styling with Tailwind
4. Use shared utilities where possible
5. Test with `npm run build` before committing

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | Yes |
| `GITHUB_REPO` | Repository in format `owner/repo` | Yes |
| `GITHUB_BRANCH` | Branch name (default: `main`) | No |
| `GITHUB_FOLDER` | Articles folder path | No |
| `GITHUB_VIDEOS_FOLDER` | Videos folder path | No |
| `GITHUB_AUTHOR_NAME` | Commit author name | No |
| `GITHUB_AUTHOR_EMAIL` | Commit author email | No |
| `OPENAI_API_KEY` | OpenAI API key | No |
| `CONTENTSTACK_API_KEY` | Contentstack API key | No |
| `CONTENTSTACK_MANAGEMENT_TOKEN` | Contentstack management token | No |
| `CONTENTSTACK_REGION` | Contentstack region (`eu`, `us`, etc.) | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | No |
| `CLOUDINARY_API_KEY` | Cloudinary API key | No |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | No |

## 🎯 Key Features Details

### Caching Strategy
- **File listings**: Cached for 24 hours
- **Processed content**: Cached for 7 days
- **Individual files**: Cached for 7 days
- **Cache purging**: Use `?purge=true` query parameter or automatic purge on save

### GitHub Integration
- Full CRUD operations for markdown files
- Conflict detection using SHA
- Commit history and version revert
- Batch file operations
- Optimized fetching using `download_url`

### Contentstack Export
- Automatic taxonomy mapping
- Asset upload for images
- Entry creation and updates
- Bulk export with rate limiting
- Progress tracking

### AI Features
- OpenAI chat and streaming
- Metadata generation
- Tag generation for videos
- Image prompt generation
- Writing assistance

## 🤝 Contributing

1. Follow the existing code patterns
2. Use TypeScript for all new code
3. Maintain consistent styling with Tailwind
4. Test thoroughly before submitting
5. Update documentation for new features

## 📄 License

Private project - All rights reserved

## 👤 Author

Tim Benniks

---

For detailed development guidelines, see `.cursorrules` file.
