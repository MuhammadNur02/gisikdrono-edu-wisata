import 'server-only';

import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import type { EnumValue } from '@/db/enums';
import { certificatesCopy } from '@/lib/copy/certificates';
import { copy } from '@/lib/copy/id';
import { PDF_COLORS, PDF_FONTS, registerPdfFonts } from '@/lib/pdf/theme';
import { formatDateLong, formatDateWritten } from '@/lib/utils/dates';
import { qrSvgPath } from '@/lib/utils/qr-path';

// The e-certificate (docs/PRD.md FR-POST-01, FR-POST-02; Task P4.5.02; docs/Security.md §10.4), A4 landscape, one page
// per certificate: the group's names the institution (or the PIC of an individual visit), a participant's names the
// participant and their class. Every page carries its number, the visit date, the RWs, the kelurahan's signatory from
// site_settings and the verify URL, which the server builds from the verify code staff never read. Nothing but rows
// the database wrote reaches it, as react-pdf primitives.

const text = certificatesCopy.pdf;
const letterhead = copy.documents.letterhead;
const VERIFY_PATH = '/verifikasi';

const FRAME_INSET = 24;
const QR_SIZE_POINTS = 64;
// The quiet zone around the QR, in modules, so a phone camera finds its edges on any paper.
const QR_QUIET_MODULES = 2;

export interface CertificatePageInput {
  kind: EnumValue<'certificate_kind'>;
  certificateNumber: string;
  recipientName: string;
  // A participant's class or department; null for the group's certificate or when the list gave none.
  groupLabel: string | null;
  institutionName: string | null;
  visitDate: string;
  rwNames: readonly string[];
  verifyUrl: string;
}

