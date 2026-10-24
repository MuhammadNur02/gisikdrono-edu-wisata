import 'server-only';

import { serverEnv } from '@/lib/env';
import { messageDelivery, type MessageDelivery } from '@/lib/local-development';
import { createResendProvider } from '@/lib/notifications/email-resend';
import { createMailpitProvider } from '@/lib/notifications/mailpit';
import type { NotificationProvider, NotificationProviders } from '@/lib/notifications/types';
import {
  createWhatsAppMetaProvider,
  type WhatsAppCredentials,
} from '@/lib/notifications/whatsapp-meta';

// Which provider delivers each channel, by messageDelivery: Meta and Resend on a Vercel preview or production
// deployment only; the local Mailpit for a stack on this machine, so the whole OTP flow can be tried without a
// WhatsApp number; and none at all anywhere else, which the worker answers by claiming nothing. Tests hand the worker
// their own providers instead.

// docs/Security.md §11.3: an alert's email waits 5 s for Resend, so a slow provider cannot hold up the run.
const SECURITY_ALERT_TIMEOUT_MS = 5000;

function whatsAppCredentials(): WhatsAppCredentials | null {
  const accessToken = serverEnv.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = serverEnv.WHATSAPP_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

export function notificationProviders(
  delivery: MessageDelivery = messageDelivery(),
): NotificationProviders | null {
  if (delivery === 'none') return null;
  if (delivery === 'mailpit') {
    return { whatsapp: createMailpitProvider('whatsapp'), email: createMailpitProvider('email') };
  }
  return {
    whatsapp: createWhatsAppMetaProvider(whatsAppCredentials()),
    email: createResendProvider({ apiKey: serverEnv.RESEND_API_KEY, from: serverEnv.EMAIL_FROM }),
  };
}

// The email provider of the out-of-band security alerts (Task P3.11.08): Resend directly, or the local Mailpit.
export function securityAlertProvider(
  delivery: MessageDelivery = messageDelivery(),
): NotificationProvider | null {
  if (delivery === 'none') return null;
  if (delivery === 'mailpit') return createMailpitProvider('email');
  return createResendProvider({
    apiKey: serverEnv.RESEND_API_KEY,
    from: serverEnv.EMAIL_FROM,
    timeoutMs: SECURITY_ALERT_TIMEOUT_MS,
  });
}
