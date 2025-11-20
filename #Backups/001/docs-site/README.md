# VoiceAssist Documentation Site

## Overview

Comprehensive documentation for VoiceAssist, including user guides, admin documentation, API references, and medical feature guides.

**URL**: https://docs-voice.asimo.io

## Technology Stack

- **Next.js 14**: React framework with App Router
- **MDX**: Markdown with React components
- **Tailwind CSS**: Styling
- **Contentlayer**: Content processing
- **Algolia DocSearch**: Search functionality
- **Shiki**: Code syntax highlighting
- **Mermaid**: Diagrams

## Project Structure

```
docs-site/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Homepage
│   ├── getting-started/
│   │   ├── page.tsx
│   │   ├── quick-start/
│   │   └── installation/
│   ├── user-guide/
│   │   ├── voice/
│   │   ├── text/
│   │   └── integrations/
│   ├── medical/
│   │   ├── textbooks/
│   │   ├── journals/
│   │   └── guidelines/
│   └── admin/
│       ├── overview/
│       └── configuration/
├── content/                    # MDX content files
│   ├── getting-started/
│   ├── user-guide/
│   ├── medical/
│   ├── admin/
│   └── reference/
├── components/
│   ├── MDXComponents.tsx       # Custom MDX components
│   ├── Sidebar.tsx
│   ├── TableOfContents.tsx
│   ├── CodeBlock.tsx
│   ├── Callout.tsx
│   └── SearchDialog.tsx
├── public/
│   ├── images/
│   └── videos/
├── contentlayer.config.ts
├── next.config.js
├── tailwind.config.js
└── package.json
```

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Access at `http://localhost:3000`

## Content Structure

Content organized in `content/` directory as MDX files:

```
content/
├── getting-started/
│   ├── welcome.mdx
│   ├── quick-start.mdx
│   └── installation.mdx
├── user-guide/
│   ├── voice.mdx
│   ├── text.mdx
│   └── files.mdx
├── medical/
│   ├── overview.mdx
│   ├── textbooks.mdx
│   ├── journals.mdx
│   └── privacy.mdx
├── admin/
│   ├── dashboard.mdx
│   ├── models.mdx
│   └── knowledge-base.mdx
└── reference/
    ├── voice-commands.mdx
    ├── keyboard-shortcuts.mdx
    └── faq.mdx
```

## Creating Content

### Basic MDX File

```mdx
---
title: Quick Start
description: Get started with VoiceAssist in 5 minutes
---

# Quick Start

Get up and running with VoiceAssist quickly.

## Prerequisites

Before you begin, ensure you have:
- An OpenAI API key
- Access to voiceassist.asimo.io

## Step 1: Access the Web App

Navigate to [voiceassist.asimo.io](https://voiceassist.asimo.io).

<Callout type="info">
  First-time users will need to create an account.
</Callout>

## Step 2: Try Your First Query

<InteractiveExample>
"What is the mechanism of action of metformin?"
</InteractiveExample>

## Next Steps

- [Medical textbook queries →](/medical/textbooks)
- [Set up integrations →](/user-guide/integrations)
```

## Custom MDX Components

### Callout

```mdx
<Callout type="info">
  Informational message
</Callout>

<Callout type="warning">
  Warning message
</Callout>

<Callout type="error">
  Error message
</Callout>

<Callout type="tip">
  Helpful tip
</Callout>
```

### Code Block

```mdx
```python
from voiceassist import VoiceAssist

assistant = VoiceAssist(api_key="...")
response = assistant.query("What is diabetes?")
print(response)
```
```

### Tabs

```mdx
<Tabs>
  <Tab label="macOS">
    macOS-specific instructions
  </Tab>
  <Tab label="Linux">
    Linux-specific instructions
  </Tab>
</Tabs>
```

### Diagram

```mdx
<Mermaid chart={`
  graph LR
    A[User] --> B[VoiceAssist]
    B --> C[Local Model]
    B --> D[Cloud API]
`} />
```

### Video

```mdx
<Video src="/videos/quick-start.mp4" />
```

### Interactive Example

