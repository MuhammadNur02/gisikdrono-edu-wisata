import 'server-only';

import { serverEnv } from '@/lib/env';
import { isLocalDevelopment } from '@/lib/local-development';
import { createResendProvider } from '@/lib/notifications/email-resend';
import { createMailpitProvider } from '@/lib/notifications/mailpit';
import type { NotificationProvider, NotificationProviders } from '@/lib/notifications/types';
import {
  createWhatsAppMetaProvider,
  type WhatsAppCredentials,
} from '@/lib/notifications/whatsapp-meta';

// Which provider delivers each channel. On a developer's machine both channels land in the local Mailpit, so the
// whole OTP flow can be tried without a WhatsApp number; everywhere else WhatsApp goes to Meta and email to Resend.
// Tests hand the worker their own providers instead.

// docs/Security.md §11.3: an alert's email waits 5 s for Resend, so a slow provider cannot hold up the run.
const SECURITY_ALERT_TIMEOUT_MS = 5000;

function whatsAppCredentials(): WhatsAppCredentials | null {
  const accessToken = serverEnv.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = serverEnv.WHATSAPP_PHONE_NUMBER_ID;
  return accessToken && phoneNumberId ? { accessToken, phoneNumberId } : null;
}

export function notificationProviders(
  isLocal: boolean = isLocalDevelopment(),
): NotificationProviders {
  if (isLocal) {
    return { whatsapp: createMailpitProvider('whatsapp'), email: createMailpitProvider('email') };
  }
  return {
    whatsapp: createWhatsAppMetaProvider(whatsAppCredentials()),
    email: createResendProvider({ apiKey: serverEnv.RESEND_API_KEY, from: serverEnv.EMAIL_FROM }),
  };
}

// The email provider of the out-of-band security alerts (Task P3.11.08): Resend directly, or the local Mailpit.
export function securityAlertProvider(
  isLocal: boolean = isLocalDevelopment(),
): NotificationProvider {
  if (isLocal) return createMailpitProvider('email');
  return createResendProvider({
    apiKey: serverEnv.RESEND_API_KEY,
    from: serverEnv.EMAIL_FROM,
    timeoutMs: SECURITY_ALERT_TIMEOUT_MS,
  });
}
