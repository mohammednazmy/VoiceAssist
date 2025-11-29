/**
 * Conversation Export Utilities
 * Export conversations to PDF and Markdown formats
 */

import type { Message } from "@voiceassist/types";
import type { Citation } from "../types";

// Export conversation to Markdown
export function exportToMarkdown(
  conversationTitle: string,
  messages: Message[],
  includeTimestamps = true,
  includeCitations = true,
): string {
  let markdown = `# ${conversationTitle}\n\n`;

  if (includeTimestamps && messages.length > 0) {
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    markdown += `**Started:** ${new Date(firstMessage.timestamp).toLocaleString()}\n`;
    markdown += `**Last Updated:** ${new Date(lastMessage.timestamp).toLocaleString()}\n`;
    markdown += `**Messages:** ${messages.length}\n\n`;
    markdown += "---\n\n";
  }

  messages.forEach((message, index) => {
    const role = message.role === "user" ? "👤 You" : "🤖 VoiceAssist";

    markdown += `## ${role}\n\n`;

    if (includeTimestamps) {
      markdown += `*${new Date(message.timestamp).toLocaleString()}*\n\n`;
    }

    // Add message content
    markdown += `${message.content}\n\n`;

    // Add citations if present and enabled
    if (includeCitations) {
      const citations = message.metadata?.citations || message.citations || [];
      if (citations.length > 0) {
        markdown += "### Sources\n\n";
        citations.forEach((citation: Citation, citIndex: number) => {
          markdown += `${citIndex + 1}. `;
          if (citation.title) {
            markdown += `**${citation.title}**`;
          }
          if (citation.authors && citation.authors.length > 0) {
            markdown += ` - ${citation.authors.join(", ")}`;
          }
          if (citation.publicationYear) {
            markdown += ` (${citation.publicationYear})`;
          }
          markdown += "\n";

          if (citation.doi) {
            markdown += `   - DOI: [${citation.doi}](https://doi.org/${citation.doi})\n`;
          }
          if (citation.pubmedId) {
            markdown += `   - PubMed: [${citation.pubmedId}](https://pubmed.ncbi.nlm.nih.gov/${citation.pubmedId}/)\n`;
          }
          if (citation.url) {
            markdown += `   - URL: ${citation.url}\n`;
          }
          if (citation.snippet) {
            markdown += `   - Excerpt: "${citation.snippet}"\n`;
          }
          markdown += "\n";
        });
      }
    }

    // Add separator between messages
    if (index < messages.length - 1) {
      markdown += "---\n\n";
    }
  });

  return markdown;
}

// Download file helper
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export to Markdown file
export function exportConversationToMarkdown(
  conversationTitle: string,
  messages: Message[],
  includeTimestamps = true,
  includeCitations = true,
) {
  const markdown = exportToMarkdown(
    conversationTitle,
    messages,
    includeTimestamps,
    includeCitations,
  );
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `${conversationTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${timestamp}.md`;
  downloadFile(markdown, filename, "text/markdown");
}

// Export to PDF using browser print
export function exportConversationToPDF(
  conversationTitle: string,
  messages: Message[],
  includeTimestamps = true,
  includeCitations = true,
) {
  // Create a temporary container for print
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error(
      "Failed to open print window. Please allow popups for this site.",
    );
  }

  const markdown = exportToMarkdown(
    conversationTitle,
    messages,
    includeTimestamps,
    includeCitations,
  );

  // Convert markdown to simple HTML for printing
  const htmlContent = markdownToSimpleHTML(markdown);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${conversationTitle}</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
          }
          h1 {
            color: #0080FF;
            border-bottom: 2px solid #0080FF;
            padding-bottom: 0.5rem;
          }
          h2 {
            color: #333;
            margin-top: 2rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid #e0e0e0;
          }
          h3 {
            color: #666;
            margin-top: 1.5rem;
          }
          hr {
            border: none;
            border-top: 1px solid #ddd;
            margin: 2rem 0;
          }
          em {
            color: #888;
            font-size: 0.9em;
          }
          a {
            color: #0080FF;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
          ul {
            margin: 1rem 0;
          }
          li {
            margin: 0.5rem 0;
          }
          @media print {
            body {
              padding: 0;
            }
            h2 {
              page-break-after: avoid;
            }
            hr {
              page-break-after: always;
              border: none;
              visibility: hidden;
            }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `);

  printWindow.document.close();

  // Wait for content to load, then trigger print
  setTimeout(() => {
    printWindow.print();
    // Close the window after printing (user can cancel)
    printWindow.onafterprint = () => printWindow.close();
  }, 250);
}

// Simple markdown to HTML converter (basic support)
function markdownToSimpleHTML(markdown: string): string {
  return (
    markdown
      // Headers
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // Bold
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Horizontal rules
      .replace(/^---$/gm, "<hr>")
      // Line breaks
      .replace(/\n\n/g, "</p><p>")
      // Wrap in paragraphs
      .split("\n")
      .map((line) => {
        if (
          line.startsWith("<h") ||
          line.startsWith("<hr") ||
          line.trim() === ""
        ) {
          return line;
        }
        return line;
      })
      .join("\n")
      .replace(/^(?!<h|<hr|<p)(.+)$/gm, "<p>$1</p>")
  );
}
