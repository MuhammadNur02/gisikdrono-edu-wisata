import type { EnumValue } from '@/db/enums';

// The contract between the outbox worker (src/server/services/notification-service.ts) and whatever delivers a
// message: Meta's WhatsApp Cloud API, Resend, the local Mailpit, or a test double (Task P3.11.02).

export type NotificationChannel = EnumValue<'notification_channel'>;
export type NotificationTemplateName = EnumValue<'notification_template'>;

// The address a message points at. A guest link's WhatsApp button is https://<site>/reservasi/{{1}}, so only its
// suffix travels to Meta; a button with a fixed address (the catalogue, the dashboard) takes no suffix, null. Email
// and Mailpit show the whole address.
export interface MessageLink {
  url: string;
  buttonSuffix: string | null;
}

export interface OutgoingMessage {
  notificationId: string;
  channel: NotificationChannel;
  template: NotificationTemplateName;
  // E.164 phone or email address, as the outbox row holds it.
  recipient: string;
  // The template's body parameters by name, as the message shows them, in the order WhatsApp numbers them.
  bodyParams: Record<string, string>;
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
