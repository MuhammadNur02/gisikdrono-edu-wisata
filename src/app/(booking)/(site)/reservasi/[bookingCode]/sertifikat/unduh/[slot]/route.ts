import { CERTIFICATE_PAGE, GUEST_BOOKING_PATH } from '@/config/guest';
import { RATE_LIMITS } from '@/config/rate-limits';
import { copy } from '@/lib/copy/id';
import { AppError } from '@/lib/errors';
import { createLogger, requestIdFrom } from '@/lib/logger';
import { parseCertificateSlot, type CertificateSlot } from '@/lib/utils/certificate-slots';
import { clientIpFrom } from '@/lib/utils/client-ip';
import {
  DOCUMENT_HTTP_STATUS as HTTP_STATUS,
  NO_STORE_HEADERS,
  pdfResponse,
  plainResponse,
} from '@/lib/utils/document-response';
import { requireGuestToken } from '@/server/auth/guards';
import { hasCertificateProof } from '@/server/auth/guest-cookies';
import type { GuestAccess } from '@/server/services/booking-service';
import {
  guestCertificateDownload,
  withinCertificateDownloadLimits,
} from '@/server/services/document-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A whole class may be rendered on this request (docs/Security.md §10.4).
export const maxDuration = 60;

// /reservasi/[bookingCode]/sertifikat/unduh/[slot] (review of PR #94, M1; docs/PRD.md FR-POST-02; docs/Security.md
// §10.3, DOC-02): a certificate of the page, or every participant's as one PDF, rendered on this request when it has no
// kept file and streamed inline, private and no-store. It sits under the page so the browser sends the certificate
// link's cookie and the proof's. Every refusal is the page's own 404, except a name still waiting for the step-up,
// which goes back to the page to type the digits, and the limits' 429.

type RequestLog = ReturnType<typeof createLogger>;

interface DownloadRouteContext {
  params: Promise<{ bookingCode: string; slot: string }>;
}

const notFound = () => plainResponse(HTTP_STATUS.notFound, copy.errors.NOT_FOUND);

function tooManyRequests(limit: keyof typeof RATE_LIMITS, log: RequestLog): Response {
  log.info('rate_limited', { limit });
  return plainResponse(HTTP_STATUS.tooManyRequests, copy.errors.RATE_LIMITED, {
    'Retry-After': String(RATE_LIMITS[limit].windowSeconds),
  });
}

function backToPage(request: Request, bookingCode: string): Response {
  const page = new URL(`${GUEST_BOOKING_PATH}/${bookingCode}/${CERTIFICATE_PAGE}`, request.url);
  return new Response(null, {
    status: HTTP_STATUS.seeOther,
    headers: { ...NO_STORE_HEADERS, Location: page.toString() },
  });
}

async function download(
  request: Request,
  guest: GuestAccess,
  slot: CertificateSlot,
  clientIp: string,
): Promise<Response> {
  try {
    const file = await guestCertificateDownload({
      bookingId: guest.bookingId,
      bookingCode: guest.bookingCode,
      slot,
      hasPhoneProof: await hasCertificateProof(guest),
      clientIp,
    });
    return pdfResponse(file.fileName, file.pdf);
  } catch (error) {
    if (error instanceof AppError && error.code === 'FORBIDDEN') return backToPage(request, guest.bookingCode);
    if (error instanceof AppError && error.code === 'NOT_FOUND') return notFound();
    throw error;
  }
}

export async function GET(request: Request, context: DownloadRouteContext): Promise<Response> {
  const { bookingCode, slot: slotText } = await context.params;
  const slot = parseCertificateSlot(slotText);
  if (slot === null) return notFound();

  const log = createLogger(requestIdFrom(request.headers));
  const clientIp = clientIpFrom(request.headers);
  try {
    if (!(await withinCertificateDownloadLimits({ clientIp, bookingId: null, slot }))) {
      return tooManyRequests('certificate_download:ip', log);
    }
    const guard = await requireGuestToken(bookingCode, 'certificate');
    if (!guard.ok) return notFound();
    const bookingId = guard.guest.bookingId;
    if (!(await withinCertificateDownloadLimits({ clientIp, bookingId, slot }))) {
      return tooManyRequests(
        slot.kind === 'all_participants' ? 'certificate_bundle:booking' : 'certificate_download:booking',
        log,
      );
    }
    return await download(request, guard.guest, slot, clientIp);
  } catch {
    // The database and the renderer are what fails here; 503 tells the visitor to try again shortly.
    log.error('internal_error', { route: 'reservasi/sertifikat/unduh', slot: slotText });
    return plainResponse(HTTP_STATUS.unavailable, copy.errors.INTERNAL);
  }
}
