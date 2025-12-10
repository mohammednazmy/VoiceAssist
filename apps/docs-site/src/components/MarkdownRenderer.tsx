"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Rewrite markdown document links to work on the web.
 *
 * Transforms:
 * - FILENAME.md → /docs/FILENAME
 * - subdir/FILENAME.md → /docs/subdir/FILENAME
 * - ../.ai/index.json → /agent/index.json
 * - ../.ai/README.md → /ai/onboarding
 * - ../services/* and ../packages/* → GitHub blob links
 * - ../apps/* → GitHub blob links
 * - External URLs → unchanged
 */
function rewriteDocLink(href: string): string {
  // Skip external URLs
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  // Skip anchor links
  if (href.startsWith("#")) {
    return href;
  }

  // Rewrite .ai/ references to /agent/ endpoints
  if (href.includes(".ai/index.json")) {
    return "/agent/index.json";
  }
  if (href.includes(".ai/docs.json")) {
    return "/agent/docs.json";
  }
  if (href.includes(".ai/README.md") || href.includes(".ai/README")) {
    return "/ai/onboarding";
  }
  if (href.includes(".ai/")) {
    // Other .ai files - redirect to agent API
    return "/ai/api";
  }

  // Rewrite relative paths to project directories → GitHub links
  const githubBase = "https://github.com/mohammednazmy/VoiceAssist/blob/main";
  if (href.startsWith("../services/")) {
    return `${githubBase}/${href.replace("../", "")}`;
  }
  if (href.startsWith("../packages/")) {
    return `${githubBase}/${href.replace("../", "")}`;
  }
  if (href.startsWith("../apps/")) {
    return `${githubBase}/${href.replace("../", "")}`;
  }
  if (href.startsWith("../server/")) {
    return `${githubBase}/${href.replace("../", "")}`;
  }
  if (href.startsWith("../PHASE_STATUS.md")) {
    return `${githubBase}/PHASE_STATUS.md`;
  }

  // Handle .md links within docs/
  if (href.endsWith(".md")) {
    // Remove .md extension and convert to site route
    const path = href.replace(/\.md$/, "").replace(/^\.\//, ""); // Remove leading ./

    // If it's a relative path like phases/PHASE_00_INITIALIZATION
    // it should become /docs/phases/PHASE_00_INITIALIZATION
    return `/docs/${path}`;
  }

  // Handle links with anchor + .md (e.g., WEB_APP_SPECS.md#user-settings)
  const mdAnchorMatch = href.match(/^([^#]+\.md)(#.+)$/);
  if (mdAnchorMatch) {
    const [, mdPath, anchor] = mdAnchorMatch;
    const path = mdPath.replace(/\.md$/, "").replace(/^\.\//, "");
    return `/docs/${path}${anchor}`;
  }

  // Return unchanged if no rewriting needed
  return href;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;

            if (isInline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }

            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            );
          },
          a({ node, href, children, ...props }) {
            const rewrittenHref = href ? rewriteDocLink(href) : "#";
            const isExternal =
              rewrittenHref.startsWith("http://") ||
              rewrittenHref.startsWith("https://");

            return (
              <a
                href={rewrittenHref}
                {...props}
                {...(isExternal
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
