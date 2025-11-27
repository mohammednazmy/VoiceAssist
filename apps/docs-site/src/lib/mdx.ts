import fs from "fs/promises";
import path from "path";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

import { mdxComponents } from "@/components/mdx-components";
import { remarkMermaidToComponent } from "./remark-mermaid";

type PluggableList = any[];

export interface MdxFrontmatter {
  title?: string;
  description?: string;
  [key: string]: unknown;
}

const CONTENT_DIR = path.join(process.cwd(), "src", "content");

const prettyCodeOptions: Partial<PrettyCodeOptions> = {
  theme: {
    light: "github-light",
    dark: "github-dark",
  },
  keepBackground: false,
  onVisitLine(node) {
    if (node.children.length === 0) {
      node.children = [{ type: "text", value: " " }];
    }
  },
};

const baseMdxOptions = {
  parseFrontmatter: true,
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkMermaidToComponent] as PluggableList,
    rehypePlugins: [
      [rehypePrettyCode, prettyCodeOptions],
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: "wrap" }],
    ] as PluggableList,
  },
};

export async function renderMdx(source: string) {
  return compileMDX<MdxFrontmatter>({
    source,
    components: mdxComponents,
    options: baseMdxOptions,
  });
}

export async function loadMdxContent(relativePath: string) {
  const fullPath = path.join(CONTENT_DIR, relativePath);

  try {
    const source = await fs.readFile(fullPath, "utf8");
    return renderMdx(source);
  } catch (error) {
    console.warn(`Failed to load MDX at ${fullPath}:`, error);
    return null;
  }
}
