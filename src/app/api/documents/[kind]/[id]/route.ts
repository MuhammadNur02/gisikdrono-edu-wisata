import { z } from 'zod';

import { RATE_LIMITS } from '@/config/rate-limits';
import { copy } from '@/lib/copy/id';
import { publicMediaUrl } from '@/lib/images/public-media';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { getBookletDownload } from '@/lib/queries/booklets';
import { clientIpFrom } from '@/lib/utils/client-ip';
import {
  countBookletDownload,
  withinBookletDownloadLimit,
} from '@/server/services/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// The booking documents of Task P3.6.04 (quotation, invoice, receipt, certificate) join this route later;
// until then only the public booklet kind exists and every other kind is unknown.
const BOOKLET_KIND = 'booklet';
const PUBLIC_MEDIA_DOWNLOAD_PARAM = 'download';
const HTTP_STATUS = { found: 302, notFound: 404, tooManyRequests: 429, unavailable: 503 } as const;

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
} as const;

const bookletIdSchema = z.uuid();

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

// `?download=<name>` makes Supabase Storage answer with Content-Disposition: attachment, so the browser saves
// the PDF instead of opening it on the storage origin (docs/StyleGuide.md §5.12).
function attachmentUrl(pdfPath: string, slug: string): string {
  const url = new URL(publicMediaUrl(pdfPath));
  url.searchParams.set(PUBLIC_MEDIA_DOWNLOAD_PARAM, `${slug}.pdf`);
  return url.toString();
}

// docs/PRD.md FR-PUB-07, Task P2.4.08: "Unduh PDF" of a published booklet. Public and session-free; limited to
// 30 per minute per IP before anything is looked up; the download is counted through the service role and
// the visitor is sent on to the public-media file with a 302.
export async function GET(request: Request, context: DocumentRouteContext): Promise<Response> {
  const { kind, id } = await context.params;
  const parsedId = bookletIdSchema.safeParse(id);
  if (kind !== BOOKLET_KIND || !parsedId.success) return notFound();

  const log = createLogger(requestIdFrom(request.headers));
  try {
    if (!(await withinBookletDownloadLimit(clientIpFrom(request.headers)))) {
      log.info('rate_limited', { limit: 'booklet:download' });
      const retryAfter = String(RATE_LIMITS['booklet:download'].windowSeconds);
      return plainResponse(HTTP_STATUS.tooManyRequests, copy.errors.RATE_LIMITED, {
        'Retry-After': retryAfter,
      });
    }
    const booklet = await getBookletDownload(parsedId.data);
    if (!booklet) return notFound();
    await countBookletDownload(booklet.id);
    return new Response(null, {
      status: HTTP_STATUS.found,
      headers: { ...NO_STORE_HEADERS, Location: attachmentUrl(booklet.pdfPath, booklet.slug) },
    });
  } catch {
    // The database is the only thing here that fails; 503 tells the visitor to try again shortly.
    log.error('internal_error', { route: 'documents/booklet', bookletId: parsedId.data });
    return plainResponse(HTTP_STATUS.unavailable, copy.errors.INTERNAL);
  }
}
