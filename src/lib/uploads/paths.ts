import { RW_IDS, type RwId } from '@/config/rw';
import { BOOKLET_PAGE_DIGITS, MAX_BOOKLET_PAGES, type UPLOAD_PURPOSES } from '@/config/uploads';
import { uuidV7Time } from '@/lib/utils/uuid-v7';

// Where an upload lives on its way to the public site (docs/PRD.md §8.8). The server names every quarantine
// object itself, so the owner prefix is the RW the officer was allowed to upload for; finalize reads the owner
// back from that path and writes under the same prefix in public-media. api/uploads/sign names an object
// `<owner>/<uuid v7>`; api/uploads/sign-pages names a booklet page `<owner>/<uuid v7>.<booklet id>.<page>.<page
// count>`, so the page it may become is fixed when it is signed and nothing the browser sends can change it
// (docs/Security.md §8.4, decision of 2026-10-18). Both stay one level deep, where the hourly purge looks.

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

// The page of a booklet a quarantine object was signed for.
export interface BookletPageSlot {
  bookletId: string;
  pageNumber: number;
  pageCount: number;
}

export interface QuarantineUpload {
  owner: string;
  // NULL for kelurahan-level content, which only the superadmin uploads.
  rwId: RwId | null;
  objectName: string;
  signedAtMs: number;
  // Set only for objects api/uploads/sign-pages signed.
  page: BookletPageSlot | null;
}

export interface MediaTarget {
  purpose: UploadPurpose;
  // The row the file belongs to, for the purposes that keep one folder per row. A booklet page takes its
  // booklet from its own path instead.
  entityId?: string | undefined;
}

const KELURAHAN_OWNER = 'kelurahan';
const RW_ID_DIGITS = 2;
const THUMBNAIL_SUFFIX = '-thumb';
const PAGE_NAME_SEPARATOR = '.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE_DIGITS = new RegExp(`^\\d{${String(BOOKLET_PAGE_DIGITS)}}$`);

const FOLDER_BY_PURPOSE: Record<UploadPurpose, string> = {
  gallery: 'gallery',
  hero: 'hero',
  product: 'products',
  package: 'packages',
  article: 'articles',
  'activity-point': 'activity-points',
  booklet: 'booklets',
  'booklet-page': 'booklets',
};

const ENTITY_PURPOSES: ReadonlySet<UploadPurpose> = new Set([
  'product',
  'package',
  'article',
  'activity-point',
  'booklet',
]);

export function ownerFor(rwId: RwId | null): string {
  return rwId === null ? KELURAHAN_OWNER : `rw-${String(rwId).padStart(RW_ID_DIGITS, '0')}`;
}

// Every prefix a quarantine object can sit under: rw-05, rw-08 and kelurahan.
export const MEDIA_OWNERS: readonly string[] = [...RW_IDS.map(ownerFor), KELURAHAN_OWNER];

function rwIdOfOwner(owner: string): RwId | null | undefined {
  if (owner === KELURAHAN_OWNER) return null;
  return RW_IDS.find((rwId) => ownerFor(rwId) === owner);
}

function pageDigits(value: number): string {
  return String(value).padStart(BOOKLET_PAGE_DIGITS, '0');
}

export function quarantinePathFor(rwId: RwId | null, objectName: string): string {
  return `${ownerFor(rwId)}/${objectName}`;
}

export function bookletPageObjectName(uuid: string, slot: BookletPageSlot): string {
  const { bookletId, pageNumber, pageCount } = slot;
  return [uuid, bookletId, pageDigits(pageNumber), pageDigits(pageCount)].join(PAGE_NAME_SEPARATOR);
}

function isPageName(bookletId: string, pageText: string, countText: string): boolean {
  return UUID.test(bookletId) && PAGE_DIGITS.test(pageText) && PAGE_DIGITS.test(countText);
}

// A page slot only within its own booklet: from 1 to the page count, which is at most 100.
function parsePageSlot(parts: string[]): BookletPageSlot | null {
  const [bookletId = '', pageText = '', countText = '', ...rest] = parts;
  if (rest.length > 0 || !isPageName(bookletId, pageText, countText)) return null;
  const pageNumber = Number(pageText);
  const pageCount = Number(countText);
  const isInBooklet = pageNumber >= 1 && pageNumber <= pageCount && pageCount <= MAX_BOOKLET_PAGES;
  return isInBooklet ? { bookletId, pageNumber, pageCount } : null;
}

