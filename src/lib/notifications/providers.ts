import 'server-only';

import { serverEnv } from '@/lib/env';
import { isLocalDevelopment } from '@/lib/local-development';
import { createResendProvider } from '@/lib/notifications/email-resend';
import { createMailpitProvider } from '@/lib/notifications/mailpit';
import type { NotificationProviders } from '@/lib/notifications/types';
import {
  createWhatsAppMetaProvider,
  type WhatsAppCredentials,
} from '@/lib/notifications/whatsapp-meta';

// Which provider delivers each channel. On a developer's machine both channels land in the local Mailpit, so the
// whole OTP flow can be tried without a WhatsApp number; everywhere else WhatsApp goes to Meta and email to Resend.
// Tests hand the worker their own providers instead.

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
