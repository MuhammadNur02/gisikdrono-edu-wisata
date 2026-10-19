'use client';

import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFlipBook, usePageRatio, type FlipBookView } from '@/hooks/use-flip-book';
import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
// The height a page may take: the screen less the site header and the toolbar, or less the toolbar alone in
// fullscreen, so a portrait page never runs below the fold.
const CHROME_HEIGHT = { page: '13rem', fullscreen: '5rem' } as const;
// Two pages side by side from md, one below.
const PAGES_ACROSS = { mdUp: 2, belowMd: 1 } as const;

export interface FlipbookViewerProps {
  title: string;
  // public-media paths of the pre-rendered pages, in order (0001.webp …).
  pagePaths: string[];
}

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const update = () => {
      setIsFullscreen(document.fullscreenElement === target.current);
    };
    document.addEventListener('fullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
    };
  }, [target]);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen();
  };
  return { isFullscreen, toggle };
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

// ← and → turn the pages anywhere on the page, which holds nothing else that uses them.
function useArrowKeys(previous: () => void, next: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
      if (event.key === 'ArrowLeft') previous();
      if (event.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previous, next]);
}

// The page ratio comes from the file, so the width that keeps a page within the screen is an inline style.
function bookWidthStyle(
  ratio: number | null,
  isMdUp: boolean,
  isFullscreen: boolean,
): CSSProperties {
  if (ratio === null) return {};
  const pagesAcross = isMdUp ? PAGES_ACROSS.mdUp : PAGES_ACROSS.belowMd;
  const chrome = isFullscreen ? CHROME_HEIGHT.fullscreen : CHROME_HEIGHT.page;
  return { maxWidth: `calc((100dvh - ${chrome}) * ${String(ratio * pagesAcross)})` };
}

interface ToolbarProps {
  view: FlipBookView | null;
  pageCount: number;
  onPrevious: () => void;
  onNext: () => void;
  fullscreen: ReturnType<typeof useFullscreen>;
}

function Position({ view, pageCount }: Pick<ToolbarProps, 'view' | 'pageCount'>) {
  if (!view) return <span className="min-w-20" />;
  const { first, last } = view;
  return (
    <>
      <span aria-hidden className="min-w-20 text-center text-body-sm tabular-nums">
        {copy.booklet.position(first + 1, last + 1, pageCount)}
      </span>
      <span className="sr-only" aria-live="polite">
        {copy.booklet.positionSpoken(first + 1, last + 1, pageCount)}
      </span>
    </>
  );
}

function Toolbar({ view, pageCount, onPrevious, onNext, fullscreen }: ToolbarProps) {
  const FullscreenIcon = fullscreen.isFullscreen ? Minimize : Maximize;
  const fullscreenLabel = fullscreen.isFullscreen
    ? copy.booklet.exitFullscreen
    : copy.booklet.fullscreen;
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="outline"
        size="icon"
        aria-label={copy.booklet.previous}
        disabled={!view || view.first <= 0}
        onClick={onPrevious}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <Position view={view} pageCount={pageCount} />
      <Button
        variant="outline"
        size="icon"
        aria-label={copy.booklet.next}
        disabled={!view || view.last >= pageCount - 1}
        onClick={onNext}
      >
        <ChevronRight aria-hidden />
      </Button>
      {document.fullscreenEnabled ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={fullscreenLabel}
          onClick={fullscreen.toggle}
        >
          <FullscreenIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

// docs/StyleGuide.md §5.12, Task P2.7.01: the pre-rendered pages turned with page-flip, two at a time from md
// and one below, by swipe, the arrow buttons or the keyboard. It is loaded only on /e-booklet/[slug], in the
// browser alone (next/dynamic, ssr: false), and never reads the PDF.
export function FlipbookViewer({ title, pagePaths }: FlipbookViewerProps) {
  const frame = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const isMdUp = useMediaQuery(MEDIA_MD_UP);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const ratio = usePageRatio(pagePaths[0] ?? '');
  const { view, previous, next } = useFlipBook(host, pagePaths, ratio, reducedMotion);
  const fullscreen = useFullscreen(frame);
  useArrowKeys(previous, next);

  return (
    <section
      ref={frame}
      aria-label={copy.booklet.viewer(title)}
      className={cn(
        'space-y-4',
        fullscreen.isFullscreen && 'flex flex-col justify-center bg-background p-4',
      )}
    >
      <div
        className="mx-auto w-full"
        style={bookWidthStyle(ratio, isMdUp, fullscreen.isFullscreen)}
      >
        {view ? null : <Skeleton className="aspect-3/2 w-full rounded-xl" />}
        <div ref={host} />
      </div>
      <Toolbar
        view={view}
        pageCount={pagePaths.length}
        onPrevious={previous}
        onNext={next}
        fullscreen={fullscreen}
      />
      <p className="text-center text-caption text-muted-foreground max-md:hidden">
        {copy.booklet.keyboardHint}
      </p>
    </section>
  );
}
