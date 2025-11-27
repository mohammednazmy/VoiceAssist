import { renderMdx } from "@/lib/mdx";

export async function MarkdownRenderer({ content }: { content: string }) {
  const { content: renderedContent } = await renderMdx(content);

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      {renderedContent}
    </article>
  );
}
