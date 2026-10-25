import 'server-only';

import { Document, Path, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';

import { copy } from '@/lib/copy/id';
import { BookingDocumentPage, LabelledValue, Letterhead } from '@/lib/pdf/document';
import { PDF_COLORS, pdfStyles, registerPdfFonts } from '@/lib/pdf/theme';
import { formatDateLong, formatTimeRange } from '@/lib/utils/dates';
import type { GuestTicket } from '@/types/ticket';

// The e-ticket (docs/PRD.md FR-BOOK-13; Task P3.11.05; docs/Security.md §9.1, §10.3): one page per ticket, that is per
// RW of the visit, with its QR of https://<site>/v/<token>, the day, the session, the group's size and the rules. No
// participant names and no contact details: the file goes out by a link in WhatsApp and email.

const text = copy.documents;
const ticketText = copy.booking.ticket;

const QR_SIZE_POINTS = 190;
// The quiet zone around the QR, in modules, so a gate camera finds its edges on any paper.
const QR_QUIET_MODULES = 2;

const styles = StyleSheet.create({
  qrBlock: { alignItems: 'center', marginVertical: 18 },
  qrCaption: { fontSize: 9, color: PDF_COLORS.muted, marginTop: 8 },
  notValid: {
    marginVertical: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: PDF_COLORS.border,
    backgroundColor: PDF_COLORS.ice,
  },
  rule: { fontSize: 9, marginBottom: 3 },
});

export interface TicketDocumentInput {
  bookingCode: string;
  tickets: readonly GuestTicket[];
  kelurahanAddress: string | null;
}

function TicketQr({ qr }: { qr: NonNullable<GuestTicket['qr']> }) {
  const extent = qr.size + QR_QUIET_MODULES + QR_QUIET_MODULES;
  const viewBox = `-${String(QR_QUIET_MODULES)} -${String(QR_QUIET_MODULES)} ${String(extent)} ${String(extent)}`;
  return (
    <View style={styles.qrBlock}>
      <Svg width={QR_SIZE_POINTS} height={QR_SIZE_POINTS} viewBox={viewBox}>
        <Path d={qr.path} fill={PDF_COLORS.deep} />
      </Svg>
      <Text style={styles.qrCaption}>{text.ticket.showAtGate}</Text>
    </View>
  );
}

function TicketDetails({ ticket }: { ticket: GuestTicket }) {
  return (
    <View style={pdfStyles.metaRow}>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={ticketText.code} value={ticket.ticketCode} />
        <LabelledValue label={text.ticket.location} value={ticket.rwName} />
      </View>
      <View style={pdfStyles.metaBlock}>
        <LabelledValue label={ticketText.visitDate} value={formatDateLong(ticket.validOn)} />
        <LabelledValue
          label={ticketText.session}
          value={formatTimeRange(ticket.startTime, ticket.endTime)}
        />
        <LabelledValue label={ticketText.pax} value={ticketText.paxCount(ticket.paxCount)} />
      </View>
    </View>
  );
}

const isUsable = (ticket: GuestTicket) => ticket.status === 'issued' || ticket.status === 'used';

function TicketPage({ ticket, input }: { ticket: GuestTicket; input: TicketDocumentInput }) {
  return (
    <BookingDocumentPage
      footer={`${text.ticket.title} ${ticket.ticketCode} · ${text.letterhead.programme}`}
    >
      <Letterhead address={input.kelurahanAddress} />
      <Text style={pdfStyles.title}>{text.ticket.title}</Text>
      <LabelledValue label={text.bookingCode} value={input.bookingCode} />
      <TicketDetails ticket={ticket} />
      {isUsable(ticket) && ticket.qr ? (
        <TicketQr qr={ticket.qr} />
      ) : (
        <Text style={styles.notValid}>{text.ticket.notValid}</Text>
      )}
      {text.ticket.rules.map((rule) => (
        <Text key={rule} style={styles.rule}>
          • {rule}
        </Text>
      ))}
    </BookingDocumentPage>
  );
}

export function TicketDocument({ input }: { input: TicketDocumentInput }) {
  return (
    <Document title={text.ticket.fileTitle(input.bookingCode)} language="id">
      {input.tickets.map((ticket) => (
        <TicketPage key={ticket.ticketCode} ticket={ticket} input={input} />
      ))}
    </Document>
  );
}

export async function renderTicketPdf(input: TicketDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<TicketDocument input={input} />);
}