// Anything but exactly a name the server issues under a known owner is refused, so no caller can point
// finalize at another prefix, another bucket path, a `..` segment or a page outside its booklet.
export function parseQuarantinePath(path: string): QuarantineUpload | null {
  const [owner = '', objectName = '', ...rest] = path.split('/');
  const [uuid = '', ...pageParts] = objectName.split(PAGE_NAME_SEPARATOR);
  const rwId = rwIdOfOwner(owner);
  const signedAtMs = uuidV7Time(uuid);
  if (rest.length > 0 || rwId === undefined || signedAtMs === null) return null;
  if (pageParts.length === 0) return { owner, rwId, objectName, signedAtMs, page: null };
  const page = parsePageSlot(pageParts);
  return page ? { owner, rwId, objectName, signedAtMs, page } : null;
}

export function isPdfPurpose(purpose: UploadPurpose): boolean {
  return purpose === 'booklet';
}

// A booklet page comes only from api/uploads/sign-pages and only becomes a page; hero banners are kelurahan
// content and activity points always belong to an RW (activity_points.rw_id NOT NULL); entity folders need
// their row's id.
export function isTargetAllowed(upload: QuarantineUpload, target: MediaTarget): boolean {
  if (target.purpose === 'booklet-page')
    return upload.page !== null && target.entityId === undefined;
  if (upload.page !== null) return false;
  if (target.purpose === 'hero' && upload.rwId !== null) return false;
  if (target.purpose === 'activity-point' && upload.rwId === null) return false;
  return ENTITY_PURPOSES.has(target.purpose) === (target.entityId !== undefined);
}

export function bookletPageFileName(pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_BOOKLET_PAGES) {
    throw new RangeError('booklet page number out of range');
  }
  return `${pageDigits(pageNumber)}.webp`;
}

// The flipbook's pages in order, from booklets.page_images_prefix and page_count; none until both are set.
export function bookletPagePaths(prefix: string | null, pageCount: number | null): string[] {
  if (!prefix || !pageCount || pageCount < 1) return [];
  const folder = prefix.replace(/\/+$/, '');
  const count = Math.min(pageCount, MAX_BOOKLET_PAGES);
  return Array.from({ length: count }, (_, index) => `${folder}/${bookletPageFileName(index + 1)}`);
}

function bookletFolder(owner: string, bookletId: string): string {
  return `${owner}/${FOLDER_BY_PURPOSE.booklet}/${bookletId}`;
}

// Where finalize published a booklet's PDF; api/uploads/sign-pages counts the pages of that file.
export function bookletPdfPath(rwId: RwId | null, bookletId: string): string {
  return `${bookletFolder(ownerFor(rwId), bookletId)}/booklet.pdf`;
}

export function bookletPagesFolder(rwId: RwId | null, bookletId: string): string {
  return `${bookletFolder(ownerFor(rwId), bookletId)}/pages`;
}

// The public-media path a finalised upload is written to. Every image gets the quarantine object's own
// name, so a new upload never lands on a published file; a booklet keeps one PDF and one page set per row.
export function publicMediaPathFor(upload: QuarantineUpload, target: MediaTarget): string {
  if (target.purpose === 'booklet-page') {
    if (!upload.page) throw new RangeError('only a signed booklet page becomes a booklet page');
    const pagesFolder = `${bookletFolder(upload.owner, upload.page.bookletId)}/pages`;
    return `${pagesFolder}/${bookletPageFileName(upload.page.pageNumber)}`;
  }
  const folder = `${upload.owner}/${FOLDER_BY_PURPOSE[target.purpose]}`;
  const entityFolder = target.entityId === undefined ? folder : `${folder}/${target.entityId}`;
  if (target.purpose === 'booklet') return `${entityFolder}/booklet.pdf`;
  return `${entityFolder}/${upload.objectName}.webp`;
}

export function thumbnailPathFor(imagePath: string): string {
  return imagePath.replace(/\.webp$/, `${THUMBNAIL_SUFFIX}.webp`);
}

const PUBLISHED_IMAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-thumb)?\.webp$/;

// Whether a path is a photo finalize published for this owner and purpose (and row): `<owner>/<folder>[/<row>]/<uuid
// v7>.webp` or its `-thumb` copy. A CMS row may point only at such a file, so an officer cannot hang another RW's
// photo, or a file of another kind, on their own content (Task P2.9.05).
export function isPublishedImagePathFor(
  path: string,
  target: MediaTarget & { rwId: RwId | null },
): boolean {
  const folder = `${ownerFor(target.rwId)}/${FOLDER_BY_PURPOSE[target.purpose]}`;
  const entityFolder = target.entityId === undefined ? folder : `${folder}/${target.entityId}`;
  if (!path.startsWith(`${entityFolder}/`)) return false;
  return PUBLISHED_IMAGE_NAME.test(path.slice(entityFolder.length + 1));
}

// A booklet's first page is its cover: the flipbook draws every page, so no second upload is needed for it.
export function bookletCoverPath(rwId: RwId | null, bookletId: string): string {
  return `${bookletPagesFolder(rwId, bookletId)}/${bookletPageFileName(1)}`;
}
