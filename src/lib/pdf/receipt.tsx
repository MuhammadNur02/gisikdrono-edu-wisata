import 'server-only';

import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { copy } from '@/lib/copy/id';
import {
  BookingDocumentPage,
  LabelledValue,
  Letterhead,
  PaymentNotice,
  SignatureBlock,
  Stamp,
  bookerLabel,
} from '@/lib/pdf/document';
import { paymentMethodLabel } from '@/lib/pdf/invoice';
import { pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong } from '@/lib/utils/dates';
import type { DocumentSnapshot } from '@/lib/validations/document-snapshot';

// The kwitansi (docs/PRD.md FR-B2B-05; Task P3.6.03): the receipt number the invoice row got at settlement, the sum
// received, from whom, for which invoice, and how it was paid.

const text = copy.documents;

export interface ReceiptDocumentInput {
  snapshot: DocumentSnapshot;
  receiptNumber: string;
  invoiceNumber: string;
  kelurahanAddress: string | null;
}

function ReceiptMeta({ input }: { input: ReceiptDocumentInput }) {
  const { snapshot } = input;
  const payment = snapshot.payment;
  const method = paymentMethodLabel(payment?.method);
  return (
    <View style={pdfStyles.metaRow}>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={text.number} value={input.receiptNumber} />
        {payment?.paid_at ? (
          <LabelledValue label={text.receipt.paidAt} value={formatDateLong(payment.paid_at)} />
        ) : null}
        <LabelledValue label={text.bookingCode} value={snapshot.booking_code} />
      </View>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={text.receipt.receivedFrom} value={bookerLabel(snapshot)} />
        <LabelledValue label={text.subject} value={text.receipt.forPayment(input.invoiceNumber)} />
        {method ? (
          <LabelledValue label={text.invoice.paidWith(method)} value={payment?.order_id ?? ''} />
        ) : null}
      </View>
    </View>
  );
}

export function ReceiptDocument({ input }: { input: ReceiptDocumentInput }) {
  const { snapshot } = input;
  const amount = snapshot.payment?.amount_paid ?? snapshot.total_amount;
  return (
    <Document title={`${text.receipt.title} ${input.receiptNumber}`} language="id">
      <BookingDocumentPage
        footer={`${text.receipt.title} ${input.receiptNumber} · ${text.letterhead.programme}`}
      >
        <Letterhead address={input.kelurahanAddress} />
        <Stamp label={text.invoice.paid} />
        <Text style={pdfStyles.title}>{text.receipt.title}</Text>
        <ReceiptMeta input={input} />
        <View style={pdfStyles.totalRow}>
          <Text style={pdfStyles.totalLabel}>{text.receipt.amount}</Text>
          <Text style={pdfStyles.totalValue}>{formatIDR(amount)}</Text>
        </View>
        <PaymentNotice />
        <SignatureBlock snapshot={snapshot} />
      </BookingDocumentPage>
    </Document>
  );
}

export async function renderReceiptPdf(input: ReceiptDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ReceiptDocument input={input} />);
}
