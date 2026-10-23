import { GALLERY_MAX_PAGES, isGalleryFilter, type GalleryFilterValue } from '@/config/gallery';
import { PUBLIC_PATHS } from '@/lib/utils/paths';

// /galeri reads `?filter=` and `?halaman=` from the URL (docs/StyleGuide.md §5.11, decision of 2026-10-18).
// Anything that is not a value the page would link to itself is redirected to the nearest one that is, so a
// hand-typed `?halaman=99999` or `?halaman=abc` never reaches a query.

export interface GallerySearch {
  filter: GalleryFilterValue | null;
  // 1-based; the page shows every page up to this one.
  page: number;
}

type SearchValue = string | string[] | undefined;

export interface GallerySearchParams {
  filter?: SearchValue;
  halaman?: SearchValue;
}

export interface ReadGallerySearch {
  search: GallerySearch;
  // False when the URL said something else, or said it differently, than `galleryPath(search)`.
  isCanonical: boolean;
}

const PAGE_NUMBER_PATTERN = /^\d+$/;

function readFilter(raw: SearchValue): { value: GalleryFilterValue | null; isCanonical: boolean } {
  if (raw === undefined) return { value: null, isCanonical: true };
  if (typeof raw === 'string' && isGalleryFilter(raw)) return { value: raw, isCanonical: true };
  return { value: null, isCanonical: false };
}

function readPage(raw: SearchValue): { value: number; isCanonical: boolean } {
  if (raw === undefined) return { value: 1, isCanonical: true };
  if (typeof raw !== 'string' || !PAGE_NUMBER_PATTERN.test(raw)) {
    return { value: 1, isCanonical: false };
  }
  const requested = Number(raw);
  const value = Math.min(Math.max(requested, 1), GALLERY_MAX_PAGES);
  // `?halaman=1` and `?halaman=02` say the same as a shorter address, which is the canonical one.
  return { value, isCanonical: value === requested && value > 1 && raw === String(value) };
}

export function readGallerySearch(params: GallerySearchParams): ReadGallerySearch {
  const filter = readFilter(params.filter);
  const page = readPage(params.halaman);
  return {
    search: { filter: filter.value, page: page.value },
    isCanonical: filter.isCanonical && page.isCanonical,
  };
}

function readParam(query: URLSearchParams, name: string): SearchValue {
  const values = query.getAll(name);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

// For src/middleware.ts: the address to send a malformed /galeri request to before anything renders, or NULL
// when it is already one the page links to. The page answers the rest (an RW that is not online, a page past the
// last) with its own 307: it sits in (public)/(rows), under no loading boundary, so nothing has streamed by then
// (Task P5.6.05).
export function canonicalGalleryPathFor(query: URLSearchParams): string | null {
  const { search, isCanonical } = readGallerySearch({
    filter: readParam(query, 'filter'),
    halaman: readParam(query, 'halaman'),
  });
  return isCanonical ? null : galleryPath(search);
}

export function galleryPath({ filter, page }: GallerySearch): string {
  const query = new URLSearchParams();
  if (filter !== null) query.set('filter', filter);
  if (page > 1) query.set('halaman', String(page));
  const queryString = query.toString();
  return queryString === '' ? PUBLIC_PATHS.gallery : `${PUBLIC_PATHS.gallery}?${queryString}`;
}

// The id of each gallery tile, counted from 1 like the photos a visitor sees, so `Muat lagi` can jump to the
// first new one.
export function galleryItemAnchor(position: number): string {
  return `foto-${String(position)}`;
}
