import { describe, expect, it, vi } from 'vitest';

import { DB_ENUMS } from '@/db/enums';
import { createResendProvider } from '@/lib/notifications/email-resend';
import { createMailpitProvider } from '@/lib/notifications/mailpit';
import { messageText } from '@/lib/notifications/message-text';
import type { OutgoingMessage } from '@/lib/notifications/types';
import {
  createWhatsAppMetaProvider,
  isPermanentMetaError,
  whatsAppPayload,
} from '@/lib/notifications/whatsapp-meta';

const OTP: OutgoingMessage = {
  notificationId: 'n-1',
  channel: 'whatsapp',
  template: 'phone_otp',
  recipient: '+6281234567890',
  bodyParams: { code: '482913' },
  link: null,
};
const LINK: OutgoingMessage = {
  notificationId: 'n-2',
  channel: 'whatsapp',
  template: 'booking_link',
  recipient: '+6281234567890',
  bodyParams: { name: 'Ani', booking_code: 'GSK-7F3K9Q2M' },
  link: {
    url: 'https://gisikdrono.example/reservasi/GSK-7F3K9Q2M?t=abc.def',
    buttonSuffix: 'GSK-7F3K9Q2M?t=abc.def',
  },
};
const CREDENTIALS = { accessToken: 'test-token', phoneNumberId: '1234567890' };

function answering(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    calls.push({ url: input instanceof Request ? input.url : String(input), init });
    return Promise.resolve(Response.json(body, { status }));
  });
  return { fetcher, calls };
}

function bodyOf(init: RequestInit | undefined): unknown {
  return JSON.parse(typeof init?.body === 'string' ? init.body : 'null');
}

describe('WhatsApp Cloud API provider', () => {
  it('sends the OTP template with its code in the body and in the copy-code button', () => {
    expect(whatsAppPayload(OTP)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '6281234567890',
      type: 'template',
      template: {
        name: 'gsk_otp_v1',
        language: { code: 'id' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: '482913' }],
          },
        ],
      },
    });
  });

  it('puts only the link suffix in the URL button, after the name and booking code', () => {
    const payload = whatsAppPayload(LINK);
    expect(payload.template.name).toBe('gsk_booking_link_v1');
    expect(payload.template.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ani' },
          { type: 'text', text: 'GSK-7F3K9Q2M' },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: 'GSK-7F3K9Q2M?t=abc.def' }],
      },
    ]);
    expect(whatsAppPayload({ ...LINK, link: null }).template.components).toHaveLength(1);
  });

  it('puts a document header first when the message carries the ticket PDF', () => {
    const payload = whatsAppPayload({
      ...LINK,
      template: 'payment_received_ticket',
      document: { url: 'https://storage.example.test/t.pdf', filename: 'ticket-GSK-7F3K9Q2M.pdf' },
    });
    expect(payload.template.name).toBe('gsk_ticket_issued_v1');
    expect(payload.template.components[0]).toEqual({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: 'https://storage.example.test/t.pdf',
            filename: 'ticket-GSK-7F3K9Q2M.pdf',
          },
        },
      ],
    });
  });

  it('posts to the number id with the bearer token and keeps the message id', async () => {
    const { fetcher, calls } = answering(200, { messages: [{ id: 'wamid.HBg' }] });
    const result = await createWhatsAppMetaProvider(CREDENTIALS, fetcher).send(OTP);
    expect(result).toEqual({ ok: true, providerMessageId: 'wamid.HBg' });
    expect(calls[0]?.url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer test-token');
  });

  it.each([
    [131026, true],
    [131047, true],
    [132001, true],
    [130429, false],
    [131000, false],
  ])('treats Meta error %i as permanent: %s', async (code, isPermanent) => {
    const { fetcher } = answering(400, { error: { code, message: 'echoes +6281234567890' } });
    const result = await createWhatsAppMetaProvider(CREDENTIALS, fetcher).send(OTP);
    expect(result).toEqual({
      ok: false,
      errorCode: `meta_${String(code)}`,
      error: 'WhatsApp Cloud API did not accept the message',
      isPermanent,
    });
    expect(JSON.stringify(result)).not.toContain('6281234567890');
  });

  it('tries a server error or a network failure again later', async () => {
    const { fetcher } = answering(503, 'unavailable');
    expect(await createWhatsAppMetaProvider(CREDENTIALS, fetcher).send(OTP)).toMatchObject({
      errorCode: 'http_503',
      isPermanent: false,
    });
    const broken = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect(await createWhatsAppMetaProvider(CREDENTIALS, broken).send(OTP)).toMatchObject({
      errorCode: 'network',
      isPermanent: false,
    });
    expect(isPermanentMetaError(undefined)).toBe(false);
  });
});

