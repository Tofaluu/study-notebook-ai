import React, { Fragment } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import type { ExplainableTerm } from '@workspace/api-client-react';

interface MarkdownRendererProps {
  content: string;
  terms?: ExplainableTerm[];
  prerequisiteTerms?: string[];
  onTermClick?: (term: string, contextSnippet: string) => void;
  headingIdPrefix?: string;
}

function extractPlainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractPlainText).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractPlainText(node.props.children);
  }
  return '';
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDisplayMath(markdown: string) {
  let processed = markdown;

  // Repair double-escaped newlines from LLMs (e.g. Gemini Flash escaping '\n' inside JSON strings)
  if (processed.includes('\\n') && !processed.includes('\n')) {
    processed = processed.replace(/\\n/g, '\n');
  } else if (processed.includes('\\n\\n')) {
    processed = processed.replace(/\\n\\n/g, '\n\n');
  }

  // Convert \[ \] to $$ $$
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`);
  // Convert \( \) to $ $
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
  // Ensure existing $$ blocks have proper blank lines around them for remark-math
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => `\n\n$$\n${math.trim()}\n$$\n\n`);

  // Clean up excessive newlines we might have just created
  processed = processed.replace(/\n{3,}/g, '\n\n');
  return processed;
}

export function MarkdownRenderer({ content, terms = [], prerequisiteTerms = [], onTermClick, headingIdPrefix }: MarkdownRendererProps) {
  const highlightedTerms = new Set<string>();

  const getHeadingId = (children: React.ReactNode) => {
    if (!headingIdPrefix) return undefined;
    const slug = slugifyHeading(extractPlainText(children));
    return slug ? `${headingIdPrefix}-${slug}` : undefined;
  };

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
            className="-mx-0.5 rounded-sm px-0.5 font-semibold text-foreground underline decoration-primary/60 decoration-2 underline-offset-[5px] transition-colors hover:bg-primary/10 hover:decoration-primary"
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
            className="-mx-0.5 rounded-sm px-0.5 font-semibold text-foreground underline decoration-primary/60 decoration-2 underline-offset-[5px] transition-colors hover:bg-primary/10 hover:decoration-primary"
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
    p: ({ children }: any) => <p className="mb-5 text-lg leading-[1.7] text-foreground/90">{processChildren(children)}</p>,
    li: ({ children }: any) => <li className="mb-2 text-lg leading-[1.7] text-foreground/90">{processChildren(children)}</li>,
    h1: ({ children }: any) => <h3 id={getHeadingId(children)} className="scroll-mt-6 mt-10 mb-4 font-serif text-3xl font-semibold text-foreground">{processChildren(children)}</h3>,
    h2: ({ children }: any) => <h3 id={getHeadingId(children)} className="scroll-mt-6 mt-8 mb-3 font-serif text-2xl font-semibold text-foreground">{processChildren(children)}</h3>,
    h3: ({ children }: any) => <h3 id={getHeadingId(children)} className="scroll-mt-6 mt-6 mb-2 font-serif text-xl font-semibold text-foreground">{processChildren(children)}</h3>,
    h4: ({ children }: any) => <h4 className="mt-5 mb-2 text-base font-semibold text-foreground">{processChildren(children)}</h4>,
    ul: ({ children }: any) => <ul className="list-disc pl-6 mb-6 space-y-2 marker:text-foreground/60">{processChildren(children)}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-6 mb-6 space-y-2 marker:text-foreground/60">{processChildren(children)}</ol>,
    blockquote: ({ children }: any) => <blockquote className="my-6 border-l border-border pl-5 font-serif italic text-muted-foreground">{processChildren(children)}</blockquote>,
    strong: ({ children }: any) => <strong className="font-semibold text-foreground">{processChildren(children)}</strong>,
    em: ({ children }: any) => <em className="italic">{processChildren(children)}</em>,
    code: ({ children }: any) => <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded text-foreground/80">{children}</code>,
    table: ({ children }: any) => <div className="overflow-x-auto my-8"><table className="w-full text-left border-collapse">{processChildren(children)}</table></div>,
    thead: ({ children }: any) => <thead className="border-b border-border bg-muted/50">{processChildren(children)}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-border/50">{processChildren(children)}</tbody>,
    tr: ({ children }: any) => <tr className="hover:bg-muted/30 transition-colors">{processChildren(children)}</tr>,
    th: ({ children }: any) => <th className="p-4 font-semibold text-foreground whitespace-nowrap">{processChildren(children)}</th>,
    td: ({ children }: any) => <td className="p-4 text-muted-foreground align-top">{processChildren(children)}</td>,
  };

  const normalizedContent = normalizeDisplayMath(content);

  return (
    <div className="prose prose-stone dark:prose-invert max-w-none prose-headings:font-normal prose-code:before:content-none prose-code:after:content-none [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-2">
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, errorColor: 'inherit' }]]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}