export interface CertificateDocumentInput {
  pages: readonly CertificatePageInput[];
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export function certificateVerifyUrl(siteUrl: string, verifyCode: string): string {
  return `${siteUrl}${VERIFY_PATH}/${verifyCode}`;
}

const styles = StyleSheet.create({
  page: {
    padding: FRAME_INSET,
    fontFamily: PDF_FONTS.body,
    fontSize: 11,
    color: PDF_COLORS.text,
    backgroundColor: PDF_COLORS.paper,
  },
  frame: { flexGrow: 1, borderWidth: 3, borderColor: PDF_COLORS.royal, padding: 6 },
  inner: {
    flexGrow: 1,
    borderWidth: 0.75,
    borderColor: PDF_COLORS.deep,
    paddingVertical: 28,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  letterhead: { alignItems: 'center' },
  letterheadLine: { fontSize: 9, color: PDF_COLORS.muted, textAlign: 'center' },
  letterheadName: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: 12,
    color: PDF_COLORS.deep,
    textAlign: 'center',
  },
  title: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: 38,
    letterSpacing: 6,
    color: PDF_COLORS.deep,
    marginTop: 22,
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 11, fontWeight: 600, letterSpacing: 2, color: PDF_COLORS.royal },
  number: { fontSize: 9, color: PDF_COLORS.muted, marginTop: 6 },
  givenTo: { marginTop: 22, fontSize: 11 },
  recipient: {
    fontFamily: PDF_FONTS.display,
    fontWeight: 700,
    fontSize: 28,
    color: PDF_COLORS.deep,
    marginTop: 6,
    textAlign: 'center',
  },
  rule: { width: 260, borderBottomWidth: 1.5, borderBottomColor: PDF_COLORS.royal, marginTop: 6 },
  groupLine: { fontSize: 12, fontWeight: 600, marginTop: 8, textAlign: 'center' },
  body: { fontSize: 12, marginTop: 14, maxWidth: 560, textAlign: 'center', lineHeight: 1.5 },
  footer: {
    marginTop: 'auto',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  verify: { flexDirection: 'row', alignItems: 'flex-end', width: 300 },
  verifyText: { fontSize: 8, color: PDF_COLORS.muted, marginLeft: 8, flexShrink: 1 },
  verifyUrl: { fontSize: 8, color: PDF_COLORS.royal, fontWeight: 600 },
  signature: { width: 220, alignItems: 'center' },
  signatureSpace: { height: 48 },
  signatureName: {
    fontWeight: 600,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.border,
    paddingTop: 4,
    width: '100%',
    textAlign: 'center',
  },
  signatureLine: { fontSize: 10, textAlign: 'center' },
});

function Letterhead() {
  return (
    <View style={styles.letterhead}>
      <Text style={styles.letterheadLine}>
        {letterhead.government} · {letterhead.district}
      </Text>
      <Text style={styles.letterheadName}>{letterhead.kelurahan}</Text>
      <Text style={styles.letterheadLine}>{letterhead.programme}</Text>
    </View>
  );
}

// Under a participant's name: their class and their institution, whichever the list and the booking gave.
function groupLineOf(page: CertificatePageInput): string | null {
  if (page.kind === 'group') return null;
  const parts = [page.groupLabel, page.institutionName].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

function bodyOf(page: CertificatePageInput): string {
  const date = formatDateLong(page.visitDate);
  return page.kind === 'group'
    ? text.groupVisit(page.rwNames, date)
    : text.participantVisit(page.rwNames, date);
}

function VerifyBlock({ url }: { url: string }) {
  const qr = qrSvgPath(url);
  const extent = qr.size + QR_QUIET_MODULES + QR_QUIET_MODULES;
  const viewBox = `-${String(QR_QUIET_MODULES)} -${String(QR_QUIET_MODULES)} ${String(extent)} ${String(extent)}`;
  return (
    <View style={styles.verify}>
      <Svg width={QR_SIZE_POINTS} height={QR_SIZE_POINTS} viewBox={viewBox}>
        <Path d={qr.path} fill={PDF_COLORS.deep} />
      </Svg>
      <View style={styles.verifyText}>
        <Text>{text.verify}</Text>
        <Text style={styles.verifyUrl}>{url}</Text>
      </View>
    </View>
  );
}

function SignatureBlock({
  input,
  visitDate,
}: {
  input: CertificateDocumentInput;
  visitDate: string;
}) {
  return (
    <View style={styles.signature}>
      <Text style={styles.signatureLine}>{text.placeAndDate(formatDateWritten(visitDate))}</Text>
      <Text style={styles.signatureLine}>{input.signatoryTitle ?? ''}</Text>
      <View style={styles.signatureSpace} />
      <Text style={styles.signatureName}>{input.signatoryName ?? ''}</Text>
    </View>
  );
}

function CertificatePage({
  page,
  input,
}: {
  page: CertificatePageInput;
  input: CertificateDocumentInput;
}) {
  const groupLine = groupLineOf(page);
  return (
    // wrap={false}: a certificate is one page, so a long name never pushes its signature onto a second one.
    <Page size="A4" orientation="landscape" style={styles.page} wrap={false}>
      <View style={styles.frame}>
        <View style={styles.inner}>
          <Letterhead />
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.subtitle}>{text.subtitle}</Text>
          <Text style={styles.number}>{text.number(page.certificateNumber)}</Text>
          <Text style={styles.givenTo}>{text.givenTo}</Text>
          <Text style={styles.recipient}>{page.recipientName}</Text>
          <View style={styles.rule} />
          {groupLine ? <Text style={styles.groupLine}>{groupLine}</Text> : null}
          <Text style={styles.body}>{bodyOf(page)}</Text>
          <View style={styles.footer}>
            <VerifyBlock url={page.verifyUrl} />
            <SignatureBlock input={input} visitDate={page.visitDate} />
          </View>
        </View>
      </View>
    </Page>
  );
}

export function CertificateDocument({ input }: { input: CertificateDocumentInput }) {
  const [first] = input.pages;
  const title = first ? text.fileTitle(first.certificateNumber) : text.title;
  return (
    <Document title={title} language="id">
      {input.pages.map((page) => (
        <CertificatePage key={page.certificateNumber} page={page} input={input} />
      ))}
    </Document>
  );
}

// One document of every page handed in, in that order; the participants' bundle is split into its pages afterwards.
export async function renderCertificatePdf(input: CertificateDocumentInput): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<CertificateDocument input={input} />);
}
