import { z } from 'zod';

import { RATE_LIMITS } from '@/config/rate-limits';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { getBookletDownload } from '@/lib/queries/booklets';
import { clientIpFrom } from '@/lib/utils/client-ip';
import { requireDocumentReader } from '@/server/auth/document-access';
import {
  BOOKING_DOCUMENT_KINDS,
  documentFileName,
  type BookingDocument,
  type BookingDocumentKind,
} from '@/server/services/booking-documents';
import {
  bookingDocumentFile,
  countBookletDownload,
  readBookingDocument,
  withinBookletDownloadLimit,
  withinDocumentLimits,
} from '@/server/services/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A booking document may be rendered on this request (docs/Security.md §10.4).
export const maxDuration = 60;

// Two families of documents: the public booklet of Task P2.4.08, counted and redirected to public-media, and a
// booking's own quotation, invoice or receipt of Task P3.6.04, rendered for its authorised reader and streamed inline.
// Certificates (Task P4.5) join the second family later.
const BOOKLET_KIND = 'booklet';
const PUBLIC_MEDIA_DOWNLOAD_PARAM = 'download';
const HTTP_STATUS = {
  ok: 200,
  found: 302,
  notFound: 404,
  tooManyRequests: 429,
  unavailable: 503,
} as const;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
} as const;

const idSchema = z.uuid();

type RequestLog = ReturnType<typeof createLogger>;

interface DocumentRouteContext {
  params: Promise<{ kind: string; id: string }>;
}

function plainResponse(status: number, text: string, headers: Record<string, string> = {}) {
  return new Response(text, {
    status,
    headers: { ...NO_STORE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

const notFound = () => plainResponse(HTTP_STATUS.notFound, copy.errors.NOT_FOUND);

function tooManyRequests(limit: keyof typeof RATE_LIMITS, log: RequestLog) {
  log.info('rate_limited', { limit });
  return plainResponse(HTTP_STATUS.tooManyRequests, copy.errors.RATE_LIMITED, {
    'Retry-After': String(RATE_LIMITS[limit].windowSeconds),
  });
}

// `?download=<name>` makes Supabase Storage answer with Content-Disposition: attachment, so the browser saves
// the PDF instead of opening it on the storage origin (docs/StyleGuide.md §5.12).
function attachmentUrl(pdfPath: string, slug: string): string {
  const url = new URL(publicMediaUrl(pdfPath));
  url.searchParams.set(PUBLIC_MEDIA_DOWNLOAD_PARAM, `${slug}.pdf`);
  return url.toString();
}

// docs/PRD.md FR-PUB-07: "Unduh PDF" of a published booklet. Public and session-free; limited to 30 per minute per
// IP before anything is looked up; the download is counted through the service role and the visitor is sent on to
// the public-media file with a 302.
async function bookletDownload(id: string, clientIp: string, log: RequestLog): Promise<Response> {
  if (!(await withinBookletDownloadLimit(clientIp)))
    return tooManyRequests('booklet:download', log);
  const booklet = await getBookletDownload(id);
  if (!booklet) return notFound();
  await countBookletDownload(booklet.id);
  return new Response(null, {
    status: HTTP_STATUS.found,
    headers: { ...NO_STORE_HEADERS, Location: attachmentUrl(booklet.pdfPath, booklet.slug) },
  });
}

function isBookingDocumentKind(kind: string): kind is BookingDocumentKind {
  return (BOOKING_DOCUMENT_KINDS as readonly string[]).includes(kind);
}

function pdfResponse(document: BookingDocument, pdf: Buffer): Response {
  return new Response(new Uint8Array(pdf), {
    status: HTTP_STATUS.ok,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${documentFileName(document)}"`,
      'Content-Length': String(pdf.length),
    },
  });
}

// The per-IP limit first, then the row, then the booking's own limit and the reader's right to it. Past the IP limit
// the answer is 429, the same for every id; every refusal after the row is read is the same 404, the booking's limit
// included, so a known id cannot be told apart from an unknown one (docs/Security.md DOC-01; review of PR #33, 6).
async function bookingDocument(
  kind: BookingDocumentKind,
  id: string,
  clientIp: string,
  log: RequestLog,
): Promise<Response> {
  if (!(await withinDocumentLimits(clientIp, null))) return tooManyRequests('document:ip', log);
  const document = await readBookingDocument(kind, id);
  if (!document) return notFound();
  if (!(await withinDocumentLimits(clientIp, document.bookingId))) {
    log.info('rate_limited', { limit: 'document:booking' });
    return notFound();
  }
  const table = kind === 'quotation' ? 'quotations' : 'invoices';
  const reader = await requireDocumentReader(table, document.id, document.bookingCode);
  if (!reader.ok) return notFound();
  const readerId = reader.reader === 'staff' ? reader.userId : null;
  return pdfResponse(document, await bookingDocumentFile(document, readerId));
}

export async function GET(request: Request, context: DocumentRouteContext): Promise<Response> {
  const { kind, id } = await context.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || (kind !== BOOKLET_KIND && !isBookingDocumentKind(kind)))
    return notFound();

  const log = createLogger(requestIdFrom(request.headers));
  const clientIp = clientIpFrom(request.headers);
  try {
    if (kind === BOOKLET_KIND) return await bookletDownload(parsedId.data, clientIp, log);
    return await bookingDocument(kind, parsedId.data, clientIp, log);
  } catch {
    // The database and the renderer are what fails here; 503 tells the reader to try again shortly.
    log.error('internal_error', { route: `documents/${kind}`, documentId: parsedId.data });
    return plainResponse(HTTP_STATUS.unavailable, copy.errors.INTERNAL);
  }
}
