import React, { Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';
import type { ExplainableTerm } from '@workspace/api-client-react';

interface MarkdownRendererProps {
  content: string;
  terms?: ExplainableTerm[];
  prerequisiteTerms?: string[];
  onTermClick?: (term: string, contextSnippet: string) => void;
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDisplayMath(markdown: string) {
  return markdown.replace(
    /\$\$([^\n]+?)\$\$/g,
    (_, expression: string) => `\n\n$$\n${expression.trim()}\n$$\n\n`
  );
}

export function MarkdownRenderer({ content, terms = [], prerequisiteTerms = [], onTermClick }: MarkdownRendererProps) {
  const highlightedTerms = new Set<string>();

  const renderWithHighlights = (text: string) => {
    if (typeof text !== 'string') return text;
    if (terms.length === 0 && prerequisiteTerms.length === 0) return text;

    const termStrings = [
      ...terms.map(t => t.term),
      ...prerequisiteTerms
    ].filter(Boolean);

    if (termStrings.length === 0) return text;

    const sorted = [...new Set(termStrings)].sort((a, b) => b.length - a.length);
    const regex = new RegExp(`\\b(${sorted.map(escapeRegExp).join('|')})\\b`, 'gi');

    const parts = text.split(regex);

    return parts.map((part, i) => {
      const termLower = part.toLowerCase();
      const matchedTerm = terms.find(t => t.term.toLowerCase() === termLower);
      const isPrereq = prerequisiteTerms.some(pt => pt.toLowerCase() === termLower);

      if (matchedTerm) {
        if (highlightedTerms.has(termLower)) return <Fragment key={i}>{part}</Fragment>;
        highlightedTerms.add(termLower);
        return (
          <button
            key={i}
            onClick={() => onTermClick?.(matchedTerm.term, matchedTerm.contextSnippet)}
            className="text-primary font-bold decoration-primary/40 hover:bg-primary/10 border-b-2 border-primary/40 transition-colors inline-block leading-tight rounded-sm px-0.5 -mx-0.5"
            data-testid={`term-${matchedTerm.term}`}
            title={matchedTerm.plainDefinition}
          >
            {part}
          </button>
        );
      } else if (isPrereq) {
        if (highlightedTerms.has(termLower)) return <Fragment key={i}>{part}</Fragment>;
        highlightedTerms.add(termLower);
        return (
          <button
            key={i}
            onClick={() => onTermClick?.(part, "Prerequisite concept related to the current topic.")}
            className="text-primary font-bold decoration-primary/40 hover:bg-primary/10 border-b-2 border-primary/40 transition-colors inline-block leading-tight rounded-sm px-0.5 -mx-0.5"
            data-testid={`prereq-${part}`}
          >
            {part}
          </button>
        );
      }
      return <Fragment key={i}>{part}</Fragment>;
    });
  };

  const processChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, child => {
      if (typeof child === 'string') return renderWithHighlights(child);
      if (React.isValidElement<{ className?: string }>(child)) {
        const className = child.props.className ?? '';
        if (child.type === 'button' || child.type === 'code' || className.includes('katex')) {
          return child;
        }
      }
      if (
        React.isValidElement<{ children?: React.ReactNode }>(child) &&
        child.props.children
      ) {
        return React.cloneElement(child, {
          children: processChildren(child.props.children)
        });
      }
      return child;
    });
  };

  const components = {
    p: ({ children }: any) => <p className="mb-6 leading-relaxed text-lg tracking-wide text-foreground/90">{processChildren(children)}</p>,
    li: ({ children }: any) => <li className="mb-3 leading-relaxed text-lg tracking-wide text-foreground/90">{processChildren(children)}</li>,
    h1: ({ children }: any) => <h1 className="text-3xl font-serif font-bold mt-10 mb-6 text-foreground tracking-tight">{processChildren(children)}</h1>,
    h2: ({ children }: any) => <h2 className="text-2xl font-serif font-bold mt-8 mb-4 text-foreground tracking-tight">{processChildren(children)}</h2>,
    h3: ({ children }: any) => <h3 className="text-xl font-serif font-bold mt-6 mb-3 text-foreground tracking-tight">{processChildren(children)}</h3>,
    ul: ({ children }: any) => <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-primary/60">{processChildren(children)}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-6 space-y-2 marker:text-primary/60">{processChildren(children)}</ol>,
    blockquote: ({ children }: any) => <blockquote className="border-l-4 border-primary/40 pl-5 italic text-muted-foreground my-6 py-2 bg-muted/40 rounded-r-xl">{processChildren(children)}</blockquote>,
    strong: ({ children }: any) => <strong className="font-semibold text-foreground">{processChildren(children)}</strong>,
    em: ({ children }: any) => <em className="italic">{processChildren(children)}</em>,
    code: ({ children }: any) => <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded text-foreground/80">{children}</code>,
  };

  const normalizedContent = normalizeDisplayMath(content);

  return (
    <div className="prose prose-stone dark:prose-invert max-w-none [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}