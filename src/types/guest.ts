// What the visitor's identity actions answer (Task P3.2.03). The OTP id is the row's random uuid: it never travels in
// an address, and it is worth nothing without the code sent to the number.

export type OtpChannel = 'whatsapp' | 'email';

export type OtpRequestAnswer =
  | { status: 'sent'; otpId: string; channel: OtpChannel; resendAfterSeconds: number }
  // WhatsApp is off or its daily breaker has tripped: the form asks for an email address and an interactive check.
  | { status: 'degraded' };

export interface OtpVerifyAnswer {
  channel: OtpChannel;
}
