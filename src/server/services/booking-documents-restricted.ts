import 'server-only';

import { copy } from '@/lib/copy/id';
import { bookerLabel, sessionLabels, visitLabel } from '@/lib/pdf/document';
import { quotationStampLabel } from '@/lib/pdf/quotation';
import { renderRestrictedDocumentPdf, type RestrictedDocumentInput } from '@/lib/pdf/restricted';
import { formatDateLong } from '@/lib/utils/dates';
import { documentFileName, type BookingDocument } from '@/server/services/booking-documents';

// The RW admin's copy of a booking's quotation, invoice or receipt (Task P4.3.02, decision of 2026-10-26; docs/Security.md
// STAFF-02): the header facts of the snapshot written out as text, and none of its money. Rendered on each request and
// never kept.

const text = copy.documents;
const RESTRICTED_SUFFIX = '-terbatas';

function titleOf(document: BookingDocument): string {
  if (document.kind === 'quotation') return text.quotation.title;
  if (document.kind === 'invoice') return text.invoice.title;
  return text.receipt.title;
}

function stampOf(document: BookingDocument): string | null {
  if (document.kind === 'quotation') return quotationStampLabel(document.status);
  if (document.kind === 'invoice') {
    if (document.status === 'paid') return text.invoice.paid;
    return document.status === 'void' ? text.invoice.void : null;
  }
  return text.invoice.paid;
}

function issuedAtOf(document: BookingDocument): string | null {
  return document.kind === 'receipt' ? null : formatDateLong(document.issuedAt);
}

// Every field is chosen here, by name: the snapshot's lines, subtotals, discount and total never leave this function.
export function restrictedInputOf(
  document: BookingDocument,
  kelurahanAddress: string | null,
): RestrictedDocumentInput {
  const { snapshot } = document;
  return {
    title: titleOf(document),
    number: document.number,
    issuedAt: issuedAtOf(document),
    stamp: stampOf(document),
    booker: bookerLabel(snapshot),
    visit: visitLabel(snapshot),
    pax: text.pax(snapshot.pax_count),
    rwNames: [...snapshot.rw_names],
    sessions: sessionLabels(snapshot),
    kelurahanAddress,
  };
}

export function restrictedFileName(document: BookingDocument): string {
  return documentFileName(document).replace(/\.pdf$/, `${RESTRICTED_SUFFIX}.pdf`);
}

export function restrictedDocumentPdf(
  document: BookingDocument,
  kelurahanAddress: string | null,
): Promise<Buffer> {
  return renderRestrictedDocumentPdf(restrictedInputOf(document, kelurahanAddress));
}
