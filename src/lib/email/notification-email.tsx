import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from 'react-email';

// The HTML layout of every email the outbox sends (Task P3.11.04; docs/Security.md §10.2, EP-03): the words of
// src/lib/notifications/message-text.ts as paragraphs, a link as a button with its own address written out beneath it,
// and the fixed lines every visitor email carries. Links only, never an attachment, never a payment instruction.
// An email has no CSS variables or web fonts to rely on, so these are the light tokens of src/styles/globals.css in
// hex, as the PDFs carry them (src/lib/pdf/theme.ts); change them together.

const COLORS = {
  deep: '#0f172a',
  royal: '#1e40af',
  ice: '#eff6ff',
  muted: '#71717a',
  border: '#e2e8f0',
  paper: '#ffffff',
} as const;

const SITE_NAME = 'Edu Wisata Gisikdrono';
const NOT_YOURS = 'Jika Anda tidak membuat pemesanan ini, abaikan pesan ini.';
const PAYMENT_NOTICE =
  'Pembayaran hanya melalui sistem (QRIS/VA); kelurahan tidak pernah meminta transfer ke rekening pribadi.';
// A label longer than this is a sentence, not a button's words; the button then says this instead.
const MAX_BUTTON_LABEL = 40;
const OPEN_LINK = 'Buka tautan';

const styles = {
  body: { backgroundColor: COLORS.ice, fontFamily: 'Inter, Arial, sans-serif', margin: 0 },
  container: {
    backgroundColor: COLORS.paper,
    border: `1px solid ${COLORS.border}`,
    borderRadius: '12px',
    margin: '24px auto',
    maxWidth: '560px',
    padding: '24px',
  },
  brand: {
    color: COLORS.royal,
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.4px',
    margin: 0,
  },
  paragraph: {
    color: COLORS.deep,
    fontSize: '15px',
    lineHeight: '22px',
    whiteSpace: 'pre-line' as const,
  },
  button: {
    backgroundColor: COLORS.royal,
    borderRadius: '10px',
    color: COLORS.paper,
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: 600,
    padding: '12px 20px',
    textDecoration: 'none',
  },
  address: {
    color: COLORS.muted,
    fontSize: '12px',
    lineHeight: '18px',
    wordBreak: 'break-all' as const,
  },
  footer: { color: COLORS.muted, fontSize: '12px', lineHeight: '18px' },
};

export interface NotificationEmailProps {
  subject: string;
  lines: readonly string[];
  // The message's own link; a paragraph that ends with it becomes a button.
  linkUrl: string | null;
  // Visitor emails carry the not-yours and payment lines; staff and security emails do not.
  isForVisitor: boolean;
}

function LinkParagraph({ text, url }: { text: string; url: string }) {
  const label = text.slice(0, -url.length).replace(/:?\s*$/, '');
  const fitsButton = label.length > 0 && label.length <= MAX_BUTTON_LABEL;
  return (
    <Section>
      {fitsButton ? null : <Text style={styles.paragraph}>{label}</Text>}
      <Button href={url} style={styles.button}>
        {fitsButton ? label : OPEN_LINK}
      </Button>
      <Text style={styles.address}>{url}</Text>
    </Section>
  );
}

export function NotificationEmail({
  subject,
  lines,
  linkUrl,
  isForVisitor,
}: NotificationEmailProps) {
  return (
    <Html lang="id">
      <Head />
      <Preview>{subject}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{SITE_NAME}</Text>
          {lines.map((line) =>
            linkUrl !== null && linkUrl !== '' && line.endsWith(linkUrl) ? (
              <LinkParagraph key={line} text={line} url={linkUrl} />
            ) : (
              <Text key={line} style={styles.paragraph}>
                {line}
              </Text>
            ),
          )}
          {isForVisitor ? (
            <>
              <Hr />
              <Text style={styles.footer}>{NOT_YOURS}</Text>
              <Text style={styles.footer}>{PAYMENT_NOTICE}</Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

// pnpm email:preview shows this sample.
NotificationEmail.PreviewProps = {
  subject: 'Pembayaran GSK-7F3K9Q2M diterima',
  lines: [
    'Halo Bu Ani,',
    'Pembayaran untuk GSK-7F3K9Q2M sudah kami terima. Tiket kunjungan Anda: Eduwisata Ecowastreme, Kamis, 12 November 2026, 09.05–10.05 WIB, 20 orang.',
    'Lihat tiket:\nhttps://eduwisata.example.test/reservasi/GSK-7F3K9Q2M/tiket?t=contoh',
    'Salam,\nEdu Wisata Gisikdrono',
  ],
  linkUrl: 'https://eduwisata.example.test/reservasi/GSK-7F3K9Q2M/tiket?t=contoh',
  isForVisitor: true,
} satisfies NotificationEmailProps;

export default NotificationEmail;
