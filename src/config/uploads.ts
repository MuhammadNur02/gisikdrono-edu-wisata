// docs/StyleGuide.md §5.6 and docs/Security.md §8.4. The browser checks these for a quick answer;
// api/uploads/sign and api/uploads/finalize enforce them again, so in the browser they are a convenience,
// not the control.
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE_PX = 1600;
// galleries.thumbnail_path (Task P2.9.01).
export const THUMBNAIL_EDGE_PX = 480;
// sharp refuses to decode more pixels than this, so a small file cannot unpack into gigabytes of memory.
// 100 megapixels is above the largest phone photo in common use (108 MP).
export const MAX_IMAGE_INPUT_PIXELS = 100_000_000;

// Booklets are the only PDFs anyone uploads, and only staff do (docs/Security.md §8.4 step 4).
export const BOOKLET_PDF_TYPE = 'application/pdf';
export const MAX_BOOKLET_PDF_BYTES = 50 * 1024 * 1024;

// iPhones save photos as HEIC unless told otherwise; sharp cannot read it, so it gets its own message.
export const HEIF_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
];
export const HEIF_EXTENSIONS = ['.heic', '.heif'];

// The first bytes of a file the browser sends with api/uploads/sign, enough for every signature we check.
export const LEADING_BYTES_LENGTH = 64;

// docs/Security.md §8.4: a signed upload URL is good for five minutes. Supabase Storage keeps the URL itself
// alive for two hours, so finalize refuses a file that arrived later than this after it was signed.
export const SIGNED_UPLOAD_WINDOW_SECONDS = 300;

// docs/Security.md §8.3, per staff member per hour. upload_sign counts api/uploads/sign and each booklet's single
// api/uploads/sign-pages; upload_finalize leaves room for a whole booklet (its PDF and 100 pages) and photos;
// upload_forbidden caps how many refused attempts are recorded one by one (security review of PR #14, L6, L8).
export const UPLOAD_LIMITS_PER_HOUR = {
  upload_sign: 60,
  upload_finalize: 300,
  upload_forbidden: 10,
} as const;

// How long Supabase Storage keeps a signed upload URL alive (measured; supabase-js cannot shorten it). A booklet's
// pages count as being uploaded for this long after they were signed.
export const SIGNED_UPLOAD_TOKEN_SECONDS = 7200;

// What finalize leaves at a quarantine path it has answered for: an empty object, so the two-hour token cannot put
// a new file there (security review of PR #14, L6). Any type the bucket accepts will do.
export const QUARANTINE_TOMBSTONE_TYPE = 'application/pdf';

// Booklet pages go to quarantine this many at a time before any is finalized (security review of PR #14, M2).
export const PAGE_UPLOAD_CONCURRENCY = 4;

// Request bodies of api/uploads/{sign,finalize} are a few small fields.
export const UPLOAD_REQUEST_BODY_LIMIT_BYTES = 2048;

export const QUARANTINE_BUCKET = 'uploads-quarantine';
export const PUBLIC_MEDIA_BUCKET = 'public-media';

// Published files never change under their name (a new upload gets a new name), so browsers and the CDN may
// keep them for a year.
export const PUBLIC_MEDIA_CACHE_SECONDS = 31_536_000;

// What an upload becomes in public-media, one folder per kind (docs/PRD.md §8.8). An entity folder needs
// the id of the row the file belongs to.
export const UPLOAD_PURPOSES = [
  'gallery',
  'hero',
  'product',
  'package',
  'article',
  'activity-point',
  'booklet',
  'booklet-page',
] as const;

// Booklet pages are numbered 0001.webp, 0002.webp … (docs/StyleGuide.md §5.12). A booklet holds at most 100
// pages: api/uploads/sign-pages signs that many at once as one signature (docs/Security.md §8.4, decision of
// 2026-10-18), and finalize refuses a longer PDF.
export const BOOKLET_PAGE_DIGITS = 4;
export const MAX_BOOKLET_PAGES = 100;

// What one booklet scan may cost (security review of PR #14, L2 and N3). The inflate budget is shared by every
// object stream and cross-reference stream of the document; ordinary booklets need a few megabytes at most. Each
// PDF object pdf-lib parses (a number, a name, an array, a dictionary) costs about 65 bytes of heap, so two million
// keep a scan near 150 MB, far above any real booklet's count. The time limit leaves finalize room for the
// download before it and the upload after it within the route's 60 seconds.
export const MAX_PDF_INFLATED_BYTES = 64 * 1024 * 1024;
export const MAX_PDF_PARSED_OBJECTS = 2_000_000;
export const MAX_PDF_SCAN_SECONDS = 20;
// pdf-lib keeps every reference it creates for as long as the process lives, so object numbers are bounded too: a
// 100-page booklet uses a few thousand, and 200,000 keeps the pool under about 30 MB per generation number. 65,535 is
// the largest generation number the format allows (security review of PR #14, follow-up of N3; R21).
export const MAX_PDF_OBJECT_NUMBER = 200_000;
export const MAX_PDF_GENERATION_NUMBER = 65_535;
// The longest name the format allows (PDF 1.7, Annex C), so no name can make the scan's decoding expensive
// (security review of PR #14, F1).
export const MAX_PDF_NAME_BYTES = 127;
// Booklet scans one server process runs at once (security review of PR #14, F2); a function instance serves one
// officer's uploads at a time in practice, so two leave room for a retry without letting scans pile up.
export const MAX_CONCURRENT_PDF_SCANS = 2;

// docs/Security.md §8.4, decision of 2026-10-18: the only link schemes a booklet PDF may carry.
export const BOOKLET_LINK_SCHEMES = ['https:', 'mailto:', 'tel:'];

// galleries.alt_text CHECK (length between 3 and 200).
export const ALT_TEXT_MIN_LENGTH = 3;
export const ALT_TEXT_MAX_LENGTH = 200;
