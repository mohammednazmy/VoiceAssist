# VoiceAssist Documentation Site

Technical documentation for the VoiceAssist platform, automatically rendering markdown files from the `docs/` directory.

**URL**: https://docs.asimo.io

## Technology Stack

- **Next.js 14**: React framework with App Router
- **React Markdown**: Markdown rendering with GFM support
- **Tailwind CSS**: Styling with Typography plugin
- **Gray Matter**: Frontmatter parsing
- **TypeScript**: Type safety

## Project Structure

```
docs-site/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout with sidebar
│   │   ├── page.tsx                      # Homepage
│   │   ├── architecture/                 # Architecture docs
│   │   ├── frontend/
│   │   │   ├── web-app/                  # Web app documentation
│   │   │   ├── voice/                    # Voice mode documentation
│   │   │   └── admin-panel/              # Admin panel documentation
│   │   ├── backend/
│   │   │   ├── architecture/             # Backend architecture
│   │   │   ├── websocket/                # WebSocket protocol
│   │   │   └── data-model/               # Data model reference
│   │   ├── operations/
│   │   │   ├── deployment/               # Deployment guide
│   │   │   ├── testing/                  # Testing guide
│   │   │   └── development/              # Development setup
│   │   └── reference/
│   │       ├── api/                      # API reference
│   │       ├── configuration/            # Configuration reference
│   │       └── all-docs/                 # Document index
│   ├── components/
│   │   ├── Header.tsx                    # Site header
│   │   ├── Sidebar.tsx                   # Navigation sidebar
│   │   └── MarkdownRenderer.tsx          # Markdown rendering
│   └── lib/
│       ├── docs.ts                       # Document loading utilities
│       └── navigation.ts                 # Navigation configuration
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server (port 3001)
pnpm dev

# Build for production
pnpm build

# Run linting
pnpm lint

# Type checking
pnpm type-check
```

Access at `http://localhost:3001`

## How It Works

The docs site loads markdown files from the monorepo's `docs/` directory at build time:

1. **Document Loading**: `lib/docs.ts` provides utilities to load markdown files:
   - `loadDoc(path)` - Load from `docs/` directory
   - `loadClientImplDoc(filename)` - Load from `docs/client-implementation/`
   - `listDocsInDirectory(path)` - List markdown files in a directory

2. **Navigation**: `lib/navigation.ts` defines the sidebar structure with sections:
   - Overview (Getting Started, Architecture)
   - Frontend (Web App, Voice Mode, Admin Panel)
   - Backend (Architecture, WebSocket, Data Model)
   - Operations (Deployment, Testing, Development)
   - Reference (API, Configuration, All Docs)

3. **Rendering**: `MarkdownRenderer.tsx` handles markdown-to-HTML conversion with:
   - GitHub Flavored Markdown support
   - Custom styling for headings, code blocks, tables
   - Dark mode support

## Adding New Pages

1. Create a new directory under `src/app/`:

   ```
   src/app/new-section/page.tsx
   ```

2. Import document loading utilities:

   ```tsx
   import { loadDoc } from "@/lib/docs";
   ```

3. Load and render markdown:

   ```tsx
   export default function NewPage() {
     const doc = loadDoc("YOUR_DOC.md");
     return (
       <div>
         <MarkdownRenderer content={doc?.content || ""} />
       </div>
     );
   }
   ```

4. Add to navigation in `lib/navigation.ts`

## Scripts

| Command           | Description                           |
| ----------------- | ------------------------------------- |
| `pnpm dev`        | Start development server on port 3001 |
| `pnpm build`      | Build for production                  |
| `pnpm start`      | Start production server               |
| `pnpm lint`       | Run ESLint                            |
| `pnpm type-check` | Run TypeScript type checking          |

## Turborepo Integration

This app is part of the VoiceAssist monorepo and integrates with Turborepo:

```bash
# Build from root
pnpm turbo build --filter=docs-site

# Lint from root
pnpm turbo lint --filter=docs-site
```

## Document Sources

The site loads documentation from:

- `docs/` - Root documentation files
- `docs/client-implementation/` - Frontend implementation specs
- `docs/overview/` - Platform overviews
- `docs/voice/` - Voice mode documentation
- `docs/infra/` - Infrastructure documentation
