import 'server-only';

// Which documents a signed URL may point at and for how long (CLAUDE.md §6.6, docs/Security.md §10.3), split from
// document-service.ts, which signs them (delta review of PR #80, L-f).

// How long a signed URL to a private document stays valid (docs/Security.md §10.3). The WhatsApp document
// header lives longest because Meta fetches the file some time after the message is queued.
export const SIGNED_URL_TTL_SECONDS = {
  ticket: 600,
  certificate: 600,
  invoice: 900,
  quotation: 900,
  receipt: 900,
  credit_note: 900,
  export: 300,
  // Review of PR #80, M-3 (owner decision): the superadmin's look at a finance proof, as short as an export.
  adjustment_evidence: 300,
  payout_proof: 300,
  whatsapp_document_header: 3600,
} as const;

export type SignedDocumentKind = keyof typeof SIGNED_URL_TTL_SECONDS;

// The folders of the documents bucket each kind may be signed from (CLAUDE.md §6.6): booking papers under
// bookings/<id>/, certificates under certificates/<booking_id>/, exports under exports/<profile_id>/, and a payout's
// proof under payouts/<batch>/ to the superadmin alone (signFinanceEvidence).
const DOCUMENT_FOLDERS_BY_KIND: Record<SignedDocumentKind, readonly string[]> = {
  ticket: ['bookings'],
  certificate: ['certificates'],
  invoice: ['bookings'],
  quotation: ['bookings'],
  receipt: ['bookings'],
  credit_note: ['bookings'],
  export: ['exports'],
  adjustment_evidence: ['bookings'],
  payout_proof: ['payouts'],
  whatsapp_document_header: ['bookings', 'certificates'],
};
// A segment starts with a letter or digit, so neither "." nor ".." can climb out of its folder.
const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MIN_DOCUMENT_SEGMENTS = 3;

export function isDocumentPathFor(kind: SignedDocumentKind, path: string): boolean {
  const segments = path.split('/');
  const [folder] = segments;
  return (
    segments.length >= MIN_DOCUMENT_SEGMENTS &&
    folder !== undefined &&
    DOCUMENT_FOLDERS_BY_KIND[kind].includes(folder) &&
    segments.every((segment) => PATH_SEGMENT.test(segment))
  );
}
