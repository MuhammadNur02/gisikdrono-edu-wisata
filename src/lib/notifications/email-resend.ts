import 'server-only';

import { z } from 'zod';

import { renderNotificationHtml } from '@/lib/email/render';
import { messageText } from '@/lib/notifications/message-text';
import { sendFailure } from '@/lib/notifications/send-result';
import type { NotificationProvider, OutgoingMessage, SendResult } from '@/lib/notifications/types';

// Resend for the email channel (Task P3.11.04, docs/Security.md EP-03): links only, never attachments. Each email goes
// out as plain text and as the HTML layout of src/lib/email, which say the same words.

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 10_000;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;

export interface ResendConfig {
  apiKey: string;
  from: string;
  // How long to wait for Resend; a security alert waits 5 s at most (docs/Security.md §11.3).
  timeoutMs?: number;
}

const acceptedSchema = z.object({ id: z.string().min(1) });

async function resultOf(response: Response): Promise<SendResult> {
  const accepted = acceptedSchema.safeParse(await response.json().catch(() => null));
  if (response.ok && accepted.success) return { ok: true, providerMessageId: accepted.data.id };
  // A refused address or body will be refused again; a rate limit or an outage may not be.
  const isPermanent = response.status !== TOO_MANY_REQUESTS && response.status < SERVER_ERROR;
  return sendFailure(
    `http_${String(response.status)}`,
    'Resend did not accept the email',
    isPermanent,
  );
}

// The worker's code for a message it could not prepare (SERVER_FAULT_ERRORS of src/server/services/service-health.ts).
const COMPOSE_FAILED = 'compose_failed';

async function htmlOf(message: OutgoingMessage): Promise<string | null> {
  try {
    return await renderNotificationHtml(message);
  } catch {
    return null;
  }
}

export function createResendProvider(
  config: ResendConfig,
  fetcher: typeof fetch = fetch,
): NotificationProvider {
  return {
    async send(message) {
      const { subject, text } = messageText(message);
      const html = await htmlOf(message);
      // The layout is the server's own: it fails again on every try, so the message is dead at once and /api/health
      // counts it as a server fault (review of PR #66, L3).
      if (html === null) {
        return sendFailure(COMPOSE_FAILED, 'The email layout could not be rendered', true);
      }
      try {
        const response = await fetcher(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [message.recipient], subject, text, html }),
          cache: 'no-store',
          signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        });
        return await resultOf(response);
      } catch {
        return sendFailure('network', 'Resend was not reached', false);
      }
    },
  };
}
