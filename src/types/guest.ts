// What the visitor's identity actions answer (Task P3.2.03). No OTP id reaches the browser: a code belongs to the
// browser that asked for it (the gsk_otp_browser cookie) and is found by that and the contact it was sent to.

export type OtpChannel = 'whatsapp' | 'email';

export type OtpRequestAnswer =
  // Sent, or the browser is waiting out its minute, or the number has used its codes for today: the visitor hears
  // the same each time, so the answer says nothing about anyone else asking for that number (review of PR #20, L4).
  | { status: 'requested'; channel: OtpChannel; resendAfterSeconds: number }
  // WhatsApp is off or its daily breaker has tripped: the form asks for an email address and an interactive check.
  | { status: 'degraded' };

export interface OtpVerifyAnswer {
  channel: OtpChannel;
}
