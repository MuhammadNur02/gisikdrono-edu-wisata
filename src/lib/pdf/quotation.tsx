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
  sessionLabels,
  visitLabel,
} from '@/lib/pdf/document';
import { pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';
import { formatDateLong } from '@/lib/utils/dates';
import type { DocumentSnapshot } from '@/lib/validations/document-snapshot';

// The Surat Penawaran (docs/PRD.md FR-B2B-02, Task P3.6.02): the quotation row's snapshot, number, verify code and
// status, the kelurahan's address, and the site's address for the verify URL. Nothing a visitor typed reaches it
// beyond the institution's name, held to 300 characters by the snapshot's shape.

const text = copy.documents;
const VERIFY_PATH = '/verifikasi';

export interface QuotationDocumentInput {
  snapshot: DocumentSnapshot;
  quotationNumber: string;
  verifyCode: string;
  version: number;
  issuedAt: string;
  status: EnumValue<'quotation_status'>;
  kelurahanAddress: string | null;
  siteUrl: string;
}

export function quotationVerifyUrl(siteUrl: string, verifyCode: string): string {
  return `${siteUrl}${VERIFY_PATH}/${verifyCode}`;
}

// What the document says of its standing: nothing while it is issued.
export function quotationStampLabel(status: EnumValue<'quotation_status'>): string | null {
  if (status === 'issued') return null;
  return text.quotation.status[status];
}

function QuotationHeader({ input }: { input: QuotationDocumentInput }) {
  const { snapshot } = input;
  return (
    <View>
      <Text style={pdfStyles.overline}>{text.quotation.version(input.version)}</Text>
      <Text style={pdfStyles.title}>{text.quotation.title}</Text>
      <View style={pdfStyles.metaRow}>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.number} value={input.quotationNumber} />
          <LabelledValue label={text.issuedAt} value={formatDateLong(input.issuedAt)} />
          <LabelledValue label={text.bookingCode} value={snapshot.booking_code} />
        </View>
        <View style={pdfStyles.metaBlock}>
          <LabelledValue label={text.to} value={bookerLabel(snapshot)} />
          <LabelledValue label={text.subject} value={text.quotation.subject} />
        </View>
      </View>
    </View>
  );
}

function QuotationVisit({ snapshot }: { snapshot: DocumentSnapshot }) {
  return (
    <View style={pdfStyles.metaRow}>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={text.visit} value={visitLabel(snapshot)} />
        <LabelledValue label={text.pax(snapshot.pax_count)} value={snapshot.rw_names.join(', ')} />
      </View>
      <View style={pdfStyles.metaBlock}>
        <Text style={pdfStyles.label}>{text.sessions}</Text>
        {sessionLabels(snapshot).map((label) => (
          <Text key={label} style={pdfStyles.value}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function QuotationDocument({ input }: { input: QuotationDocumentInput }) {
  const { snapshot } = input;
  const stamp = quotationStampLabel(input.status);
  const validUntil = snapshot.valid_until ? formatDateLong(snapshot.valid_until) : '';
  return (
    <Document title={`${text.quotation.title} ${input.quotationNumber}`} language="id">
      <BookingDocumentPage
        footer={text.verify(quotationVerifyUrl(input.siteUrl, input.verifyCode))}
      >
        <Letterhead address={input.kelurahanAddress} />
        {stamp ? <Stamp label={stamp} /> : null}
        <QuotationHeader input={input} />
        <Text style={pdfStyles.paragraph}>
          {text.quotation.opening(bookerLabel(snapshot), snapshot.package_name)}
        </Text>
        <QuotationVisit snapshot={snapshot} />
        <LinesTable snapshot={snapshot} />
        <Text style={pdfStyles.paragraph}>{text.quotation.validity(validUntil)}</Text>
        <Text style={pdfStyles.paragraph}>{text.quotation.confirm}</Text>
        <PaymentNotice />
        <SignatureBlock snapshot={snapshot} />
      </BookingDocumentPage>
    </Document>
  );
}

export async function renderQuotationPdf(input: QuotationDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<QuotationDocument input={input} />);
}
