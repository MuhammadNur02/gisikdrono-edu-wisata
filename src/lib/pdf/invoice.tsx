import 'server-only';

import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { EnumValue } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import {
  BookingDocumentPage,
  LabelledValue,
  Letterhead,
  LinesTable,
  PaymentNotice,
  SignatureBlock,
  Stamp,
  bookerLabel,
  visitLabel,
} from '@/lib/pdf/document';
import { pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong } from '@/lib/utils/dates';
import type { DocumentSnapshot } from '@/lib/validations/document-snapshot';

// The invoice and its credit note (docs/PRD.md FR-B2B-05, FR-B2B-06; Task P3.6.03). The row and its numbers are made
// only inside internal.apply_payment_event at settlement and record_refund on a refund; this renders what they wrote.

const text = copy.documents;

export interface InvoiceDocumentInput {
  snapshot: DocumentSnapshot;
  invoiceNumber: string;
  status: EnumValue<'invoice_status'>;
  issuedAt: string;
  kelurahanAddress: string | null;
  // 'invoice' prints the bill; 'credit_note' the refund note the same row carries after a refund.
  kind: 'invoice' | 'credit_note';
}

export function invoiceStampLabel(input: InvoiceDocumentInput): string | null {
  if (input.kind === 'credit_note') return null;
  if (input.status === 'paid') return text.invoice.paid;
  if (input.status === 'void') return text.invoice.void;
  return null;
}

// How the money came in, as the snapshot's payment names it; a method the enum does not know prints as it is.
export function paymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  const known: Record<string, string> = text.methods;
  return known[method] ?? method;
}

function InvoiceHeader({ input }: { input: InvoiceDocumentInput }) {
  const { snapshot } = input;
  const dueDate = snapshot.due_date ? formatDateLong(snapshot.due_date) : null;
  return (
    <View>
      <Text style={pdfStyles.title}>{text.invoice.title}</Text>
      <View style={pdfStyles.metaRow}>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.number} value={input.invoiceNumber} />
          <LabelledValue label={text.issuedAt} value={formatDateLong(input.issuedAt)} />
          {dueDate ? <LabelledValue label={text.invoice.dueDate} value={dueDate} /> : null}
          <LabelledValue label={text.bookingCode} value={snapshot.booking_code} />
        </View>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.invoice.billTo} value={bookerLabel(snapshot)} />
          <LabelledValue label={text.visit} value={visitLabel(snapshot)} />
          <LabelledValue
            label={text.pax(snapshot.pax_count)}
            value={snapshot.rw_names.join(', ')}
          />
        </View>
      </View>
    </View>
  );
}

// Paid: how and when. Unpaid: how to pay, through the system only.
function PaymentSection({ snapshot }: { snapshot: DocumentSnapshot }) {
  const payment = snapshot.payment;
  const method = paymentMethodLabel(payment?.method);
  if (payment?.paid_at && method) {
    return (
      <View style={pdfStyles.metaRow}>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue
            label={text.invoice.paidWith(method)}
            value={formatDateLong(payment.paid_at)}
          />
        </View>
        <View style={pdfStyles.metaBlock}>
          {payment.order_id ? (
            <LabelledValue label={text.invoice.orderId} value={payment.order_id} />
          ) : null}
        </View>
      </View>
    );
  }
  return (
    <View style={pdfStyles.paragraph}>
      <Text style={pdfStyles.label}>{text.invoice.howToPay}</Text>
      <Text>{text.invoice.howToPayText}</Text>
    </View>
  );
}

function CreditNoteBody({ input }: { input: InvoiceDocumentInput }) {
  const note = input.snapshot.credit_note;
  return (
    <View>
      <Text style={pdfStyles.title}>{text.invoice.creditNoteTitle}</Text>
      <View style={pdfStyles.metaRow}>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.number} value={note?.number ?? ''} />
          <LabelledValue
            label={text.issuedAt}
            value={note?.issued_at ? formatDateLong(note.issued_at) : ''}
          />
          <LabelledValue label={text.bookingCode} value={input.snapshot.booking_code} />
        </View>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.invoice.billTo} value={bookerLabel(input.snapshot)} />
          <LabelledValue
            label={text.subject}
            value={text.invoice.creditNoteFor(input.invoiceNumber)}
          />
        </View>
      </View>
      <View style={pdfStyles.totalRow}>
        <Text style={pdfStyles.totalLabel}>{text.invoice.creditNoteAmount}</Text>
        <Text style={pdfStyles.totalValue}>{formatIDR(note?.amount ?? 0)}</Text>
      </View>
    </View>
  );
}

export function InvoiceDocument({ input }: { input: InvoiceDocumentInput }) {
  const stamp = invoiceStampLabel(input);
  const title = input.kind === 'credit_note' ? text.invoice.creditNoteTitle : text.invoice.title;
  return (
    <Document title={`${title} ${input.invoiceNumber}`} language="id">
      <BookingDocumentPage
        footer={`${title} ${input.invoiceNumber} · ${text.letterhead.programme}`}
      >
        <Letterhead address={input.kelurahanAddress} />
        {stamp ? <Stamp label={stamp} /> : null}
        {input.kind === 'credit_note' ? (
          <CreditNoteBody input={input} />
        ) : (
          <>
            <InvoiceHeader input={input} />
            <LinesTable snapshot={input.snapshot} />
            <PaymentSection snapshot={input.snapshot} />
            <PaymentNotice />
          </>
        )}
        <SignatureBlock snapshot={input.snapshot} />
      </BookingDocumentPage>
    </Document>
  );
}

export async function renderInvoicePdf(input: InvoiceDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<InvoiceDocument input={input} />);
}