```mdx
<InteractiveExample>
  Try asking: "What does Harrison's say about diabetes?"
</InteractiveExample>
```

## Navigation

Sidebar navigation automatically generated from content structure.

`nav.config.ts`:

```typescript
export const navigation = [
  {
    title: 'Getting Started',
    links: [
      { title: 'Welcome', href: '/getting-started/welcome' },
      { title: 'Quick Start', href: '/getting-started/quick-start' },
      { title: 'Installation', href: '/getting-started/installation' }
    ]
  },
  {
    title: 'User Guide',
    links: [
      { title: 'Voice Mode', href: '/user-guide/voice' },
      { title: 'Text Mode', href: '/user-guide/text' },
      // ...
    ]
  },
  // ...
];
```

## Search

### Algolia DocSearch

```typescript
// docsearch.config.json
{
  "index_name": "voiceassist",
  "start_urls": ["https://docs-voice.asimo.io"],
  "selectors": {
    "lvl0": "h1",
    "lvl1": "h2",
    "lvl2": "h3",
    "text": "p"
  }
}
```

### Search Component

```typescript
import { DocSearch } from '@docsearch/react';

<DocSearch
  appId="YOUR_APP_ID"
  apiKey="YOUR_SEARCH_API_KEY"
  indexName="voiceassist"
/>
```

## Styling

### Dark Mode

```typescript
// Automatic based on system preference
// Manual toggle available in header

const { theme, setTheme } = useTheme();

<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  Toggle Theme
</button>
```

### Custom Theme

`tailwind.config.js`:

```javascript
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        // ...
      },
    },
  },
}
```

## Build & Deploy

### Build for Production

```bash
npm run build
```

Output in `.next/` and `out/` (if using static export).

### Static Export

```bash
# next.config.js
module.exports = {
  output: 'export',
  images: {
    unoptimized: true
  }
}

npm run build
```

### Deploy

```bash
# Build
npm run build

# Deploy to server
rsync -avz out/ user@asimo.io:/var/www/docs-voice/

# Or use Vercel/Netlify
```

## SEO

### Meta Tags

Automatically generated from frontmatter:

```mdx
---
title: Quick Start
description: Get started with VoiceAssist in 5 minutes
---
```

Generates:

```html
<title>Quick Start | VoiceAssist Docs</title>
<meta name="description" content="Get started with VoiceAssist in 5 minutes" />
<meta property="og:title" content="Quick Start" />
<meta property="og:description" content="Get started with VoiceAssist in 5 minutes" />
```

### Sitemap

Automatically generated at build time:

```
https://docs-voice.asimo.io/sitemap.xml
```

## Accessibility

- Semantic HTML
- ARIA labels
- Keyboard navigation
- Skip to content link
- Focus management
- Screen reader friendly

## Analytics

Privacy-respecting analytics with Plausible:

```typescript
// app/layout.tsx
<Script
  defer
  data-domain="docs-voice.asimo.io"
  src="https://plausible.io/js/script.js"
/>
```

## Maintenance

### Update Documentation

1. Edit MDX files in `content/`
2. Commit changes
3. Push to Git
4. CI/CD automatically rebuilds

### Add New Page

1. Create MDX file in appropriate directory
2. Add to navigation config
3. Build and deploy

### Update Dependencies

```bash
npm update
npm audit fix
```

## Contributing

### Content Guidelines

- Clear, concise writing
- Step-by-step instructions
- Lots of examples
- Screenshots where helpful
- Keep up-to-date with app changes

### Submitting Changes

1. Fork repository
2. Create feature branch
3. Make changes
4. Submit pull request

## Troubleshooting

### Build fails

```bash
# Clear cache
rm -rf .next
npm run build
```

### Search not working

- Verify Algolia configuration
- Check API keys
- Ensure site is crawled

### Images not loading

- Check file paths
- Verify public directory structure
- Ensure proper image optimization config

## Future Enhancements

- [ ] Versioned documentation
- [ ] Multi-language support
- [ ] Interactive code playground
- [ ] Video tutorials library
- [ ] Community contributions
- [ ] Changelog automation
- [ ] API reference auto-generation

## License

Personal use project.
