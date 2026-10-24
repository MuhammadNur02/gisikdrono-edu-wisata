import 'server-only';

import { z } from 'zod';

import { WHATSAPP_TEMPLATE_NAMES } from '@/config/site';
import { sendFailure } from '@/lib/notifications/send-result';
import type { NotificationProvider, OutgoingMessage, SendResult } from '@/lib/notifications/types';

// Meta's WhatsApp Cloud API (Task P3.11.03, docs/Task.md Appendix B): one approved template per message, language
// `id`, body parameters in template order, and a URL button carrying either the OTP (the copy-code button of an
// AUTHENTICATION template is a URL button to Meta) or the guest link's suffix. Built to Meta's documented contract;
// not yet tried against a real number (Task P3.11.03 note).

const GRAPH_API_URL = 'https://graph.facebook.com/v21.0';
const TEMPLATE_LANGUAGE = 'id';
const REQUEST_TIMEOUT_MS = 10_000;
// Meta's codes for a message that will never go through: not a WhatsApp number, outside the reply window, and the
// 132xxx template errors. Anything else, 130429 (rate limited) and 5xx included, is tried again later.
const NOT_A_WHATSAPP_NUMBER = 131026;
const OUTSIDE_REPLY_WINDOW = 131047;
const PERMANENT_ERROR_CODES: ReadonlySet<number> = new Set([
  NOT_A_WHATSAPP_NUMBER,
  OUTSIDE_REPLY_WINDOW,
]);
const TEMPLATE_ERROR_CODES = { from: 132000, to: 132999 } as const;

export interface WhatsAppCredentials {
  accessToken: string;
  phoneNumberId: string;
}

type TemplateComponent =
  | { type: 'body'; parameters: { type: 'text'; text: string }[] }
  | { type: 'button'; sub_type: 'url'; index: '0'; parameters: { type: 'text'; text: string }[] };

function buttonFor(message: OutgoingMessage): TemplateComponent | null {
  const text =
    message.template === 'phone_otp' ? message.bodyParams.code : message.link?.buttonSuffix;
  if (text === undefined || text === null) return null;
  return {
    type: 'button',
    sub_type: 'url',
    index: '0',
    parameters: [{ type: 'text', text }],
  };
}

export function whatsAppPayload(message: OutgoingMessage) {
  const body: TemplateComponent = {
    type: 'body',
    parameters: Object.values(message.bodyParams).map((value) => ({
      type: 'text',
      text: value,
    })),
  };
  const button = buttonFor(message);
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: message.recipient.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: WHATSAPP_TEMPLATE_NAMES[message.template],
      language: { code: TEMPLATE_LANGUAGE },
      components: button ? [body, button] : [body],
    },
  };
}

export function isPermanentMetaError(code: number | undefined): boolean {
  if (code === undefined) return false;
  return (
    PERMANENT_ERROR_CODES.has(code) ||
    (code >= TEMPLATE_ERROR_CODES.from && code <= TEMPLATE_ERROR_CODES.to)
  );
}

const acceptedSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });
const refusedSchema = z.object({ error: z.object({ code: z.int() }) });

async function resultOf(response: Response): Promise<SendResult> {
  const reply: unknown = await response.json().catch(() => null);
  const accepted = acceptedSchema.safeParse(reply);
  if (response.ok && accepted.success && accepted.data.messages[0]) {
    return { ok: true, providerMessageId: accepted.data.messages[0].id };
  }
  const code = refusedSchema.safeParse(reply).data?.error.code;
  const errorCode = code === undefined ? `http_${String(response.status)}` : `meta_${String(code)}`;
  return sendFailure(
    errorCode,
    'WhatsApp Cloud API did not accept the message',
    isPermanentMetaError(code),
  );
}

export function createWhatsAppMetaProvider(
  credentials: WhatsAppCredentials | null,
  fetcher: typeof fetch = fetch,
): NotificationProvider {
  return {
    async send(message) {
      if (!credentials) {
        return sendFailure('whatsapp_not_configured', 'The WhatsApp credentials are not set', true);
      }
      try {
        const response = await fetcher(`${GRAPH_API_URL}/${credentials.phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(whatsAppPayload(message)),
          cache: 'no-store',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        return await resultOf(response);
      } catch {
        return sendFailure('network', 'WhatsApp Cloud API was not reached', false);
      }
    },
  };
}
