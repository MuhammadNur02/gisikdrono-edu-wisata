import 'server-only';

import { z } from 'zod';

import { messageText } from '@/lib/notifications/message-text';
import { sendFailure } from '@/lib/notifications/send-result';
import type { NotificationProvider, SendResult } from '@/lib/notifications/types';

// Resend for the email channel (Task P3.11.04, docs/Security.md EP-03): links only, never attachments. Plain text for
// now; an HTML layout can replace the body later without changing this contract.

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

export function createResendProvider(
  config: ResendConfig,
  fetcher: typeof fetch = fetch,
): NotificationProvider {
  return {
    async send(message) {
      const { subject, text } = messageText(message);
      try {
        const response = await fetcher(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [message.recipient], subject, text }),
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
