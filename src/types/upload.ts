// The JSON contracts of api/uploads/sign and api/uploads/finalize (docs/Security.md §8.4). Both answer with
// an ActionResult, so a refused file comes back as { ok: false, error: { code, message } } with the
// Indonesian message the uploader shows.

export type UploadKind = 'image' | 'pdf';

// Why a file was refused; each has its own message in copy.uploads and is the reason recorded in the
// upload_rejected security event.
export type UploadProblem =
  | 'svg'
  | 'heic'
  | 'type'
  | 'wrong_kind'
  | 'image_size'
  | 'pdf_size'
  | 'late'
  | 'missing'
  | 'unreadable'
  | 'pdf_encrypted'
  | 'pdf_active_content'
  | 'pdf_link'
  | 'pdf_too_many_pages'
  | 'pdf_too_complex'
  | 'booklet_missing'
  | 'already_used'
  | 'booklet_pages_exist'
  | 'booklet_pages_in_progress';

// Where the browser puts the file: uploadToSignedUrl(path, token, file) on uploads-quarantine.
export interface SignedUpload {
  path: string;
  token: string;
}

// What api/uploads/sign-pages answers: one signed URL for each page of a booklet whose PDF finalize has
// published, in page order. The page number and the page count are part of each path.
export interface SignedBookletPages {
  pageCount: number;
  pages: (SignedUpload & { pageNumber: number })[];
}

export interface FinalizedImage {
  kind: 'image';
  path: string;
  width: number;
  height: number;
  blurhash: string;
  // The 480 px copy galleries list (galleries.thumbnail_path); null for every other purpose.
  thumbnailPath: string | null;
}

export interface FinalizedPdf {
  kind: 'pdf';
  path: string;
  pageCount: number;
  fileSizeBytes: number;
}

export type FinalizedUpload = FinalizedImage | FinalizedPdf;
