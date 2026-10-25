import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ExplainableTerm, PageReference } from '@workspace/api-client-react';
import type { Chat, ConceptTab, FollowUpTab, HistoryItem } from '@/lib/db';
import { SelectableAnswer } from './SelectableAnswer';
import { slugifyHeading } from './MarkdownRenderer';
import { SourcesCited } from './SourcesCited';
import { Button } from '@/components/ui/button';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  Copy,
  Download,
  ExternalLink,
  List,
  Loader2,
  Pin,
  Printer,
} from 'lucide-react';

interface NotebookReaderViewProps {
  chat: Chat;
  onTermClick: (term: string, contextSnippet: string, parentId?: string) => void;
  onFollowUp: (selectedText: string, question: string, answerContext: string, parentId?: string) => void;
  onJumpToTab: (tabId: string) => void;
  onOpenDemo?: () => void;
}

interface ChapterSubheading {
  id: string;
  text: string;
  level: 2 | 3;
}

interface CompiledChapter {
  index: number;
  id: string;
  question?: string;
  aiItem: HistoryItem;
  subheadings: ChapterSubheading[];
  followUps: FollowUpTab[];
}

interface TocRailItem {
  id: string;
  label: string;
  level: 1 | 2 | 3;
}

function extractMarkdownSubheadings(markdown: string, prefix: string): ChapterSubheading[] {
  const lines = markdown.split('\n');
  const h2List: ChapterSubheading[] = [];
  const h3List: ChapterSubheading[] = [];
  let inCodeBlock = false;
  const seenSlugs = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match || h3Match) {
      const level: 2 | 3 = h2Match ? 2 : 3;
      const rawText = (h2Match ? h2Match[1] : h3Match![1])
        .replace(/[*_`~]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .trim();
      const slug = slugifyHeading(rawText);
      if (!slug || seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      const item: ChapterSubheading = {
        id: `${prefix}-${slug}`,
        text: rawText,
        level,
      };
      if (level === 2) h2List.push(item);
      else h3List.push(item);
    }
  }

  return h2List.length > 0 ? h2List : h3List.slice(0, 12);
}

const TOC_PINNED_STORAGE_KEY = 'study-notebook-reader-toc-pinned';

export function NotebookReaderView({
  chat,
  onTermClick,
  onFollowUp,
  onJumpToTab,
  onOpenDemo,
}: NotebookReaderViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const [activeScrollId, setActiveScrollId] = useState<string | null>(null);
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const [expandedInquiries, setExpandedInquiries] = useState<Set<string>>(new Set());
  const [collapsedTocChapters, setCollapsedTocChapters] = useState<Set<string>>(new Set());

  const [isTocPinned, setIsTocPinned] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(TOC_PINNED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });
  const [isTocHovered, setIsTocHovered] = useState(false);
  const hoverCloseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(TOC_PINNED_STORAGE_KEY, JSON.stringify(isTocPinned));
    } catch {
      // ignore storage errors
    }
  }, [isTocPinned]);

  const handleTocMouseEnter = () => {
    if (hoverCloseTimeoutRef.current) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    setIsTocHovered(true);
  };

  const handleTocMouseLeave = () => {
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      setIsTocHovered(false);
    }, 150);
  };

  const isTocPanelOpen = isTocPinned || isTocHovered;

  const conceptTabs = useMemo(
    () => chat.tabs.filter((t): t is ConceptTab => t.type === 'concept'),
    [chat.tabs]
  );

  const followUpTabs = useMemo(
    () => chat.tabs.filter((t): t is FollowUpTab => t.type === 'follow-up'),
    [chat.tabs]
  );

  // Pair user prompts with AI explanations into chapters, extract subheadings, and attach related FollowUpTabs
  const { chapters, orphanFollowUps, conceptFollowUpsMap } = useMemo(() => {
    const builtChapters: CompiledChapter[] = [];
    let pendingUserQuestion: string | undefined;

    for (const item of chat.history) {
      if (item.type === 'user') {
        pendingUserQuestion = item.content;
      } else if (item.type === 'ai' && item.explanation) {
        const chapterPrefix = `notebook-chapter-${item.id}`;
        builtChapters.push({
          index: builtChapters.length + 1,
          id: item.id,
          question: pendingUserQuestion,
          aiItem: item,
          subheadings: extractMarkdownSubheadings(
            item.explanation.answerMarkdown,
            chapterPrefix
          ),
          followUps: [],
        });
        pendingUserQuestion = undefined;
      }
    }

    const byConceptParent = new Map<string, FollowUpTab[]>();
    const unattached: FollowUpTab[] = [];
    const conceptIds = new Set(conceptTabs.map((c) => c.id));

    for (const fTab of followUpTabs) {
      if (fTab.parentId && conceptIds.has(fTab.parentId)) {
        const list = byConceptParent.get(fTab.parentId) || [];
        list.push(fTab);
        byConceptParent.set(fTab.parentId, list);
        continue;
      }

      let matchedChapter = builtChapters.find((ch) => {
        const exp = ch.aiItem.explanation;
        if (!exp) return false;
        if (fTab.answerContext && fTab.answerContext.startsWith(exp.title)) return true;
        if (fTab.answerContext && fTab.answerContext === exp.answerMarkdown) return true;
        if (fTab.selectedText && exp.answerMarkdown.includes(fTab.selectedText)) return true;
        return false;
      });

      if (!matchedChapter && builtChapters.length === 1) {
        matchedChapter = builtChapters[0];
      }

      if (matchedChapter) {
        matchedChapter.followUps.push(fTab);
      } else {
        unattached.push(fTab);
      }
    }

    return {
      chapters: builtChapters,
      orphanFollowUps: unattached,
      conceptFollowUpsMap: byConceptParent,
    };
  }, [chat.history, conceptTabs, followUpTabs]);

  // Aggregate a deduplicated glossary of all ExplainableTerms across chapters & follow-ups
  const glossaryTerms = useMemo(() => {
    const map = new Map<string, ExplainableTerm>();

    for (const ch of chapters) {
      for (const termObj of ch.aiItem.explanation?.terms || []) {
        const key = termObj.term.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, termObj);
        }
      }
    }

    for (const fTab of followUpTabs) {
      for (const termObj of fTab.explanation?.terms || []) {
        const key = termObj.term.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, termObj);
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.term.localeCompare(b.term));
  }, [chapters, followUpTabs]);

  // Aggregate all unique source references across the entire notebook
  const allCitedRefs = useMemo(() => {
    const seen = new Set<string>();
    const list: PageReference[] = [];

    const addRefs = (refs?: PageReference[]) => {
      if (!refs) return;
      for (const ref of refs) {
        const key = `${ref.sourceId}:${ref.pageNumber}:${ref.excerpt.slice(0, 60)}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(ref);
        }
      }
    };

    chapters.forEach((ch) => addRefs(ch.aiItem.explanation?.sourceRefs));
    conceptTabs.forEach((ct) => addRefs(ct.explanation?.sourceRefs));
    followUpTabs.forEach((ft) => addRefs(ft.explanation?.sourceRefs));

    return list;
  }, [chapters, conceptTabs, followUpTabs]);

  // Flat list of items for the Notion minimap rail & scroll spy
  const railItems = useMemo<TocRailItem[]>(() => {
    const items: TocRailItem[] = [];

    for (const ch of chapters) {
      items.push({
        id: `notebook-chapter-${ch.id}`,
        label: ch.aiItem.explanation?.title || 'Chapter',
        level: 1,
      });
      for (const sub of ch.subheadings) {
        items.push({
          id: sub.id,
          label: sub.text,
          level: 2,
        });
      }
      ch.followUps.forEach((fu) => {
        items.push({
          id: `notebook-followup-${fu.id}`,
          label: fu.explanation?.title || fu.question,
          level: 3,
        });
      });
    }

    conceptTabs.forEach((ct) => {
      items.push({
        id: `notebook-concept-${ct.id}`,
        label: ct.explanation?.title || ct.term,
        level: 2,
      });
    });

    if (glossaryTerms.length > 0) {
      items.push({
        id: 'notebook-glossary',
        label: `Glossary (${glossaryTerms.length})`,
        level: 1,
      });
    }

    if (allCitedRefs.length > 0) {
      items.push({
        id: 'notebook-sources',
        label: `Sources (${allCitedRefs.length})`,
        level: 1,
      });
    }

    return items;
  }, [chapters, conceptTabs, glossaryTerms.length, allCitedRefs.length]);

  // Scroll-spy to highlight the currently visible section in the Notion rail & TOC
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || railItems.length === 0) return;

    const updateActiveSection = () => {
      const containerTop = container.getBoundingClientRect().top;
      let currentId = railItems[0]?.id ?? null;

      for (const item of railItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        const offset = el.getBoundingClientRect().top - containerTop;
        if (offset <= 140) {
          currentId = item.id;
        } else {
          break;
        }
      }

      setActiveScrollId(currentId);
    };

    updateActiveSection();
    container.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      container.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [railItems]);

  const scrollToSection = (elementId: string) => {
    setMobileTocOpen(false);
    if (!isTocPinned) {
      setIsTocHovered(false);
    }
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveScrollId(elementId);
      setHighlightedSectionId(elementId);
      window.setTimeout(() => {
        setHighlightedSectionId((prev) => (prev === elementId ? null : prev));
      }, 1600);
    }
  };

  const handleReaderTermClick = (term: string, contextSnippet: string, parentId?: string) => {
    const existing = conceptTabs.find(
      (t) => t.term.trim().toLowerCase() === term.trim().toLowerCase()
    );
    if (existing) {
      scrollToSection(`notebook-concept-${existing.id}`);
      return;
    }
    onTermClick(term, contextSnippet, parentId);
    window.setTimeout(() => {
      const conceptsContainer = document.getElementById('notebook-concepts-end');
      conceptsContainer?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const handleReaderFollowUp = (
    selectedText: string,
    question: string,
    answerContext: string,
    parentId?: string
  ) => {
    onFollowUp(selectedText, question, answerContext, parentId);
  };

  const buildCompiledMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# ${chat.title}`);
    lines.push(
      `*Compiled Study Notebook · ${new Date(chat.updatedAt).toLocaleDateString()}*\n`
    );

    if (chapters.length > 0) {
      chapters.forEach((ch) => {
        const exp = ch.aiItem.explanation!;
        lines.push(`## ${exp.title}`);
        if (ch.question) {
          const singleLineQ = ch.question.replace(/\s+/g, ' ').trim();
          const shortQ =
            singleLineQ.length > 240 ? `${singleLineQ.slice(0, 240)}…` : singleLineQ;
          lines.push(`> **Prompt:** ${shortQ}\n`);
        }
        lines.push(`${exp.answerMarkdown}\n`);

        if (ch.followUps.length > 0) {
          ch.followUps.forEach((fu) => {
            lines.push(`### ${fu.explanation?.title || fu.question}`);
            lines.push(`> *“${fu.selectedText}”*`);
            lines.push(`> **Q:** ${fu.question}\n`);
            if (fu.explanation) {
              lines.push(`${fu.explanation.answerMarkdown}\n`);
            }
          });
        }
      });
    }

    if (conceptTabs.length > 0) {
      lines.push(`## Concept Pages\n`);
      conceptTabs.forEach((ct) => {
        lines.push(`### ${ct.explanation?.title || ct.term}`);
        if (ct.explanation) {
          if (ct.explanation.prerequisiteTerms?.length) {
            lines.push(
              `*Prerequisites: ${ct.explanation.prerequisiteTerms.join(', ')}*\n`
            );
          }
          lines.push(`${ct.explanation.answerMarkdown}\n`);
        }
        const childFollowUps = conceptFollowUpsMap.get(ct.id) || [];
        childFollowUps.forEach((fu) => {
          lines.push(`#### ${fu.explanation?.title || fu.question}`);
          lines.push(`> *“${fu.selectedText}”*\n`);
          if (fu.explanation) {
            lines.push(`${fu.explanation.answerMarkdown}\n`);
          }
        });
      });
    }

    if (glossaryTerms.length > 0) {
      lines.push(`## Glossary\n`);
      glossaryTerms.forEach((t) => {
        lines.push(`- **${t.term}**: ${t.plainDefinition}`);
      });
      lines.push('');
    }

    if (allCitedRefs.length > 0) {
      lines.push(`## Sources Cited\n`);
      allCitedRefs.forEach((ref) => {
        lines.push(`- **${ref.sourceName}** (p. ${ref.pageNumber}): *“${ref.excerpt}”*`);
      });
    }

    return lines.join('\n');
  };

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildCompiledMarkdown());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy markdown', e);
    }
  };

  const handleDownloadMarkdown = () => {
    const md = buildCompiledMarkdown();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName =
      chat.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'study-notebook';
    a.href = url;
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isEmpty =
    chapters.length === 0 && conceptTabs.length === 0 && followUpTabs.length === 0;

  if (isEmpty) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-12 flex items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-3">
          <h2 className="font-serif text-2xl font-semibold text-foreground">
            Nothing in this notebook yet
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask a question in Chat, open underlined concepts, or highlight passages to ask follow-ups. Everything you explore assembles here into one continuous reading view.
          </p>
          {onOpenDemo && (
            <div className="pt-2">
              <Button variant="outline" onClick={onOpenDemo}>
                Open the demo notebook
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className="relative flex-1 min-h-0 overflow-y-auto bg-background"
    >
      {/* Notion-Style Floating Table of Contents (Left Edge Rail + Origin-Aware Hover/Pin Popover) */}
      <div
        onMouseEnter={handleTocMouseEnter}
        onMouseLeave={handleTocMouseLeave}
        className="hidden lg:block sticky top-6 z-30 h-0 w-fit pl-3 md:pl-5 print:hidden"
      >
        {/* Minimized Notion Line Rail */}
        <button
          type="button"
          aria-label="Open Table of Contents"
          aria-expanded={isTocPanelOpen}
          onClick={() => setIsTocPinned(true)}
          className={`group flex flex-col gap-2 rounded-lg py-2.5 px-2 transition-[opacity,transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
            isTocPanelOpen
              ? 'opacity-0 pointer-events-none -translate-x-1.5'
              : 'opacity-100 hover:bg-muted/60'
          }`}
        >
          {railItems.slice(0, 28).map((item) => {
            const isActive = activeScrollId === item.id;
            const widthClass =
              item.level === 1
                ? 'w-4'
                : item.level === 2
                  ? 'w-3 ml-1'
                  : 'w-2 ml-2';
            return (
              <span
                key={item.id}
                className={`block h-[2px] rounded-full transition-[background-color,transform] duration-150 ease-out ${widthClass} ${
                  isActive
                    ? 'bg-foreground scale-x-110'
                    : 'bg-muted-foreground/35 group-hover:bg-muted-foreground/60'
                }`}
              />
            );
          })}
        </button>

        {/* Expanded Notion TOC Panel */}
        <aside
          aria-label="Table of Contents"
          className={`absolute left-3 md:left-5 top-0 w-64 rounded-xl border border-border/80 bg-card/95 backdrop-blur-md p-3.5 shadow-lg max-h-[calc(100dvh-7rem)] overflow-y-auto scrollbar-thin origin-top-left transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            isTocPanelOpen
              ? 'opacity-100 translate-x-0 scale-100 pointer-events-auto'
              : 'opacity-0 -translate-x-2 scale-[0.96] pointer-events-none'
          }`}
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-border/50 pb-2">
            <span className="text-xs font-medium text-muted-foreground">
              Contents
            </span>
            <button
              type="button"
              onClick={() => {
                if (isTocPinned) {
                  setIsTocPinned(false);
                  setIsTocHovered(false);
                } else {
                  setIsTocPinned(true);
                }
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.95] ${
                isTocPinned
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title={isTocPinned ? 'Minimize to rail' : 'Keep open'}
              aria-label={isTocPinned ? 'Minimize table of contents' : 'Keep table of contents open'}
            >
              {isTocPinned ? (
                <ChevronsLeft className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3 w-3" />
              )}
            </button>
          </div>

          <nav className="space-y-3 text-xs">
            {chapters.length > 0 && (
              <ul className="space-y-1">
                {chapters.map((ch) => {
                  const chSectionId = `notebook-chapter-${ch.id}`;
                  const isChActive = activeScrollId === chSectionId;
                  const hasChildren =
                    ch.subheadings.length > 0 || ch.followUps.length > 0;
                  const isCollapsed = collapsedTocChapters.has(ch.id);

                  return (
                    <li key={ch.id} className="space-y-0.5">
                      <div className="flex items-start gap-0.5">
                        {hasChildren && (
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedTocChapters((prev) => {
                                const next = new Set(prev);
                                if (next.has(ch.id)) next.delete(ch.id);
                                else next.add(ch.id);
                                return next;
                              })
                            }
                            className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-[0.95]"
                            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => scrollToSection(chSectionId)}
                          className={`flex-1 rounded px-1.5 py-1 text-left transition-colors duration-150 line-clamp-2 ${
                            isChActive
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-foreground/85 hover:bg-muted/60 hover:text-foreground'
                          }`}
                        >
                          {ch.aiItem.explanation?.title}
                        </button>
                      </div>

                      {hasChildren && !isCollapsed && (
                        <ul className="ml-2 space-y-0.5 border-l border-border/60 pl-2">
                          {ch.subheadings.map((sub) => {
                            const isSubActive = activeScrollId === sub.id;
                            return (
                              <li key={sub.id}>
                                <button
                                  type="button"
                                  onClick={() => scrollToSection(sub.id)}
                                  className={`w-full rounded px-1.5 py-0.5 text-left transition-colors duration-150 line-clamp-1 ${
                                    isSubActive
                                      ? 'bg-muted font-medium text-foreground'
                                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                  }`}
                                >
                                  {sub.text}
                                </button>
                              </li>
                            );
                          })}
                          {ch.followUps.map((fu) => {
                            const fuId = `notebook-followup-${fu.id}`;
                            const isFuActive = activeScrollId === fuId;
                            return (
                              <li key={fu.id}>
                                <button
                                  type="button"
                                  onClick={() => scrollToSection(fuId)}
                                  className={`w-full rounded px-1.5 py-0.5 text-left transition-colors duration-150 line-clamp-1 ${
                                    isFuActive
                                      ? 'bg-muted font-medium text-foreground'
                                      : 'text-muted-foreground/85 hover:bg-muted/50 hover:text-foreground'
                                  }`}
                                >
                                  ↳ {fu.explanation?.title || fu.question}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {conceptTabs.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="mb-1 px-1.5 text-[11px] font-medium text-muted-foreground">
                  Concepts
                </p>
                <ul className="space-y-0.5">
                  {conceptTabs.map((ct) => {
                    const ctId = `notebook-concept-${ct.id}`;
                    const isCtActive = activeScrollId === ctId;
                    return (
                      <li key={ct.id}>
                        <button
                          type="button"
                          onClick={() => scrollToSection(ctId)}
                          className={`w-full rounded px-1.5 py-0.5 text-left transition-colors duration-150 line-clamp-1 ${
                            isCtActive
                              ? 'bg-muted font-medium text-foreground'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          }`}
                        >
                          {ct.explanation?.title || ct.term}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {(glossaryTerms.length > 0 || allCitedRefs.length > 0) && (
              <div className="pt-2 border-t border-border/50 space-y-0.5">
                {glossaryTerms.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('notebook-glossary')}
                    className={`w-full rounded px-1.5 py-1 text-left transition-colors duration-150 ${
                      activeScrollId === 'notebook-glossary'
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    Glossary ({glossaryTerms.length})
                  </button>
                )}
                {allCitedRefs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('notebook-sources')}
                    className={`w-full rounded px-1.5 py-1 text-left transition-colors duration-150 ${
                      activeScrollId === 'notebook-sources'
                        ? 'bg-muted font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    Sources ({allCitedRefs.length})
                  </button>
                )}
              </div>
            )}
          </nav>
        </aside>
      </div>

      {/* Centered Editorial Column (matches ConceptView & FollowUpView 46rem measure) */}
      <div>
        <div className="mx-auto max-w-[46rem] px-4 py-6 md:px-8 md:py-10 space-y-8 pb-24">
          {/* Document Header */}
          <header className="border-b border-border pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="font-serif text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-4xl">
                {chat.title}
              </h1>

              <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyMarkdown}
                  className="h-8 gap-1.5 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-primary" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy .md
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadMarkdown}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
              <span>
                {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
              </span>
              {conceptTabs.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {conceptTabs.length} {conceptTabs.length === 1 ? 'concept' : 'concepts'}
                  </span>
                </>
              )}
              {followUpTabs.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {followUpTabs.length} {followUpTabs.length === 1 ? 'follow-up' : 'follow-ups'}
                  </span>
                </>
              )}
              {glossaryTerms.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {glossaryTerms.length} {glossaryTerms.length === 1 ? 'term' : 'terms'}
                  </span>
                </>
              )}
            </div>

            {/* Mobile/Tablet Table of Contents toggle */}
            <div className="mt-4 lg:hidden print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMobileTocOpen((v) => !v)}
                className="w-full justify-between text-xs"
              >
                <span className="flex items-center gap-2">
                  <List className="h-3.5 w-3.5" />
                  Contents
                </span>
                <span>{mobileTocOpen ? 'Hide' : 'Show'}</span>
              </Button>
              {mobileTocOpen && (
                <nav
                  aria-label="Mobile Table of Contents"
                  className="mt-2 rounded-xl border border-border/60 bg-card p-3.5 space-y-3 text-xs"
                >
                  {chapters.map((ch) => (
                    <div key={ch.id} className="space-y-1">
                      <button
                        type="button"
                        onClick={() => scrollToSection(`notebook-chapter-${ch.id}`)}
                        className="text-left font-medium text-foreground hover:text-primary truncate block w-full"
                      >
                        {ch.aiItem.explanation?.title}
                      </button>
                      {ch.subheadings.length > 0 && (
                        <ul className="pl-3 border-l border-border/60 space-y-1">
                          {ch.subheadings.map((sub) => (
                            <li key={sub.id}>
                              <button
                                type="button"
                                onClick={() => scrollToSection(sub.id)}
                                className="text-left text-muted-foreground hover:text-foreground truncate block w-full"
                              >
                                {sub.text}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </nav>
              )}
            </div>
          </header>

          {/* CHAPTERS */}
          {chapters.map((ch) => {
            const exp = ch.aiItem.explanation!;
            const sectionId = `notebook-chapter-${ch.id}`;
            const isHighlighted = highlightedSectionId === sectionId;

            return (
              <div key={ch.id} className="space-y-5">
                <article
                  id={sectionId}
                  className={`scroll-mt-6 rounded-2xl border bg-card px-5 py-6 shadow-sm transition-colors duration-300 md:px-12 md:py-10 ${
                    isHighlighted ? 'border-primary' : 'border-border/60'
                  }`}
                >
                  {ch.question &&
                    (() => {
                      const isLongPrompt =
                        ch.question.length > 180 || ch.question.includes('\n');
                      const isExpanded = expandedInquiries.has(ch.id);
                      return (
                        <div className="mb-6 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                          <div
                            className={
                              !isExpanded && isLongPrompt
                                ? 'line-clamp-2 whitespace-pre-line'
                                : 'whitespace-pre-wrap'
                            }
                          >
                            <span className="font-medium text-foreground">Prompt: </span>
                            {ch.question}
                          </div>
                          {isLongPrompt && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedInquiries((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(ch.id)) next.delete(ch.id);
                                  else next.add(ch.id);
                                  return next;
                                })
                              }
                              className="mt-1.5 text-xs font-medium text-foreground/80 underline underline-offset-4 hover:text-foreground print:hidden"
                            >
                              {isExpanded ? 'Collapse prompt' : 'Show full prompt'}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                  <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-3xl font-semibold tracking-[-0.01em] text-foreground md:text-4xl">
                    {exp.title}
                  </h2>

                  <SelectableAnswer
                    title={exp.title}
                    content={exp.answerMarkdown}
                    terms={exp.terms}
                    headingIdPrefix={sectionId}
                    onTermClick={(term, snippet) => handleReaderTermClick(term, snippet)}
                    onFollowUp={(selectedText, question, answerContext) =>
                      handleReaderFollowUp(selectedText, question, answerContext)
                    }
                  />

                  <SourcesCited refs={exp.sourceRefs} />
                </article>

                {/* Follow-Up Notes attached to this Chapter */}
                {ch.followUps.length > 0 && (
                  <div className="space-y-4 pl-4 md:pl-6 border-l border-border">
                    {ch.followUps.map((fu) => {
                      const fuSectionId = `notebook-followup-${fu.id}`;
                      const isFuHighlighted = highlightedSectionId === fuSectionId;

                      return (
                        <aside
                          key={fu.id}
                          id={fuSectionId}
                          className={`scroll-mt-6 rounded-2xl border bg-card px-5 py-6 shadow-sm transition-colors duration-300 md:px-10 md:py-8 ${
                            isFuHighlighted ? 'border-primary' : 'border-border/60'
                          }`}
                        >
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <h3 className="font-serif text-2xl font-semibold tracking-[-0.01em] text-foreground">
                              {fu.explanation?.title || fu.question}
                            </h3>
                            <button
                              type="button"
                              onClick={() => onJumpToTab(fu.id)}
                              className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
                              title="Open in isolated tab"
                            >
                              <span>Open tab</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </div>

                          <figure className="mb-6 rounded-xl bg-muted/50 px-4 py-3.5">
                            <blockquote className="mb-2 line-clamp-3 font-serif text-sm italic leading-relaxed text-foreground/80">
                              “{fu.selectedText}”
                            </blockquote>
                            <p className="border-t border-border/60 pt-2 text-xs font-medium text-foreground">
                              Q: {fu.question}
                            </p>
                          </figure>

                          {fu.explanation ? (
                            <SelectableAnswer
                              title={fu.explanation.title}
                              content={fu.explanation.answerMarkdown}
                              terms={fu.explanation.terms}
                              onTermClick={(term, snippet) =>
                                handleReaderTermClick(term, snippet, fu.id)
                              }
                              onFollowUp={(selectedText, question, answerContext) =>
                                handleReaderFollowUp(
                                  selectedText,
                                  question,
                                  answerContext,
                                  fu.id
                                )
                              }
                            />
                          ) : (
                            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              <span>Answering your follow-up…</span>
                            </div>
                          )}
                        </aside>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* CONCEPT DEEP-DIVES */}
          {conceptTabs.length > 0 && (
            <section aria-label="Concepts" className="space-y-6 pt-4">
              <h2 className="border-b border-border pb-3 font-serif text-2xl font-semibold tracking-[-0.01em] text-foreground">
                Concepts
              </h2>

              {conceptTabs.map((ct) => {
                const sectionId = `notebook-concept-${ct.id}`;
                const isHighlighted = highlightedSectionId === sectionId;
                const childFollowUps = conceptFollowUpsMap.get(ct.id) || [];
                const parentConcept = ct.parentId
                  ? conceptTabs.find((p) => p.id === ct.parentId)
                  : undefined;

                return (
                  <div key={ct.id} className="space-y-4">
                    <article
                      id={sectionId}
                      className={`scroll-mt-6 rounded-2xl border bg-card px-5 py-6 shadow-sm transition-colors duration-300 md:px-12 md:py-10 ${
                        isHighlighted ? 'border-primary' : 'border-border/60'
                      }`}
                    >
                      <div className="mb-6 flex items-start justify-between gap-4 border-b border-border/50 pb-4">
                        <div>
                          <h3 className="font-serif text-3xl font-semibold tracking-[-0.01em] text-foreground md:text-4xl">
                            {ct.explanation?.title || ct.term}
                          </h3>
                          {parentConcept && (
                            <button
                              type="button"
                              onClick={() =>
                                scrollToSection(`notebook-concept-${parentConcept.id}`)
                              }
                              className="mt-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              ← From {parentConcept.explanation?.title || parentConcept.term}
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => onJumpToTab(ct.id)}
                          className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
                          title="Open in isolated tab"
                        >
                          <span>Open tab</span>
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </div>

                      {ct.explanation ? (
                        <>
                          {ct.explanation.prerequisiteTerms &&
                            ct.explanation.prerequisiteTerms.length > 0 && (
                              <div className="mb-6 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground mr-1">
                                  Builds on:
                                </span>
                                {ct.explanation.prerequisiteTerms.map((prereq) => {
                                  const isExplored = conceptTabs.some(
                                    (t) =>
                                      t.term.trim().toLowerCase() ===
                                      prereq.trim().toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={prereq}
                                      type="button"
                                      onClick={() =>
                                        handleReaderTermClick(
                                          prereq,
                                          `Prerequisite concept for ${ct.term}.`,
                                          ct.id
                                        )
                                      }
                                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                                        isExplored
                                          ? 'border-border bg-muted text-foreground'
                                          : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
                                      }`}
                                    >
                                      <span>{prereq}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                          <SelectableAnswer
                            title={ct.explanation.title}
                            content={ct.explanation.answerMarkdown}
                            prerequisiteTerms={ct.explanation.prerequisiteTerms}
                            headingIdPrefix={sectionId}
                            onTermClick={(term, snippet) =>
                              handleReaderTermClick(term, snippet, ct.id)
                            }
                            onFollowUp={(selectedText, question, answerContext) =>
                              handleReaderFollowUp(
                                selectedText,
                                question,
                                answerContext,
                                ct.id
                              )
                            }
                          />

                          <SourcesCited refs={ct.explanation.sourceRefs} />
                        </>
                      ) : (
                        <div className="flex items-center gap-3 py-8 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span>
                            Opening <strong className="text-foreground">“{ct.term}”</strong>…
                          </span>
                        </div>
                      )}
                    </article>

                    {childFollowUps.length > 0 && (
                      <div className="space-y-4 pl-4 md:pl-6 border-l border-border">
                        {childFollowUps.map((fu) => (
                          <aside
                            key={fu.id}
                            id={`notebook-followup-${fu.id}`}
                            className="scroll-mt-6 rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-10 md:py-8"
                          >
                            <div className="mb-4 flex items-center justify-between gap-4">
                              <h4 className="font-serif text-xl font-semibold text-foreground">
                                {fu.explanation?.title || fu.question}
                              </h4>
                              <button
                                type="button"
                                onClick={() => onJumpToTab(fu.id)}
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground print:hidden"
                              >
                                <span>Open tab</span>
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                            <figure className="mb-5 rounded-xl bg-muted/50 px-4 py-3">
                              <blockquote className="mb-2 line-clamp-3 font-serif text-sm italic text-foreground/80">
                                “{fu.selectedText}”
                              </blockquote>
                              <p className="border-t border-border/60 pt-2 text-xs font-medium text-foreground">
                                Q: {fu.question}
                              </p>
                            </figure>
                            {fu.explanation ? (
                              <SelectableAnswer
                                title={fu.explanation.title}
                                content={fu.explanation.answerMarkdown}
                                terms={fu.explanation.terms}
                                onTermClick={(term, snippet) =>
                                  handleReaderTermClick(term, snippet, ct.id)
                                }
                                onFollowUp={(selectedText, question, answerContext) =>
                                  handleReaderFollowUp(
                                    selectedText,
                                    question,
                                    answerContext,
                                    ct.id
                                  )
                                }
                              />
                            ) : (
                              <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span>Answering your follow-up…</span>
                              </div>
                            )}
                          </aside>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div id="notebook-concepts-end" />
            </section>
          )}

          {/* Unattached Follow-Ups */}
          {orphanFollowUps.length > 0 && (
            <section aria-label="Additional Follow-Ups" className="space-y-6 pt-4">
              <h2 className="border-b border-border pb-3 font-serif text-2xl font-semibold tracking-[-0.01em] text-foreground">
                Follow-Ups
              </h2>
              {orphanFollowUps.map((fu) => (
                <article
                  key={fu.id}
                  id={`notebook-followup-${fu.id}`}
                  className="scroll-mt-6 rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-10 md:py-8"
                >
                  <figure className="mb-5 rounded-xl bg-muted/50 px-4 py-3">
                    <blockquote className="mb-2 font-serif text-sm italic text-foreground/80">
                      “{fu.selectedText}”
                    </blockquote>
                    <p className="border-t border-border/60 pt-2 text-xs font-medium text-foreground">
                      Q: {fu.question}
                    </p>
                  </figure>
                  {fu.explanation && (
                    <>
                      <h3 className="mb-4 font-serif text-2xl font-semibold text-foreground">
                        {fu.explanation.title}
                      </h3>
                      <SelectableAnswer
                        title={fu.explanation.title}
                        content={fu.explanation.answerMarkdown}
                        terms={fu.explanation.terms}
                        onTermClick={(term, snippet) => handleReaderTermClick(term, snippet)}
                        onFollowUp={(selectedText, question, answerContext) =>
                          handleReaderFollowUp(selectedText, question, answerContext)
                        }
                      />
                    </>
                  )}
                </article>
              ))}
            </section>
          )}

          {/* GLOSSARY (Clean Editorial Definition List — no icon-card grid) */}
          {glossaryTerms.length > 0 && (
            <section
              id="notebook-glossary"
              aria-label="Glossary"
              className="scroll-mt-6 rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-12 md:py-10"
            >
              <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-2xl font-semibold tracking-[-0.01em] text-foreground">
                Glossary
              </h2>

              <dl className="divide-y divide-border/50">
                {glossaryTerms.map((item) => {
                  const existingConcept = conceptTabs.find(
                    (c) =>
                      c.term.trim().toLowerCase() === item.term.trim().toLowerCase()
                  );

                  return (
                    <div
                      key={item.term}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                    >
                      <div className="space-y-1">
                        <dt className="font-serif text-lg font-semibold text-foreground">
                          <button
                            type="button"
                            onClick={() =>
                              handleReaderTermClick(item.term, item.contextSnippet)
                            }
                            className="text-left underline decoration-primary/60 decoration-2 underline-offset-[5px] transition-colors hover:bg-primary/10 hover:decoration-primary rounded-sm"
                          >
                            {item.term}
                          </button>
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted-foreground">
                          {item.plainDefinition}
                        </dd>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleReaderTermClick(item.term, item.contextSnippet)
                        }
                        className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground print:hidden"
                      >
                        {existingConcept ? 'Jump to page →' : 'Open page →'}
                      </button>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}

          {/* SOURCES CITED */}
          {allCitedRefs.length > 0 && (
            <section
              id="notebook-sources"
              aria-label="Sources Cited"
              className="scroll-mt-6 rounded-2xl border border-border/60 bg-card px-5 py-6 shadow-sm md:px-12 md:py-10"
            >
              <h2 className="mb-6 border-b border-border/50 pb-4 font-serif text-2xl font-semibold tracking-[-0.01em] text-foreground">
                Sources Cited
              </h2>
              <ul className="divide-y divide-border/50">
                {allCitedRefs.map((ref, idx) => (
                  <li key={idx} className="py-3.5 first:pt-0 last:pb-0 text-sm">
                    <p className="font-medium text-foreground">
                      {ref.sourceName}
                      <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                        p. {ref.pageNumber}
                      </span>
                    </p>
                    <p className="mt-1 font-serif italic leading-relaxed text-muted-foreground">
                      “{ref.excerpt}”
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
