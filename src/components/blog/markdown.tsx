// Renders blog markdown. react-markdown ignores raw HTML by default, so
// authored content can't inject scripts. Headings get the same anchor ids
// that extractHeadings() puts in the table of contents.

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { headingId } from '@/lib/blog-utils';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

export function BlogMarkdown({ content }: { content: string }) {
  // Fresh per render so ids are assigned in document order, exactly like extractHeadings().
  const used = new Map<string, number>();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h2 id={headingId(textOf(children), used)}>{children}</h2>,
        h2: ({ children }) => <h2 id={headingId(textOf(children), used)}>{children}</h2>,
        h3: ({ children }) => <h3 id={headingId(textOf(children), used)}>{children}</h3>,
        a: ({ href, children }) => {
          const external = !!href && /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?repeatgrow\.com/.test(href);
          return (
            <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}>
              {children}
            </a>
          );
        },
        img: ({ src, alt }) => (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={typeof src === 'string' ? src : undefined}
              alt={alt ?? ''}
              loading="lazy"
              className="w-full rounded-xl border border-border"
            />
            {alt ? <figcaption>{alt}</figcaption> : null}
          </figure>
        ),
        pre: ({ children }) => (
          <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-sm">{children}</pre>
        ),
        code: ({ children, className }) =>
          className ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="rounded bg-muted px-1.5 py-0.5 text-[0.9em]">{children}</code>
          ),
        table: ({ children }) => (
          <div className="overflow-x-auto">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
