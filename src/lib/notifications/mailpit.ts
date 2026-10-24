import 'server-only';

import { z } from 'zod';

import { LOCAL_MAILPIT_URL } from '@/config/guest';
import { WHATSAPP_TEMPLATE_NAMES } from '@/config/site';
import { messageText, type MessageText } from '@/lib/notifications/message-text';
import { sendFailure } from '@/lib/notifications/send-result';
import type {
  NotificationChannel,
  NotificationProvider,
  SendResult,
} from '@/lib/notifications/types';

// The local stand-in for WhatsApp and email: every message lands in the Mailpit of `supabase start`
// (http://127.0.0.1:54324), where a developer reads the OTP while trying the flow. src/lib/notifications/providers.ts
// picks it only on a local development server, so on staging and production no message, and no code, ever comes here.

const SEND_PATH = '/api/v1/send';
const REQUEST_TIMEOUT_MS = 5000;
const SENDER = { Email: 'outbox@gisikdrono.lokal', Name: 'Outbox lokal Edu Wisata Gisikdrono' };

const acceptedSchema = z.object({ ID: z.string().min(1) });

function addressFor(channel: NotificationChannel, recipient: string): string {
  return channel === 'whatsapp' ? `wa${recipient.replace(/\D/g, '')}@whatsapp.lokal` : recipient;
}

async function postToMailpit(
  fetcher: typeof fetch,
  to: string,
  { subject, text }: MessageText,
): Promise<SendResult> {
  try {
    const response = await fetcher(`${LOCAL_MAILPIT_URL}${SEND_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: SENDER, To: [{ Email: to }], Subject: subject, Text: text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const accepted = acceptedSchema.safeParse(await response.json().catch(() => null));
    if (response.ok && accepted.success) {
      return { ok: true, providerMessageId: `mailpit-${accepted.data.ID}` };
    }
    return sendFailure(`http_${String(response.status)}`, 'Mailpit refused the message', false);
  } catch {
    return sendFailure('network', 'Mailpit was not reached', false);
  }
}

export function createMailpitProvider(
  channel: NotificationChannel,
  fetcher: typeof fetch = fetch,
): NotificationProvider {
  return {
    send(message) {
      const words = messageText(message);
      const label =
        channel === 'whatsapp' ? `[WhatsApp ${WHATSAPP_TEMPLATE_NAMES[message.template]}] ` : '';
      const to = addressFor(channel, message.recipient);
      return postToMailpit(fetcher, to, { ...words, subject: `${label}${words.subject}` });
    },
  };
}
