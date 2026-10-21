import type { EnumValue } from '@/db/enums';

// The contract between the outbox worker (src/server/services/notification-service.ts) and whatever delivers a
// message: Meta's WhatsApp Cloud API, Resend, the local Mailpit, or a test double (Task P3.11.02).

export type NotificationChannel = EnumValue<'notification_channel'>;
export type NotificationTemplateName = EnumValue<'notification_template'>;

// A guest link for a template with a URL button. WhatsApp's approved button is https://<site>/reservasi/{{1}}, so
// only the suffix travels to Meta; email and Mailpit show the whole address.
export interface MessageLink {
  url: string;
  buttonSuffix: string;
}

export interface OutgoingMessage {
  notificationId: string;
  channel: NotificationChannel;
  template: NotificationTemplateName;
  // E.164 phone or email address, as the outbox row holds it.
  recipient: string;
  // The template's body parameters by name, in the order WhatsApp numbers them ({{1}}, {{2}}, ...).
  bodyParams: Record<string, string | number>;
  link: MessageLink | null;
}

// errorCode and error are the server's own short words: a provider's text may repeat the recipient.
export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; errorCode: string; error: string; isPermanent: boolean };

export interface NotificationProvider {
  // Never throws: a network failure is a SendResult like any other.
  send(message: OutgoingMessage): Promise<SendResult>;
}

export type NotificationProviders = Record<NotificationChannel, NotificationProvider>;
