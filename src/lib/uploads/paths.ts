import { RW_IDS, type RwId } from '@/config/rw';
import { BOOKLET_PAGE_DIGITS, MAX_BOOKLET_PAGES, type UPLOAD_PURPOSES } from '@/config/uploads';
import { uuidV7Time } from '@/lib/utils/uuid-v7';

// Where an upload lives on its way to the public site (docs/PRD.md §8.8). api/uploads/sign names the
// quarantine object itself, `<owner>/<uuid v7>`, so the owner prefix is the RW the officer was allowed to
// upload for; finalize reads the owner back from that path and writes under the same prefix in public-media.

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export interface QuarantineUpload {
  owner: string;
  // NULL for kelurahan-level content, which only the superadmin uploads.
  rwId: RwId | null;
  objectName: string;
  signedAtMs: number;
}

export interface MediaTarget {
  purpose: UploadPurpose;
  // The row the file belongs to, for the purposes that keep one folder per row.
  entityId?: string | undefined;
  pageNumber?: number | undefined;
}

const KELURAHAN_OWNER = 'kelurahan';
const RW_ID_DIGITS = 2;
const THUMBNAIL_SUFFIX = '-thumb';

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
  'booklet-page',
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

export function quarantinePathFor(rwId: RwId | null, objectName: string): string {
  return `${ownerFor(rwId)}/${objectName}`;
}

// Anything but exactly `<owner>/<uuid v7>` is refused, so no caller can point finalize at another
// prefix, another bucket path or a `..` segment.
export function parseQuarantinePath(path: string): QuarantineUpload | null {
  const [owner = '', objectName = '', ...rest] = path.split('/');
  const rwId = rwIdOfOwner(owner);
  const signedAtMs = uuidV7Time(objectName);
  if (rest.length > 0 || rwId === undefined || signedAtMs === null) return null;
  return { owner, rwId, objectName, signedAtMs };
}

export function isPdfPurpose(purpose: UploadPurpose): boolean {
  return purpose === 'booklet';
}

// Hero banners are kelurahan content and activity points always belong to an RW (activity_points.rw_id
// NOT NULL); entity folders need their row's id, booklet pages their number.
export function isTargetAllowed(upload: QuarantineUpload, target: MediaTarget): boolean {
  if (target.purpose === 'hero' && upload.rwId !== null) return false;
  if (target.purpose === 'activity-point' && upload.rwId === null) return false;
  if (ENTITY_PURPOSES.has(target.purpose) !== (target.entityId !== undefined)) return false;
  return (target.purpose === 'booklet-page') === (target.pageNumber !== undefined);
}

export function bookletPageFileName(pageNumber: number): string {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_BOOKLET_PAGES) {
    throw new RangeError('booklet page number out of range');
  }
  return `${String(pageNumber).padStart(BOOKLET_PAGE_DIGITS, '0')}.webp`;
}

// The public-media path a finalised upload is written to. Every image gets the quarantine object's own
// name, so a new upload never lands on a published file; a booklet keeps one PDF and one page set per row.
export function publicMediaPathFor(upload: QuarantineUpload, target: MediaTarget): string {
  const folder = `${upload.owner}/${FOLDER_BY_PURPOSE[target.purpose]}`;
  const entityFolder = target.entityId === undefined ? folder : `${folder}/${target.entityId}`;
  if (target.purpose === 'booklet') return `${entityFolder}/booklet.pdf`;
  if (target.purpose === 'booklet-page') {
    return `${entityFolder}/pages/${bookletPageFileName(target.pageNumber ?? 0)}`;
  }
  return `${entityFolder}/${upload.objectName}.webp`;
}

export function thumbnailPathFor(imagePath: string): string {
  return imagePath.replace(/\.webp$/, `${THUMBNAIL_SUFFIX}.webp`);
}
