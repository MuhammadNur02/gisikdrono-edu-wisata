'use client';

import { PageFlip, type FlipOrientation } from 'page-flip';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import {
  createPageElement,
  loadPagesAround,
  probeUrlFor,
  visiblePagesAt,
  type VisiblePages,
} from '@/lib/booklet/flipbook-pages';
import { duration } from '@/lib/motion/transitions';

// Below md the book shows one page (docs/StyleGuide.md §5.12). page-flip switches to a single page when the
// book is narrower than two minimum pages, and at md the page container is 720 px wide (768 minus its 24 px
// gutters), so a minimum page of 360 px puts the switch exactly there.
const MIN_PAGE_WIDTH_PX = 360;
const MAX_PAGE_WIDTH_PX = 1600;
// A page whose first image fails to load is laid out as A4 portrait, the usual booklet.
const A4_SIZE_MM = { width: 210, height: 297 } as const;
const A4_RATIO = A4_SIZE_MM.width / A4_SIZE_MM.height;
const MS_PER_SECOND = 1000;
const SHADOW_OPACITY = 0.4;

export interface FlipBookView extends VisiblePages {
  orientation: FlipOrientation;
}

// Width over height of the first page, or null while it loads.
export function usePageRatio(firstPagePath: string): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    const probe = new Image();
    probe.onload = () => {
      setRatio(probe.naturalWidth / probe.naturalHeight || A4_RATIO);
    };
    probe.onerror = () => {
      setRatio(A4_RATIO);
    };
    probe.src = probeUrlFor(firstPagePath);
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [firstPagePath]);
  return ratio;
}

function createBook(block: HTMLElement, ratio: number, reducedMotion: boolean): PageFlip {
  return new PageFlip(block, {
    size: 'stretch',
    width: MAX_PAGE_WIDTH_PX * ratio,
    height: MAX_PAGE_WIDTH_PX,
    minWidth: MIN_PAGE_WIDTH_PX,
    maxWidth: MAX_PAGE_WIDTH_PX,
    showCover: true,
    usePortrait: true,
    autoSize: true,
    mobileScrollSupport: true,
    maxShadowOpacity: SHADOW_OPACITY,
    flippingTime: reducedMotion ? 1 : duration.max * MS_PER_SECOND,
  });
}

// Mounts page-flip inside `host` for as long as the component lives and reports which pages are open.
export function useFlipBook(
  host: RefObject<HTMLDivElement | null>,
  paths: string[],
  ratio: number | null,
  reducedMotion: boolean,
) {
  const book = useRef<PageFlip | null>(null);
  const [view, setView] = useState<FlipBookView | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container || ratio === null) return;
    const block = document.createElement('div');
    container.append(block);
    const pages = paths.map((_, index) => createPageElement(index + 1));
    const flipBook = createBook(block, ratio, reducedMotion);
    const show = (index: number, orientation: FlipOrientation) => {
      loadPagesAround(pages, paths, index);
      setView({ ...visiblePagesAt(index, orientation, paths.length), orientation });
    };
    flipBook.on('init', (event) => {
      show(event.data.page, event.data.mode);
    });
    flipBook.on('flip', (event) => {
      show(event.data, flipBook.getOrientation());
    });
    flipBook.on('changeOrientation', (event) => {
      show(flipBook.getCurrentPageIndex(), event.data);
    });
    flipBook.loadFromHTML(pages);
    // page-flip sets the minimum width of two pages on its block, wider than a 360 px phone.
    block.style.minWidth = '';
    book.current = flipBook;
    return () => {
      flipBook.destroy();
      book.current = null;
    };
  }, [host, paths, ratio, reducedMotion]);

  return { view, ...useTurns(book, view, paths.length, reducedMotion) };
}

function useTurns(
  book: RefObject<PageFlip | null>,
  view: FlipBookView | null,
  pageCount: number,
  reducedMotion: boolean,
) {
  const next = useCallback(() => {
    if (!view || view.last >= pageCount - 1) return;
    if (reducedMotion) book.current?.turnToPage(view.last + 1);
    else book.current?.flipNext();
  }, [book, view, pageCount, reducedMotion]);

  const previous = useCallback(() => {
    if (!view || view.first <= 0) return;
    if (reducedMotion) book.current?.turnToPage(view.first - 1);
    else book.current?.flipPrev();
  }, [book, view, reducedMotion]);

  return { next, previous };
}
