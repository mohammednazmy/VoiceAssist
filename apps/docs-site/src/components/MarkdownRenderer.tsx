"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import React from "react";

import { slugifyHeading } from "@/lib/search";

function textFromChildren(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return child.toString();
      }
      if (React.isValidElement(child)) {
        return textFromChildren(child.props.children);
      }
      return "";
    })
    .join(" ")
    .trim();
}

function createHeading(
  Tag: keyof JSX.IntrinsicElements,
  className: string
): React.FC<React.HTMLAttributes<HTMLHeadingElement>> {
  const HeadingComponent = ({ children, ...props }) => {
    const text = textFromChildren(children);
    const id = slugifyHeading(text || props.id || "heading");

    return (
      <Tag id={id} className={className} {...props}>
        <a href={`#${id}`} className="no-underline hover:underline">
          {children}
        </a>
      </Tag>
    );
  };

  HeadingComponent.displayName = `Heading-${Tag}`;
  return HeadingComponent;
}

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom heading rendering with anchor links
          h1: createHeading(
            "h1",
            "text-3xl font-bold text-gray-900 dark:text-white mb-6"
          ),
          h2: createHeading(
            "h2",
            "text-2xl font-semibold text-gray-900 dark:text-white mt-8 mb-4"
          ),
          h3: createHeading(
            "h3",
            "text-xl font-semibold text-gray-900 dark:text-white mt-6 mb-3"
          ),
          // Custom code block styling
          pre: ({ children, ...props }) => (
            <pre
              className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto my-4"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code
                  className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          // Custom link styling
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline"
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
              {...props}
            >
              {children}
            </a>
          ),
          // Custom table styling
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto my-6">
              <table
                className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
                {...props}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50 dark:bg-gray-800"
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td
              className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 border-t border-gray-200 dark:border-gray-700"
              {...props}
            >
              {children}
            </td>
          ),
          // Custom blockquote styling
          blockquote: ({ children, ...props }) => (
            <blockquote
              className="border-l-4 border-primary-500 pl-4 my-4 italic text-gray-700 dark:text-gray-300"
              {...props}
            >
              {children}
            </blockquote>
          ),
          // Custom list styling
          ul: ({ children, ...props }) => (
            <ul
              className="list-disc list-inside space-y-2 my-4 text-gray-700 dark:text-gray-300"
              {...props}
            >
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol
              className="list-decimal list-inside space-y-2 my-4 text-gray-700 dark:text-gray-300"
              {...props}
            >
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="ml-4" {...props}>
              {children}
            </li>
          ),
          // Paragraph styling
          p: ({ children, ...props }) => (
            <p
              className="my-4 text-gray-700 dark:text-gray-300 leading-relaxed"
              {...props}
            >
              {children}
            </p>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
