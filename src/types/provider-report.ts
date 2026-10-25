// What a provider's webhook says about a message the outbox sent (Task P3.11.06, P3.11.09), recorded by
// svc_record_provider_status (20261030080000). status is Meta's sent, delivered, read or failed, or Resend's bounced
// or complained; errorCode the server's own code, never the provider's text.
export interface ProviderReport {
  providerMessageId: string;
  status: string;
  errorCode: string | null;
  occurredAt: string | null;
}