describe('Resend provider', () => {
  const config = { apiKey: 're_test', from: 'Edu Wisata <noreply@example.test>' };
  const email = { ...LINK, channel: 'email' as const, recipient: 'ani@example.test' };

  it('sends the plain-text email with the whole link and keeps the email id', async () => {
    const { fetcher, calls } = answering(200, { id: 'email-1' });
    expect(await createResendProvider(config, fetcher).send(email)).toEqual({
      ok: true,
      providerMessageId: 'email-1',
    });
    expect(bodyOf(calls[0]?.init)).toMatchObject({
      from: config.from,
      to: ['ani@example.test'],
      subject: 'Tautan reservasi GSK-7F3K9Q2M',
    });
    expect(JSON.stringify(bodyOf(calls[0]?.init))).toContain(LINK.link?.url);
  });

  it.each([
    [422, true],
    [429, false],
    [500, false],
  ])('treats HTTP %i as permanent: %s', async (status, isPermanent) => {
    const { fetcher } = answering(status, { message: 'no' });
    expect(await createResendProvider(config, fetcher).send(email)).toMatchObject({
      errorCode: `http_${String(status)}`,
      isPermanent,
    });
  });

  it('survives a network failure', async () => {
    const broken = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect(await createResendProvider(config, broken).send(email)).toMatchObject({
      errorCode: 'network',
    });
  });
});

describe('local Mailpit provider', () => {
  it('files a WhatsApp message under a stand-in address with the template name and the code', async () => {
    const { fetcher, calls } = answering(200, { ID: 'mp-1' });
    expect(await createMailpitProvider('whatsapp', fetcher).send(OTP)).toEqual({
      ok: true,
      providerMessageId: 'mailpit-mp-1',
    });
    expect(calls[0]?.url).toBe('http://127.0.0.1:54324/api/v1/send');
    const sent = bodyOf(calls[0]?.init);
    expect(sent).toMatchObject({
      To: [{ Email: 'wa6281234567890@whatsapp.lokal' }],
      Subject: '[WhatsApp gsk_otp_v1] Kode verifikasi Edu Wisata Gisikdrono',
    });
    expect(JSON.stringify(sent)).toContain('482913');
  });

  it('keeps an email address as it is, and reports Mailpit refusing or missing', async () => {
    const email = { ...OTP, channel: 'email' as const, recipient: 'ani@example.test' };
    const { fetcher, calls } = answering(400, { Error: 'bad' });
    expect(await createMailpitProvider('email', fetcher).send(email)).toMatchObject({
      errorCode: 'http_400',
      isPermanent: false,
    });
    expect(bodyOf(calls[0]?.init)).toMatchObject({ To: [{ Email: 'ani@example.test' }] });
    const broken = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect(await createMailpitProvider('email', broken).send(email)).toMatchObject({
      errorCode: 'network',
    });
  });
});

describe('messageText', () => {
  it('words the OTP and the link message in Indonesian', () => {
    expect(messageText({ ...OTP, template: 'phone_otp' }).text).toContain(
      '482913 adalah kode verifikasi Anda',
    );
    const link = messageText({ ...LINK, template: 'booking_link' });
    expect(link.text).toContain('Halo Ani,');
    expect(link.text).toContain('berlaku 3 hari');
    expect(
      messageText({ ...LINK, template: 'booking_link', link: null, bodyParams: {} }).text,
    ).toContain('Halo ,');
  });

  it('has words for every template, a guest message signed and carrying its link', () => {
    for (const template of DB_ENUMS.notification_template) {
      expect(messageText({ ...LINK, template }).subject).not.toBe('');
    }
    const ticket = messageText({
      ...LINK,
      template: 'payment_received_ticket',
      bodyParams: {
        name: 'Ani',
        booking_code: 'GSK-7F3K9Q2M',
        package: 'Eduwisata',
        date: 'Kamis, 12 November 2026',
        session: '09.05–10.05 WIB',
        pax: '20',
      },
    });
    expect(ticket.text).toContain('Eduwisata, Kamis, 12 November 2026, 09.05–10.05 WIB, 20 orang');
    expect(ticket.text).toContain(LINK.link?.url ?? 'missing');
    expect(ticket.text.endsWith('Salam,\nEdu Wisata Gisikdrono')).toBe(true);
  });

  it('leaves out of a staff message what its copy does not carry, and signs it off as nobody', () => {
    const forRw = messageText({
      ...LINK,
      template: 'admin_new_paid_booking',
      bodyParams: {
        booking_code: 'GSK-7F3K9Q2M',
        rw_name: 'RW 05 Ecowastreme',
        visit_date: 'Kamis',
        pax: '20',
      },
      link: { url: 'http://127.0.0.1:3000/dashboard', buttonSuffix: null },
    });
    expect(forRw.text).toContain('Kunjungan ke RW 05 Ecowastreme.');
    expect(forRw.text).not.toContain('Total');
    expect(forRw.text).not.toContain('Salam');
  });
});

describe('a button with a fixed address', () => {
  it('carries no parameter to Meta', () => {
    const expired: OutgoingMessage = {
      ...LINK,
      template: 'booking_expired',
      link: { url: 'http://127.0.0.1:3000/paket-wisata', buttonSuffix: null },
    };
    expect(whatsAppPayload(expired).template.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ani' },
          { type: 'text', text: 'GSK-7F3K9Q2M' },
        ],
      },
    ]);
  });
});
