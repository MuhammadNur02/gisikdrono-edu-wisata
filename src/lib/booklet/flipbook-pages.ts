import type { FlipOrientation } from 'page-flip';

import { IMAGE_DEVICE_WIDTHS } from '@/config/images';
import { copy } from '@/lib/copy/id';
import supabaseImageLoader from '@/lib/images/supabase-loader';

// The page elements page-flip turns. The library moves them into its own wrapper and removes them on
// destroy, so they are built here with the DOM rather than rendered by React, which never owns them.

// A page is at most half the 1280 px container, or the whole screen below md (docs/StyleGuide.md §5.12).
const PAGE_SIZES = '(min-width: 1280px) 640px, (min-width: 48rem) 50vw, 100vw';
// The page on screen plus the two either side are fetched (StyleGuide §5.12: preload the neighbours).
const PAGES_AROUND = 2;
const PAGE_CLASSES = 'bg-white';
const IMAGE_CLASSES = 'block size-full object-contain select-none';

export interface VisiblePages {
  // Zero-based, both ends included; the same page twice on a single page or the lone cover.
  first: number;
  last: number;
}

function srcSetFor(path: string): string {
  return IMAGE_DEVICE_WIDTHS.map(
    (width) => `${supabaseImageLoader({ src: path, width })} ${String(width)}w`,
  ).join(', ');
}

export function createPageElement(pageNumber: number): HTMLElement {
  const page = document.createElement('div');
  page.className = PAGE_CLASSES;
  const image = document.createElement('img');
  image.className = IMAGE_CLASSES;
  image.alt = copy.booklet.page(pageNumber);
  image.decoding = 'async';
  image.draggable = false;
  page.append(image);
  return page;
}

// Gives the pages around `index` their source; a page already given one keeps it.
export function loadPagesAround(pages: HTMLElement[], paths: string[], index: number): void {
  const from = Math.max(0, index - PAGES_AROUND);
  const to = Math.min(pages.length - 1, index + PAGES_AROUND + 1);
  for (let pageIndex = from; pageIndex <= to; pageIndex += 1) {
    const image = pages[pageIndex]?.querySelector('img');
    const path = paths[pageIndex];
    if (!image || path === undefined || image.srcset) continue;
    image.sizes = PAGE_SIZES;
    image.srcset = srcSetFor(path);
  }
}

// The book needs the page proportions before it is laid out, and no page size is stored, so the first page is
// measured from its smallest rendition.
const PROBE_WIDTH = 320;

export function probeUrlFor(path: string): string {
  return supabaseImageLoader({ src: path, width: PROBE_WIDTH });
}

// With the cover alone on the right (showCover), a spread starts at an odd index; the last page of an even
// count stands alone again.
export function visiblePagesAt(
  index: number,
  orientation: FlipOrientation,
  pageCount: number,
): VisiblePages {
  if (orientation === 'portrait' || index === 0) return { first: index, last: index };
  return { first: index, last: Math.min(index + 1, pageCount - 1) };
}
