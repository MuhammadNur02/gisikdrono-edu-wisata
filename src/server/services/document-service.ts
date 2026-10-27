import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { svcIncrementBookletDownload } from '@/db/rpc';
import { revealFinanceEvidence } from '@/db/rpc-finance';
import type { Database } from '@/db/types';
import { AppError } from '@/lib/errors';
import { pepperedHash } from '@/lib/pepper';
import { publicEnv } from '@/lib/public-env';
import { getPublicSiteSettings } from '@/lib/queries/settings';
import { withinRateLimits } from '@/lib/rate-limit';
// See withinBookletDownloadLimit for why this module creates a service-role client.
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CertificateSlot } from '@/lib/utils/certificate-slots';
import { rateLimitIpBucket } from '@/lib/utils/client-ip';
import { todayInJakarta } from '@/lib/utils/dates';
import type { StaffContext } from '@/server/auth/guards';
import {
  bookingDocumentPdf,
  loadBookingDocument,
  lookupVerifyCode,
  type BookingDocument,
  type BookingDocumentKind,
} from '@/server/services/booking-documents';
import { restrictedDocumentPdf } from '@/server/services/booking-documents-restricted';
import {
  certificatePdf,
  loadCertificate,
  rerenderBookingCertificates,
} from '@/server/services/certificate-documents';
import type { CertificateRow } from '@/server/services/certificate-pages';
import {
  SIGNED_URL_TTL_SECONDS,
  type SignedDocumentKind,
} from '@/server/services/document-paths';
import { createDocumentSignedUrl } from '@/server/services/document-urls';
import {
  removeFinanceDocument,
  storeFinanceDocument,
  type StoredDocument,
} from '@/server/services/finance-documents';
import { asFinanceWrite } from '@/server/services/finance-errors';
import {
  guestCertificateFile,
  type GuestCertificateFile,
} from '@/server/services/guest-certificate-downloads';
import {
  loadGuestCertificates,
  stepUpCertificatePhone,
  type PhoneStepUp,
} from '@/server/services/guest-certificates';
import {
  keptTicketPdfPath,
  loadTicketDocument,
  ticketDocumentPdf,
  type TicketDocument,
} from '@/server/services/ticket-documents';
import { withinUploadLimit } from '@/server/services/upload-events';
import type { GuestCertificateView } from '@/types/certificate';
import type { VerifiedDocument } from '@/types/documents';
import type { EvidenceKind, EvidenceLink } from '@/types/finance';

type DatabaseClient = SupabaseClient<Database>;

// The service role is needed below because the limiter and the counter are internal functions no API role may
// run (P1.3.24): a public counter would be a public write. The limiter is keyed by the visitor IP alone (hashed
// by src/lib/rate-limit.ts), and the counter acts only on the id of a booklet the anon policy has just returned
// as published.

// Task P2.4.08: true while the visitor is within the booklet:download limit. It is checked before the booklet is
// even looked up, so guessing ids costs the same as downloading.
export function withinBookletDownloadLimit(
  clientIp: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  return withinRateLimits(adminClient, [
    { name: 'booklet:download', subject: rateLimitIpBucket(clientIp) },
  ]);
}

