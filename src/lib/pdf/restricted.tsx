import 'server-only';

import { Document, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { copy } from '@/lib/copy/id';
import { BookingDocumentPage, LabelledValue, Letterhead, Stamp } from '@/lib/pdf/document';
import { PDF_COLORS, pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';

// The RW admin's copy of a quotation, invoice or receipt (Task P4.3.02, decision of 2026-10-26; docs/Security.md
// STAFF-02, §10.3): the document's header and nothing of its money. It never receives the snapshot itself, only the
// header's facts already written as text, so no amount, line or discount can reach the page or its metadata. It is
// rendered on each request and never kept, since the kept file is the full document.

const text = copy.documents;

export interface RestrictedDocumentInput {
  // 'Surat Penawaran', 'Invoice', 'Kwitansi'.
  title: string;
  number: string;
  issuedAt: string | null;
  // The document's own standing (DIBATALKAN, LUNAS, …), or null while it simply stands.
  stamp: string | null;
  booker: string;
  visit: string;
  pax: string;
  rwNames: readonly string[];
  sessions: readonly string[];
  kelurahanAddress: string | null;
}

const styles = StyleSheet.create({
  mark: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: PDF_COLORS.royal,
    color: PDF_COLORS.royal,
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: 1.2,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  withheld: {
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    backgroundColor: PDF_COLORS.ice,
    padding: 12,
    marginTop: 6,
    fontWeight: 600,
  },
});

function Header({ input }: { input: RestrictedDocumentInput }) {
  return (
    <View style={pdfStyles.metaRow}>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={text.number} value={input.number} />
        {input.issuedAt ? <LabelledValue label={text.issuedAt} value={input.issuedAt} /> : null}
        <LabelledValue label={text.to} value={input.booker} />
      </View>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={text.visit} value={input.visit} />
        <LabelledValue label={input.pax} value={input.rwNames.join(', ')} />
        <Text style={pdfStyles.label}>{text.sessions}</Text>
        {input.sessions.map((session) => (
          <Text key={session} style={pdfStyles.value}>
            {session}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function RestrictedDocument({ input }: { input: RestrictedDocumentInput }) {
  const title = `${input.title} ${input.number}`;
  return (
    <Document title={`${title} · ${text.restricted.mark}`} language="id">
      <BookingDocumentPage
        footer={`${title} · ${text.restricted.mark} · ${text.letterhead.programme}`}
      >
        <Letterhead address={input.kelurahanAddress} />
        {input.stamp ? <Stamp label={input.stamp} /> : null}
        <Text style={styles.mark}>{text.restricted.mark}</Text>
        <Text style={pdfStyles.title}>{input.title}</Text>
        <Header input={input} />
        <Text style={styles.withheld}>{text.restricted.withheld}</Text>
      </BookingDocumentPage>
    </Document>
  );
}

export async function renderRestrictedDocumentPdf(input: RestrictedDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<RestrictedDocument input={input} />);
}
