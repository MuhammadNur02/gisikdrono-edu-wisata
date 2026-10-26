import 'server-only';

import { Document, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { dsrCopy } from '@/lib/copy/dsr';
import { BookingDocumentPage, LabelledValue, Letterhead } from '@/lib/pdf/document';
import { pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';
import { formatIDR } from '@/lib/utils/currency';
import { formatDateLong, formatDateTimeShort } from '@/lib/utils/dates';

// The answer to an access request (Task P4.10.03; docs/Security.md §7.6): what the booking holds about its booker
// and participants, as plain fields, the same that the JSON file carries. Kept under bookings/<id>/dsr/ and handed
// only to the guest, through their own link.

const text = dsrCopy.export;

export interface DsrExportData {
  bookingCode: string;
  generatedAt: string;
  booker: {
    name: string;
    phone: string | null;
    email: string | null;
    institution: string | null;
    bookerType: string;
  };
  visit: {
    packageName: string;
    visitDate: string;
    visitDateEnd: string;
    paxCount: number;
    status: string;
    notes: string | null;
    createdAt: string;
  };
  participants: {
    seqNo: number;
    fullName: string;
    groupLabel: string | null;
    roleLabel: string | null;
  }[];
  payments: { method: string; status: string; amount: number; settledAt: string | null }[];
  documents: { label: string; number: string; issuedAt: string }[];
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={pdfStyles.section}>
      <Text style={pdfStyles.label}>{title}</Text>
      {lines.length === 0 ? <Text style={pdfStyles.value}>{text.none}</Text> : null}
      {lines.map((line, index) => (
        <Text key={`${String(index)}:${line}`} style={pdfStyles.value}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function bookerLines(data: DsrExportData): string[] {
  const { booker } = data;
  return [booker.name, booker.institution, booker.phone, booker.email, booker.bookerType].filter(
    (line): line is string => line !== null,
  );
}

function visitLines(data: DsrExportData): string[] {
  const { visit } = data;
  const dates =
    visit.visitDateEnd === visit.visitDate
      ? formatDateLong(visit.visitDate)
      : `${formatDateLong(visit.visitDate)} – ${formatDateLong(visit.visitDateEnd)}`;
  return [
    visit.packageName,
    dates,
    `${String(visit.paxCount)} orang`,
    visit.status,
    visit.notes,
  ].filter((line): line is string => line !== null && line !== '');
}

export function DsrExportDocument({ data }: { data: DsrExportData }) {
  const participants = data.participants.map(
    (p) => `${String(p.seqNo)}. ${p.fullName}${p.groupLabel ? ` (${p.groupLabel})` : ''}`,
  );
  const payments = data.payments.map(
    (p) =>
      `${p.method} · ${p.status} · ${formatIDR(p.amount)}${p.settledAt ? ` · ${formatDateTimeShort(p.settledAt)}` : ''}`,
  );
  const documents = data.documents.map(
    (d) => `${d.label} ${d.number} · ${formatDateLong(d.issuedAt)}`,
  );
  return (
    <Document title={`${text.title} ${data.bookingCode}`} language="id">
      <BookingDocumentPage footer={text.footer}>
        <Letterhead address={null} />
        <Text style={pdfStyles.title}>{text.title}</Text>
        <LabelledValue
          label={text.subtitle(data.bookingCode)}
          value={text.generatedAt(formatDateTimeShort(data.generatedAt))}
        />
        <Section title={text.booker} lines={bookerLines(data)} />
        <Section title={text.visit} lines={visitLines(data)} />
        <Section title={text.participants} lines={participants} />
        <Section title={text.payments} lines={payments} />
        <Section title={text.documents} lines={documents} />
      </BookingDocumentPage>
    </Document>
  );
}

export async function renderDsrExportPdf(data: DsrExportData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<DsrExportDocument data={data} />);
}