// increment_booklet_download checks the status again, so an id that is not published never moves a counter
// (docs/PRD.md FR-PUB-07, APP-04).
export function countBookletDownload(
  bookletId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<void> {
  return svcIncrementBookletDownload(adminClient, bookletId);
}

// A booking's quotation, invoice or receipt (Task P3.6.04). The service role is needed because a visitor has no
// session: the row is read by the id the route was given, and the route hands it to requireDocumentReader before
// anything is rendered. The per-IP limit is counted first, so guessing ids costs the same as reading.
export function withinDocumentLimits(
  clientIp: string,
  bookingId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  const checks = [{ name: 'document:ip', subject: rateLimitIpBucket(clientIp) } as const];
  return withinRateLimits(
    adminClient,
    bookingId === null ? checks : [...checks, { name: 'document:booking', subject: bookingId }],
  );
}

export function readBookingDocument(
  kind: BookingDocumentKind,
  id: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<BookingDocument | null> {
  return loadBookingDocument(adminClient, kind, id);
}

// The PDF of a document the reader was already authorised for, with the kelurahan's address of site_settings and
// the site's own address for the verify URL.
export async function bookingDocumentFile(
  document: BookingDocument,
  readerId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<Buffer> {
  const settings = await getPublicSiteSettings();
  return bookingDocumentPdf(adminClient, document, {
    kelurahanAddress: settings.kelurahanAddress,
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    readerId,
  });
}

// An RW admin's header-only copy of a quotation, invoice or receipt (Task P4.3.02, decision of 2026-10-26): within
// the staff member's own limit, rendered from the header facts alone and never kept.
export function withinRestrictedDocumentLimit(
  staffId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  return withinRateLimits(adminClient, [{ name: 'document_restricted:user', subject: staffId }]);
}

export async function restrictedBookingDocumentFile(document: BookingDocument): Promise<Buffer> {
  const settings = await getPublicSiteSettings();
  return restrictedDocumentPdf(document, settings.kelurahanAddress);
}

// A booking's e-ticket PDF (Task P3.11.05), by the booking id the route was given; the route authorises the reader
// against the booking's code before anything is rendered.
export function readTicketDocument(
  bookingId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<TicketDocument | null> {
  return loadTicketDocument(adminClient, bookingId);
}

export async function ticketDocumentFile(
  document: TicketDocument,
  readerId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<Buffer> {
  const settings = await getPublicSiteSettings();
  return ticketDocumentPdf(adminClient, document, {
    kelurahanAddress: settings.kelurahanAddress,
    readerId,
  });
}

// A certificate's PDF (Task P4.5.02), by the certificate id the route was given; the route authorises the reader
// against the certificate's own row before anything is rendered, and the site's address builds the verify URL.
export function readCertificateDocument(
  certificateId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<CertificateRow | null> {
  return loadCertificate(adminClient, certificateId);
}

export function certificateDocumentFile(
  certificate: CertificateRow,
  readerId: string | null,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<Buffer> {
  return certificatePdf(adminClient, certificate, {
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    readerId,
  });
}

// /dashboard/certificates "Render ulang" (FR-ADMIN-07): the caller has checked that the staff member may act on the
// booking's certificates; the files are rewritten under their name, within the staff member's hourly limit.
export async function rerenderCertificateFiles(
  bookingId: string,
  staffId: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<number> {
  const isWithinLimit = await withinRateLimits(adminClient, [
    { name: 'certificate_rerender:user', subject: staffId },
  ]);
  if (!isWithinLimit) throw new AppError('RATE_LIMITED');
  return rerenderBookingCertificates(adminClient, bookingId, {
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    readerId: staffId,
  });
}

// The visitor's certificate page (Task P4.5.03): the booking id comes from a verified certificate link; what the page
// may show and hand out is decided in guest-certificates.ts.
export function guestCertificates(
  bookingId: string,
  hasPhoneProof: boolean,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<GuestCertificateView> {
  return loadGuestCertificates(adminClient, { bookingId, hasPhoneProof, today: todayInJakarta() });
}

// The IP as security events and the audit log keep it (docs/Security.md §7.4): a keyed hash, never the address.
function ipHashOf(clientIp: string): string {
  return pepperedHash('gsk-ip-hash-v1', clientIp);
}

export function stepUpGuestCertificates(
  request: { bookingId: string; lastFour: string; clientIp: string },
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<PhoneStepUp> {
  return stepUpCertificatePhone(adminClient, {
    bookingId: request.bookingId,
    lastFour: request.lastFour,
    ipBucket: rateLimitIpBucket(request.clientIp),
    ipHash: ipHashOf(request.clientIp),
  });
}

// The certificate downloads' own limits (review of PR #94, M3), apart from the booking documents': per IP before the
// link is checked (bookingId null), then per booking, and "Unduh semua" once more for the whole class it renders.
export function withinCertificateDownloadLimits(
  request: { clientIp: string; bookingId: string | null; slot: CertificateSlot },
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<boolean> {
  if (request.bookingId === null) {
    return withinRateLimits(adminClient, [
      { name: 'certificate_download:ip', subject: rateLimitIpBucket(request.clientIp) },
    ]);
  }
  const perBooking = { name: 'certificate_download:booking', subject: request.bookingId } as const;
  const perBundle = { name: 'certificate_bundle:booking', subject: request.bookingId } as const;
  return withinRateLimits(
    adminClient,
    request.slot.kind === 'all_participants' ? [perBooking, perBundle] : [perBooking],
  );
}

// The PDF of /reservasi/[bookingCode]/sertifikat/unduh/[slot], rendered on this request when it has no kept file.
export function guestCertificateDownload(
  request: {
    bookingId: string;
    bookingCode: string;
    slot: CertificateSlot;
    hasPhoneProof: boolean;
    clientIp: string;
  },
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<GuestCertificateFile> {
  return guestCertificateFile(adminClient, {
    bookingId: request.bookingId,
    bookingCode: request.bookingCode,
    slot: request.slot,
    hasPhoneProof: request.hasPhoneProof,
    today: todayInJakarta(),
    siteUrl: publicEnv.NEXT_PUBLIC_SITE_URL,
    ipHash: ipHashOf(request.clientIp),
  });
}

export interface WhatsAppDocument {
  url: string;
  filename: string;
}

// The document header of gsk_ticket_issued_v1 (Task P3.11.03): a signed URL of 60 minutes to the kept ticket file,
// minted as the message is sent and handed to Meta only, never stored (CLAUDE.md §6.6); null when the booking has no
// ticket file that may be kept.
export async function ticketWhatsAppDocument(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<WhatsAppDocument | null> {
  const settings = await getPublicSiteSettings();
  const path = await keptTicketPdfPath(adminClient, bookingId, settings.kelurahanAddress);
  if (path === null) return null;
  const url = await createDocumentSignedUrl(adminClient, path, 'whatsapp_document_header');
  return { url, filename: path.slice(path.lastIndexOf('/') + 1) };
}

export type VerifyCodeAnswer =
  { kind: 'rate_limited' } | { kind: 'looked_up'; document: VerifiedDocument | null };

// /verifikasi/[code] (Task P3.6.05): the service role reads by the random code alone, after the visitor's IP has been
// counted, so guessing codes costs the same as checking one; the code names no booking and no person by itself.
export async function verifyDocumentCode(
  code: string,
  clientIp: string,
  adminClient: DatabaseClient = createSupabaseAdminClient(),
): Promise<VerifyCodeAnswer> {
  const isWithinLimit = await withinRateLimits(adminClient, [
    { name: 'verify:code', subject: rateLimitIpBucket(clientIp) },
  ]);
  if (!isWithinLimit) return { kind: 'rate_limited' };
  return { kind: 'looked_up', document: await lookupVerifyCode(adminClient, code) };
}

// The finance pages' proofs and evidence (Task P4.7.02, P4.7.04): the private documents bucket has no policy, so
// only the service role writes it, at a path finance-service.ts built from a verified booking or payout id, for a
// superadmin the action's guard has checked. Counted with the other finalizes (docs/Security.md UPL-04).
export async function storeFinanceEvidence(
  ctx: StaffContext,
  quarantinePath: string,
  destination: string,
): Promise<StoredDocument> {
  const adminClient = createSupabaseAdminClient();
  if (!(await withinUploadLimit(adminClient, ctx, 'upload_finalize', null))) {
    throw new AppError('RATE_LIMITED');
  }
  return storeFinanceDocument(adminClient, quarantinePath, destination);
}

export async function removeFinanceEvidence(path: string): Promise<void> {
  await removeFinanceDocument(createSupabaseAdminClient(), path);
}

const EVIDENCE_DOCUMENT_KIND = {
  adjustment: 'adjustment_evidence',
  payout: 'payout_proof',
} as const satisfies Record<EvidenceKind, SignedDocumentKind>;

// Review of PR #80, M-3: "Lihat bukti". rpc_reveal_finance_evidence checks the superadmin's AAL2 on their own session,
// names the file and writes the view's pii_revealed event; only then is a 300 s link signed, which goes straight back
// to the page and is never stored.
export async function signFinanceEvidence(kind: EvidenceKind, id: string): Promise<EvidenceLink> {
  const supabase = await createSupabaseServerClient();
  const path = await asFinanceWrite(() => revealFinanceEvidence(supabase, kind, id));
  const documentKind = EVIDENCE_DOCUMENT_KIND[kind];
  const url = await createDocumentSignedUrl(createSupabaseAdminClient(), path, documentKind);
  return { url, expiresInSeconds: SIGNED_URL_TTL_SECONDS[documentKind] };
}
