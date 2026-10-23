import 'server-only';

import { Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { copy } from '@/lib/copy/id';
import { pdfStyles } from '@/lib/pdf/theme';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { DocumentLine, DocumentSnapshot } from '@/lib/validations/document-snapshot';

// The parts every booking document is built from (Task P3.6.02; docs/Security.md §10.4): react-pdf primitives over
// the fields of a document snapshot and nothing else, so no free text and no HTML ever reaches a PDF.

const text = copy.documents;

export function BookingDocumentPage({ children, footer }: { children: ReactNode; footer: string }) {
  return (
    <Page size="A4" style={pdfStyles.page}>
      {children}
      <Text style={pdfStyles.footer} fixed>
        {footer}
      </Text>
    </Page>
  );
}

// The kop surat: the kelurahan's place in the city's administration, and its address from site_settings.
export function Letterhead({ address }: { address: string | null }) {
  return (
    <View style={pdfStyles.letterhead}>
      <Text style={pdfStyles.letterheadLine}>
        {text.letterhead.government} · {text.letterhead.district}
      </Text>
      <Text style={pdfStyles.letterheadName}>{text.letterhead.kelurahan}</Text>
      <Text style={pdfStyles.letterheadLine}>{text.letterhead.programme}</Text>
      {address ? <Text style={pdfStyles.letterheadLine}>{address}</Text> : null}
    </View>
  );
}

export function LabelledValue({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={pdfStyles.label}>{label}</Text>
      <Text style={pdfStyles.value}>{value}</Text>
    </View>
  );
}

// The booker as a document names them: the institution, or the kind of visitor when none was given.
export function bookerLabel(snapshot: DocumentSnapshot): string {
  return snapshot.institution_name ?? copy.booking.wizard.booker.bookerTypes[snapshot.booker_type];
}

export function visitLabel(snapshot: DocumentSnapshot): string {
  const start = formatDateLong(snapshot.visit_date);
  const end = snapshot.visit_date_end;
  return end && end !== snapshot.visit_date ? `${start} – ${formatDateLong(end)}` : start;
}

export function sessionLabels(snapshot: DocumentSnapshot): string[] {
  return snapshot.sessions.map(
    (session) => `${session.rw_name}: ${formatTimeRange(session.start_time, session.end_time)}`,
  );
}

function LineRow({ line }: { line: DocumentLine }) {
  return (
    <View style={pdfStyles.tableRow}>
      <Text style={[pdfStyles.cell, pdfStyles.cellName]}>{line.product_name}</Text>
      <Text style={[pdfStyles.cell, pdfStyles.cellNumber]}>{String(line.qty)}</Text>
      <Text style={[pdfStyles.cell, pdfStyles.cellMoney]}>{formatIDR(line.unit_price)}</Text>
      <Text style={[pdfStyles.cell, pdfStyles.cellMoney]}>{formatIDR(line.line_total)}</Text>
    </View>
  );
}

// The item table and the total, with the discount as a line of its own when there is one.
export function LinesTable({ snapshot }: { snapshot: DocumentSnapshot }) {
  return (
    <View>
      <View style={pdfStyles.table}>
        <View style={pdfStyles.tableHead}>
          <Text style={[pdfStyles.cell, pdfStyles.cellName]}>{text.table.item}</Text>
          <Text style={[pdfStyles.cell, pdfStyles.cellNumber]}>{text.table.qty}</Text>
          <Text style={[pdfStyles.cell, pdfStyles.cellMoney]}>{text.table.unitPrice}</Text>
          <Text style={[pdfStyles.cell, pdfStyles.cellMoney]}>{text.table.lineTotal}</Text>
        </View>
        {snapshot.lines.map((line, index) => (
          <LineRow key={`${line.kind}-${String(index)}`} line={line} />
        ))}
        {snapshot.discount_amount > 0 ? (
          <View style={pdfStyles.tableRow}>
            <Text style={[pdfStyles.cell, pdfStyles.cellName]}>{text.discount}</Text>
            <Text style={[pdfStyles.cell, pdfStyles.cellMoney]}>
              −{formatIDR(snapshot.discount_amount)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={pdfStyles.totalRow}>
        <Text style={pdfStyles.totalLabel}>{text.total}</Text>
        <Text style={pdfStyles.totalValue}>{formatIDR(snapshot.total_amount)}</Text>
      </View>
    </View>
  );
}

// docs/StyleGuide.md §9: the trust line every money document repeats word for word.
export function PaymentNotice() {
  return <Text style={pdfStyles.notice}>{text.paymentNotice}</Text>;
}

export function SignatureBlock({ snapshot }: { snapshot: DocumentSnapshot }) {
  return (
    <View style={pdfStyles.signature}>
      <Text>{text.signedBy}</Text>
      <Text style={pdfStyles.label}>{snapshot.signatory_title ?? ''}</Text>
      <View style={pdfStyles.signatureSpace} />
      <Text style={pdfStyles.signatureName}>{snapshot.signatory_name ?? ''}</Text>
    </View>
  );
}

// A word across the page for a document that no longer stands as issued, or that is settled.
export function Stamp({ label }: { label: string }) {
  return <Text style={pdfStyles.stamp}>{label}</Text>;
}
