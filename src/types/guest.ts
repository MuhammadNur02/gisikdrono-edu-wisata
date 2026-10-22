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

// The contact a code proved: the WhatsApp number, or while WhatsApp is limited the address beside the typed number.
export interface VerifiedContact {
  channel: OtpChannel;
  phone: string;
  email: string | null;
}

// What the booking wizard keeps of it in its draft (Task P3.5.02): never the code, only when it was proved, since the
// summary asks again after eight minutes (decision of 2026-10-22 on P3.5, Q2).
export interface ProvenContact extends VerifiedContact {
  verifiedAt: number;
}
