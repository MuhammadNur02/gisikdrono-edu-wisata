import { readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';

import { z } from 'zod';

// pnpm wa:send-test -- --to +6281234567890 --template payment_received_ticket [--document-url https://...]
//   [--file .env.local] [--dry-run]   (Task P3.11.03, CLAUDE.md §10.1)
// Sends one approved WhatsApp template to a test number with sample parameters, through the same payload builder and
// provider the outbox uses, so a template's approval and the credentials can be tried before the first real message.
// The ticket template carries a document header, so it needs --document-url, a PDF Meta can fetch. Staff templates go
// by email only and are refused. Nothing printed carries the access token; the answer is Meta's message id or the
// server's own error code. --dry-run prints the template and its parts without sending.

const DEFAULT_ENV_FILE = '.env.local';
const TICKET_TEMPLATE = 'payment_received_ticket';
const SAMPLE_BOOKING_CODE = 'GSK-7F3K9Q2M';
const SAMPLE_PAX = 25;
const SAMPLE_TOTAL = 1_250_000;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DAYS_AHEAD = 7;
const ISO_DATE_LENGTH = 10;
const SAMPLE_OTP = '123456';

const SENDABLE = [
  'phone_otp',
  'booking_created',
  'quotation_ready',
  'payment_reminder',
  'payment_received_ticket',
  'booking_expired',
  'booking_cancelled',
  'visit_reminder_d1',
  'checked_in_thanks',
  'certificate_ready',
  'review_invite',
  'refund_processed',
  'security_alert',
  'booking_link',
] as const;

const argsSchema = z.object({
  to: z.string().regex(/^\+62[0-9]{8,13}$/, 'an Indonesian E.164 number, +62…'),
  template: z.enum(SENDABLE),
  'document-url': z.url({ protocol: /^https$/ }).optional(),
  file: z.string().default(DEFAULT_ENV_FILE),
  'dry-run': z.boolean().default(false),
});

const credentialsSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
});

function readArgs() {
  const { values } = parseArgs({
    // process.argv starts with the node binary and this script; the options follow.
    args: process.argv.filter((_, index) => index > 1).filter((arg) => arg !== '--'),
    options: {
      to: { type: 'string' },
      template: { type: 'string' },
      'document-url': { type: 'string' },
      file: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const args = argsSchema.parse(values);
  if (args.template === TICKET_TEMPLATE && args['document-url'] === undefined) {
    throw new Error(
      'gsk_ticket_issued_v1 has a document header: pass --document-url with a PDF Meta can fetch',
    );
  }
  return args;
}

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, ISO_DATE_LENGTH);
}

const SAMPLE_FACTS = {
  bookingCode: SAMPLE_BOOKING_CODE,
  packageName: 'Paket Uji Coba',
  visitDate: isoDate(DAYS_AHEAD),
  session: '09.00–10.00 WIB',
  gate: 'RW 05 Ecowastreme',
  pax: SAMPLE_PAX,
  total: SAMPLE_TOTAL,
  deadline: new Date(Date.now() + HOUR_MS).toISOString(),
  institution: 'SD Negeri Uji Coba',
  quotationNumber: 'SP/GSK/2026/10/0001',
  quotationValidUntil: isoDate(DAYS_AHEAD),
  refundedAmount: 0,
};

async function sampleParams(template: (typeof SENDABLE)[number]): Promise<Record<string, unknown>> {
  if (template === 'phone_otp') return { code: SAMPLE_OTP };
  if (template === 'security_alert') {
    return { severity: 'high', rule: 'uji_coba', time: new Date().toISOString() };
  }
  if (template === 'booking_link') return { name: 'Bapak/Ibu', booking_code: SAMPLE_BOOKING_CODE };
  const { guestTemplateParams } = await import('../src/lib/notifications/compose');
  return guestTemplateParams(template, 'Bapak/Ibu', SAMPLE_FACTS, null);
}

async function main(): Promise<void> {
  const args = readArgs();
  const credentials = credentialsSchema.parse(parseEnv(readFileSync(args.file, 'utf8')));
  // The modules below read NEXT_PUBLIC_SITE_URL as they load, so the env file goes into the process first.
  process.loadEnvFile(args.file);
  const { templateParamsSchemas } = await import('../src/lib/notifications/templates');
  const { displayParams } = await import('../src/lib/notifications/compose');
  const { createWhatsAppMetaProvider, whatsAppPayload } =
    await import('../src/lib/notifications/whatsapp-meta');

  const params = templateParamsSchemas[args.template].parse(await sampleParams(args.template));
  const documentUrl = args['document-url'];
  const message = {
    notificationId: 'wa-send-test',
    channel: 'whatsapp' as const,
    template: args.template,
    recipient: args.to,
    bodyParams: displayParams(params),
    link: { url: '', buttonSuffix: SAMPLE_BOOKING_CODE },
    ...(documentUrl === undefined
      ? {}
      : { document: { url: documentUrl, filename: 'tiket-uji.pdf' } }),
  };
  if (args['dry-run']) {
    const { template } = whatsAppPayload(message);
    const parts = template.components.map((component) => component.type).join(', ');
    process.stdout
      .write(`Would send ${template.name} (${parts}) with ${Object.keys(message.bodyParams).join(', ')}
`);
    return;
  }
  const result = await createWhatsAppMetaProvider({
    accessToken: credentials.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: credentials.WHATSAPP_PHONE_NUMBER_ID,
  }).send(message);
  if (!result.ok) throw new Error(`Meta did not accept it: ${result.errorCode}`);
  process.stdout.write(`Sent ${args.template} as ${result.providerMessageId}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
